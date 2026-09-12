use crate::auth::get_offline_uuid;
use crate::config::load_settings;
use crate::downloader::{
    download_items_concurrently, is_library_allowed, is_native_for_wrong_arch, prepare_vanilla_files, DownloadItem,
};
use crate::instances::list_instances;
use crate::java::{download_temurin_java, find_java_binary, probe_java_binary, scan_java_installations};
use crate::models::{DownloadProgress, LaunchLogPayload};
use crate::paths::{get_assets_dir, get_instance_dir, get_libraries_dir, get_runtimes_dir};
use serde_json::Value;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Default, Clone)]
pub struct GameProcessState {
    pub running_processes: Arc<Mutex<HashMap<String, u32>>>,
}

pub async fn launch_minecraft(instance_id: &str, app_handle: AppHandle) -> Result<(), String> {
    let settings = load_settings();
    let instances = list_instances()?;
    let instance = instances
        .into_iter()
        .find(|i| i.id == instance_id)
        .ok_or_else(|| format!("Nie znaleziono instancji {}", instance_id))?;

    // 1. Ustal ścieżkę do Javy
    let java_bin = resolve_java_path(&settings, &instance.mc_version, &app_handle).await?;

    // 2. Pobierz/przygotuj pliki Vanilla
    let (client_jar, vanilla_json) = prepare_vanilla_files(&instance.mc_version, &app_handle).await?;

    let instance_dir = get_instance_dir(instance_id);
    let natives_dir = instance_dir.join("natives");
    fs::create_dir_all(&natives_dir).map_err(|e| e.to_string())?;

    let current_os = match std::env::consts::OS {
        "macos" => "osx",
        "windows" => "windows",
        "linux" => "linux",
        _ => "unknown",
    };
    let is_arm64 = std::env::consts::ARCH == "aarch64";

    // 3. Zbierz ścieżki bibliotek
    let mut classpath_entries: Vec<PathBuf> = Vec::new();
    let mut main_class = vanilla_json
        .get("mainClass")
        .and_then(|m| m.as_str())
        .unwrap_or("net.minecraft.client.main.Main")
        .to_string();

    if let Some(libraries) = vanilla_json.get("libraries").and_then(|l| l.as_array()) {
        for lib in libraries {
            let name = lib.get("name").and_then(|n| n.as_str()).unwrap_or("");

            if !is_library_allowed(lib, current_os) {
                continue;
            }

            if is_native_for_wrong_arch(name, current_os, is_arm64) {
                continue;
            }

            if let Some(artifact) = lib.pointer("/downloads/artifact") {
                if let Some(p) = artifact.get("path").and_then(|p| p.as_str()) {
                    if !is_native_for_wrong_arch(p, current_os, is_arm64) {
                        let lib_path = get_libraries_dir().join(p);
                        if lib_path.exists() {
                            classpath_entries.push(lib_path.clone());
                            if name.contains("natives") || p.contains("natives") {
                                extract_natives(&lib_path, &natives_dir);
                            }
                        }
                    }
                }
            }

            // Obsługa classifiers (starsze wersje Minecrafta)
            if let Some(classifiers) = lib.pointer("/downloads/classifiers").and_then(|c| c.as_object()) {
                for (classifier_name, classifier_val) in classifiers {
                    if is_native_for_wrong_arch(classifier_name, current_os, is_arm64) {
                        continue;
                    }
                    if current_os == "osx" && !classifier_name.contains("osx") && !classifier_name.contains("macos") {
                        continue;
                    }
                    if current_os == "windows" && !classifier_name.contains("windows") {
                        continue;
                    }
                    if current_os == "linux" && !classifier_name.contains("linux") {
                        continue;
                    }

                    if let Some(p) = classifier_val.get("path").and_then(|p| p.as_str()) {
                        if !is_native_for_wrong_arch(p, current_os, is_arm64) {
                            let lib_path = get_libraries_dir().join(p);
                            if lib_path.exists() {
                                classpath_entries.push(lib_path.clone());
                                extract_natives(&lib_path, &natives_dir);
                            }
                        }
                    }
                }
            }
        }
    }

    // 4. Jeśli loader to Fabric lub Quilt, pobierz biblioteki i podmień mainClass
    if instance.loader == "fabric" || instance.loader == "quilt" {
        let (profile_url, loader_type_name) = if instance.loader == "quilt" {
            let loader_ver = instance.loader_version.as_deref().unwrap_or("0.20.0-beta.9");
            (
                format!(
                    "https://meta.quiltmc.org/v3/versions/loader/{}/{}/profile/json",
                    instance.mc_version, loader_ver
                ),
                "Quilt",
            )
        } else {
            let loader_ver = instance.loader_version.as_deref().unwrap_or("0.15.11");
            (
                format!(
                    "https://meta.fabricmc.net/v2/versions/loader/{}/{}/profile/json",
                    instance.mc_version, loader_ver
                ),
                "Fabric",
            )
        };

        let client = reqwest::Client::builder()
            .user_agent("VantMcLauncher/1.0")
            .build()
            .map_err(|e| e.to_string())?;

        if let Ok(resp) = client.get(&profile_url).send().await {
            if resp.status().is_success() {
                if let Ok(loader_json) = resp.json::<Value>().await {
                    if let Some(mc) = loader_json.get("mainClass").and_then(|m| m.as_str()) {
                        main_class = mc.to_string();
                    }

                    if let Some(libs) = loader_json.get("libraries").and_then(|l| l.as_array()) {
                        let mut loader_items = Vec::new();
                        for lib in libs {
                            if let (Some(name), Some(url)) = (
                                lib.get("name").and_then(|n| n.as_str()),
                                lib.get("url").and_then(|u| u.as_str()),
                            ) {
                                if let Some(maven_path) = maven_coordinate_to_path(name) {
                                    let full_url = format!("{}{}", url, maven_path);
                                    let target_path = get_libraries_dir().join(&maven_path);
                                    classpath_entries.push(target_path.clone());

                                    loader_items.push(DownloadItem {
                                        url: full_url,
                                        path: target_path,
                                        sha1: None,
                                        size: 0,
                                    });
                                }
                            }
                        }

                        download_items_concurrently(loader_items, &format!("Pobieranie bibliotek {}", loader_type_name), &app_handle).await?;
                    }
                }
            }
        }
    }

    // Dodaj client.jar do classpath
    classpath_entries.push(client_jar);

    #[cfg(target_os = "windows")]
    let classpath_sep = ";";
    #[cfg(not(target_os = "windows"))]
    let classpath_sep = ":";

    let classpath_str = classpath_entries
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect::<Vec<String>>()
        .join(classpath_sep);

    // 5. Przygotuj argumenty JVM i Gry
    let min_ram = settings.min_ram_mb;
    let max_ram = instance.memory_mb.unwrap_or(settings.max_ram_mb);
    let offline_uuid = get_offline_uuid(&settings.nickname);

    let asset_index_id = vanilla_json
        .pointer("/assetIndex/id")
        .and_then(|i| i.as_str())
        .unwrap_or(&instance.mc_version);

    let mut jvm_args = vec![
        format!("-Xms{}M", min_ram),
        format!("-Xmx{}M", max_ram),
        format!("-Djava.library.path={}", natives_dir.to_string_lossy()),
        "-Dminecraft.launcher.brand=VantMcLauncher".to_string(),
        "-Dminecraft.launcher.version=1.0.0".to_string(),
    ];

    for arg in settings.jvm_args.split_whitespace() {
        if !arg.is_empty() {
            jvm_args.push(arg.to_string());
        }
    }

    #[cfg(target_os = "macos")]
    {
        jvm_args.push("-XstartOnFirstThread".to_string());

        let has_any_gc = settings.jvm_args.contains("UseG1GC")
            || settings.jvm_args.contains("UseZGC")
            || settings.jvm_args.contains("UseParallelGC")
            || settings.jvm_args.contains("UseSerialGC")
            || settings.jvm_args.contains("UseShenandoahGC")
            || settings.jvm_args.contains("UseEpsilonGC");

        if std::env::consts::ARCH == "aarch64" && !has_any_gc {
            let is_java_21_or_higher = probe_java_binary(Path::new(&java_bin))
                .map(|info| info.major_version >= 21)
                .unwrap_or(false);

            if is_java_21_or_higher {
                // Apple Silicon unified memory & low-latency Generational ZGC for Java 21+
                jvm_args.push("-XX:+UnlockExperimentalVMOptions".to_string());
                jvm_args.push("-XX:+UseZGC".to_string());
                jvm_args.push("-XX:+ZGenerational".to_string());
                jvm_args.push("-XX:+UseStringDeduplication".to_string());
            } else {
                // Java 17 and earlier do not support -XX:+ZGenerational
                jvm_args.push("-XX:+UseG1GC".to_string());
                jvm_args.push("-XX:+UseStringDeduplication".to_string());
            }
        }
    }

    jvm_args.push("-cp".to_string());
    jvm_args.push(classpath_str);
    jvm_args.push(main_class);

    let game_args = vec![
        "--username".to_string(),
        settings.nickname.clone(),
        "--version".to_string(),
        instance.mc_version.clone(),
        "--gameDir".to_string(),
        instance_dir.to_string_lossy().to_string(),
        "--assetsDir".to_string(),
        get_assets_dir().to_string_lossy().to_string(),
        "--assetIndex".to_string(),
        asset_index_id.to_string(),
        "--uuid".to_string(),
        offline_uuid,
        "--accessToken".to_string(),
        "0".to_string(),
        "--userType".to_string(),
        "legacy".to_string(),
        "--versionType".to_string(),
        "VantMcLauncher".to_string(),
    ];

    let full_args: Vec<String> = jvm_args.into_iter().chain(game_args).collect();

    let emit_log = |line: String, is_error: bool| {
        let _ = app_handle.emit(
            "minecraft-log",
            LaunchLogPayload {
                instance_id: instance_id.to_string(),
                line,
                is_error,
            },
        );
    };

    emit_log(format!("[VantLauncher] Uruchamianie gry Minecraft {} ({})", instance.name, instance.mc_version), false);
    emit_log(format!("[VantLauncher] Wybrana Java: {}", java_bin), false);
    emit_log(format!("[VantLauncher] Folder instancji: {}", instance_dir.display()), false);

    let _ = app_handle.emit(
        "download-progress",
        DownloadProgress {
            step: "Uruchamianie".to_string(),
            current: 100,
            total: 100,
            percentage: 100.0,
            message: "Uruchamianie gry Minecraft...".to_string(),
        },
    );

    let mut child = match Command::new(&java_bin)
        .args(&full_args)
        .current_dir(&instance_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            let err_msg = format!("Błąd uruchamiania procesu Javy ({}): {}", java_bin, e);
            emit_log(format!("[VantLauncher BŁĄD] {}", err_msg), true);
            return Err(err_msg);
        }
    };

    let pid = child.id();
    if let Some(state) = app_handle.try_state::<GameProcessState>() {
        let mut map = state.running_processes.lock().unwrap();
        map.insert(instance_id.to_string(), pid);
    }

    emit_log(format!("[VantLauncher] Zarejestrowano PID procesu gry: {}", pid), false);

    let stdout = child.stdout.take().ok_or("Nie można przechwycić stdout")?;
    let stderr = child.stderr.take().ok_or("Nie można przechwycić stderr")?;

    let app_h1 = app_handle.clone();
    let inst_id_1 = instance_id.to_string();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().map_while(Result::ok) {
            if line.contains("Loading Minecraft") {
                let _ = app_h1.emit(
                    "download-progress",
                    DownloadProgress {
                        step: "Uruchamianie".to_string(),
                        current: 40,
                        total: 100,
                        percentage: 40.0,
                        message: "Inicjalizacja silnika gry Minecraft...".to_string(),
                    },
                );
            } else if line.contains("Loading") && line.contains("mods") {
                let _ = app_h1.emit(
                    "download-progress",
                    DownloadProgress {
                        step: "Mody".to_string(),
                        current: 70,
                        total: 100,
                        percentage: 70.0,
                        message: "Wczytywanie modyfikacji...".to_string(),
                    },
                );
            } else if line.contains("Backend library: LWJGL") || line.contains("OpenGL") {
                let _ = app_h1.emit(
                    "download-progress",
                    DownloadProgress {
                        step: "Grafika".to_string(),
                        current: 95,
                        total: 100,
                        percentage: 95.0,
                        message: "Otwieranie okna gry Minecraft...".to_string(),
                    },
                );
            }

            let _ = app_h1.emit(
                "minecraft-log",
                LaunchLogPayload {
                    instance_id: inst_id_1.clone(),
                    line,
                    is_error: false,
                },
            );
        }
    });

    let app_h2 = app_handle.clone();
    let inst_id_2 = instance_id.to_string();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().map_while(Result::ok) {
            let _ = app_h2.emit(
                "minecraft-log",
                LaunchLogPayload {
                    instance_id: inst_id_2.clone(),
                    line,
                    is_error: true,
                },
            );
        }
    });

    let app_h3 = app_handle.clone();
    let inst_id_3 = instance_id.to_string();
    std::thread::spawn(move || {
        match child.wait() {
            Ok(status) => {
                if let Some(state) = app_h3.try_state::<GameProcessState>() {
                    let mut map = state.running_processes.lock().unwrap();
                    map.remove(&inst_id_3);
                }
                let code = status.code().unwrap_or(-1);
                let is_error = !status.success();
                let exit_msg = if status.success() {
                    format!("[VantLauncher] Proces gry zakończył się poprawnie (kod wyjścia: {})", code)
                } else {
                    format!("[VantLauncher BŁĄD] Proces gry zakończył się z błędem (kod wyjścia: {})", code)
                };
                let _ = app_h3.emit(
                    "minecraft-log",
                    LaunchLogPayload {
                        instance_id: inst_id_3.clone(),
                        line: exit_msg,
                        is_error,
                    },
                );
                let _ = app_h3.emit(
                    "game-stopped",
                    serde_json::json!({
                        "instance_id": inst_id_3,
                        "exit_code": code,
                        "success": status.success()
                    }),
                );
            }
            Err(e) => {
                if let Some(state) = app_h3.try_state::<GameProcessState>() {
                    let mut map = state.running_processes.lock().unwrap();
                    map.remove(&inst_id_3);
                }
                let _ = app_h3.emit(
                    "minecraft-log",
                    LaunchLogPayload {
                        instance_id: inst_id_3.clone(),
                        line: format!("[VantLauncher BŁĄD] Błąd oczekiwania na proces gry: {}", e),
                        is_error: true,
                    },
                );
            }
        }
    });

    let _ = app_handle.emit("game-started", serde_json::json!({ "instance_id": instance_id, "pid": pid }));
    Ok(())
}

pub fn kill_game_process(app_handle: &AppHandle, instance_id: Option<String>) -> Result<(), String> {
    let state = app_handle
        .try_state::<GameProcessState>()
        .ok_or_else(|| "Brak stanu procesów".to_string())?;

    let mut map = state.running_processes.lock().unwrap();
    let targets: Vec<(String, u32)> = if let Some(ref id) = instance_id {
        if let Some(&pid) = map.get(id) {
            vec![(id.clone(), pid)]
        } else {
            vec![]
        }
    } else {
        map.iter().map(|(k, &v)| (k.clone(), v)).collect()
    };

    if targets.is_empty() {
        #[cfg(unix)]
        {
            let _ = std::process::Command::new("pkill")
                .args(["-9", "-f", "net.minecraft.client.main.Main"])
                .output();
            let _ = std::process::Command::new("pkill")
                .args(["-9", "-f", "net.fabricmc.loader.impl.launch.knot.KnotClient"])
                .output();
        }
        #[cfg(windows)]
        {
            let _ = std::process::Command::new("taskkill")
                .args(["/F", "/IM", "javaw.exe"])
                .output();
        }
        let _ = app_handle.emit("game-stopped", serde_json::json!({
            "instance_id": instance_id.unwrap_or_default(),
            "exit_code": -9,
            "killed": true
        }));
        return Ok(());
    }

    for (inst_id, pid) in targets {
        map.remove(&inst_id);

        #[cfg(unix)]
        {
            let _ = std::process::Command::new("kill").args(["-9", &pid.to_string()]).output();
        }
        #[cfg(windows)]
        {
            let _ = std::process::Command::new("taskkill").args(["/F", "/T", "/PID", &pid.to_string()]).output();
        }

        let _ = app_handle.emit("game-stopped", serde_json::json!({
            "instance_id": inst_id,
            "exit_code": -9,
            "killed": true
        }));

        let _ = app_handle.emit("minecraft-log", LaunchLogPayload {
            instance_id: inst_id,
            line: format!("[VantLauncher] Zatrzymano proces gry na żądanie użytkownika (PID: {})", pid),
            is_error: false,
        });
    }

    Ok(())
}

pub fn is_game_running(app_handle: &AppHandle, instance_id: Option<String>) -> bool {
    if let Some(state) = app_handle.try_state::<GameProcessState>() {
        let map = state.running_processes.lock().unwrap();
        if let Some(id) = instance_id {
            map.contains_key(&id)
        } else {
            !map.is_empty()
        }
    } else {
        false
    }
}

pub fn get_running_instance_id(app_handle: &AppHandle) -> Option<String> {
    if let Some(state) = app_handle.try_state::<GameProcessState>() {
        let map = state.running_processes.lock().unwrap();
        map.keys().next().cloned()
    } else {
        None
    }
}

async fn resolve_java_path(
    settings: &crate::models::UserSettings,
    _mc_version: &str,
    app_handle: &AppHandle,
) -> Result<String, String> {
    if let Some(ref path) = settings.custom_java_path {
        if Path::new(path).exists() {
            return Ok(path.clone());
        }
    }

    let runtimes_dir = get_runtimes_dir();

    // Priorytetowe wykrycie i użycie Javy 21 w runtimes launchera
    // (np. runtimes/java-21/jdk-21.0.12.1+1/Contents/Home/bin/java)
    let java21_dir = runtimes_dir.join("java-21");
    if java21_dir.exists() {
        if let Some(java_exec) = find_java_binary(&java21_dir) {
            return Ok(java_exec.to_string_lossy().to_string());
        }
    }

    let installed = scan_java_installations();

    // Preferuj runtime Javy 21 z runtimes_dir
    if let Some(runtime_j21) = installed.iter().find(|j| {
        j.major_version == 21 && Path::new(&j.path).starts_with(&runtimes_dir)
    }) {
        return Ok(runtime_j21.path.clone());
    }

    // Preferuj jakąkolwiek Javę z runtimes >= 17 (na Apple Silicon preferuj ARM64)
    let is_sys_arm64 = std::env::consts::ARCH == "aarch64";
    if is_sys_arm64 {
        if let Some(runtime_arm) = installed.iter().find(|j| {
            j.is_arm64 && j.major_version >= 17 && Path::new(&j.path).starts_with(&runtimes_dir)
        }) {
            return Ok(runtime_arm.path.clone());
        }
    }

    if let Some(runtime_any) = installed.iter().find(|j| {
        j.major_version >= 17 && Path::new(&j.path).starts_with(&runtimes_dir)
    }) {
        return Ok(runtime_any.path.clone());
    }

    // Następnie dowolna wykryta Java 21 (na ARM64 preferuj ARM64)
    if is_sys_arm64 {
        if let Some(sys_arm21) = installed.iter().find(|j| j.is_arm64 && j.major_version == 21) {
            return Ok(sys_arm21.path.clone());
        }
    }

    if let Some(j21) = installed.iter().find(|j| j.major_version == 21) {
        return Ok(j21.path.clone());
    }

    // Dowolna Java >= 17
    if is_sys_arm64 {
        if let Some(sys_arm) = installed.iter().find(|j| j.is_arm64 && j.major_version >= 17) {
            return Ok(sys_arm.path.clone());
        }
    }

    if let Some(best) = installed.iter().find(|j| j.major_version >= 17) {
        return Ok(best.path.clone());
    }

    if let Some(any) = installed.first() {
        return Ok(any.path.clone());
    }

    let _ = app_handle.emit(
        "download-progress",
        DownloadProgress {
            step: "Java".to_string(),
            current: 0,
            total: 100,
            percentage: 5.0,
            message: "Nie wykryto Javy na komputerze. Pobieranie OpenJDK 21...".to_string(),
        },
    );

    let downloaded_path = download_temurin_java(21, app_handle.clone()).await?;
    Ok(downloaded_path)
}

fn extract_natives(jar_path: &Path, natives_dir: &Path) {
    if let Ok(file) = File::open(jar_path) {
        if let Ok(mut archive) = zip::ZipArchive::new(file) {
            for i in 0..archive.len() {
                if let Ok(mut entry) = archive.by_index(i) {
                    let name = entry.name().to_string();
                    if name.ends_with(".dylib") || name.ends_with(".so") || name.ends_with(".dll") {
                        if let Some(file_name) = Path::new(&name).file_name() {
                            let dest = natives_dir.join(file_name);
                            if let Ok(mut out_file) = File::create(&dest) {
                                let _ = std::io::copy(&mut entry, &mut out_file);
                                #[cfg(unix)]
                                {
                                    use std::os::unix::fs::PermissionsExt;
                                    let _ = fs::set_permissions(&dest, fs::Permissions::from_mode(0o755));
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

pub fn maven_coordinate_to_path(coordinate: &str) -> Option<String> {
    let parts: Vec<&str> = coordinate.split(':').collect();
    if parts.len() >= 3 {
        let group = parts[0].replace('.', "/");
        let name = parts[1];
        let version = parts[2];
        let classifier = if parts.len() > 3 {
            format!("-{}", parts[3])
        } else {
            String::new()
        };
        Some(format!("{}/{}/{}/{}-{}{}.jar", group, name, version, name, version, classifier))
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_maven_coordinate() {
        let path = maven_coordinate_to_path("net.fabricmc:fabric-loader:0.15.11");
        assert_eq!(
            path,
            Some("net/fabricmc/fabric-loader/0.15.11/fabric-loader-0.15.11.jar".to_string())
        );
    }
}

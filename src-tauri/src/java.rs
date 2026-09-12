use crate::models::JavaInstallation;
use crate::paths::get_runtimes_dir;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Emitter};

pub fn scan_java_installations() -> Vec<JavaInstallation> {
    let mut results = Vec::new();
    let mut scanned_paths: Vec<PathBuf> = Vec::new();

    // 1. Sprawdź runtimes pobrane wewnątrz katalogu launchera
    let runtimes_dir = get_runtimes_dir();
    if runtimes_dir.exists() {
        for entry in walkdir::WalkDir::new(&runtimes_dir).into_iter().flatten() {
            if entry.file_type().is_file() {
                let name = entry.file_name().to_string_lossy();
                if name == "java" || name == "java.exe" {
                    if let Some(parent) = entry.path().parent() {
                        if parent.ends_with("bin") {
                            scanned_paths.push(entry.into_path());
                        }
                    }
                }
            }
        }
    }

    // 2. Standardowe ścieżki systemowe
    #[cfg(target_os = "macos")]
    {
        let jvm_dir = Path::new("/Library/Java/JavaVirtualMachines");
        if jvm_dir.exists() {
            for entry in walkdir::WalkDir::new(jvm_dir).max_depth(5).into_iter().flatten() {
                if entry.file_type().is_file() && entry.file_name() == "java" {
                    if let Some(parent) = entry.path().parent() {
                        if parent.ends_with("bin") {
                            scanned_paths.push(entry.into_path());
                        }
                    }
                }
            }
        }

        // macOS JavaAppletPlugin (bardzo częsta lokalizacja oficjalnej Javy 8 od Oracle)
        let applet_plugin = PathBuf::from("/Library/Internet Plug-Ins/JavaAppletPlugin.plugin/Contents/Home/bin/java");
        if applet_plugin.exists() {
            scanned_paths.push(applet_plugin);
        }

        // Homebrew OpenJDK
        for dir_name in &["openjdk", "openjdk@21", "openjdk@17", "openjdk@11", "openjdk@8"] {
            let brew_bin = PathBuf::from(format!("/opt/homebrew/opt/{}/bin/java", dir_name));
            if brew_bin.exists() {
                scanned_paths.push(brew_bin);
            }
            let brew_libexec = PathBuf::from(format!("/opt/homebrew/opt/{}/libexec/openjdk.jdk/Contents/Home/bin/java", dir_name));
            if brew_libexec.exists() {
                scanned_paths.push(brew_libexec);
            }
        }

        // Sprawdź /usr/libexec/java_home
        if let Ok(output) = Command::new("/usr/libexec/java_home").output() {
            if output.status.success() {
                let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path_str.is_empty() {
                    let jvm_bin = PathBuf::from(&path_str).join("bin").join("java");
                    if jvm_bin.exists() {
                        scanned_paths.push(jvm_bin);
                    }
                }
            }
        }

        scanned_paths.push(PathBuf::from("/usr/bin/java"));
    }

    #[cfg(target_os = "windows")]
    {
        for program_files in &[r"C:\Program Files\Java", r"C:\Program Files\Eclipse Adoptium", r"C:\Program Files\Microsoft\jdk"] {
            let base = Path::new(program_files);
            if base.exists() {
                for entry in walkdir::WalkDir::new(base).max_depth(4).into_iter().flatten() {
                    if entry.file_type().is_file() && entry.file_name() == "java.exe" {
                        scanned_paths.push(entry.into_path());
                    }
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        let jvm_dir = Path::new("/usr/lib/jvm");
        if jvm_dir.exists() {
            for entry in walkdir::WalkDir::new(jvm_dir).max_depth(4).into_iter().flatten() {
                if entry.file_type().is_file() && entry.file_name() == "java" {
                    scanned_paths.push(entry.into_path());
                }
            }
        }
        scanned_paths.push(PathBuf::from("/usr/bin/java"));
    }

    // Sprawdź każde znalezione java wykonując `java -version`
    for path in scanned_paths {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o755));
        }

        let path_str = path.to_string_lossy().to_string();
        if results.iter().any(|r: &JavaInstallation| r.path == path_str) {
            continue;
        }

        if let Some(info) = probe_java_binary(&path) {
            results.push(info);
        }
    }

    // Sortuj: priorytet dla runtimes launchera, potem najnowsze wersje Javy, a na ARM64 preferuj natywne arm64
    let is_sys_arm64 = std::env::consts::ARCH == "aarch64";
    results.sort_by(|a, b| {
        let a_in_runtimes = Path::new(&a.path).starts_with(&runtimes_dir);
        let b_in_runtimes = Path::new(&b.path).starts_with(&runtimes_dir);
        b_in_runtimes
            .cmp(&a_in_runtimes)
            .then_with(|| b.major_version.cmp(&a.major_version))
            .then_with(|| {
                if is_sys_arm64 {
                    b.is_arm64.cmp(&a.is_arm64)
                } else {
                    a.is_arm64.cmp(&b.is_arm64)
                }
            })
    });
    results
}

pub fn find_java_binary(dir: &Path) -> Option<PathBuf> {
    if !dir.exists() {
        return None;
    }
    for entry in walkdir::WalkDir::new(dir).into_iter().flatten() {
        if entry.file_type().is_file() {
            let name = entry.file_name().to_string_lossy();
            if name == "java" || name == "java.exe" {
                if let Some(parent) = entry.path().parent() {
                    if parent.ends_with("bin") {
                        #[cfg(unix)]
                        {
                            use std::os::unix::fs::PermissionsExt;
                            let _ = fs::set_permissions(entry.path(), fs::Permissions::from_mode(0o755));
                        }
                        return Some(entry.into_path());
                    }
                }
            }
        }
    }
    None
}

pub fn probe_java_binary(path: &Path) -> Option<JavaInstallation> {
    let output = Command::new(path)
        .args(["-XshowSettings:properties", "-version"])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let combined = format!("{}\n{}", stderr, stdout);

    if combined.contains("Unable to locate a Java Runtime") {
        return None;
    }

    let mut version_string = None;
    let mut major_version = 8;
    let is_arm64 = combined.contains("aarch64")
        || combined.contains("arm64")
        || combined.contains("os.arch = aarch64");

    for line in combined.lines() {
        if line.contains("version") {
            if let Some(start) = line.find('"') {
                if let Some(end) = line[start + 1..].find('"') {
                    let ver = line[start + 1..start + 1 + end].to_string();
                    if ver.starts_with("1.8") {
                        major_version = 8;
                    } else if let Some(dot) = ver.find('.') {
                        if let Ok(major) = ver[..dot].parse::<u32>() {
                            major_version = major;
                        }
                    } else if let Ok(major) = ver.parse::<u32>() {
                        major_version = major;
                    }
                    version_string = Some(ver);
                    break;
                }
            }
        }
    }

    version_string.map(|ver| JavaInstallation {
        path: path.to_string_lossy().to_string(),
        version_string: ver,
        major_version,
        is_arm64,
    })
}

pub async fn download_temurin_java(
    version: u32,
    app_handle: AppHandle,
) -> Result<String, String> {
    let os = match std::env::consts::OS {
        "macos" => "mac",
        "windows" => "windows",
        "linux" => "linux",
        other => other,
    };

    let mut arch = match std::env::consts::ARCH {
        "aarch64" => "aarch64",
        "x86_64" => "x64",
        other => other,
    };

    if os == "mac" && arch == "aarch64" && version <= 8 {
        arch = "x64";
    }

    let download_url = format!(
        "https://api.adoptium.net/v3/binary/latest/{}/ga/{}/{}/jdk/hotspot/normal/eclipse",
        version, os, arch
    );

    let _ = app_handle.emit(
        "java-download-progress",
        serde_json::json!({
            "status": "downloading",
            "message": format!("Pobieranie Java {} (OpenJDK Temurin)...", version),
            "percentage": 15.0
        }),
    );

    let client = reqwest::Client::builder()
        .user_agent("VantMcLauncher/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| format!("Błąd pobierania Javy: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Adoptium API zwróciło status: {}",
            response.status()
        ));
    }

    let _ = app_handle.emit(
        "java-download-progress",
        serde_json::json!({
            "status": "extracting",
            "message": "Rozpakowywanie Javy...",
            "percentage": 70.0
        }),
    );

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Błąd odczytu danych Javy: {}", e))?;

    let target_dir = get_runtimes_dir().join(format!("java-{}", version));
    let _ = fs::remove_dir_all(&target_dir);
    fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    {
        use std::io::Cursor;
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes))
            .map_err(|e| format!("Błąd archiwum zip: {}", e))?;
        archive.extract(&target_dir).map_err(|e| e.to_string())?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        use flate2::read::GzDecoder;
        use std::io::Cursor;
        use tar::Archive;

        let tar = GzDecoder::new(Cursor::new(bytes));
        let mut archive = Archive::new(tar);
        archive.unpack(&target_dir).map_err(|e| format!("Błąd rozpakowywania tar.gz: {}", e))?;
    }

    // Znajdź plik wykonywalny java
    let mut java_exec = None;
    for entry in walkdir::WalkDir::new(&target_dir) {
        if let Ok(entry) = entry {
            if entry.file_type().is_file() {
                let file_name = entry.file_name().to_string_lossy();
                if file_name == "java" || file_name == "java.exe" {
                    if entry.path().parent().map(|p| p.ends_with("bin")).unwrap_or(false) {
                        #[cfg(unix)]
                        {
                            use std::os::unix::fs::PermissionsExt;
                            let _ = fs::set_permissions(entry.path(), fs::Permissions::from_mode(0o755));
                        }
                        java_exec = Some(entry.path().to_string_lossy().to_string());
                        break;
                    }
                }
            }
        }
    }

    let java_path = java_exec.ok_or_else(|| "Nie znaleziono pliku java w rozpakowanym runtime".to_string())?;

    let _ = app_handle.emit(
        "java-download-progress",
        serde_json::json!({
            "status": "ready",
            "message": format!("Java {} gotowa do użycia!", version),
            "percentage": 100.0,
            "path": java_path
        }),
    );

    Ok(java_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_java_binary_in_nonexistent() {
        assert_eq!(find_java_binary(Path::new("/nonexistent/path/for/sure")), None);
    }
}

use crate::models::DownloadProgress;
use crate::paths::{get_assets_dir, get_libraries_dir, get_versions_dir};
use futures_util::stream::{self, StreamExt};
use serde_json::Value;
use sha1::{Digest, Sha1};
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

pub struct DownloadItem {
    pub url: String,
    pub path: PathBuf,
    pub sha1: Option<String>,
    #[allow(dead_code)]
    pub size: usize,
}

pub fn check_sha1(path: &Path, expected_sha1: &str) -> bool {
    if !path.exists() {
        return false;
    }
    if let Ok(mut file) = File::open(path) {
        let mut hasher = Sha1::new();
        let mut buffer = [0; 65536];
        while let Ok(n) = file.read(&mut buffer) {
            if n == 0 {
                break;
            }
            hasher.update(&buffer[..n]);
        }
        let hash = format!("{:x}", hasher.finalize());
        return hash.eq_ignore_ascii_case(expected_sha1);
    }
    false
}

pub async fn download_items_concurrently(
    items: Vec<DownloadItem>,
    step_name: &str,
    app_handle: &AppHandle,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .user_agent("VantMcLauncher/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    // Odfiltruj te, które już istnieją i mają poprawny SHA1
    let mut to_download = Vec::new();
    for item in items {
        if let Some(ref expected) = item.sha1 {
            if check_sha1(&item.path, expected) {
                continue;
            }
        } else if item.path.exists() {
            continue;
        }
        to_download.push(item);
    }

    let total = to_download.len();
    if total == 0 {
        let _ = app_handle.emit(
            "download-progress",
            DownloadProgress {
                step: step_name.to_string(),
                current: 0,
                total: 0,
                percentage: 100.0,
                message: format!("{} zweryfikowane!", step_name),
            },
        );
        return Ok(());
    }

    let completed = Arc::new(AtomicUsize::new(0));
    let step_str = step_name.to_string();

    let stream = stream::iter(to_download.into_iter().map(|item| {
        let client = client.clone();
        let completed = completed.clone();
        let app_handle = app_handle.clone();
        let step = step_str.clone();

        async move {
            if let Some(parent) = item.path.parent() {
                let _ = fs::create_dir_all(parent);
            }

            if let Ok(resp) = client.get(&item.url).send().await {
                if resp.status().is_success() {
                    if let Ok(bytes) = resp.bytes().await {
                        let _ = fs::write(&item.path, bytes);
                    }
                }
            }

            let done = completed.fetch_add(1, Ordering::SeqCst) + 1;
            if done % 10 == 0 || done == total {
                let pct = (done as f32 / total as f32) * 100.0;
                let _ = app_handle.emit(
                    "download-progress",
                    DownloadProgress {
                        step: step.clone(),
                        current: done,
                        total,
                        percentage: pct,
                        message: format!("{} ({}/{})", step, done, total),
                    },
                );
            }
        }
    }))
    .buffer_unordered(16);

    stream.collect::<Vec<()>>().await;
    Ok(())
}

pub async fn prepare_vanilla_files(
    version_id: &str,
    app_handle: &AppHandle,
) -> Result<(PathBuf, Value), String> {
    let client = reqwest::Client::builder()
        .user_agent("VantMcLauncher/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let version_dir = get_versions_dir().join(version_id);
    fs::create_dir_all(&version_dir).map_err(|e| e.to_string())?;
    let version_json_path = version_dir.join(format!("{}.json", version_id));

    // 1. Pobierz lub załaduj JSON wersji
    let version_json: Value = if version_json_path.exists() {
        let content = fs::read_to_string(&version_json_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())?
    } else {
        let manifest_url = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
        let manifest: Value = client
            .get(manifest_url)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?;

        let mut pkg_url = None;
        if let Some(versions) = manifest.get("versions").and_then(|v| v.as_array()) {
            for v in versions {
                if v.get("id").and_then(|id| id.as_str()) == Some(version_id) {
                    pkg_url = v.get("url").and_then(|u| u.as_str()).map(|s| s.to_string());
                    break;
                }
            }
        }

        let url = pkg_url.ok_or_else(|| format!("Nie znaleziono wersji {} w manifeście", version_id))?;
        let json_bytes = client
            .get(&url)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .bytes()
            .await
            .map_err(|e| e.to_string())?;

        fs::write(&version_json_path, &json_bytes).map_err(|e| e.to_string())?;
        serde_json::from_slice(&json_bytes).map_err(|e| e.to_string())?
    };

    // 2. Pobierz client.jar
    let client_jar_path = version_dir.join(format!("{}.jar", version_id));
    if let Some(client_dl) = version_json.pointer("/downloads/client") {
        if let Some(url) = client_dl.get("url").and_then(|u| u.as_str()) {
            let sha1 = client_dl.get("sha1").and_then(|s| s.as_str()).map(|s| s.to_string());
            let size = client_dl.get("size").and_then(|s| s.as_u64()).unwrap_or(0) as usize;

            let item = DownloadItem {
                url: url.to_string(),
                path: client_jar_path.clone(),
                sha1,
                size,
            };
            download_items_concurrently(vec![item], "Pobieranie client.jar", app_handle).await?;
        }
    }

    // 3. Zbierz biblioteki do pobrania
    let mut library_items = Vec::new();
    let current_os = match std::env::consts::OS {
        "macos" => "osx",
        "windows" => "windows",
        "linux" => "linux",
        _ => "unknown",
    };

    let is_arm64 = std::env::consts::ARCH == "aarch64";

    if let Some(libraries) = version_json.get("libraries").and_then(|l| l.as_array()) {
        for lib in libraries {
            let name = lib.get("name").and_then(|n| n.as_str()).unwrap_or("");

            // Sprawdź reguły (rules)
            if !is_library_allowed(lib, current_os) {
                continue;
            }

            if is_native_for_wrong_arch(name, current_os, is_arm64) {
                continue;
            }

            // Normalny artifact
            if let Some(artifact) = lib.pointer("/downloads/artifact") {
                if let (Some(url), Some(path_str)) = (
                    artifact.get("url").and_then(|u| u.as_str()),
                    artifact.get("path").and_then(|p| p.as_str()),
                ) {
                    if !is_native_for_wrong_arch(path_str, current_os, is_arm64) {
                        let sha1 = artifact.get("sha1").and_then(|s| s.as_str()).map(|s| s.to_string());
                        let size = artifact.get("size").and_then(|s| s.as_u64()).unwrap_or(0) as usize;
                        let target_path = get_libraries_dir().join(path_str);

                        library_items.push(DownloadItem {
                            url: url.to_string(),
                            path: target_path,
                            sha1,
                            size,
                        });
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

                    if let (Some(url), Some(path_str)) = (
                        classifier_val.get("url").and_then(|u| u.as_str()),
                        classifier_val.get("path").and_then(|p| p.as_str()),
                    ) {
                        if !is_native_for_wrong_arch(path_str, current_os, is_arm64) {
                            let sha1 = classifier_val.get("sha1").and_then(|s| s.as_str()).map(|s| s.to_string());
                            let size = classifier_val.get("size").and_then(|s| s.as_u64()).unwrap_or(0) as usize;
                            let target_path = get_libraries_dir().join(path_str);

                            library_items.push(DownloadItem {
                                url: url.to_string(),
                                path: target_path,
                                sha1,
                                size,
                            });
                        }
                    }
                }
            }
        }
    }

    download_items_concurrently(library_items, "Pobieranie bibliotek", app_handle).await?;

    // 4. Asset Index & Assety
    if let Some(asset_index) = version_json.get("assetIndex") {
        if let (Some(index_url), Some(index_id)) = (
            asset_index.get("url").and_then(|u| u.as_str()),
            asset_index.get("id").and_then(|i| i.as_str()),
        ) {
            let index_path = get_assets_dir().join("indexes").join(format!("{}.json", index_id));
            if !index_path.exists() {
                if let Some(p) = index_path.parent() {
                    let _ = fs::create_dir_all(p);
                }
                if let Ok(resp) = client.get(index_url).send().await {
                    if let Ok(bytes) = resp.bytes().await {
                        let _ = fs::write(&index_path, bytes);
                    }
                }
            }

            // Pobierz obiekty assetów
            if index_path.exists() {
                if let Ok(content) = fs::read_to_string(&index_path) {
                    if let Ok(index_data) = serde_json::from_str::<Value>(&content) {
                        if let Some(objects) = index_data.get("objects").and_then(|o| o.as_object()) {
                            let mut asset_items = Vec::new();
                            for (_key, obj) in objects {
                                if let Some(hash) = obj.get("hash").and_then(|h| h.as_str()) {
                                    if hash.len() >= 2 {
                                        let prefix = &hash[..2];
                                        let asset_url = format!("https://resources.download.minecraft.net/{}/{}", prefix, hash);
                                        let target_path = get_assets_dir().join("objects").join(prefix).join(hash);
                                        let size = obj.get("size").and_then(|s| s.as_u64()).unwrap_or(0) as usize;

                                        asset_items.push(DownloadItem {
                                            url: asset_url,
                                            path: target_path,
                                            sha1: Some(hash.to_string()),
                                            size,
                                        });
                                    }
                                }
                            }
                            download_items_concurrently(asset_items, "Pobieranie dźwięków i tekstur", app_handle).await?;
                        }
                    }
                }
            }
        }
    }

    Ok((client_jar_path, version_json))
}

pub fn is_library_allowed(lib: &Value, current_os: &str) -> bool {
    if let Some(rules) = lib.get("rules").and_then(|r| r.as_array()) {
        let mut allowed = false;
        for rule in rules {
            let action = rule.get("action").and_then(|a| a.as_str()).unwrap_or("");
            if let Some(os) = rule.get("os") {
                if let Some(os_name) = os.get("name").and_then(|n| n.as_str()) {
                    if os_name == current_os {
                        allowed = action == "allow";
                    }
                }
            } else {
                allowed = action == "allow";
            }
        }
        return allowed;
    }
    true
}

pub fn is_native_for_wrong_arch(name_or_path: &str, current_os: &str, is_arm64: bool) -> bool {
    let lower = name_or_path.to_lowercase();
    if current_os == "osx" {
        let is_macos_native = lower.contains("natives-macos")
            || lower.contains("natives-osx")
            || lower.contains("natives-darwin");

        if is_macos_native {
            let is_arm = lower.contains("arm64") || lower.contains("aarch64");
            let is_explicit_x86 = lower.contains("x86_64") || lower.contains("-x64");

            if is_arm64 && is_explicit_x86 {
                return true;
            }
            if !is_arm64 && is_arm {
                return true;
            }
        }
    } else if current_os == "windows" {
        let is_win_native = lower.contains("natives-windows");
        if is_win_native {
            let is_arm = lower.contains("arm64") || lower.contains("aarch64");
            let is_x86_32 = lower.contains("x86") && !lower.contains("x86_64");
            if is_arm64 {
                if !is_arm {
                    return true;
                }
            } else if is_arm || is_x86_32 {
                return true;
            }
        }
    } else if current_os == "linux" {
        let is_linux_native = lower.contains("natives-linux");
        if is_linux_native {
            let is_arm = lower.contains("arm64") || lower.contains("aarch64");
            if is_arm64 && !is_arm {
                return true;
            }
            if !is_arm64 && is_arm {
                return true;
            }
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_native_for_wrong_arch_macos() {
        // Jawne x86_64 powinno być ignorowane na Apple Silicon
        assert!(is_native_for_wrong_arch("org.lwjgl:lwjgl:3.3.2:natives-macos-x86_64", "osx", true));
        assert!(is_native_for_wrong_arch("org/lwjgl/lwjgl/3.3.2/lwjgl-3.3.2-natives-macos-x86_64.jar", "osx", true));

        // Klasyczne uniwersalne natives-osx (dla Minecraft 1.0 - 1.18, rd, alpha, beta) MUSZĄ być dozwolone na Apple Silicon
        assert!(!is_native_for_wrong_arch("natives-osx", "osx", true));

        // arm64 natives powinny być akceptowane na Apple Silicon
        assert!(!is_native_for_wrong_arch("org.lwjgl:lwjgl:3.3.2:natives-macos-arm64", "osx", true));
        assert!(!is_native_for_wrong_arch("org/lwjgl/lwjgl/3.3.2/lwjgl-3.3.2-natives-macos-arm64.jar", "osx", true));

        // Zwykłe biblioteki nie są natywne (zwraca false)
        assert!(!is_native_for_wrong_arch("org.lwjgl:lwjgl:3.3.2", "osx", true));

        // Na maszynie Intel (is_arm64 = false):
        // arm64 natives powinny być ignorowane (zwraca true)
        assert!(is_native_for_wrong_arch("org.lwjgl:lwjgl:3.3.2:natives-macos-arm64", "osx", false));
        // x86_64 natives powinny być akceptowane (zwraca false)
        assert!(!is_native_for_wrong_arch("org.lwjgl:lwjgl:3.3.2:natives-macos-x86_64", "osx", false));
    }
}

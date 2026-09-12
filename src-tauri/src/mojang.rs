use crate::models::{VersionEntry, VersionManifest};
use crate::paths::get_versions_dir;
use serde_json::Value;
use std::fs;

const MOJANG_MANIFEST_URL: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

pub async fn get_mc_versions() -> Result<Vec<VersionEntry>, String> {
    let cache_file = get_versions_dir().join("version_manifest_v2.json");

    // Spróbuj pobrać najnowszy z sieci
    let client = reqwest::Client::builder()
        .user_agent("VantMcLauncher/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    if let Ok(resp) = client.get(MOJANG_MANIFEST_URL).send().await {
        if resp.status().is_success() {
            if let Ok(bytes) = resp.bytes().await {
                let _ = fs::write(&cache_file, &bytes);
                if let Ok(manifest) = serde_json::from_slice::<VersionManifest>(&bytes) {
                    return Ok(manifest.versions);
                }
            }
        }
    }

    // Jeśli brak internetu, użyj cache
    if cache_file.exists() {
        if let Ok(content) = fs::read_to_string(&cache_file) {
            if let Ok(manifest) = serde_json::from_str::<VersionManifest>(&content) {
                return Ok(manifest.versions);
            }
        }
    }

    // W ostateczności zwróć listę popularnych wersji
    Ok(vec![
        VersionEntry {
            id: "1.20.4".to_string(),
            version_type: "release".to_string(),
            url: "".to_string(),
            release_time: "2023-12-07T11:46:17+00:00".to_string(),
        },
        VersionEntry {
            id: "1.20.1".to_string(),
            version_type: "release".to_string(),
            url: "".to_string(),
            release_time: "2023-06-12T13:45:00+00:00".to_string(),
        },
        VersionEntry {
            id: "1.19.4".to_string(),
            version_type: "release".to_string(),
            url: "".to_string(),
            release_time: "2023-03-14T12:00:00+00:00".to_string(),
        },
        VersionEntry {
            id: "1.16.5".to_string(),
            version_type: "release".to_string(),
            url: "".to_string(),
            release_time: "2021-01-15T12:00:00+00:00".to_string(),
        },
        VersionEntry {
            id: "1.12.2".to_string(),
            version_type: "release".to_string(),
            url: "".to_string(),
            release_time: "2017-09-18T12:00:00+00:00".to_string(),
        },
        VersionEntry {
            id: "1.8.9".to_string(),
            version_type: "release".to_string(),
            url: "".to_string(),
            release_time: "2015-12-09T12:00:00+00:00".to_string(),
        },
    ])
}

pub async fn get_fabric_loaders(game_version: &str) -> Result<Vec<String>, String> {
    let url = format!("https://meta.fabricmc.net/v2/versions/loader/{}", game_version);
    let client = reqwest::Client::builder()
        .user_agent("VantMcLauncher/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    if let Ok(resp) = client.get(&url).send().await {
        if resp.status().is_success() {
            if let Ok(data) = resp.json::<Vec<Value>>().await {
                let mut versions = Vec::new();
                for item in data {
                    if let Some(loader) = item.get("loader") {
                        if let Some(ver) = loader.get("version").and_then(|v| v.as_str()) {
                            versions.push(ver.to_string());
                        }
                    }
                }
                if !versions.is_empty() {
                    return Ok(versions);
                }
            }
        }
    }

    // Domyślna wersja fabric loadera
    Ok(vec!["0.15.11".to_string(), "0.15.7".to_string(), "0.14.25".to_string()])
}

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
                if let Some(versions) = parse_manifest_bytes(&bytes) {
                    return Ok(versions);
                }
            }
        }
    }

    // Jeśli brak internetu, użyj cache
    if cache_file.exists() {
        if let Ok(bytes) = fs::read(&cache_file) {
            if let Some(versions) = parse_manifest_bytes(&bytes) {
                return Ok(versions);
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

pub fn parse_manifest_bytes(bytes: &[u8]) -> Option<Vec<VersionEntry>> {
    // 1. Spróbuj serde_json::from_slice ze strukturą VersionManifest
    if let Ok(manifest) = serde_json::from_slice::<VersionManifest>(bytes) {
        if !manifest.versions.is_empty() {
            return Some(manifest.versions);
        }
    }

    // 2. Fallback: dynamiczne parsowanie z Value
    if let Ok(v) = serde_json::from_slice::<Value>(bytes) {
        if let Some(arr) = v.get("versions").and_then(|a| a.as_array()) {
            let mut list = Vec::new();
            for item in arr {
                if let (Some(id), Some(vtype)) = (
                    item.get("id").and_then(|i| i.as_str()),
                    item.get("type").and_then(|t| t.as_str()),
                ) {
                    list.push(VersionEntry {
                        id: id.to_string(),
                        version_type: vtype.to_string(),
                        url: item.get("url").and_then(|u| u.as_str()).unwrap_or("").to_string(),
                        release_time: item
                            .get("releaseTime")
                            .or_else(|| item.get("release_time"))
                            .and_then(|r| r.as_str())
                            .unwrap_or("")
                            .to_string(),
                    });
                }
            }
            if !list.is_empty() {
                return Some(list);
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_manifest_mojang_format() {
        let sample = r#"{
            "latest": {"release": "26.2", "snapshot": "26.3-rc-2"},
            "versions": [
                {
                    "id": "26.2",
                    "type": "release",
                    "url": "https://piston-meta.mojang.com/v1/packages/26.2.json",
                    "time": "2026-09-11T06:44:16+00:00",
                    "releaseTime": "2026-06-16T12:03:33+00:00",
                    "sha1": "bc42e43dfe43d65a2f6c2c1dbb322c75134e51fe",
                    "complianceLevel": 1
                },
                {
                    "id": "1.2.5",
                    "type": "release",
                    "url": "https://piston-meta.mojang.com/v1/packages/1.2.5.json",
                    "time": "2022-03-10T09:51:38+00:00",
                    "releaseTime": "2012-03-29T22:00:00+00:00",
                    "sha1": "5158765caf1ca14958cb6c45d52c8e09ed9b046c",
                    "complianceLevel": 0
                }
            ]
        }"#;

        let parsed = parse_manifest_bytes(sample.as_bytes()).expect("Should parse versions");
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].id, "26.2");
        assert_eq!(parsed[0].version_type, "release");
        assert_eq!(parsed[0].release_time, "2026-06-16T12:03:33+00:00");
        assert_eq!(parsed[1].id, "1.2.5");
        assert_eq!(parsed[1].version_type, "release");
    }
}

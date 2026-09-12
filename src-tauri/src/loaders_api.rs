use crate::paths::get_versions_dir;
use serde::Deserialize;
use std::fs;
use std::time::SystemTime;

#[derive(Debug, Deserialize)]
struct QuiltLoaderEntry {
    loader: QuiltLoaderInfo,
}

#[derive(Debug, Deserialize)]
struct QuiltLoaderInfo {
    version: String,
}

#[derive(Debug, Deserialize)]
struct NeoForgeMavenMetadata {
    versions: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct ForgePromotions {
    promos: Option<std::collections::HashMap<String, String>>,
}

pub async fn get_quilt_loaders(game_version: &str) -> Result<Vec<String>, String> {
    let url = format!("https://meta.quiltmc.org/v3/versions/loader/{}", game_version);
    let client = reqwest::Client::builder()
        .user_agent("VantMcLauncher/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Ok(vec!["0.20.0-beta.9".to_string()]); // Fallback
    }

    let entries: Vec<QuiltLoaderEntry> = res.json().await.unwrap_or_default();
    let versions: Vec<String> = entries.into_iter().map(|e| e.loader.version).collect();
    if versions.is_empty() {
        Ok(vec!["0.20.0-beta.9".to_string()])
    } else {
        Ok(versions)
    }
}

pub async fn get_neoforge_versions(game_version: &str) -> Result<Vec<String>, String> {
    let url = "https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge";
    let client = reqwest::Client::builder()
        .user_agent("VantMcLauncher/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let res = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Ok(vec![]);
    }

    let metadata: NeoForgeMavenMetadata = res.json().await.unwrap_or(NeoForgeMavenMetadata { versions: None });
    let all_versions = metadata.versions.unwrap_or_default();

    // Filtruj po wersji Minecrafta (np. "20.4" dla "1.20.4" lub "21.1" dla "1.21.1")
    let short_ver = game_version.strip_prefix("1.").unwrap_or(game_version);
    let matching: Vec<String> = all_versions
        .into_iter()
        .rev()
        .filter(|v| v.starts_with(short_ver))
        .collect();

    Ok(matching)
}

pub fn parse_forge_versions_from_xml(xml: &str, game_version: &str) -> Vec<String> {
    let prefix = format!("{}-", game_version);
    let mut versions = Vec::new();
    for line in xml.lines() {
        if let Some(start) = line.find("<version>") {
            if let Some(end) = line.find("</version>") {
                let ver_str = line[start + 9..end].trim();
                if let Some(stripped) = ver_str.strip_prefix(&prefix) {
                    if !versions.contains(&stripped.to_string()) {
                        versions.push(stripped.to_string());
                    }
                }
            }
        }
    }
    // Zwróć od najnowszych do najstarszych
    versions.reverse();
    versions
}

pub async fn get_forge_versions(game_version: &str) -> Result<Vec<String>, String> {
    let client = reqwest::Client::builder()
        .user_agent("VantMcLauncher/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    // 1. Pobierz promotions_slim.json (zalecana i najnowsza wersja)
    let promos_url = "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json";
    let mut recommended_ver: Option<String> = None;
    let mut latest_ver: Option<String> = None;

    if let Ok(res) = client.get(promos_url).send().await {
        if res.status().is_success() {
            if let Ok(data) = res.json::<ForgePromotions>().await {
                if let Some(promos) = data.promos {
                    let rec_key = format!("{}-recommended", game_version);
                    let lat_key = format!("{}-latest", game_version);
                    recommended_ver = promos.get(&rec_key).cloned();
                    latest_ver = promos.get(&lat_key).cloned();
                }
            }
        }
    }

    // 2. Pobierz pełną bazę wersji z maven-metadata.xml (z pamięcią podręczną)
    let cache_file = get_versions_dir().join("forge_maven_metadata.xml");
    let xml_content = if let Ok(metadata) = fs::metadata(&cache_file) {
        let is_fresh = if let Ok(modified) = metadata.modified() {
            if let Ok(duration) = SystemTime::now().duration_since(modified) {
                duration.as_secs() < 86400 // 24h
            } else {
                false
            }
        } else {
            false
        };

        if is_fresh {
            fs::read_to_string(&cache_file).unwrap_or_default()
        } else {
            fetch_and_cache_forge_xml(&client, &cache_file).await
        }
    } else {
        fetch_and_cache_forge_xml(&client, &cache_file).await
    };

    let all_forge_for_mc = parse_forge_versions_from_xml(&xml_content, game_version);

    let mut results = Vec::new();

    // Dodaj zalecaną na samej górze jeśli istnieje
    if let Some(ref rec) = recommended_ver {
        results.push(format!("{} (zalecana)", rec));
    }

    // Dodaj najnowszą jeśli istnieje i różni się od zalecanej
    if let Some(ref lat) = latest_ver {
        if Some(lat) != recommended_ver.as_ref() {
            results.push(format!("{} (najnowsza)", lat));
        }
    }

    // Dodaj wszystkie pozostałe wersje
    for ver in all_forge_for_mc {
        let is_rec = recommended_ver.as_ref() == Some(&ver);
        let is_lat = latest_ver.as_ref() == Some(&ver);
        if !is_rec && !is_lat {
            results.push(ver);
        }
    }

    // Jeśli z jakiegoś powodu XML nie zawierał wersji, ale promotions miało zalecaną/najnowszą:
    if results.is_empty() {
        if let Some(rec) = recommended_ver {
            results.push(rec);
        }
        if let Some(lat) = latest_ver {
            if !results.contains(&lat) {
                results.push(lat);
            }
        }
    }

    Ok(results)
}

async fn fetch_and_cache_forge_xml(client: &reqwest::Client, cache_file: &std::path::Path) -> String {
    let url = "https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml";
    if let Ok(res) = client.get(url).send().await {
        if res.status().is_success() {
            if let Ok(text) = res.text().await {
                let _ = fs::write(cache_file, &text);
                return text;
            }
        }
    }
    // Jeśli pobieranie sieciowe nie powiodło się, spróbuj przeczytać stary cache
    fs::read_to_string(cache_file).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_forge_versions_from_xml() {
        let sample_xml = r#"
        <metadata>
            <versioning>
                <versions>
                    <version>1.20.1-47.1.0</version>
                    <version>1.20.1-47.2.0</version>
                    <version>1.20.1-47.3.0</version>
                    <version>1.20.4-49.0.1</version>
                </versions>
            </versioning>
        </metadata>
        "#;
        let versions = parse_forge_versions_from_xml(sample_xml, "1.20.1");
        assert_eq!(versions, vec!["47.3.0", "47.2.0", "47.1.0"]);
    }
}

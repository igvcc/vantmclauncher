use serde::Deserialize;

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
        .user_agent("VantMcLauncher/0.1.0")
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
        .user_agent("VantMcLauncher/0.1.0")
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
        .take(15)
        .collect();

    Ok(matching)
}

pub async fn get_forge_versions(game_version: &str) -> Result<Vec<String>, String> {
    let url = "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json";
    let client = reqwest::Client::builder()
        .user_agent("VantMcLauncher/0.1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let res = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Ok(vec![]);
    }

    let data: ForgePromotions = res.json().await.unwrap_or(ForgePromotions { promos: None });
    let mut results = Vec::new();

    if let Some(promos) = data.promos {
        let rec_key = format!("{}-recommended", game_version);
        let lat_key = format!("{}-latest", game_version);

        if let Some(rec) = promos.get(&rec_key) {
            results.push(format!("{} (zalecana)", rec));
        }
        if let Some(lat) = promos.get(&lat_key) {
            if !results.iter().any(|r| r.starts_with(lat)) {
                results.push(format!("{} (najnowsza)", lat));
            }
        }
    }

    Ok(results)
}

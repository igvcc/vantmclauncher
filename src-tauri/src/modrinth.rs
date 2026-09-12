use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Write;
use crate::paths::get_instance_mods_dir;
use crate::mods::parse_mod_file;
use crate::models::ModItem;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModrinthSearchResult {
    pub hits: Vec<ModrinthMod>,
    pub offset: u32,
    pub limit: u32,
    pub total_hits: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModrinthMod {
    pub project_id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub icon_url: Option<String>,
    pub downloads: u64,
    pub follows: Option<u64>,
    pub categories: Vec<String>,
    pub client_side: Option<String>,
    pub server_side: Option<String>,
    pub author: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModrinthVersion {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub version_number: String,
    pub game_versions: Vec<String>,
    pub loaders: Vec<String>,
    pub files: Vec<ModrinthFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModrinthFile {
    pub url: String,
    pub filename: String,
    pub primary: bool,
    pub size: u64,
}

pub async fn search_mods(
    query: &str,
    loader: Option<&str>,
    mc_version: Option<&str>,
    limit: u32,
    offset: u32,
) -> Result<ModrinthSearchResult, String> {
    let client = reqwest::Client::builder()
        .user_agent("VantMcLauncher/0.1.0 (vant.fun)")
        .build()
        .map_err(|e| format!("Błąd klienta HTTP: {}", e))?;

    let mut facets: Vec<Vec<String>> = vec![vec!["project_type:mod".to_string()]];

    if let Some(l) = loader {
        let l_clean = l.to_lowercase();
        if l_clean != "vanilla" && !l_clean.is_empty() {
            facets.push(vec![format!("categories:{}", l_clean)]);
        }
    }

    if let Some(v) = mc_version {
        if !v.is_empty() {
            facets.push(vec![format!("versions:{}", v)]);
        }
    }

    let facets_json = serde_json::to_string(&facets).unwrap_or_else(|_| "[]".to_string());
    let limit_str = limit.min(50).to_string();
    let offset_str = offset.to_string();

    let mut req = client
        .get("https://api.modrinth.com/v2/search")
        .query(&[
            ("limit", limit_str.as_str()),
            ("offset", offset_str.as_str()),
            ("facets", facets_json.as_str()),
        ]);

    let trimmed = query.trim();
    if !trimmed.is_empty() {
        req = req.query(&[("query", trimmed)]);
    }

    let res = req
        .send()
        .await
        .map_err(|e| format!("Błąd zapytania do Modrinth API: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Modrinth API zwróciło status: {}", res.status()));
    }

    let data: ModrinthSearchResult = res
        .json()
        .await
        .map_err(|e| format!("Błąd parsowania odpowiedzi Modrinth: {}", e))?;

    Ok(data)
}

pub async fn get_project_versions(
    project_id: &str,
    loader: Option<&str>,
    mc_version: Option<&str>,
) -> Result<Vec<ModrinthVersion>, String> {
    let client = reqwest::Client::builder()
        .user_agent("VantMcLauncher/0.1.0 (vant.fun)")
        .build()
        .map_err(|e| format!("Błąd klienta HTTP: {}", e))?;

    let url = format!("https://api.modrinth.com/v2/project/{}/version", project_id);
    let mut req = client.get(&url);

    if let Some(l) = loader {
        let l_clean = l.to_lowercase();
        if l_clean != "vanilla" && !l_clean.is_empty() {
            let json = serde_json::to_string(&vec![l_clean]).unwrap_or_default();
            req = req.query(&[("loaders", json)]);
        }
    }

    if let Some(v) = mc_version {
        if !v.is_empty() {
            let json = serde_json::to_string(&vec![v]).unwrap_or_default();
            req = req.query(&[("game_versions", json)]);
        }
    }

    let res = req
        .send()
        .await
        .map_err(|e| format!("Błąd zapytania o wersje z Modrinth: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Modrinth API zwróciło status: {}", res.status()));
    }

    let versions: Vec<ModrinthVersion> = res
        .json()
        .await
        .map_err(|e| format!("Błąd parsowania wersji Modrinth: {}", e))?;

    Ok(versions)
}

pub async fn install_mod_version(
    instance_id: &str,
    file_url: &str,
    filename: &str,
) -> Result<ModItem, String> {
    let client = reqwest::Client::builder()
        .user_agent("VantMcLauncher/0.1.0 (vant.fun)")
        .build()
        .map_err(|e| format!("Błąd klienta HTTP: {}", e))?;

    let res = client
        .get(file_url)
        .send()
        .await
        .map_err(|e| format!("Błąd pobierania pliku moda: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Nie udało się pobrać moda: HTTP {}", res.status()));
    }

    let bytes = res
        .bytes()
        .await
        .map_err(|e| format!("Błąd odczytu danych pliku: {}", e))?;

    let mods_dir = get_instance_mods_dir(instance_id);
    let dest_path = mods_dir.join(filename);

    let mut file = File::create(&dest_path).map_err(|e| format!("Błąd tworzenia pliku na dysku: {}", e))?;
    file.write_all(&bytes).map_err(|e| format!("Błąd zapisu pliku: {}", e))?;

    let item = parse_mod_file(&dest_path, filename);
    Ok(item)
}

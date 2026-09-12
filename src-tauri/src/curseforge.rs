use serde::{Deserialize, Serialize};

pub const CURSEFORGE_API_KEY: &str = "$2a$10$wuAJuNZuted3NORVmpgUC.m8sI.pv1tOPKZyBgLFGjxFp/br0lZCC";
pub const MINECRAFT_GAME_ID: u32 = 432;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurseForgeSearchResult {
    pub data: Vec<CurseForgeMod>,
    pub pagination: CurseForgePagination,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurseForgePagination {
    pub index: u32,
    pub page_size: u32,
    pub result_count: u32,
    pub total_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurseForgeMod {
    pub id: u64,
    pub name: String,
    pub slug: String,
    pub summary: String,
    pub download_count: f64,
    pub logo: Option<CurseForgeLogo>,
    pub authors: Vec<CurseForgeAuthor>,
    pub categories: Vec<CurseForgeCategory>,
    pub date_modified: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurseForgeLogo {
    pub thumbnail_url: Option<String>,
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurseForgeAuthor {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurseForgeCategory {
    pub name: String,
    pub slug: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurseForgeFilesResponse {
    pub data: Vec<CurseForgeFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurseForgeFile {
    pub id: u64,
    pub mod_id: u64,
    pub display_name: String,
    pub file_name: String,
    pub file_date: String,
    pub file_length: u64,
    pub release_type: u8, // 1 = Release, 2 = Beta, 3 = Alpha
    pub download_url: Option<String>,
    pub game_versions: Vec<String>,
}

pub fn map_loader_to_curseforge_type(loader: Option<&str>) -> u32 {
    match loader.map(|l| l.to_lowercase()).as_deref() {
        Some("forge") => 1,
        Some("fabric") => 4,
        Some("quilt") => 5,
        Some("neoforge") => 6,
        _ => 0, // 0 = Any
    }
}

pub fn map_category_to_curseforge_class(category: &str) -> u32 {
    match category {
        "mods" => 6,
        "resourcepacks" | "texturepacks" => 12,
        "shaderpacks" | "shaders" => 6552,
        "datapacks" => 6945,
        _ => 6,
    }
}

pub fn get_curseforge_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("VantMcLauncher/0.1.0 (vant.fun)")
        .build()
        .map_err(|e| format!("Błąd inicjalizacji klienta HTTP dla CurseForge: {}", e))
}

pub async fn search_curseforge(
    query: &str,
    category: &str,
    loader: Option<&str>,
    mc_version: Option<&str>,
    limit: u32,
    offset: u32,
) -> Result<Vec<CurseForgeMod>, String> {
    let client = get_curseforge_client()?;
    let class_id = map_category_to_curseforge_class(category);
    let loader_type = if category == "mods" {
        map_loader_to_curseforge_type(loader)
    } else {
        0
    };

    let page_size_str = limit.min(50).to_string();
    let offset_str = offset.to_string();
    let class_id_str = class_id.to_string();
    let loader_type_str = loader_type.to_string();
    let game_id_str = MINECRAFT_GAME_ID.to_string();

    let mut query_params: Vec<(&str, &str)> = vec![
        ("gameId", &game_id_str),
        ("classId", &class_id_str),
        ("pageSize", &page_size_str),
        ("index", &offset_str),
        ("sortField", "2"), // Popularity
        ("sortOrder", "desc"),
    ];

    let trimmed_query = query.trim();
    if !trimmed_query.is_empty() {
        query_params.push(("searchFilter", trimmed_query));
    }

    if loader_type > 0 {
        query_params.push(("modLoaderType", &loader_type_str));
    }

    // Only apply mc_version filter if specified
    let version_clean = mc_version.unwrap_or("").trim();
    if !version_clean.is_empty() && category == "mods" {
        query_params.push(("gameVersion", version_clean));
    }

    let res = client
        .get("https://api.curseforge.com/v1/mods/search")
        .header("x-api-key", CURSEFORGE_API_KEY)
        .header("Accept", "application/json")
        .query(&query_params)
        .send()
        .await
        .map_err(|e| format!("Błąd zapytania do CurseForge API: {}", e))?;

    if res.status().is_success() {
        let text = res.text().await.map_err(|e| format!("Błąd odczytu CurseForge: {}", e))?;
        if let Ok(data) = serde_json::from_str::<serde_json::Value>(&text) {
            if let Some(items) = data.get("data").and_then(|d| d.as_array()) {
                if items.is_empty() && !version_clean.is_empty() {
                    // Retry without gameVersion
                    let mut fallback_params: Vec<(&str, &str)> = vec![
                        ("gameId", &game_id_str),
                        ("classId", &class_id_str),
                        ("pageSize", &page_size_str),
                        ("index", &offset_str),
                        ("sortField", "2"),
                        ("sortOrder", "desc"),
                    ];
                    if !trimmed_query.is_empty() {
                        fallback_params.push(("searchFilter", trimmed_query));
                    }
                    if loader_type > 0 {
                        fallback_params.push(("modLoaderType", &loader_type_str));
                    }

                    if let Ok(retry_res) = client
                        .get("https://api.curseforge.com/v1/mods/search")
                        .header("x-api-key", CURSEFORGE_API_KEY)
                        .header("Accept", "application/json")
                        .query(&fallback_params)
                        .send()
                        .await
                    {
                        if retry_res.status().is_success() {
                            if let Ok(retry_text) = retry_res.text().await {
                                if let Ok(parsed) = parse_curseforge_mods_json(&retry_text) {
                                    return Ok(parsed);
                                }
                            }
                        }
                    }
                }
            }
        }
        return parse_curseforge_mods_json(&text);
    }

    Err(format!("CurseForge API zwróciło status: {}", res.status()))
}

fn parse_curseforge_mods_json(text: &str) -> Result<Vec<CurseForgeMod>, String> {
    let json: serde_json::Value = serde_json::from_str(text)
        .map_err(|e| format!("Błąd parsowania JSON z CurseForge: {}", e))?;

    let mut mods = Vec::new();
    if let Some(arr) = json.get("data").and_then(|d| d.as_array()) {
        for item in arr {
            let id = item.get("id").and_then(|v| v.as_u64()).unwrap_or(0);
            let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let slug = item.get("slug").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let summary = item.get("summary").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let download_count = item.get("downloadCount").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let date_modified = item.get("dateModified").and_then(|v| v.as_str()).map(|s| s.to_string());

            let mut logo = None;
            if let Some(l) = item.get("logo") {
                let thumbnail_url = l.get("thumbnailUrl").and_then(|v| v.as_str()).map(|s| s.to_string());
                let url = l.get("url").and_then(|v| v.as_str()).map(|s| s.to_string());
                logo = Some(CurseForgeLogo { thumbnail_url, url });
            }

            let mut authors = Vec::new();
            if let Some(a_arr) = item.get("authors").and_then(|v| v.as_array()) {
                for a in a_arr {
                    if let Some(an) = a.get("name").and_then(|v| v.as_str()) {
                        authors.push(CurseForgeAuthor { name: an.to_string() });
                    }
                }
            }

            let mut categories = Vec::new();
            if let Some(c_arr) = item.get("categories").and_then(|v| v.as_array()) {
                for c in c_arr {
                    let cn = c.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let cs = c.get("slug").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    if !cn.is_empty() {
                        categories.push(CurseForgeCategory { name: cn, slug: cs });
                    }
                }
            }

            mods.push(CurseForgeMod {
                id,
                name,
                slug,
                summary,
                download_count,
                logo,
                authors,
                categories,
                date_modified,
            });
        }
    }

    Ok(mods)
}

pub async fn get_curseforge_files(
    mod_id: u64,
    _loader: Option<&str>,
    _mc_version: Option<&str>,
) -> Result<Vec<CurseForgeFile>, String> {
    let client = get_curseforge_client()?;
    let url = format!("https://api.curseforge.com/v1/mods/{}/files?pageSize=50", mod_id);

    let res = client
        .get(&url)
        .header("x-api-key", CURSEFORGE_API_KEY)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Błąd pobierania plików modyfikacji z CurseForge: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("CurseForge API zwróciło status: {}", res.status()));
    }

    let text = res.text().await.map_err(|e| format!("Błąd odczytu odpowiedzi: {}", e))?;
    let json: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("Błąd parsowania plików z CurseForge: {}", e))?;

    let mut files = Vec::new();
    if let Some(arr) = json.get("data").and_then(|d| d.as_array()) {
        for f in arr {
            let id = f.get("id").and_then(|v| v.as_u64()).unwrap_or(0);
            let display_name = f.get("displayName").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let file_name = f.get("fileName").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let file_date = f.get("fileDate").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let file_length = f.get("fileLength").and_then(|v| v.as_u64()).unwrap_or(0);
            let release_type = f.get("releaseType").and_then(|v| v.as_u64()).unwrap_or(1) as u8;

            let mut download_url = f.get("downloadUrl").and_then(|v| v.as_str()).map(|s| s.to_string());
            if download_url.is_none() || download_url.as_ref().map(|s| s.is_empty()).unwrap_or(true) {
                // Official CurseForge CDN fallback calculation
                let part1 = id / 1000;
                let part2 = id % 1000;
                download_url = Some(format!("https://edge.forgecdn.net/files/{}/{}/{}", part1, part2, file_name));
            }

            let mut game_versions = Vec::new();
            if let Some(gv_arr) = f.get("gameVersions").and_then(|v| v.as_array()) {
                for gv in gv_arr {
                    if let Some(s) = gv.as_str() {
                        game_versions.push(s.to_string());
                    }
                }
            }

            files.push(CurseForgeFile {
                id,
                mod_id,
                display_name,
                file_name,
                file_date,
                file_length,
                release_type,
                download_url,
                game_versions,
            });
        }
    }

    Ok(files)
}

use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use crate::paths::{
    get_instance_mods_dir,
    get_instance_resourcepacks_dir,
    get_instance_shaderpacks_dir,
    get_instance_datapacks_dir,
};
use crate::modrinth;
use crate::curseforge;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnifiedCatalogItem {
    pub id: String,
    pub source: String, // "modrinth" | "curseforge"
    pub raw_id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub icon_url: Option<String>,
    pub downloads: u64,
    pub categories: Vec<String>,
    pub author: String,
    pub category: String, // "mods" | "resourcepacks" | "shaderpacks" | "datapacks"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnifiedVersionItem {
    pub id: String,
    pub source: String,
    pub project_id: String,
    pub name: String,
    pub version_number: String,
    pub release_type: String, // "release" | "beta" | "alpha"
    pub game_versions: Vec<String>,
    pub loaders: Vec<String>,
    pub file_name: String,
    pub file_size: u64,
    pub download_url: String,
    pub date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnifiedInstalledItem {
    pub filename: String,
    pub name: String,
    pub enabled: bool,
    pub size: u64,
    pub category: String,
    pub description: String,
    pub icon_base64: Option<String>,
}

pub fn get_content_dir(instance_id: &str, category: &str) -> PathBuf {
    match category {
        "resourcepacks" | "texturepacks" => get_instance_resourcepacks_dir(instance_id),
        "shaderpacks" | "shaders" => get_instance_shaderpacks_dir(instance_id),
        "datapacks" => get_instance_datapacks_dir(instance_id),
        _ => get_instance_mods_dir(instance_id),
    }
}

pub async fn search_content(
    query: &str,
    category: &str,
    source: &str,
    loader: Option<&str>,
    mc_version: Option<&str>,
    limit: u32,
    offset: u32,
) -> Result<Vec<UnifiedCatalogItem>, String> {
    let source_clean = source.to_lowercase();

    if source_clean == "modrinth" {
        return search_modrinth_unified(query, category, loader, mc_version, limit, offset).await;
    }

    if source_clean == "curseforge" {
        return search_curseforge_unified(query, category, loader, mc_version, limit, offset).await;
    }

    // Both sources combined ("all")
    let half_limit = (limit / 2).max(10);
    let (modrinth_res, curseforge_res) = tokio::join!(
        search_modrinth_unified(query, category, loader, mc_version, half_limit, offset),
        search_curseforge_unified(query, category, loader, mc_version, half_limit, offset)
    );

    let mut combined = Vec::new();
    let m_items = modrinth_res.unwrap_or_default();
    let c_items = curseforge_res.unwrap_or_default();

    let max_len = m_items.len().max(c_items.len());
    for i in 0..max_len {
        if i < m_items.len() {
            combined.push(m_items[i].clone());
        }
        if i < c_items.len() {
            // Avoid exact duplicate titles
            let is_dup = combined.iter().any(|existing| {
                existing.title.trim().eq_ignore_ascii_case(c_items[i].title.trim())
            });
            if !is_dup {
                combined.push(c_items[i].clone());
            }
        }
    }

    Ok(combined)
}

async fn search_modrinth_unified(
    query: &str,
    category: &str,
    loader: Option<&str>,
    mc_version: Option<&str>,
    limit: u32,
    offset: u32,
) -> Result<Vec<UnifiedCatalogItem>, String> {
    let res = modrinth::search_content_typed(query, category, loader, mc_version, limit, offset).await?;

    let items = res.hits.into_iter().map(|hit| {
        UnifiedCatalogItem {
            id: format!("modrinth:{}", hit.project_id),
            source: "modrinth".to_string(),
            raw_id: hit.project_id,
            slug: hit.slug,
            title: hit.title,
            description: hit.description,
            icon_url: hit.icon_url,
            downloads: hit.downloads,
            categories: hit.categories,
            author: hit.author,
            category: category.to_string(),
        }
    }).collect();

    Ok(items)
}

async fn search_curseforge_unified(
    query: &str,
    category: &str,
    loader: Option<&str>,
    mc_version: Option<&str>,
    limit: u32,
    offset: u32,
) -> Result<Vec<UnifiedCatalogItem>, String> {
    let mods = curseforge::search_curseforge(query, category, loader, mc_version, limit, offset).await?;

    let items = mods.into_iter().map(|m| {
        let author_name = m.authors.first().map(|a| a.name.clone()).unwrap_or_else(|| "CurseForge".to_string());
        let icon_url = m.logo.as_ref().and_then(|l| l.thumbnail_url.clone().or_else(|| l.url.clone()));
        let categories = m.categories.into_iter().map(|c| c.name).collect();

        UnifiedCatalogItem {
            id: format!("curseforge:{}", m.id),
            source: "curseforge".to_string(),
            raw_id: m.id.to_string(),
            slug: m.slug,
            title: m.name,
            description: m.summary,
            icon_url,
            downloads: m.download_count as u64,
            categories,
            author: author_name,
            category: category.to_string(),
        }
    }).collect();

    Ok(items)
}

pub async fn get_content_versions(
    project_id: &str,
    source: &str,
    _category: &str,
    loader: Option<&str>,
    mc_version: Option<&str>,
) -> Result<Vec<UnifiedVersionItem>, String> {
    let source_clean = source.to_lowercase();
    let raw_id = if let Some(idx) = project_id.find(':') {
        &project_id[idx + 1..]
    } else {
        project_id
    };

    if source_clean == "curseforge" || project_id.starts_with("curseforge:") {
        let mod_id: u64 = raw_id.parse().map_err(|_| format!("Nieprawidłowe ID projektu CurseForge: {}", raw_id))?;
        let files = curseforge::get_curseforge_files(mod_id, loader, mc_version).await?;

        let versions = files.into_iter().map(|f| {
            let release_type_str = match f.release_type {
                1 => "release",
                2 => "beta",
                3 => "alpha",
                _ => "release",
            };

            // Extract loaders from game_versions if present
            let mut loaders = Vec::new();
            let mut game_vers = Vec::new();
            for gv in &f.game_versions {
                let gv_lower = gv.to_lowercase();
                if gv_lower == "fabric" || gv_lower == "forge" || gv_lower == "neoforge" || gv_lower == "quilt" {
                    loaders.push(gv.clone());
                } else if !gv_lower.contains("client") && !gv_lower.contains("server") {
                    game_vers.push(gv.clone());
                }
            }

            UnifiedVersionItem {
                id: format!("curseforge:{}", f.id),
                source: "curseforge".to_string(),
                project_id: raw_id.to_string(),
                name: f.display_name,
                version_number: f.file_name.clone(),
                release_type: release_type_str.to_string(),
                game_versions: game_vers,
                loaders,
                file_name: f.file_name,
                file_size: f.file_length,
                download_url: f.download_url.unwrap_or_default(),
                date: Some(f.file_date),
            }
        }).collect();

        return Ok(versions);
    }

    // Default to Modrinth
    let versions = modrinth::get_project_versions(raw_id, loader, mc_version).await?;
    let unified = versions.into_iter().map(|v| {
        let primary_file = v.files.iter().find(|f| f.primary).or_else(|| v.files.first());
        let (file_name, file_size, download_url) = if let Some(pf) = primary_file {
            (pf.filename.clone(), pf.size, pf.url.clone())
        } else {
            ("unknown".to_string(), 0, "".to_string())
        };

        let rel_type = v.version_type.unwrap_or_else(|| "release".to_string());

        UnifiedVersionItem {
            id: format!("modrinth:{}", v.id),
            source: "modrinth".to_string(),
            project_id: raw_id.to_string(),
            name: v.name,
            version_number: v.version_number,
            release_type: rel_type,
            game_versions: v.game_versions,
            loaders: v.loaders,
            file_name,
            file_size,
            download_url,
            date: v.date_published,
        }
    }).collect();

    Ok(unified)
}

pub async fn install_content_file(
    instance_id: &str,
    category: &str,
    file_url: &str,
    filename: &str,
) -> Result<UnifiedInstalledItem, String> {
    let client = reqwest::Client::builder()
        .user_agent("VantMcLauncher/0.1.0 (vant.fun)")
        .build()
        .map_err(|e| format!("Błąd klienta HTTP: {}", e))?;

    let res = client
        .get(file_url)
        .send()
        .await
        .map_err(|e| format!("Błąd pobierania pliku: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Serwer zwrócił błąd pobierania pliku: HTTP {}", res.status()));
    }

    let bytes = res
        .bytes()
        .await
        .map_err(|e| format!("Błąd odczytu danych pliku: {}", e))?;

    let target_dir = get_content_dir(instance_id, category);
    let dest_path = target_dir.join(filename);

    let mut file = File::create(&dest_path).map_err(|e| format!("Błąd tworzenia pliku na dysku: {}", e))?;
    file.write_all(&bytes).map_err(|e| format!("Błąd zapisu pliku: {}", e))?;

    let size = bytes.len() as u64;
    let name = filename
        .trim_end_matches(".disabled")
        .trim_end_matches(".jar")
        .trim_end_matches(".zip")
        .to_string();

    Ok(UnifiedInstalledItem {
        filename: filename.to_string(),
        name,
        enabled: !filename.ends_with(".disabled"),
        size,
        category: category.to_string(),
        description: format!("Pobrano do folderu {}", category),
        icon_base64: None,
    })
}

pub fn list_installed_content(instance_id: &str, category: &str) -> Result<Vec<UnifiedInstalledItem>, String> {
    let dir = get_content_dir(instance_id, category);
    let mut items = Vec::new();

    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(filename) = path.file_name().and_then(|f| f.to_str()) {
                if filename.starts_with('.') {
                    continue;
                }

                let is_valid = match category {
                    "mods" => filename.ends_with(".jar") || filename.ends_with(".jar.disabled"),
                    _ => filename.ends_with(".zip") || filename.ends_with(".zip.disabled") || path.is_dir(),
                };

                if is_valid {
                    let enabled = !filename.ends_with(".disabled");
                    let size = if path.is_file() {
                        entry.metadata().map(|m| m.len()).unwrap_or(0)
                    } else {
                        0
                    };

                    let clean_name = filename
                        .trim_end_matches(".disabled")
                        .trim_end_matches(".jar")
                        .trim_end_matches(".zip")
                        .to_string();

                    // For mods, we can reuse parse_mod_file for icon and description
                    let (desc, icon) = if category == "mods" && path.is_file() {
                        let parsed = crate::mods::parse_mod_file(&path, filename);
                        (parsed.description, parsed.icon_base64)
                    } else {
                        (format!("Pakiet w folderze {}", category), None)
                    };

                    items.push(UnifiedInstalledItem {
                        filename: filename.to_string(),
                        name: clean_name,
                        enabled,
                        size,
                        category: category.to_string(),
                        description: desc,
                        icon_base64: icon,
                    });
                }
            }
        }
    }

    items.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(items)
}

pub fn toggle_installed_content(instance_id: &str, category: &str, filename: &str) -> Result<UnifiedInstalledItem, String> {
    let dir = get_content_dir(instance_id, category);
    let old_path = dir.join(filename);

    if !old_path.exists() {
        return Err("Plik nie istnieje".to_string());
    }

    let new_filename = if filename.ends_with(".disabled") {
        filename.trim_end_matches(".disabled").to_string()
    } else {
        format!("{}.disabled", filename)
    };

    let new_path = dir.join(&new_filename);
    fs::rename(&old_path, &new_path).map_err(|e| format!("Błąd zmiany nazwy pliku: {}", e))?;

    let size = new_path.metadata().map(|m| m.len()).unwrap_or(0);
    let clean_name = new_filename
        .trim_end_matches(".disabled")
        .trim_end_matches(".jar")
        .trim_end_matches(".zip")
        .to_string();

    Ok(UnifiedInstalledItem {
        filename: new_filename.clone(),
        name: clean_name,
        enabled: !new_filename.ends_with(".disabled"),
        size,
        category: category.to_string(),
        description: format!("Element {}", category),
        icon_base64: None,
    })
}

pub fn delete_installed_content(instance_id: &str, category: &str, filename: &str) -> Result<(), String> {
    let dir = get_content_dir(instance_id, category);
    let path = dir.join(filename);
    if path.exists() {
        if path.is_dir() {
            fs::remove_dir_all(path).map_err(|e| format!("Błąd usuwania folderu: {}", e))?;
        } else {
            fs::remove_file(path).map_err(|e| format!("Błąd usuwania pliku: {}", e))?;
        }
    }
    Ok(())
}

pub fn install_content_from_path(
    instance_id: &str,
    category: &str,
    source_path_str: &str,
) -> Result<UnifiedInstalledItem, String> {
    let source_path = Path::new(source_path_str);
    if !source_path.exists() {
        return Err("Wskazany plik nie istnieje".to_string());
    }

    let file_name = source_path
        .file_name()
        .and_then(|f| f.to_str())
        .ok_or_else(|| "Nieprawidłowa nazwa pliku".to_string())?;

    let target_dir = get_content_dir(instance_id, category);
    let target_path = target_dir.join(file_name);

    if source_path.is_file() {
        fs::copy(source_path, &target_path).map_err(|e| format!("Błąd kopiowania pliku: {}", e))?;
    } else if source_path.is_dir() {
        // Recursive copy directory
        copy_dir_all(source_path, &target_path).map_err(|e| format!("Błąd kopiowania folderu: {}", e))?;
    }

    let size = target_path.metadata().map(|m| m.len()).unwrap_or(0);
    let clean_name = file_name
        .trim_end_matches(".disabled")
        .trim_end_matches(".jar")
        .trim_end_matches(".zip")
        .to_string();

    Ok(UnifiedInstalledItem {
        filename: file_name.to_string(),
        name: clean_name,
        enabled: !file_name.ends_with(".disabled"),
        size,
        category: category.to_string(),
        description: format!("Zainstalowano ręcznie w {}", category),
        icon_base64: None,
    })
}

pub fn install_content_bytes(
    instance_id: &str,
    category: &str,
    filename: &str,
    data: &[u8],
) -> Result<UnifiedInstalledItem, String> {
    let target_dir = get_content_dir(instance_id, category);
    let target_path = target_dir.join(filename);

    fs::write(&target_path, data).map_err(|e| format!("Błąd zapisu pliku: {}", e))?;

    let clean_name = filename
        .trim_end_matches(".disabled")
        .trim_end_matches(".jar")
        .trim_end_matches(".zip")
        .to_string();

    Ok(UnifiedInstalledItem {
        filename: filename.to_string(),
        name: clean_name,
        enabled: !filename.ends_with(".disabled"),
        size: data.len() as u64,
        category: category.to_string(),
        description: format!("Zainstalowano w {}", category),
        icon_base64: None,
    })
}

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dst.join(entry.file_name()))?;
        } else {
            fs::copy(entry.path(), dst.join(entry.file_name()))?;
        }
    }
    Ok(())
}

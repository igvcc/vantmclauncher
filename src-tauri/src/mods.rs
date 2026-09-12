use crate::models::ModItem;
use crate::paths::get_instance_mods_dir;
use base64::Engine;
use serde_json::Value;
use std::fs::{self, File};
use std::io::Read;
use std::path::Path;

pub fn list_mods(instance_id: &str) -> Result<Vec<ModItem>, String> {
    let mods_dir = get_instance_mods_dir(instance_id);
    let mut mods = Vec::new();

    if let Ok(entries) = fs::read_dir(&mods_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(filename) = path.file_name().and_then(|f| f.to_str()) {
                    if filename.ends_with(".jar") || filename.ends_with(".jar.disabled") {
                        let item = parse_mod_file(&path, filename);
                        mods.push(item);
                    }
                }
            }
        }
    }

    mods.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(mods)
}

pub fn parse_mod_file(path: &Path, filename: &str) -> ModItem {
    let is_enabled = !filename.ends_with(".disabled");
    let mut mod_name = filename
        .trim_end_matches(".disabled")
        .trim_end_matches(".jar")
        .to_string();
    let mut mod_version = "1.0.0".to_string();
    let mut mod_description = "Minecraft Mod".to_string();
    let mut mod_authors = Vec::new();
    let mut mod_icon_base64 = None;

    if let Ok(file) = File::open(path) {
        if let Ok(mut archive) = zip::ZipArchive::new(file) {
            // 1. Sprawdź fabric.mod.json
            let fabric_contents = {
                if let Ok(mut fabric_file) = archive.by_name("fabric.mod.json") {
                    let mut s = String::new();
                    let _ = fabric_file.read_to_string(&mut s);
                    Some(s)
                } else {
                    None
                }
            };

            if let Some(contents) = fabric_contents {
                let mut icon_path_to_read = None;
                if let Ok(v) = serde_json::from_str::<Value>(&contents) {
                    if let Some(n) = v.get("name").and_then(|n| n.as_str()) {
                        mod_name = n.to_string();
                    }
                    if let Some(ver) = v.get("version").and_then(|v| v.as_str()) {
                        mod_version = ver.to_string();
                    }
                    if let Some(desc) = v.get("description").and_then(|d| d.as_str()) {
                        mod_description = desc.to_string();
                    }
                    if let Some(authors) = v.get("authors").and_then(|a| a.as_array()) {
                        for a in authors {
                            if let Some(s) = a.as_str() {
                                mod_authors.push(s.to_string());
                            } else if let Some(name) = a.get("name").and_then(|n| n.as_str()) {
                                mod_authors.push(name.to_string());
                            }
                        }
                    }
                    if let Some(icon_p) = v.get("icon").and_then(|i| i.as_str()) {
                        icon_path_to_read = Some(icon_p.to_string());
                    }
                }

                if let Some(icon_path) = icon_path_to_read {
                    if let Ok(mut icon_file) = archive.by_name(&icon_path) {
                        let mut icon_bytes = Vec::new();
                        if icon_file.read_to_end(&mut icon_bytes).is_ok() {
                            let encoded = base64::engine::general_purpose::STANDARD.encode(&icon_bytes);
                            mod_icon_base64 = Some(format!("data:image/png;base64,{}", encoded));
                        }
                    }
                }
            } else {
                // 2. Sprawdź META-INF/mods.toml (Forge/NeoForge)
                let forge_contents = {
                    if let Ok(mut forge_file) = archive.by_name("META-INF/mods.toml") {
                        let mut s = String::new();
                        let _ = forge_file.read_to_string(&mut s);
                        Some(s)
                    } else {
                        None
                    }
                };

                if let Some(contents) = forge_contents {
                    for line in contents.lines() {
                        let line = line.trim();
                        if line.starts_with("displayName=") || line.starts_with("displayName =") {
                            let val = line.split('=').nth(1).unwrap_or("").trim().trim_matches('"');
                            if !val.is_empty() {
                                mod_name = val.to_string();
                            }
                        } else if line.starts_with("version=") || line.starts_with("version =") {
                            let val = line.split('=').nth(1).unwrap_or("").trim().trim_matches('"');
                            if !val.is_empty() && val != "${file.jarVersion}" {
                                mod_version = val.to_string();
                            }
                        } else if line.starts_with("description=") || line.starts_with("description =") {
                            let val = line.split('=').nth(1).unwrap_or("").trim().trim_matches('"');
                            if !val.is_empty() {
                                mod_description = val.to_string();
                            }
                        }
                    }
                }
            }
        }
    }

    ModItem {
        filename: filename.to_string(),
        name: mod_name,
        version: mod_version,
        description: mod_description,
        authors: mod_authors,
        enabled: is_enabled,
        icon_base64: mod_icon_base64,
    }
}

pub fn toggle_mod(instance_id: &str, filename: &str) -> Result<ModItem, String> {
    let mods_dir = get_instance_mods_dir(instance_id);
    let old_path = mods_dir.join(filename);

    if !old_path.exists() {
        return Err(format!("Plik {} nie istnieje", filename));
    }

    let new_filename = if filename.ends_with(".disabled") {
        filename.trim_end_matches(".disabled").to_string()
    } else {
        format!("{}.disabled", filename)
    };

    let new_path = mods_dir.join(&new_filename);
    fs::rename(&old_path, &new_path)
        .map_err(|e| format!("Błąd zmiany nazwy pliku moda: {}", e))?;

    Ok(parse_mod_file(&new_path, &new_filename))
}

pub fn delete_mod(instance_id: &str, filename: &str) -> Result<(), String> {
    let mods_dir = get_instance_mods_dir(instance_id);
    let path = mods_dir.join(filename);
    if path.exists() {
        fs::remove_file(path).map_err(|e| format!("Błąd usuwania moda: {}", e))?;
    }
    Ok(())
}

pub fn install_mod_from_path(instance_id: &str, source_path_str: &str) -> Result<ModItem, String> {
    let source_path = Path::new(source_path_str);
    if !source_path.exists() {
        return Err("Wskazany plik nie istnieje".to_string());
    }

    let file_name = source_path
        .file_name()
        .and_then(|f| f.to_str())
        .ok_or_else(|| "Nieprawidłowa nazwa pliku".to_string())?;

    if !file_name.ends_with(".jar") && !file_name.ends_with(".jar.disabled") {
        return Err("Plik musi mieć rozszerzenie .jar".to_string());
    }

    let target_dir = get_instance_mods_dir(instance_id);
    let target_path = target_dir.join(file_name);

    fs::copy(source_path, &target_path)
        .map_err(|e| format!("Błąd kopiowania pliku moda: {}", e))?;

    Ok(parse_mod_file(&target_path, file_name))
}

pub fn install_mod_bytes(instance_id: &str, filename: &str, data: &[u8]) -> Result<ModItem, String> {
    if !filename.ends_with(".jar") && !filename.ends_with(".jar.disabled") {
        return Err("Plik musi mieć rozszerzenie .jar".to_string());
    }

    let target_dir = get_instance_mods_dir(instance_id);
    let target_path = target_dir.join(filename);

    fs::write(&target_path, data)
        .map_err(|e| format!("Błąd zapisu pliku moda: {}", e))?;

    Ok(parse_mod_file(&target_path, filename))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_mod_fallback() {
        let dummy_path = Path::new("/tmp/test_mod.jar");
        let item = parse_mod_file(dummy_path, "test_mod.jar");
        assert_eq!(item.name, "test_mod");
        assert!(item.enabled);
    }

    #[test]
    fn test_parse_disabled_mod() {
        let dummy_path = Path::new("/tmp/some_mod.jar.disabled");
        let item = parse_mod_file(dummy_path, "some_mod.jar.disabled");
        assert_eq!(item.name, "some_mod");
        assert!(!item.enabled);
    }
}

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

fn extract_quoted_string(line: &str) -> Option<String> {
    // Look for content inside double quotes
    if let Some(first) = line.find('"') {
        if let Some(second) = line[first + 1..].find('"') {
            let val = line[first + 1..first + 1 + second].trim();
            return Some(val.to_string());
        }
    }
    // Look for content inside single quotes
    if let Some(first) = line.find('\'') {
        if let Some(second) = line[first + 1..].find('\'') {
            let val = line[first + 1..first + 1 + second].trim();
            return Some(val.to_string());
        }
    }
    None
}

fn clean_multiline_toml_string(raw: &str) -> String {
    let cleaned = raw
        .trim()
        .trim_start_matches("'''")
        .trim_end_matches("'''")
        .trim_start_matches("\"\"\"")
        .trim_end_matches("\"\"\"")
        .trim_matches('"')
        .trim_matches('\'')
        .trim();

    // Replace linebreaks with spaces
    let single_line = cleaned.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect::<Vec<_>>().join(" ");
    if single_line.is_empty() {
        "Minecraft Mod".to_string()
    } else {
        single_line
    }
}

pub fn parse_mod_file(path: &Path, filename: &str) -> ModItem {
    let is_enabled = !filename.ends_with(".disabled");
    let clean_stem = filename
        .trim_end_matches(".disabled")
        .trim_end_matches(".jar");

    let mut mod_name = clean_stem.to_string();
    let mut mod_version = "1.0.0".to_string();
    let mut mod_description = "Minecraft Mod".to_string();
    let mut mod_authors = Vec::new();
    let mut mod_icon_base64: Option<String> = None;

    if let Ok(file) = File::open(path) {
        if let Ok(mut archive) = zip::ZipArchive::new(file) {
            let mut icon_path_candidate: Option<String> = None;

            // 1. Sprawdź fabric.mod.json
            let mut fabric_contents = None;
            if let Ok(mut f) = archive.by_name("fabric.mod.json") {
                let mut s = String::new();
                if f.read_to_string(&mut s).is_ok() {
                    fabric_contents = Some(s);
                }
            }

            if let Some(contents) = fabric_contents {
                if let Ok(v) = serde_json::from_str::<Value>(&contents) {
                    if let Some(n) = v.get("name").and_then(|n| n.as_str()) {
                        mod_name = n.trim().to_string();
                    }
                    if let Some(ver) = v.get("version").and_then(|v| v.as_str()) {
                        mod_version = ver.trim().to_string();
                    }
                    if let Some(desc) = v.get("description").and_then(|d| d.as_str()) {
                        mod_description = clean_multiline_toml_string(desc);
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
                    // Handle icon as string or object map (e.g. {"128": "assets/...png"})
                    if let Some(icon_val) = v.get("icon") {
                        if let Some(s) = icon_val.as_str() {
                            icon_path_candidate = Some(s.to_string());
                        } else if let Some(map) = icon_val.as_object() {
                            if let Some((_, first_val)) = map.iter().next() {
                                if let Some(s) = first_val.as_str() {
                                    icon_path_candidate = Some(s.to_string());
                                }
                            }
                        }
                    }
                }
            }

            // 2. Sprawdź quilt.mod.json jeśli jeszcze brak nazwy
            if mod_name == clean_stem {
                let mut quilt_contents = None;
                if let Ok(mut f) = archive.by_name("quilt.mod.json") {
                    let mut s = String::new();
                    if f.read_to_string(&mut s).is_ok() {
                        quilt_contents = Some(s);
                    }
                }

                if let Some(contents) = quilt_contents {
                    if let Ok(v) = serde_json::from_str::<Value>(&contents) {
                        if let Some(n) = v.pointer("/quilt_loader/metadata/name").and_then(|n| n.as_str()) {
                            mod_name = n.trim().to_string();
                        }
                        if let Some(ver) = v.pointer("/quilt_loader/version").and_then(|v| v.as_str()) {
                            mod_version = ver.trim().to_string();
                        }
                        if let Some(desc) = v.pointer("/quilt_loader/metadata/description").and_then(|d| d.as_str()) {
                            mod_description = clean_multiline_toml_string(desc);
                        }
                        if let Some(icon) = v.pointer("/quilt_loader/metadata/icon").and_then(|i| i.as_str()) {
                            icon_path_candidate = Some(icon.to_string());
                        }
                    }
                }
            }

            // 3. Sprawdź META-INF/mods.toml lub META-INF/neoforge.mods.toml
            let mut forge_contents = None;
            if let Ok(mut f) = archive.by_name("META-INF/mods.toml") {
                let mut s = String::new();
                if f.read_to_string(&mut s).is_ok() {
                    forge_contents = Some(s);
                }
            }
            if forge_contents.is_none() {
                if let Ok(mut f) = archive.by_name("META-INF/neoforge.mods.toml") {
                    let mut s = String::new();
                    if f.read_to_string(&mut s).is_ok() {
                        forge_contents = Some(s);
                    }
                }
            }

            if let Some(contents) = forge_contents {
                // Check for multiline description ''' ... ''' or """ ... """
                if let Some(desc_idx) = contents.find("description") {
                    let slice = &contents[desc_idx..];
                    if let Some(triple_sq) = slice.find("'''") {
                        let after = &slice[triple_sq + 3..];
                        if let Some(end_idx) = after.find("'''") {
                            let extracted = &after[..end_idx];
                            mod_description = clean_multiline_toml_string(extracted);
                        }
                    } else if let Some(triple_dq) = slice.find("\"\"\"") {
                        let after = &slice[triple_dq + 3..];
                        if let Some(end_idx) = after.find("\"\"\"") {
                            let extracted = &after[..end_idx];
                            mod_description = clean_multiline_toml_string(extracted);
                        }
                    }
                }

                for line in contents.lines() {
                    let line = line.trim();
                    if line.starts_with("displayName") {
                        if let Some(val) = extract_quoted_string(line) {
                            if !val.is_empty() {
                                mod_name = val;
                            }
                        }
                    } else if line.starts_with("version") {
                        if let Some(val) = extract_quoted_string(line) {
                            if !val.is_empty() && val != "${file.jarVersion}" {
                                mod_version = val;
                            }
                        }
                    } else if line.starts_with("description") && mod_description == "Minecraft Mod" {
                        if let Some(val) = extract_quoted_string(line) {
                            if !val.is_empty() {
                                mod_description = clean_multiline_toml_string(&val);
                            }
                        }
                    } else if line.starts_with("logoFile") {
                        if let Some(val) = extract_quoted_string(line) {
                            if !val.is_empty() && icon_path_candidate.is_none() {
                                icon_path_candidate = Some(val);
                            }
                        }
                    } else if line.starts_with("authors") {
                        if let Some(val) = extract_quoted_string(line) {
                            if !val.is_empty() {
                                mod_authors = val.split(',').map(|s| s.trim().to_string()).collect();
                            }
                        }
                    }
                }
            }

            // 4. Spróbuj załadować wskazaną ikonę
            if let Some(ref icon_path) = icon_path_candidate {
                let trimmed = icon_path.trim_start_matches('/');
                if let Ok(mut icon_file) = archive.by_name(trimmed) {
                    let mut icon_bytes = Vec::new();
                    if icon_file.read_to_end(&mut icon_bytes).is_ok() && !icon_bytes.is_empty() {
                        let encoded = base64::engine::general_purpose::STANDARD.encode(&icon_bytes);
                        mod_icon_base64 = Some(format!("data:image/png;base64,{}", encoded));
                    }
                }
            }

            // 5. Uniwersalny skaner ikon w archiwum ZIP (jeśli brak ikony)
            if mod_icon_base64.is_none() {
                let total = archive.len();
                for i in 0..total {
                    if let Ok(mut f) = archive.by_index(i) {
                        let name_lower = f.name().to_lowercase();
                        // Szukaj dowolnego icon.png lub logo.png w assets/ (np. assets/modid/icon.png)
                        if (name_lower.ends_with("/icon.png")
                            || name_lower == "icon.png"
                            || name_lower.ends_with("/logo.png")
                            || name_lower == "logo.png")
                            && !name_lower.starts_with("meta-inf")
                        {
                            let mut buf = Vec::new();
                            if f.read_to_end(&mut buf).is_ok() && !buf.is_empty() {
                                let encoded = base64::engine::general_purpose::STANDARD.encode(&buf);
                                mod_icon_base64 = Some(format!("data:image/png;base64,{}", encoded));
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    // Dodatkowe czyszczenie wersji z pozostałości komentarzy TOML lub cudzysłowów
    let clean_version = mod_version
        .split('#')
        .next()
        .unwrap_or(&mod_version)
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .trim();

    let final_version = if clean_version.is_empty() || clean_version == "${file.jarVersion}" {
        "1.0.0".to_string()
    } else {
        clean_version.to_string()
    };

    ModItem {
        filename: filename.to_string(),
        name: mod_name,
        version: final_version,
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
    fn test_extract_quoted_string() {
        assert_eq!(extract_quoted_string("displayName=\"Cloth Config v11\" #mandatory"), Some("Cloth Config v11".to_string()));
        assert_eq!(extract_quoted_string("version = '1.46.0' #optional"), Some("1.46.0".to_string()));
    }

    #[test]
    fn test_clean_multiline_toml_string() {
        let toml_desc = "'''\nA self-writing config library\nfor Minecraft.\n'''";
        assert_eq!(clean_multiline_toml_string(toml_desc), "A self-writing config library for Minecraft.");
    }
}

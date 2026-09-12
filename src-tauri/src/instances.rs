use crate::models::Instance;
use crate::paths::{get_instance_dir, get_instances_dir};
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn list_instances() -> Result<Vec<Instance>, String> {
    let instances_dir = get_instances_dir();
    let mut instances = Vec::new();

    if let Ok(entries) = fs::read_dir(&instances_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let json_file = path.join("instance.json");
                if json_file.exists() {
                    if let Ok(content) = fs::read_to_string(&json_file) {
                        if let Ok(inst) = serde_json::from_str::<Instance>(&content) {
                            instances.push(inst);
                        }
                    }
                }
            }
        }
    }

    // Jeśli brak instancji, utwórz domyślną Vanilla 1.20.4 oraz Fabric 1.20.4
    if instances.is_empty() {
        let default_fabric = create_instance(
            "Fabric 1.20.4",
            "1.20.4",
            "fabric",
            Some("0.15.11".to_string()),
            "fabric",
        )?;
        instances.push(default_fabric);
    }

    // Sortuj od najnowszych
    instances.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(instances)
}

pub fn create_instance(
    name: &str,
    mc_version: &str,
    loader: &str,
    loader_version: Option<String>,
    icon: &str,
) -> Result<Instance, String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let safe_name = name
        .to_lowercase()
        .replace(|c: char| !c.is_alphanumeric() && c != '-', "-");
    let id = format!("{}-{}", safe_name, timestamp % 10000);

    let instance = Instance {
        id: id.clone(),
        name: name.to_string(),
        mc_version: mc_version.to_string(),
        loader: loader.to_string(),
        loader_version,
        created_at: timestamp,
        memory_mb: None,
        icon: icon.to_string(),
    };

    let dir = get_instance_dir(&id);
    fs::create_dir_all(dir.join("mods")).map_err(|e| e.to_string())?;
    fs::create_dir_all(dir.join("saves")).map_err(|e| e.to_string())?;
    fs::create_dir_all(dir.join("resourcepacks")).map_err(|e| e.to_string())?;
    fs::create_dir_all(dir.join("config")).map_err(|e| e.to_string())?;

    let json_content = serde_json::to_string_pretty(&instance).map_err(|e| e.to_string())?;
    fs::write(dir.join("instance.json"), json_content).map_err(|e| e.to_string())?;

    Ok(instance)
}

pub fn delete_instance(id: &str) -> Result<(), String> {
    let dir = get_instance_dir(id);
    if dir.exists() {
        if let Err(e) = fs::remove_dir_all(&dir) {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = fs::set_permissions(&dir, fs::Permissions::from_mode(0o777));
                for entry in walkdir::WalkDir::new(&dir).into_iter().flatten() {
                    let _ = fs::set_permissions(entry.path(), fs::Permissions::from_mode(0o777));
                }
            }
            fs::remove_dir_all(&dir).map_err(|e2| format!("Błąd usuwania folderu profilu ({}): {}", e, e2))?;
        }
    }
    Ok(())
}

pub fn open_instance_folder(id: &str, subfolder: Option<&str>) -> Result<(), String> {
    let mut dir = get_instance_dir(id);
    if let Some(sub) = subfolder {
        dir = dir.join(sub);
        if !dir.exists() {
            let _ = fs::create_dir_all(&dir);
        }
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Błąd otwierania folderu: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Błąd otwierania folderu: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Błąd otwierania folderu: {}", e))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_and_list_instance() {
        let inst = create_instance("Test Instance", "1.20.4", "fabric", Some("0.15.11".into()), "fabric");
        let instance = inst.expect("Failed to create instance");
        assert_eq!(instance.mc_version, "1.20.4");
        assert_eq!(instance.loader, "fabric");

        let list = list_instances().unwrap();
        assert!(list.iter().any(|i| i.id == instance.id));

        // Cleanup
        let _ = delete_instance(&instance.id);
    }
}

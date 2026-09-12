use std::path::PathBuf;
use std::fs;

pub fn get_launcher_dir() -> PathBuf {
    if let Ok(custom) = std::env::var("VANT_DATA_DIR") {
        let p = PathBuf::from(custom);
        let _ = fs::create_dir_all(&p);
        return p;
    }

    let dir = dirs::data_local_dir()
        .map(|d| d.join("VantMcLauncher"))
        .unwrap_or_else(|| {
            dirs::home_dir()
                .map(|h| h.join(".vantmclauncher"))
                .unwrap_or_else(|| PathBuf::from(".vantmclauncher"))
        });

    // Check if directory can be created and written to
    if fs::create_dir_all(&dir).is_err() || !is_dir_writable(&dir) {
        let fallback = PathBuf::from("./.vantmclauncher");
        let _ = fs::create_dir_all(&fallback);
        return fallback;
    }
    dir
}

fn is_dir_writable(path: &std::path::Path) -> bool {
    let test_file = path.join(".vant_probe");
    if fs::write(&test_file, b"ok").is_ok() {
        let _ = fs::remove_file(test_file);
        true
    } else {
        false
    }
}

pub fn get_instances_dir() -> PathBuf {
    let dir = get_launcher_dir().join("instances");
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    dir
}

pub fn get_instance_dir(instance_id: &str) -> PathBuf {
    let dir = get_instances_dir().join(instance_id);
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    dir
}

pub fn get_instance_mods_dir(instance_id: &str) -> PathBuf {
    let dir = get_instance_dir(instance_id).join("mods");
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    dir
}

pub fn get_assets_dir() -> PathBuf {
    let dir = get_launcher_dir().join("assets");
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    dir
}

pub fn get_libraries_dir() -> PathBuf {
    let dir = get_launcher_dir().join("libraries");
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    dir
}

pub fn get_versions_dir() -> PathBuf {
    let dir = get_launcher_dir().join("versions");
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    dir
}

pub fn get_runtimes_dir() -> PathBuf {
    let dir = get_launcher_dir().join("runtimes");
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    dir
}

pub fn get_config_file() -> PathBuf {
    get_launcher_dir().join("config.json")
}

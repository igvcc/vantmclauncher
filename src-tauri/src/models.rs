use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSettings {
    pub nickname: String,
    pub custom_java_path: Option<String>,
    pub min_ram_mb: u32,
    pub max_ram_mb: u32,
    pub jvm_args: String,
    pub selected_instance_id: Option<String>,
}

impl Default for UserSettings {
    fn default() -> Self {
        Self {
            nickname: "VantPlayer".to_string(),
            custom_java_path: None,
            min_ram_mb: 2048,
            max_ram_mb: 4096,
            jvm_args: "-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -Dsun.rmi.dgc.server.gcInterval=2147483646 -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=50 -XX:G1HeapRegionSize=32M".to_string(),
            selected_instance_id: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Instance {
    pub id: String,
    pub name: String,
    pub mc_version: String,
    pub loader: String, // "vanilla", "fabric", "forge", "neoforge", "quilt"
    pub loader_version: Option<String>,
    pub created_at: u64,
    pub memory_mb: Option<u32>,
    pub icon: String, // e.g. "grass", "fabric", "forge", "sword"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModItem {
    pub filename: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub authors: Vec<String>,
    pub enabled: bool,
    pub icon_base64: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub version_type: String,
    pub url: String,
    #[serde(alias = "releaseTime", default)]
    pub release_time: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionManifest {
    pub latest: LatestVersions,
    pub versions: Vec<VersionEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LatestVersions {
    pub release: String,
    pub snapshot: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JavaInstallation {
    pub path: String,
    pub version_string: String,
    pub major_version: u32,
    pub is_arm64: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub step: String,
    pub current: usize,
    pub total: usize,
    pub percentage: f32,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchLogPayload {
    pub instance_id: String,
    pub line: String,
    pub is_error: bool,
}

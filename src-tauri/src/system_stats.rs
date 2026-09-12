use serde::Serialize;
use sysinfo::{Components, System};

#[derive(Debug, Clone, Serialize)]
pub struct SystemStats {
    pub cpu_usage: f32,
    pub ram_used_mb: u64,
    pub ram_total_mb: u64,
    pub ram_pct: f32,
    pub cpu_temp: Option<f32>,
    pub thermal_status: String,
}

pub struct SystemMonitor {
    sys: System,
}

impl SystemMonitor {
    pub fn new() -> Self {
        let mut sys = System::new_all();
        sys.refresh_all();
        Self { sys }
    }

    pub fn get_stats(&mut self) -> SystemStats {
        self.sys.refresh_cpu_usage();
        self.sys.refresh_memory();

        let cpu_usage = self.sys.global_cpu_usage();

        let total_bytes = self.sys.total_memory();
        let used_bytes = self.sys.used_memory();

        let ram_total_mb = total_bytes / 1024 / 1024;
        let ram_used_mb = used_bytes / 1024 / 1024;
        let ram_pct = if total_bytes > 0 {
            (used_bytes as f32 / total_bytes as f32) * 100.0
        } else {
            0.0
        };

        // Hardware temperature from sysinfo components
        let components = Components::new_with_refreshed_list();
        let mut cpu_temp: Option<f32> = None;

        for comp in &components {
            let label = comp.label().to_lowercase();
            if label.contains("cpu")
                || label.contains("core")
                || label.contains("soc")
                || label.contains("die")
                || label.contains("package")
                || label.contains("pcore")
                || label.contains("ecore")
            {
                if let Some(t) = comp.temperature() {
                    if t > 0.0 && t < 125.0 {
                        cpu_temp = Some(t);
                        break;
                    }
                }
            }
        }

        // If no named CPU component matched, take the first reasonable sensor reading
        if cpu_temp.is_none() {
            for comp in &components {
                if let Some(t) = comp.temperature() {
                    if t > 20.0 && t < 110.0 {
                        cpu_temp = Some(t);
                        break;
                    }
                }
            }
        }

        // Thermal status description
        let thermal_status = match cpu_temp {
            Some(t) if t < 55.0 => "Chłodno",
            Some(t) if t < 75.0 => "Optymalna",
            Some(t) if t < 88.0 => "Ciepło",
            Some(_) => "Gorąco",
            None => {
                if cpu_usage < 30.0 {
                    "Optymalna"
                } else if cpu_usage < 70.0 {
                    "Umiarkowana"
                } else {
                    "Wysokie obciążenie"
                }
            }
        }
        .to_string();

        SystemStats {
            cpu_usage: (cpu_usage * 10.0).round() / 10.0,
            ram_used_mb,
            ram_total_mb,
            ram_pct: (ram_pct * 10.0).round() / 10.0,
            cpu_temp: cpu_temp.map(|t| (t * 10.0).round() / 10.0),
            thermal_status,
        }
    }
}

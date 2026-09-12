use serde::Serialize;
use sysinfo::{Components, System, Pid, ProcessesToUpdate};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize)]
pub struct SystemStats {
    pub cpu_usage: f32,
    pub ram_used_mb: u64,
    pub ram_total_mb: u64,
    pub ram_pct: f32,
    pub cpu_temp: Option<f32>,
    pub thermal_status: String,
    pub minecraft_ram_mb: Option<u64>,
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

    pub fn get_stats(&mut self, app_handle: Option<&AppHandle>) -> SystemStats {
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

        // Sprawdź zużycie RAM przez uruchomiony proces Minecrafta
        let mut minecraft_ram_mb: Option<u64> = None;
        if let Some(h) = app_handle {
            if let Some(state) = h.try_state::<crate::launcher::GameProcessState>() {
                if let Ok(map) = state.running_processes.lock() {
                    let pids: Vec<u32> = map.values().copied().collect();
                    if !pids.is_empty() {
                        let sysinfo_pids: Vec<Pid> = pids.iter().map(|&p| Pid::from(p as usize)).collect();
                        self.sys.refresh_processes(ProcessesToUpdate::Some(&sysinfo_pids), true);
                        let mut total_mc_bytes = 0u64;
                        let mut found_any = false;
                        for pid_val in sysinfo_pids {
                            if let Some(proc) = self.sys.process(pid_val) {
                                total_mc_bytes += proc.memory();
                                found_any = true;
                            }
                        }
                        if found_any {
                            minecraft_ram_mb = Some(total_mc_bytes / 1024 / 1024);
                        }
                    }
                }
            }
        }

        SystemStats {
            cpu_usage: (cpu_usage * 10.0).round() / 10.0,
            ram_used_mb,
            ram_total_mb,
            ram_pct: (ram_pct * 10.0).round() / 10.0,
            cpu_temp: cpu_temp.map(|t| (t * 10.0).round() / 10.0),
            thermal_status,
            minecraft_ram_mb,
        }
    }
}

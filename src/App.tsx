import { useState, useEffect } from "react";
import { safeInvoke as invoke, safeListen as listen } from "./api";
import { Dock, TabType } from "./components/Dock";
import { HomeView } from "./components/HomeView";
import { InstancesView } from "./components/InstancesView";
import { ModsView } from "./components/ModsView";
import { JavaView } from "./components/JavaView";
import { ConsoleView } from "./components/ConsoleView";
import { SettingsView } from "./components/SettingsView";
import {
  UserSettings,
  Instance,
  ModItem,
  VersionEntry,
  JavaInstallation,
  DownloadProgress,
  LaunchLogPayload,
  SystemStats,
} from "./types";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab") as TabType;
    if (["home", "instances", "mods", "java", "console", "settings"].includes(tabParam)) {
      return tabParam;
    }
    const hash = window.location.hash.replace("#", "") as TabType;
    return ["home", "instances", "mods", "java", "console", "settings"].includes(hash)
      ? hash
      : "home";
  });

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "") as TabType;
      if (["home", "instances", "mods", "java", "console", "settings"].includes(hash)) {
        setActiveTab(hash);
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);
  const [settings, setSettings] = useState<UserSettings>({
    nickname: "VantPlayer",
    custom_java_path: null,
    min_ram_mb: 2048,
    max_ram_mb: 4096,
    jvm_args: "-XX:+UseG1GC",
    selected_instance_id: null,
  });

  const [instances, setInstances] = useState<Instance[]>([]);
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null);
  const [mods, setMods] = useState<ModItem[]>([]);
  const [isLoadingMods, setIsLoadingMods] = useState(false);
  const [javaList, setJavaList] = useState<JavaInstallation[]>([]);
  const [mcVersions, setMcVersions] = useState<VersionEntry[]>([]);
  const [fabricLoaders, setFabricLoaders] = useState<string[]>([]);
  const [offlineUuid, setOfflineUuid] = useState("");
  const [logs, setLogs] = useState<LaunchLogPayload[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isGameRunning, setIsGameRunning] = useState(false);
  const [runningInstanceId, setRunningInstanceId] = useState<string | null>(null);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);

  // Java download state
  const [isDownloadingJava, setIsDownloadingJava] = useState(false);
  const [javaDownloadMsg, setJavaDownloadMsg] = useState("");
  const [javaDownloadPct, setJavaDownloadPct] = useState(0);

  // Toast notifications
  const [toast, setToast] = useState<{ message: string; type: "info" | "success" | "error" } | null>(null);

  const showToast = (message: string, type: "info" | "success" | "error" = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const activeInstance = instances.find((i) => i.id === activeInstanceId) || instances[0] || null;

  // 1. Initial data loading
  useEffect(() => {
    loadInitialData();

    // Check if game is already running on mount
    invoke<boolean>("is_game_running")
      .then((running) => {
        setIsGameRunning(running);
        if (running) {
          invoke<string | null>("get_running_instance_id")
            .then((id) => setRunningInstanceId(id))
            .catch(console.error);
        }
      })
      .catch(console.error);

    // Initial system hardware telemetry
    invoke<SystemStats>("get_system_stats")
      .then(setSystemStats)
      .catch(console.error);

    const unlistenStats = listen<SystemStats>("system-stats", (event) => {
      setSystemStats(event.payload);
    });

    // Listeners for Tauri backend events
    const unlistenProgress = listen<DownloadProgress>("download-progress", (event) => {
      setDownloadProgress(event.payload);
      if (event.payload.percentage >= 100) {
        setTimeout(() => setDownloadProgress(null), 2500);
      }
    });

    const unlistenJavaProgress = listen<{ status: string; message: string; percentage: number }>(
      "java-download-progress",
      (event) => {
        setIsDownloadingJava(true);
        setJavaDownloadMsg(event.payload.message);
        setJavaDownloadPct(event.payload.percentage);
        if (event.payload.status === "ready") {
          setIsDownloadingJava(false);
          refreshJavaList();
          showToast(event.payload.message, "success");
        }
      }
    );

    const unlistenLogs = listen<LaunchLogPayload>("minecraft-log", (event) => {
      setLogs((prev) => [...prev.slice(-1000), event.payload]);
    });

    const unlistenGameStarted = listen<{ instance_id: string; pid?: number }>("game-started", (event) => {
      setIsLaunching(false);
      setIsGameRunning(true);
      setRunningInstanceId(event.payload.instance_id);
      showToast("Minecraft wystartował! Dobrej gry!", "success");
    });

    const unlistenGameStopped = listen<{ instance_id: string; exit_code: number }>("game-stopped", (event) => {
      setIsGameRunning(false);
      setRunningInstanceId(null);
      if (event.payload.exit_code === 0) {
        showToast("Gra została zamknięta.", "info");
      } else {
        showToast(`Gra została zamknięta (kod: ${event.payload.exit_code})`, "info");
      }
    });

    return () => {
      unlistenStats.then((f) => f());
      unlistenProgress.then((f) => f());
      unlistenJavaProgress.then((f) => f());
      unlistenLogs.then((f) => f());
      unlistenGameStarted.then((f) => f());
      unlistenGameStopped.then((f) => f());
    };
  }, []);

  // Update UUID when nickname changes
  useEffect(() => {
    if (settings.nickname) {
      invoke<string>("get_offline_uuid_cmd", { nickname: settings.nickname })
        .then(setOfflineUuid)
        .catch(console.error);
    }
  }, [settings.nickname]);

  // Load mods whenever active instance changes
  useEffect(() => {
    if (activeInstance) {
      loadModsForInstance(activeInstance.id);
    }
  }, [activeInstanceId, activeInstance?.id]);

  const loadInitialData = async () => {
    try {
      const loadedSettings = await invoke<UserSettings>("get_settings");
      setSettings(loadedSettings);

      const loadedInstances = await invoke<Instance[]>("get_instances");
      setInstances(loadedInstances);

      if (loadedSettings.selected_instance_id && loadedInstances.some((i) => i.id === loadedSettings.selected_instance_id)) {
        setActiveInstanceId(loadedSettings.selected_instance_id);
      } else if (loadedInstances.length > 0) {
        setActiveInstanceId(loadedInstances[0].id);
      }

      refreshJavaList();

      invoke<VersionEntry[]>("get_mc_versions")
        .then(setMcVersions)
        .catch(console.error);
    } catch (err) {
      console.error("Błąd ładowania danych początkowych:", err);
      showToast(String(err), "error");
    }
  };

  const refreshJavaList = async () => {
    try {
      const list = await invoke<JavaInstallation[]>("get_java_installations");
      setJavaList(list);
    } catch (err) {
      console.error("Błąd skanowania Javy:", err);
    }
  };

  const loadModsForInstance = async (instanceId: string) => {
    setIsLoadingMods(true);
    try {
      const list = await invoke<ModItem[]>("get_mods", { instanceId });
      setMods(list);
    } catch (err) {
      console.error("Błąd ładowania modów:", err);
    } finally {
      setIsLoadingMods(false);
    }
  };

  const handleUpdateNickname = async (nickname: string) => {
    const updated = { ...settings, nickname };
    setSettings(updated);
    try {
      await invoke("save_settings", { settings: updated });
      showToast(`Nick zmieniony na: ${nickname}`, "success");
    } catch (err) {
      showToast(String(err), "error");
    }
  };

  const handleSelectInstance = async (id: string) => {
    setActiveInstanceId(id);
    const updated = { ...settings, selected_instance_id: id };
    setSettings(updated);
    try {
      await invoke("save_settings", { settings: updated });
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateInstance = async (
    name: string,
    mcVersion: string,
    loader: string,
    loaderVersion?: string,
    icon: string = "fabric"
  ) => {
    try {
      const created = await invoke<Instance>("create_instance", {
        name,
        mcVersion,
        loader,
        loaderVersion: loaderVersion || null,
        icon,
      });
      setInstances((prev) => [created, ...prev]);
      handleSelectInstance(created.id);
      showToast(`Twój nowy profil "${created.name}" jest gotowy!`, "success");
    } catch (err) {
      showToast(`Błąd tworzenia profilu: ${err}`, "error");
    }
  };

  const handleDeleteInstance = async (id: string) => {
    if (!confirm("Czy na pewno chcesz usunąć ten profil gry wraz ze wszystkimi zapisanymi światami i modami?")) {
      return;
    }
    try {
      await invoke("delete_instance", { id });
      const updated = instances.filter((i) => i.id !== id);
      setInstances(updated);
      if (activeInstanceId === id) {
        if (updated.length > 0) {
          handleSelectInstance(updated[0].id);
        }
      }
      showToast("Profil został usunięty", "info");
    } catch (err) {
      showToast(String(err), "error");
    }
  };

  const handleOpenFolder = async (id: string, subfolder?: string) => {
    try {
      await invoke("open_instance_folder", { id, subfolder: subfolder || null });
    } catch (err) {
      showToast(String(err), "error");
    }
  };

  const handleToggleMod = async (filename: string) => {
    if (!activeInstance) return;
    try {
      const updated = await invoke<ModItem>("toggle_mod", {
        instanceId: activeInstance.id,
        filename,
      });
      setMods((prev) =>
        prev.map((m) => (m.filename === filename ? updated : m))
      );
    } catch (err) {
      showToast(String(err), "error");
    }
  };

  const handleDeleteMod = async (filename: string) => {
    if (!activeInstance) return;
    try {
      await invoke("delete_mod", {
        instanceId: activeInstance.id,
        filename,
      });
      setMods((prev) => prev.filter((m) => m.filename !== filename));
      showToast(`Usunięto mod: ${filename}`, "info");
    } catch (err) {
      showToast(String(err), "error");
    }
  };

  const handleInstallModFile = async (filePath: string) => {
    if (!activeInstance) {
      showToast("Wybierz najpierw profil gry, do którego chcesz dodać mod", "error");
      return;
    }
    try {
      const newMod = await invoke<ModItem>("install_mod", {
        instanceId: activeInstance.id,
        path: filePath,
      });
      setMods((prev) => [newMod, ...prev.filter((m) => m.filename !== newMod.filename)]);
      showToast(`Mod "${newMod.name}" został pomyślnie dodany!`, "success");
      setActiveTab("mods");
    } catch (err) {
      showToast(String(err), "error");
    }
  };

  const handleInstallModBytes = async (filename: string, bytes: number[]) => {
    if (!activeInstance) {
      showToast("Wybierz najpierw profil gry, do którego chcesz dodać mod", "error");
      return;
    }
    try {
      const newMod = await invoke<ModItem>("install_mod_bytes", {
        instanceId: activeInstance.id,
        filename,
        bytes,
      });
      setMods((prev) => [newMod, ...prev.filter((m) => m.filename !== newMod.filename)]);
      showToast(`Mod "${newMod.name}" został pomyślnie dodany!`, "success");
      setActiveTab("mods");
    } catch (err) {
      showToast(String(err), "error");
    }
  };

  const handleFetchFabricLoaders = async (gameVersion: string) => {
    try {
      const list = await invoke<string[]>("get_fabric_loaders", { gameVersion });
      setFabricLoaders(list);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDownloadJava = async (version: number) => {
    try {
      setIsDownloadingJava(true);
      await invoke("download_java", { version });
    } catch (err) {
      setIsDownloadingJava(false);
      showToast(`Błąd pobierania Javy: ${err}`, "error");
    }
  };

  const handleLaunch = async () => {
    if (!activeInstance) {
      showToast("Wybierz najpierw profil gry przed startem!", "error");
      return;
    }

    setIsLaunching(true);
    setDownloadProgress({
      step: "Przygotowanie",
      current: 0,
      total: 100,
      percentage: 2.0,
      message: "Przygotowywanie plików i weryfikacja...",
    });

    try {
      await invoke("launch_game", { instanceId: activeInstance.id });
    } catch (err) {
      setIsLaunching(false);
      setDownloadProgress(null);
      showToast(String(err), "error");
      setActiveTab("console");
    }
  };

  const handleKillGame = async () => {
    try {
      const targetId = runningInstanceId || (activeInstance ? activeInstance.id : null);
      await invoke("kill_game", { instanceId: targetId });
      setIsGameRunning(false);
      setRunningInstanceId(null);
      showToast("Gra została zatrzymana", "info");
    } catch (err) {
      showToast(`Nie udało się zatrzymać gry: ${err}`, "error");
    }
  };

  return (
    <div className="flex h-screen w-screen bg-[#0D0D0D] text-white relative overflow-hidden font-sans">
      {/* Ambient background glows in vant.fun style */}
      <div className="ambient-glow" />
      <div className="ambient-glow-bottom" />

      {/* Floating Toast Notification */}
      {toast && (
        <div
          className={`fixed top-5 right-6 z-50 px-5 py-3 rounded-2xl text-xs font-semibold backdrop-blur-xl shadow-2xl border transition-all flex items-center gap-2 ${
            toast.type === "success"
              ? "bg-emerald-950/80 border-emerald-500/40 text-emerald-200 shadow-emerald-900/30"
              : toast.type === "error"
              ? "bg-rose-950/80 border-rose-500/40 text-rose-200 shadow-rose-900/30"
              : "bg-cyan-950/80 border-cyan-500/40 text-cyan-200 shadow-cyan-900/30"
          }`}
          style={{ animation: "toastIn 0.3s ease-out" }}
        >
          <span className="w-2 h-2 rounded-full bg-current animate-ping" />
          <span>{toast.message}</span>
        </div>
      )}

      {/* Navigation Dock */}
      <Dock activeTab={activeTab} setActiveTab={setActiveTab} isGameRunning={isGameRunning} systemStats={systemStats} />

      {/* Main Content Area */}
      <main className="flex-1 h-full overflow-hidden flex flex-col relative z-10">
        {activeTab === "home" && (
          <HomeView
            settings={settings}
            instances={instances}
            activeInstance={activeInstance}
            onUpdateNickname={handleUpdateNickname}
            onSelectInstance={handleSelectInstance}
            onLaunch={handleLaunch}
            onKillGame={handleKillGame}
            isGameRunning={isGameRunning}
            onOpenFolder={() => activeInstance && handleOpenFolder(activeInstance.id)}
            onGoToMods={() => setActiveTab("mods")}
            onGoToInstances={() => setActiveTab("instances")}
            onGoToJava={() => setActiveTab("java")}
            downloadProgress={downloadProgress}
            isLaunching={isLaunching}
            offlineUuid={offlineUuid}
            javaCount={javaList.length}
          />
        )}

        {activeTab === "instances" && (
          <InstancesView
            instances={instances}
            activeInstanceId={activeInstanceId}
            onSelectInstance={handleSelectInstance}
            onLaunchInstance={(id) => {
              handleSelectInstance(id);
              handleLaunch();
            }}
            onDeleteInstance={handleDeleteInstance}
            onOpenFolder={(id) => handleOpenFolder(id)}
            onCreateInstance={handleCreateInstance}
            availableVersions={mcVersions}
            fabricLoaders={fabricLoaders}
            fetchFabricLoaders={handleFetchFabricLoaders}
          />
        )}

        {activeTab === "mods" && (
          <ModsView
            activeInstance={activeInstance}
            mods={mods}
            isLoading={isLoadingMods}
            onToggleMod={handleToggleMod}
            onDeleteMod={handleDeleteMod}
            onInstallModFile={handleInstallModFile}
            onInstallModBytes={handleInstallModBytes}
            onOpenModsFolder={() => activeInstance && handleOpenFolder(activeInstance.id, "mods")}
            onModInstalled={() => activeInstance && loadModsForInstance(activeInstance.id)}
          />
        )}

        {activeTab === "console" && (
          <ConsoleView
            logs={logs}
            onClearLogs={() => setLogs([])}
            isGameRunning={isGameRunning}
            onKillGame={handleKillGame}
          />
        )}

        {activeTab === "java" && (
          <JavaView
            javaList={javaList}
            settings={settings}
            onUpdateSettings={async (patch) => {
              const updated = { ...settings, ...patch };
              setSettings(updated);
              await invoke("save_settings", { settings: updated });
              showToast("Zapisano wybraną wersję Javy", "success");
            }}
            onDownloadJava={handleDownloadJava}
            onRefreshJava={refreshJavaList}
            isDownloadingJava={isDownloadingJava}
            javaDownloadMsg={javaDownloadMsg}
            javaDownloadPct={javaDownloadPct}
          />
        )}

        {activeTab === "settings" && (
          <SettingsView
            settings={settings}
            onSaveSettings={async (newSettings) => {
              setSettings(newSettings);
              await invoke("save_settings", { settings: newSettings });
              showToast("Ustawienia zostały pomyślnie zapisane!", "success");
            }}
            onOpenAppDir={() => {
              if (activeInstance) {
                handleOpenFolder(activeInstance.id);
              }
            }}
          />
        )}
      </main>
    </div>
  );
}

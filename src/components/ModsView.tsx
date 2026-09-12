import { useState, useEffect, useRef } from "react";
import {
  FolderOpen,
  Search,
  Trash2,
  UploadCloud,
  CheckCircle,
  XCircle,
  Puzzle,
  PlusCircle,
  AlertTriangle,
  Sparkles,
  Loader2,
  ArrowDownToLine,
  Check,
  Palette,
  SunMedium,
  Boxes,
  Globe,
  X,
} from "lucide-react";
import {
  Instance,
  ModItem,
  ContentType,
  ContentSource,
  UnifiedCatalogItem,
  UnifiedVersionItem,
  UnifiedInstalledItem,
} from "../types";
import { safeInvoke } from "../api";

interface ModsViewProps {
  activeInstance: Instance | null;
  mods: ModItem[];
  isLoading: boolean;
  onToggleMod: (filename: string) => void;
  onDeleteMod: (filename: string) => void;
  onInstallModFile: (path: string) => void;
  onInstallModBytes?: (filename: string, bytes: number[]) => void;
  onOpenModsFolder: (category?: ContentType) => void;
  onModInstalled?: () => void;
}

const CATEGORY_TABS: { id: ContentType; label: string; icon: any; ext: string; folder: string }[] = [
  { id: "mods", label: "Mody", icon: Puzzle, ext: ".jar", folder: "mods" },
  { id: "resourcepacks", label: "Resource Packi", icon: Palette, ext: ".zip", folder: "resourcepacks" },
  { id: "shaderpacks", label: "Shader Packi", icon: SunMedium, ext: ".zip", folder: "shaderpacks" },
  { id: "datapacks", label: "Data Packi", icon: Boxes, ext: ".zip", folder: "datapacks" },
];

export const ModsView: React.FC<ModsViewProps> = ({
  activeInstance,
  mods,
  isLoading: isParentLoading,
  onToggleMod,
  onDeleteMod,
  onInstallModFile,
  onInstallModBytes,
  onOpenModsFolder,
  onModInstalled,
}) => {
  const [activeCategory, setActiveCategory] = useState<ContentType>("mods");
  const [subTab, setSubTab] = useState<"installed" | "catalog">(() => {
    const p = new URLSearchParams(window.location.search).get("subtab");
    return p === "catalog" ? "catalog" : "installed";
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [itemPendingDelete, setItemPendingDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Installed items state for non-mod categories (and sync with mods)
  const [installedItems, setInstalledItems] = useState<UnifiedInstalledItem[]>([]);
  const [isLoadingInstalled, setIsLoadingInstalled] = useState(false);

  // Catalog State
  const [catalogSource, setCatalogSource] = useState<ContentSource>("all");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogProjects, setCatalogProjects] = useState<UnifiedCatalogItem[]>([]);
  const [isSearchingCatalog, setIsSearchingCatalog] = useState(false);
  const [installingVersionId, setInstallingVersionId] = useState<string | null>(null);
  const [installedNotice, setInstalledNotice] = useState<string | null>(null);

  // Version Picker Modal State
  const [selectedProject, setSelectedProject] = useState<UnifiedCatalogItem | null>(null);
  const [projectVersions, setProjectVersions] = useState<UnifiedVersionItem[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [filterOnlyCompatible, setFilterOnlyCompatible] = useState(true);
  const [versionSearchQuery, setVersionSearchQuery] = useState("");

  // Load installed items when switching category or instance
  const refreshInstalledItems = async () => {
    if (!activeInstance) return;
    if (activeCategory === "mods") {
      // In mods mode, App.tsx passes `mods` prop, but we can also fetch installed content
      return;
    }
    setIsLoadingInstalled(true);
    try {
      const items = await safeInvoke<UnifiedInstalledItem[]>("get_content_items", {
        instanceId: activeInstance.id,
        category: activeCategory,
      });
      setInstalledItems(items || []);
    } catch (err) {
      console.error(`Błąd wczytywania ${activeCategory}:`, err);
    } finally {
      setIsLoadingInstalled(false);
    }
  };

  useEffect(() => {
    refreshInstalledItems();
  }, [activeCategory, activeInstance?.id]);

  // Native Tauri v2 window drag-and-drop listener
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupTauriDrop = async () => {
      try {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        const fn = await getCurrentWebview().onDragDropEvent(async (event) => {
          if (event.payload.type === "over") {
            setIsDragging(true);
          } else if (event.payload.type === "drop") {
            setIsDragging(false);
            if (event.payload.paths && event.payload.paths.length > 0 && activeInstance) {
              for (const p of event.payload.paths) {
                if (activeCategory === "mods") {
                  if (p.endsWith(".jar") || p.endsWith(".jar.disabled")) {
                    onInstallModFile(p);
                  }
                } else {
                  try {
                    await safeInvoke("install_content_file_path", {
                      instanceId: activeInstance.id,
                      category: activeCategory,
                      path: p,
                    });
                    refreshInstalledItems();
                    setInstalledNotice(`Dodano plik do ${activeCategory}!`);
                    setTimeout(() => setInstalledNotice(null), 3000);
                  } catch (e) {
                    console.error("Błąd upuszczania pliku:", e);
                  }
                }
              }
            }
          } else {
            setIsDragging(false);
          }
        });
        unlisten = fn;
      } catch {
        // Browser mock mode
      }
    };

    setupTauriDrop();
    return () => {
      if (unlisten) unlisten();
    };
  }, [onInstallModFile, activeCategory, activeInstance?.id]);

  // Catalog search effect (Modrinth + CurseForge)
  useEffect(() => {
    if (subTab !== "catalog") return;

    const timer = setTimeout(async () => {
      setIsSearchingCatalog(true);
      try {
        const items = await safeInvoke<UnifiedCatalogItem[]>("search_content", {
          query: catalogQuery,
          category: activeCategory,
          source: catalogSource,
          loader: activeInstance?.loader,
          mcVersion: activeInstance?.mc_version,
          limit: 30,
          offset: 0,
        });

        setCatalogProjects(items || []);
      } catch (err) {
        console.error("Błąd wyszukiwania w katalogu:", err);
      } finally {
        setIsSearchingCatalog(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [subTab, catalogQuery, catalogSource, activeCategory, activeInstance?.loader, activeInstance?.mc_version]);

  // Open Version Selector Modal for a Project
  const handleOpenVersionModal = async (project: UnifiedCatalogItem) => {
    setSelectedProject(project);
    setIsLoadingVersions(true);
    setProjectVersions([]);
    setVersionSearchQuery("");

    try {
      const versions = await safeInvoke<UnifiedVersionItem[]>("get_content_versions", {
        projectId: project.id,
        source: project.source,
        category: activeCategory,
        loader: activeInstance?.loader,
        mcVersion: activeInstance?.mc_version,
      });
      setProjectVersions(versions || []);
    } catch (err) {
      console.error("Błąd pobierania wersji:", err);
    } finally {
      setIsLoadingVersions(false);
    }
  };

  // Check if a project or version is already installed locally
  const isItemInstalled = (title: string, slug: string, filename?: string) => {
    const checkName = (filename || title).toLowerCase();
    const checkSlug = slug.toLowerCase();

    if (activeCategory === "mods") {
      return mods.some((m) => {
        const mn = m.name.toLowerCase();
        const fn = m.filename.toLowerCase();
        return (
          fn === checkName ||
          mn.includes(checkSlug) ||
          fn.includes(checkSlug) ||
          mn.includes(title.toLowerCase())
        );
      });
    }

    return installedItems.some((item) => {
      const fn = item.filename.toLowerCase();
      const n = item.name.toLowerCase();
      return (
        fn === checkName ||
        n.includes(checkSlug) ||
        fn.includes(checkSlug) ||
        n.includes(title.toLowerCase())
      );
    });
  };

  // Install a specific version
  const handleInstallVersion = async (version: UnifiedVersionItem) => {
    if (!activeInstance || !selectedProject) return;

    setInstallingVersionId(version.id);
    try {
      // Smart conflict resolution: Sodium 0.9.1 vs 0.9.2 on MC 26.2 Fabric
      const isSodium = selectedProject.slug.toLowerCase().includes("sodium") || selectedProject.raw_id === "AANobbMI";
      const isIris = selectedProject.slug.toLowerCase().includes("iris") || selectedProject.raw_id === "YL57xq9U";
      const isMC26_2 = activeInstance.mc_version.includes("26.2");

      if (isSodium && isMC26_2 && mods.some((m) => m.filename.toLowerCase().includes("iris"))) {
        if (version.version_number.includes("0.9.2")) {
          // Alert user or suggest 0.9.1
          const compat = projectVersions.find((v) => v.version_number.includes("0.9.1"));
          if (compat) {
            alert("Uwaga: Sodium 0.9.2 wyklucza Iris 1.11.2! Wybieramy wersję Sodium 0.9.1, która jest w 100% zgodna.");
            version = compat;
          }
        }
      }

      if (isIris && isMC26_2) {
        const brokenSodium = mods.find(
          (m) => m.filename.toLowerCase().includes("sodium") && m.filename.includes("0.9.2")
        );
        if (brokenSodium) {
          onDeleteMod(brokenSodium.filename);
        }
      }

      await safeInvoke("install_content_file", {
        instanceId: activeInstance.id,
        category: activeCategory,
        fileUrl: version.download_url,
        filename: version.file_name,
      });

      setInstalledNotice(`Zainstalowano: ${version.file_name}!`);
      setTimeout(() => setInstalledNotice(null), 3500);

      if (activeCategory === "mods") {
        if (onModInstalled) onModInstalled();
      } else {
        await refreshInstalledItems();
      }
    } catch (err) {
      console.error("Błąd instalacji wersji:", err);
      alert(`Nie udało się pobrać pliku: ${err}`);
    } finally {
      setInstallingVersionId(null);
    }
  };

  // Quick install latest compatible version directly from card
  const handleQuickInstall = async (project: UnifiedCatalogItem) => {
    if (!activeInstance) return;
    setInstallingVersionId(project.id);
    try {
      const versions = await safeInvoke<UnifiedVersionItem[]>("get_content_versions", {
        projectId: project.id,
        source: project.source,
        category: activeCategory,
        loader: activeInstance.loader,
        mcVersion: activeInstance.mc_version,
      });

      if (!versions || versions.length === 0) {
        alert(`Brak kompatybilnej wersji ${project.title} dla ${activeInstance.mc_version}`);
        return;
      }

      // Filter compatible
      const mcVer = activeInstance.mc_version.toLowerCase();
      const loader = activeInstance.loader.toLowerCase();
      const compatible = versions.find((v) => {
        const hasMc = v.game_versions.length === 0 || v.game_versions.some((gv) => gv.toLowerCase().includes(mcVer));
        const hasLoader = activeCategory !== "mods" || v.loaders.length === 0 || v.loaders.some((l) => l.toLowerCase().includes(loader));
        return hasMc && hasLoader;
      }) || versions[0];

      await handleInstallVersion(compatible);
    } catch (err) {
      console.error("Błąd szybkiej instalacji:", err);
      alert(`Błąd instalacji: ${err}`);
    } finally {
      setInstallingVersionId(null);
    }
  };

  // Toggle installed item
  const handleToggleItem = async (filename: string) => {
    if (!activeInstance) return;
    if (activeCategory === "mods") {
      onToggleMod(filename);
      return;
    }
    try {
      const updated = await safeInvoke<UnifiedInstalledItem>("toggle_content_item", {
        instanceId: activeInstance.id,
        category: activeCategory,
        filename,
      });
      if (updated) {
        setInstalledItems((prev) => prev.map((item) => (item.filename === filename ? updated : item)));
      }
    } catch (err) {
      console.error(`Błąd przełączania ${filename}:`, err);
    }
  };

  // Delete installed item
  const handleDeleteItem = async (filename: string) => {
    if (!activeInstance) return;
    if (activeCategory === "mods") {
      onDeleteMod(filename);
      setItemPendingDelete(null);
      return;
    }
    try {
      await safeInvoke("delete_content_item", {
        instanceId: activeInstance.id,
        category: activeCategory,
        filename,
      });
      setInstalledItems((prev) => prev.filter((item) => item.filename !== filename));
      setItemPendingDelete(null);
    } catch (err) {
      console.error(`Błąd usuwania ${filename}:`, err);
    }
  };

  // File drag & drop local handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0 && activeInstance) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = (file as any).path;
        if (activeCategory === "mods") {
          if (filePath && (filePath.endsWith(".jar") || filePath.endsWith(".jar.disabled"))) {
            onInstallModFile(filePath);
          } else if (onInstallModBytes && (file.name.endsWith(".jar") || file.name.endsWith(".jar.disabled"))) {
            const buffer = await file.arrayBuffer();
            onInstallModBytes(file.name, Array.from(new Uint8Array(buffer)));
          }
        } else {
          if (filePath) {
            await safeInvoke("install_content_file_path", {
              instanceId: activeInstance.id,
              category: activeCategory,
              path: filePath,
            });
          } else {
            const buffer = await file.arrayBuffer();
            await safeInvoke("install_content_file_bytes", {
              instanceId: activeInstance.id,
              category: activeCategory,
              filename: file.name,
              bytes: Array.from(new Uint8Array(buffer)),
            });
          }
          await refreshInstalledItems();
        }
      }
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && activeInstance) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = (file as any).path;
        if (activeCategory === "mods") {
          if (filePath) {
            onInstallModFile(filePath);
          } else if (onInstallModBytes) {
            const buffer = await file.arrayBuffer();
            onInstallModBytes(file.name, Array.from(new Uint8Array(buffer)));
          }
        } else {
          if (filePath) {
            await safeInvoke("install_content_file_path", {
              instanceId: activeInstance.id,
              category: activeCategory,
              path: filePath,
            });
          } else {
            const buffer = await file.arrayBuffer();
            await safeInvoke("install_content_file_bytes", {
              instanceId: activeInstance.id,
              category: activeCategory,
              filename: file.name,
              bytes: Array.from(new Uint8Array(buffer)),
            });
          }
          await refreshInstalledItems();
        }
      }
      e.target.value = "";
    }
  };

  // Filter installed items
  const displayedInstalledMods = mods.filter(
    (m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.authors.some((a) => a.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const displayedInstalledOther = installedItems.filter(
    (item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentActiveTabConfig = CATEGORY_TABS.find((t) => t.id === activeCategory) || CATEGORY_TABS[0];
  const installedCount = activeCategory === "mods" ? mods.length : installedItems.length;

  // Filter versions in modal
  const filteredVersions = projectVersions.filter((v) => {
    if (versionSearchQuery) {
      const q = versionSearchQuery.toLowerCase();
      if (!v.name.toLowerCase().includes(q) && !v.version_number.toLowerCase().includes(q) && !v.file_name.toLowerCase().includes(q)) {
        return false;
      }
    }
    if (filterOnlyCompatible && activeInstance) {
      const mcVer = activeInstance.mc_version.toLowerCase();
      const loader = activeInstance.loader.toLowerCase();
      const mcMatches = v.game_versions.length === 0 || v.game_versions.some((gv) => gv.toLowerCase().includes(mcVer));
      const loaderMatches = activeCategory !== "mods" || v.loaders.length === 0 || v.loaders.some((l) => l.toLowerCase().includes(loader));
      return mcMatches && loaderMatches;
    }
    return true;
  });

  return (
    <div className="flex-1 h-full overflow-y-auto p-8 flex flex-col relative z-10">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        accept={currentActiveTabConfig.ext}
        multiple
        className="hidden"
      />

      {/* Notice Banner */}
      {installedNotice && (
        <div className="fixed bottom-8 right-8 z-50 px-5 py-3 rounded-2xl bg-emerald-950/90 border border-emerald-500/40 text-emerald-200 text-xs font-semibold shadow-2xl flex items-center gap-2 animate-bounce">
          <CheckCircle size={16} className="text-emerald-400" />
          <span>{installedNotice}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-neon-cyan text-xs font-semibold tracking-wider uppercase mb-2">
            <currentActiveTabConfig.icon size={13} />
            <span>Centrum Zawartości & Dodatków</span>
          </div>
          <h2 className="text-3xl font-heading font-extrabold text-white tracking-tight">
            {currentActiveTabConfig.label} — <span className="text-neon-cyan">{activeInstance ? activeInstance.name : "Wybierz profil"}</span>
          </h2>
          <p className="text-gray-400 text-xs mt-1">
            Pobieraj z baz Modrinth i CurseForge lub zarządzaj plikami na dysku.
          </p>
        </div>

        <button
          onClick={() => onOpenModsFolder(activeCategory)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs font-semibold text-white transition-all cursor-pointer shadow-lg hover:border-cyan-400/40 shrink-0 self-start"
        >
          <FolderOpen size={16} className="text-neon-cyan" />
          <span>Otwórz folder ({currentActiveTabConfig.folder})</span>
        </button>
      </div>

      {/* Main Categories Switcher (Mody, Resource Packi, Shadery, Datapacki) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-5">
        {CATEGORY_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeCategory === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveCategory(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? "bg-cyan-500/20 text-neon-cyan border border-cyan-400/50 shadow-neon-cyan"
                  : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-white/5"
              }`}
            >
              <Icon size={15} className={isActive ? "text-neon-cyan" : "text-gray-400"} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Sub-Tabs: Zainstalowane vs Katalog Online */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => setSubTab("installed")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-semibold tracking-wider transition-all cursor-pointer ${
            subTab === "installed"
              ? "bg-white text-black font-bold shadow-[0_0_20px_rgba(255,255,255,0.25)] scale-[1.02]"
              : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
          }`}
        >
          <currentActiveTabConfig.icon size={14} />
          <span>Zainstalowane ({installedCount})</span>
        </button>

        <button
          onClick={() => setSubTab("catalog")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-semibold tracking-wider transition-all cursor-pointer ${
            subTab === "catalog"
              ? "bg-gradient-to-r from-cyan-400 to-blue-500 text-black font-bold shadow-[0_0_25px_rgba(0,242,255,0.35)] scale-[1.02]"
              : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
          }`}
        >
          <Sparkles size={14} className={subTab === "catalog" ? "text-black" : "text-neon-cyan"} />
          <span>Katalog Online (Modrinth & CurseForge)</span>
        </button>
      </div>

      {/* TAB 1: INSTALLED ITEMS */}
      {subTab === "installed" && (
        <>
          {/* Drag & Drop Hero Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`rounded-3xl p-8 mb-6 border-2 border-dashed transition-all flex flex-col items-center justify-center text-center ${
              isDragging
                ? "border-neon-cyan bg-cyan-500/15 shadow-neon-cyan scale-[1.01]"
                : "border-white/10 bg-black/40 hover:border-white/20 hover:bg-black/60"
            }`}
          >
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-cyan-500/30 flex items-center justify-center text-neon-cyan mb-3 shadow-[0_0_20px_rgba(0,242,255,0.25)]">
              <UploadCloud size={30} />
            </div>
            <h3 className="font-heading font-extrabold text-base text-white mb-1">
              Upuść pliki {currentActiveTabConfig.ext} tutaj
            </h3>
            <p className="text-xs text-gray-400 max-w-sm mb-4">
              Przeciągnij pobrany plik z komputera, a automatycznie dodamy go do Twojego profilu.
            </p>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-semibold text-white transition-all cursor-pointer shadow-lg hover:border-cyan-400/50"
            >
              <PlusCircle size={15} className="text-neon-cyan" />
              <span>Wybierz plik z dysku</span>
            </button>
          </div>

          {/* Search bar */}
          <div className="relative mb-5">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={`Szukaj w zainstalowanych (${currentActiveTabConfig.label.toLowerCase()})...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl pl-11 pr-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400/50 transition-colors"
            />
          </div>

          {/* List of Installed Items */}
          <div className="flex-1">
            {isParentLoading || isLoadingInstalled ? (
              <div className="flex items-center justify-center p-12 text-gray-500">
                <Loader2 size={24} className="animate-spin text-neon-cyan mr-3" />
                <span className="text-sm">Wczytywanie elementów...</span>
              </div>
            ) : activeCategory === "mods" ? (
              displayedInstalledMods.length === 0 ? (
                <div className="glass-panel rounded-3xl p-12 text-center text-gray-500">
                  <Puzzle size={40} className="mx-auto mb-3 opacity-30 text-neon-cyan" />
                  <p className="font-medium text-sm text-gray-400">Brak modów w tym profilu</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Przeciągnij plik .jar lub przejdź do Katalogu Online, aby coś zainstalować.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
                  {displayedInstalledMods.map((mod) => {
                    const cleanedDesc = mod.description
                      .replace(/^['"]{1,3}|['"]{1,3}$/g, "")
                      .replace(/\s+/g, " ")
                      .trim();
                    const displayDesc =
                      cleanedDesc.length > 0 && cleanedDesc !== "'''" && cleanedDesc !== '"""'
                        ? cleanedDesc
                        : "Modyfikacja gry Minecraft";

                    const cleanedVer = mod.version.split("#")[0].replace(/^["']|["']$/g, "").trim();
                    const displayVer = cleanedVer.startsWith("v") ? cleanedVer : `v${cleanedVer}`;

                    const cleanName = mod.name.replace(/^["']|["']$/g, "").trim();
                    const words = cleanName.replace(/[^a-zA-Z0-9\s]/g, "").trim().split(/\s+/);
                    const initials =
                      words.length >= 2
                        ? (words[0][0] + words[1][0]).toUpperCase()
                        : cleanName.slice(0, 2).toUpperCase() || "MD";

                    return (
                      <div
                        key={mod.filename}
                        className={`glass-panel rounded-2xl p-4 transition-all duration-200 border flex items-center justify-between gap-4 ${
                          mod.enabled
                            ? "border-white/10 hover:border-cyan-500/30 hover:bg-white/[0.04]"
                            : "border-white/5 opacity-60 bg-black/40"
                        }`}
                      >
                        <div className="flex items-center gap-4 min-w-0 flex-1">
                          <div
                            className="w-12 h-12 min-w-[48px] min-h-[48px] max-w-[48px] max-h-[48px] rounded-xl bg-black/60 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden p-1 shadow-md"
                            style={{ width: 48, height: 48, minWidth: 48, minHeight: 48, maxWidth: 48, maxHeight: 48 }}
                          >
                            {mod.icon_base64 ? (
                              <img
                                src={mod.icon_base64}
                                alt={cleanName}
                                className="w-full h-full object-contain rounded-lg"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = "none";
                                }}
                              />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-cyan-950/80 via-black to-purple-950/60 flex items-center justify-center border border-cyan-500/20 text-neon-cyan font-heading font-black text-xs shadow-inner rounded-lg">
                                {initials}
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2.5 mb-1">
                              <h4 className="font-heading font-bold text-sm text-white truncate" title={cleanName}>
                                {cleanName}
                              </h4>
                              <span
                                className="shrink-0 text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 text-gray-300 border border-white/10 max-w-[120px] truncate"
                                title={displayVer}
                              >
                                {displayVer}
                              </span>
                            </div>
                            <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed" title={displayDesc}>
                              {displayDesc}
                            </p>
                            {mod.authors.length > 0 && (
                              <p className="text-[10px] text-gray-500 truncate mt-1">Autorzy: {mod.authors.join(", ")}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <button
                            onClick={() => onToggleMod(mod.filename)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                              mod.enabled
                                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25"
                                : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white"
                            }`}
                          >
                            {mod.enabled ? <CheckCircle size={13} /> : <XCircle size={13} />}
                            <span>{mod.enabled ? "Włączony" : "Wyłączony"}</span>
                          </button>

                          <button
                            onClick={() => setItemPendingDelete(mod.filename)}
                            className="p-2 rounded-xl bg-white/5 hover:bg-rose-500/20 text-gray-400 hover:text-rose-400 border border-white/5 hover:border-rose-500/30 transition-all cursor-pointer"
                            title="Usuń moda"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : displayedInstalledOther.length === 0 ? (
              <div className="glass-panel rounded-3xl p-12 text-center text-gray-500">
                <currentActiveTabConfig.icon size={40} className="mx-auto mb-3 opacity-30 text-neon-cyan" />
                <p className="font-medium text-sm text-gray-400">Brak elementów w {currentActiveTabConfig.label}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Przeciągnij plik .zip lub przejdź do Katalogu Online, aby pobrać pakiety.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
                {displayedInstalledOther.map((item) => (
                  <div
                    key={item.filename}
                    className={`glass-panel rounded-2xl p-4 transition-all duration-200 border flex items-center justify-between gap-4 ${
                      item.enabled
                        ? "border-white/10 hover:border-cyan-500/30 hover:bg-white/[0.04]"
                        : "border-white/5 opacity-60 bg-black/40"
                    }`}
                  >
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div className="w-12 h-12 min-w-[48px] min-h-[48px] max-w-[48px] max-h-[48px] rounded-xl bg-black/60 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden p-1 shadow-md text-neon-cyan">
                        <currentActiveTabConfig.icon size={22} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2.5 mb-1">
                          <h4 className="font-heading font-bold text-sm text-white truncate" title={item.name}>
                            {item.name}
                          </h4>
                          {item.size > 0 && (
                            <span className="shrink-0 text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 text-gray-300 border border-white/10">
                              {(item.size / (1024 * 1024)).toFixed(1)} MB
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 truncate">{item.filename}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <button
                        onClick={() => handleToggleItem(item.filename)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                          item.enabled
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25"
                            : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        {item.enabled ? <CheckCircle size={13} /> : <XCircle size={13} />}
                        <span>{item.enabled ? "Włączony" : "Wyłączony"}</span>
                      </button>

                      <button
                        onClick={() => setItemPendingDelete(item.filename)}
                        className="p-2 rounded-xl bg-white/5 hover:bg-rose-500/20 text-gray-400 hover:text-rose-400 border border-white/5 hover:border-rose-500/30 transition-all cursor-pointer"
                        title="Usuń plik"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* TAB 2: ONLINE CATALOG */}
      {subTab === "catalog" && (
        <div className="flex flex-col gap-5">
          {/* Search, Sources & Categories Toolbar */}
          <div className="flex flex-col lg:flex-row gap-3 items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1 w-full">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder={`Szukaj w bazie (${currentActiveTabConfig.label.toLowerCase()})...`}
                value={catalogQuery}
                onChange={(e) => setCatalogQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl pl-11 pr-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400/50 transition-colors"
              />
            </div>

            {/* Source Selector (Wszystkie, Modrinth, CurseForge) */}
            <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-2xl border border-white/10 shrink-0">
              <button
                onClick={() => setCatalogSource("all")}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  catalogSource === "all"
                    ? "bg-white/15 text-white font-bold border border-white/20 shadow-md"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <Globe size={13} />
                <span>Wszystkie źródła</span>
              </button>

              <button
                onClick={() => setCatalogSource("modrinth")}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  catalogSource === "modrinth"
                    ? "bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.3)]"
                    : "text-gray-400 hover:text-emerald-300"
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                <span>Modrinth</span>
              </button>

              <button
                onClick={() => setCatalogSource("curseforge")}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  catalogSource === "curseforge"
                    ? "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.3)]"
                    : "text-gray-400 hover:text-amber-300"
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                <span>CurseForge</span>
              </button>
            </div>
          </div>

          {/* Results Grid */}
          {isSearchingCatalog ? (
            <div className="flex items-center justify-center p-16 text-gray-400">
              <Loader2 size={26} className="animate-spin text-neon-cyan mr-3" />
              <span className="text-sm font-semibold">Wyszukiwanie projektów w bazach...</span>
            </div>
          ) : catalogProjects.length === 0 ? (
            <div className="glass-panel rounded-3xl p-12 text-center text-gray-500">
              <Sparkles size={36} className="mx-auto mb-3 opacity-30 text-neon-cyan" />
              <p className="font-medium text-sm text-gray-400">Nie znaleziono wyników</p>
              <p className="text-xs text-gray-600 mt-1">Spróbuj zmienić zapytanie lub wybrać inne źródło.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {catalogProjects.map((project) => {
                const isInstalled = isItemInstalled(project.title, project.slug);
                const isInstalling = installingVersionId === project.id;
                const isModrinth = project.source === "modrinth";

                return (
                  <div
                    key={project.id}
                    onClick={() => handleOpenVersionModal(project)}
                    className="glass-panel rounded-2xl p-4.5 border border-white/10 hover:border-cyan-500/40 hover:bg-white/[0.04] transition-all flex flex-col justify-between gap-3 shadow-lg cursor-pointer group"
                  >
                    <div className="flex items-start gap-3.5">
                      <div
                        className="w-12 h-12 min-w-[48px] min-h-[48px] max-w-[48px] max-h-[48px] rounded-xl bg-black/60 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden p-1 shadow-md"
                        style={{ width: 48, height: 48, minWidth: 48, minHeight: 48, maxWidth: 48, maxHeight: 48 }}
                      >
                        {project.icon_url ? (
                          <img
                            src={project.icon_url}
                            alt={project.title}
                            className="w-full h-full object-contain rounded-lg"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <currentActiveTabConfig.icon size={22} className="text-neon-cyan" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-heading font-bold text-sm text-white group-hover:text-neon-cyan transition-colors truncate">
                            {project.title}
                          </h4>

                          {/* Source Platform Badge */}
                          <span
                            className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full shrink-0 border tracking-wider ${
                              isModrinth
                                ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                                : "bg-amber-500/10 text-amber-300 border-amber-500/30"
                            }`}
                          >
                            {isModrinth ? "Modrinth" : "CurseForge"}
                          </span>
                        </div>

                        <p className="text-xs text-gray-400 line-clamp-2 mt-1 leading-relaxed">
                          {project.description || "Brak opisu modyfikacji"}
                        </p>

                        <div className="flex items-center gap-3 text-[10px] text-gray-500 mt-1.5">
                          <span>Autor: <strong className="text-gray-400">{project.author}</strong></span>
                          <span>•</span>
                          <span>{(project.downloads / 1000000).toFixed(1)}M pobrań</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-white/5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5 flex-wrap max-w-[200px] overflow-hidden">
                        {project.categories.slice(0, 2).map((cat) => (
                          <span
                            key={cat}
                            className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-md bg-white/5 text-gray-400 border border-white/5 truncate max-w-[90px]"
                          >
                            {cat}
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenVersionModal(project)}
                          className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-gray-300 hover:text-white text-xs font-semibold transition-all cursor-pointer"
                        >
                          Wersje
                        </button>

                        {isInstalled ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                            <Check size={13} />
                            <span>Zainstalowano</span>
                          </span>
                        ) : (
                          <button
                            onClick={() => handleQuickInstall(project)}
                            disabled={isInstalling}
                            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-black font-bold text-xs shadow-neon-cyan transition-all cursor-pointer disabled:opacity-50"
                          >
                            {isInstalling ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <ArrowDownToLine size={13} />
                            )}
                            <span>{isInstalling ? "Pobieranie..." : "Zainstaluj"}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VERSION PICKER MODAL */}
      {selectedProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="glass-panel border border-cyan-500/30 rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 pb-4 border-b border-white/10 flex items-start justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-14 h-14 rounded-2xl bg-black/60 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden p-1 shadow-md">
                  {selectedProject.icon_url ? (
                    <img src={selectedProject.icon_url} alt={selectedProject.title} className="w-full h-full object-contain rounded-xl" />
                  ) : (
                    <currentActiveTabConfig.icon size={26} className="text-neon-cyan" />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-heading font-extrabold text-lg text-white truncate">
                      {selectedProject.title}
                    </h3>
                    <span
                      className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border ${
                        selectedProject.source === "modrinth"
                          ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                          : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                      }`}
                    >
                      {selectedProject.source === "modrinth" ? "Modrinth" : "CurseForge"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 line-clamp-1">{selectedProject.description}</p>
                  <p className="text-[11px] text-gray-500 mt-1">Autor: {selectedProject.author}</p>
                </div>
              </div>

              <button
                onClick={() => setSelectedProject(null)}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Controls: Search & Compatible Filter */}
            <div className="px-6 py-3 bg-white/[0.02] border-b border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative flex-1 w-full">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Filtruj wersje (np. 1.21, 26.2, fabric)..."
                  value={versionSearchQuery}
                  onChange={(e) => setVersionSearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400/40"
                />
              </div>

              {activeInstance && (
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-gray-300 shrink-0">
                  <input
                    type="checkbox"
                    checked={filterOnlyCompatible}
                    onChange={(e) => setFilterOnlyCompatible(e.target.checked)}
                    className="rounded accent-cyan-400 cursor-pointer"
                  />
                  <span>Tylko dla {activeInstance.loader} {activeInstance.mc_version}</span>
                </label>
              )}
            </div>

            {/* Versions List */}
            <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-3 max-h-[50vh]">
              {isLoadingVersions ? (
                <div className="flex flex-col items-center justify-center p-12 text-gray-400 gap-2">
                  <Loader2 size={24} className="animate-spin text-neon-cyan" />
                  <span className="text-xs">Pobieranie listy wersji z platformy...</span>
                </div>
              ) : filteredVersions.length === 0 ? (
                <div className="text-center p-8 text-gray-400">
                  <p className="text-sm font-semibold">Brak wersji spełniających kryteria.</p>
                  {filterOnlyCompatible && (
                    <button
                      onClick={() => setFilterOnlyCompatible(false)}
                      className="mt-2 text-xs text-neon-cyan hover:underline cursor-pointer"
                    >
                      Pokaż wszystkie wersje (w tym archiwalne)
                    </button>
                  )}
                </div>
              ) : (
                filteredVersions.map((v) => {
                  const isInstalled = isItemInstalled(selectedProject.title, selectedProject.slug, v.file_name);
                  const isDownloading = installingVersionId === v.id;

                  // Release type styling
                  const relLower = v.release_type.toLowerCase();
                  const isRelease = relLower.includes("release");
                  const isBeta = relLower.includes("beta");

                  return (
                    <div
                      key={v.id}
                      className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-cyan-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-heading font-bold text-sm text-white truncate max-w-sm">
                            {v.name || v.version_number}
                          </span>

                          <span
                            className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                              isRelease
                                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                : isBeta
                                ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                                : "bg-rose-500/15 text-rose-400 border-rose-500/30"
                            }`}
                          >
                            {v.release_type}
                          </span>

                          {/* Sodium/Iris Compatibility Hint */}
                          {selectedProject.slug.toLowerCase().includes("sodium") && v.version_number.includes("0.9.1") && (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-neon-cyan border border-cyan-400/40">
                              Zgodna z Iris 1.11.2
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                          <span className="font-mono text-gray-300">{v.file_name}</span>
                          {v.file_size > 0 && (
                            <span>• {(v.file_size / (1024 * 1024)).toFixed(2)} MB</span>
                          )}
                          {v.date && (
                            <span>• {v.date.split("T")[0]}</span>
                          )}
                        </div>

                        {/* Supported versions & Loaders */}
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {v.loaders.map((ldr) => (
                            <span
                              key={ldr}
                              className="text-[9px] uppercase font-semibold px-2 py-0.5 rounded-md bg-white/5 text-gray-400 border border-white/5"
                            >
                              {ldr}
                            </span>
                          ))}
                          {v.game_versions.slice(0, 4).map((gv) => (
                            <span
                              key={gv}
                              className="text-[9px] font-mono px-2 py-0.5 rounded-md bg-white/5 text-cyan-300 border border-cyan-500/20"
                            >
                              {gv}
                            </span>
                          ))}
                          {v.game_versions.length > 4 && (
                            <span className="text-[9px] text-gray-500 font-mono">
                              +{v.game_versions.length - 4} więcej
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 self-end sm:self-center">
                        {isInstalled ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                            <Check size={13} />
                            <span>Zainstalowano</span>
                          </span>
                        ) : (
                          <button
                            onClick={() => handleInstallVersion(v)}
                            disabled={isDownloading}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-black font-bold text-xs shadow-neon-cyan transition-all cursor-pointer disabled:opacity-50"
                          >
                            {isDownloading ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <ArrowDownToLine size={13} />
                            )}
                            <span>{isDownloading ? "Pobieranie..." : "Zainstaluj tę wersję"}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {itemPendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="glass-panel border border-rose-500/30 rounded-3xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400 mb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 flex items-center justify-center border border-rose-500/30">
                <AlertTriangle size={20} />
              </div>
              <h3 className="font-heading font-bold text-lg text-white">Potwierdź usunięcie</h3>
            </div>
            <p className="text-xs text-gray-300 mb-6 leading-relaxed">
              Czy na pewno chcesz bezpowrotnie usunąć plik{" "}
              <span className="font-mono text-white bg-white/10 px-2 py-0.5 rounded font-semibold">
                {itemPendingDelete}
              </span>{" "}
              z folderu {currentActiveTabConfig.folder}?
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setItemPendingDelete(null)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-gray-300 transition-colors cursor-pointer"
              >
                Anuluj
              </button>
              <button
                onClick={() => handleDeleteItem(itemPendingDelete)}
                className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-xs font-bold text-white transition-colors cursor-pointer shadow-lg shadow-rose-900/30"
              >
                Usuń z dysku
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

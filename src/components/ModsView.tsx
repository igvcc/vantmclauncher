import { useState, useEffect, useRef } from "react";
import { FolderOpen, Search, Trash2, UploadCloud, CheckCircle, XCircle, Puzzle, PlusCircle, AlertTriangle, FileCode } from "lucide-react";
import { Instance, ModItem } from "../types";

interface ModsViewProps {
  activeInstance: Instance | null;
  mods: ModItem[];
  isLoading: boolean;
  onToggleMod: (filename: string) => void;
  onDeleteMod: (filename: string) => void;
  onInstallModFile: (path: string) => void;
  onInstallModBytes?: (filename: string, bytes: number[]) => void;
  onOpenModsFolder: () => void;
}

export const ModsView: React.FC<ModsViewProps> = ({
  activeInstance,
  mods,
  isLoading,
  onToggleMod,
  onDeleteMod,
  onInstallModFile,
  onInstallModBytes,
  onOpenModsFolder,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [modPendingDelete, setModPendingDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Native Tauri v2 window drag-and-drop listener
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupTauriDrop = async () => {
      try {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        const fn = await getCurrentWebview().onDragDropEvent((event) => {
          if (event.payload.type === "over") {
            setIsDragging(true);
          } else if (event.payload.type === "drop") {
            setIsDragging(false);
            if (event.payload.paths && event.payload.paths.length > 0) {
              for (const p of event.payload.paths) {
                if (p.endsWith(".jar") || p.endsWith(".jar.disabled")) {
                  onInstallModFile(p);
                }
              }
            }
          } else {
            setIsDragging(false);
          }
        });
        unlisten = fn;
      } catch {
        // Running in standard browser or preview
      }
    };

    setupTauriDrop();
    return () => {
      if (unlisten) unlisten();
    };
  }, [onInstallModFile]);

  const filteredMods = mods.filter(
    (m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.authors.some((a) => a.toLowerCase().includes(searchQuery.toLowerCase()))
  );

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
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = (file as any).path;
        if (filePath && (filePath.endsWith(".jar") || filePath.endsWith(".jar.disabled"))) {
          onInstallModFile(filePath);
        } else if (onInstallModBytes && (file.name.endsWith(".jar") || file.name.endsWith(".jar.disabled"))) {
          const buffer = await file.arrayBuffer();
          onInstallModBytes(file.name, Array.from(new Uint8Array(buffer)));
        }
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = (file as any).path;
        if (filePath) {
          onInstallModFile(filePath);
        } else if (onInstallModBytes) {
          const buffer = await file.arrayBuffer();
          onInstallModBytes(file.name, Array.from(new Uint8Array(buffer)));
        }
      }
      e.target.value = "";
    }
  };

  const handleManualPathSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const path = (formData.get("modPath") as string)?.trim();
    if (path) {
      onInstallModFile(path);
      e.currentTarget.reset();
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-8 flex flex-col relative z-10">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".jar,.jar.disabled"
        multiple
        className="hidden"
      />

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-neon-cyan text-xs font-semibold tracking-wider uppercase mb-2">
            <Puzzle size={13} />
            <span>Menedżer Modów</span>
          </div>
          <h2 className="text-3xl font-heading font-extrabold text-white tracking-tight">
            Modyfikacje — <span className="text-neon-cyan">{activeInstance ? activeInstance.name : "Brak"}</span>
          </h2>
          <p className="text-gray-400 text-xs mt-1">
            Przeciągaj pliki .jar bezpośrednio do okna lub kliknij przycisk wyboru z dysku.
          </p>
        </div>

        <button
          onClick={onOpenModsFolder}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs font-semibold text-white transition-all cursor-pointer shadow-lg hover:border-cyan-400/40"
        >
          <FolderOpen size={16} className="text-neon-cyan" />
          <span>Otwórz folder mods</span>
        </button>
      </div>

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
        <h3 className="font-heading font-extrabold text-lg text-white">
          Przeciągnij i upuść pliki .jar tutaj
        </h3>
        <p className="text-xs text-gray-400 max-w-md mt-1 mb-5">
          Launcher automatycznie odczyta nazwę moda, wersję, opis i ikonę oraz umieści go w profilu instancji.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 w-full max-w-xl">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-neon-cyan text-black font-bold text-xs hover:bg-cyan-300 transition-all shadow-neon-cyan cursor-pointer"
          >
            <PlusCircle size={15} />
            <span>Wybierz pliki .jar z dysku</span>
          </button>

          {/* Quick path installer form */}
          <form onSubmit={handleManualPathSubmit} className="flex gap-2 flex-1 min-w-[240px]">
            <input
              name="modPath"
              type="text"
              placeholder="Lub wklej pełną ścieżkę do .jar..."
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-neon-cyan font-mono"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition-colors cursor-pointer border border-white/10"
            >
              Dodaj
            </button>
          </form>
        </div>
      </div>

      {/* Search & Stats Filter */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Szukaj moda po nazwie, pliku lub autorze..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-neon-cyan transition-colors"
          />
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span>
            Zainstalowane: <strong className="text-white font-mono">{mods.length}</strong>
          </span>
          <span>•</span>
          <span>
            Aktywne: <strong className="text-emerald-400 font-mono">{mods.filter((m) => m.enabled).length}</strong>
          </span>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {modPendingDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel border border-rose-500/30 rounded-3xl p-6 max-w-md w-full shadow-[0_0_40px_rgba(244,63,94,0.2)]">
            <div className="flex items-center gap-3 text-rose-400 mb-3">
              <AlertTriangle size={24} />
              <h3 className="font-heading font-bold text-lg text-white">Usunąć modyfikację?</h3>
            </div>
            <p className="text-xs text-gray-300 mb-2">
              Czy na pewno chcesz usunąć ten mod? Plik zostanie trwale usunięty z dysku:
            </p>
            <p className="text-xs font-mono bg-black/60 p-2.5 rounded-xl text-rose-300 border border-rose-500/20 mb-6 break-all">
              {modPendingDelete}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setModPendingDelete(null)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-gray-300 transition-colors cursor-pointer"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteMod(modPendingDelete);
                  setModPendingDelete(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors shadow-lg shadow-rose-900/40 cursor-pointer"
              >
                Usuń plik
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mods List */}
      <div className="flex-1 overflow-y-auto pr-1">
        {isLoading ? (
          <div className="h-40 flex items-center justify-center text-xs text-gray-400">
            <span className="animate-spin mr-2">⟳</span> Ładowanie modów...
          </div>
        ) : filteredMods.length === 0 ? (
          <div className="h-52 glass-panel rounded-3xl flex flex-col items-center justify-center text-center p-6 text-gray-400">
            <Puzzle size={40} className="text-gray-600 mb-3" />
            <p className="text-sm font-semibold text-gray-300">Brak modów w tej instancji</p>
            <p className="text-xs text-gray-500 mt-1 max-w-xs">
              Przeciągnij pliki .jar do obszaru powyżej lub kliknij „Wybierz pliki .jar z dysku”.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filteredMods.map((mod) => (
              <div
                key={mod.filename}
                className={`glass-panel rounded-2xl p-4 flex items-center justify-between gap-4 transition-all ${
                  mod.enabled ? "border-white/10" : "opacity-60 border-white/5 bg-black/40"
                }`}
              >
                {/* Mod Icon & Info */}
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  {mod.icon_base64 ? (
                    <img
                      src={mod.icon_base64}
                      alt={mod.name}
                      onError={(e) => {
                        // Fallback if image fails to render
                        (e.target as HTMLElement).style.display = "none";
                      }}
                      className="w-12 h-12 rounded-2xl object-contain bg-black/60 border border-white/10 p-1 shadow-md"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500/15 via-blue-500/10 to-violet-500/15 border border-white/10 flex items-center justify-center text-neon-cyan shadow-md">
                      <Puzzle size={24} />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-heading font-bold text-sm text-white truncate">{mod.name}</h4>
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-300 font-mono">
                        v{mod.version}
                      </span>
                    </div>

                    <p className="text-[11px] text-gray-400 truncate mt-0.5" title={mod.description}>
                      {mod.description || "Brak opisu dla tego moda"}
                    </p>

                    <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400 font-mono">
                      <span className="inline-flex items-center gap-1 text-gray-400 truncate">
                        <FileCode size={11} className="text-gray-400" />
                        {mod.filename}
                      </span>
                      {mod.authors.length > 0 && (
                        <span className="text-gray-400">• Autorzy: {mod.authors.slice(0, 2).join(", ")}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions: Toggle Switch & Delete */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onToggleMod(mod.filename)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      mod.enabled
                        ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25"
                        : "bg-white/5 border border-white/10 text-gray-400 hover:text-white"
                    }`}
                  >
                    {mod.enabled ? <CheckCircle size={14} /> : <XCircle size={14} />}
                    <span>{mod.enabled ? "Włączony" : "Wyłączony"}</span>
                  </button>

                  <button
                    onClick={() => setModPendingDelete(mod.filename)}
                    className="p-2 rounded-xl text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-colors cursor-pointer"
                    title="Usuń plik moda"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

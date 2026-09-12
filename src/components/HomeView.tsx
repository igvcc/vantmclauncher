import { useState } from "react";
import { Play, FolderOpen, Puzzle, Copy, Check, Sparkles, AlertTriangle, Loader2, Square } from "lucide-react";
import { Instance, UserSettings, DownloadProgress } from "../types";

interface HomeViewProps {
  settings: UserSettings;
  instances: Instance[];
  activeInstance: Instance | null;
  onUpdateNickname: (nick: string) => void;
  onSelectInstance: (id: string) => void;
  onLaunch: () => void;
  onKillGame?: () => void;
  onOpenFolder: () => void;
  onGoToMods: () => void;
  onGoToInstances: () => void;
  onGoToJava: () => void;
  downloadProgress: DownloadProgress | null;
  isLaunching: boolean;
  isGameRunning?: boolean;
  offlineUuid: string;
  javaCount: number;
}

export const HomeView: React.FC<HomeViewProps> = ({
  settings,
  instances,
  activeInstance,
  onUpdateNickname,
  onSelectInstance,
  onLaunch,
  onKillGame,
  onOpenFolder,
  onGoToMods,
  onGoToInstances,
  onGoToJava,
  downloadProgress,
  isLaunching,
  isGameRunning,
  offlineUuid,
  javaCount,
}) => {
  const [copied, setCopied] = useState(false);
  const [tempNick, setTempNick] = useState(settings.nickname);

  const handleCopyUuid = () => {
    navigator.clipboard.writeText(offlineUuid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNickBlur = () => {
    const trimmed = tempNick.trim();
    if (trimmed && trimmed !== settings.nickname) {
      onUpdateNickname(trimmed);
    }
  };

  const handleNickKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleNickBlur();
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-8 flex flex-col justify-between relative z-10">
      {/* Top Section: Hero & Player Profile */}
      <div>
        {/* Hero title in vant.fun style with logo */}
        <div className="flex items-center gap-5 mb-8">
          <div className="w-16 h-16 rounded-2xl bg-black/50 border border-white/10 flex items-center justify-center p-2.5 shadow-[0_0_30px_rgba(139,92,246,0.25)] shrink-0">
            <img src="/logo.png" alt="Vant Ribbon" className="w-full h-full object-contain filter drop-shadow-[0_0_12px_rgba(0,242,255,0.4)]" />
          </div>
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-neon-cyan text-xs font-semibold tracking-wider uppercase mb-1.5">
              <Sparkles size={13} />
              <span>VΛNT CLIENT</span>
            </div>
            <h1 className="text-3xl font-heading font-extrabold text-white tracking-tight leading-none">
              VΛNT <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon-cyan via-blue-400 to-purple-500 drop-shadow-[0_0_20px_rgba(0,242,255,0.3)]">DESKTOP</span>
            </h1>
            <p className="text-gray-400 text-xs tracking-wide mt-1">
              Wszystko gotowe do startu. Wybierz wersję, kliknij Graj i ruszaj do świata klocków.
            </p>
          </div>
        </div>

        {/* Player Profile & Active Instance Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Player Card */}
          <div className="glass-panel rounded-2xl p-5 flex items-center gap-4 relative overflow-hidden">
            <div className="relative flex-shrink-0">
              <img
                src={`https://mc-heads.net/avatar/${settings.nickname || "Steve"}/72`}
                alt="Player Avatar"
                className="w-16 h-16 rounded-2xl border border-white/10 shadow-lg object-cover bg-black/60"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.onerror = null;
                  target.style.display = "none";
                  const fallback = target.nextElementSibling as HTMLElement;
                  if (fallback) fallback.style.display = "flex";
                }}
              />
              <div
                style={{ display: "none" }}
                className="w-16 h-16 rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/20 via-blue-600/20 to-violet-600/20 items-center justify-center text-neon-cyan font-heading font-extrabold text-2xl shadow-neon-cyan"
              >
                {(settings.nickname || "V")[0].toUpperCase()}
              </div>
              <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-[#0D0D0D]"></span>
            </div>

            <div className="flex-1 min-w-0">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 block mb-1">
                Twój nick w grze
              </label>
              <input
                type="text"
                value={tempNick}
                onChange={(e) => setTempNick(e.target.value)}
                onBlur={handleNickBlur}
                onKeyDown={handleNickKeyDown}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm font-semibold text-white w-full focus:outline-none focus:border-cyan-400 transition-colors"
                placeholder="Podaj swój nick..."
              />
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-gray-400">
                <span className="truncate font-mono">UUID: {offlineUuid ? offlineUuid.slice(0, 14) + "..." : "Generowanie..."}</span>
                <button
                  onClick={handleCopyUuid}
                  className="p-1 hover:text-white transition-colors cursor-pointer"
                  title="Skopiuj identyfikator gracza"
                >
                  {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                </button>
              </div>
            </div>
          </div>

          {/* Active Instance Card */}
          <div className="lg:col-span-2 glass-panel rounded-2xl p-5 flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 block mb-1">
                  Wybrany profil gry
                </span>
                <h3 className="text-lg font-heading font-bold text-white flex items-center gap-2">
                  {activeInstance ? activeInstance.name : "Wybierz profil do gry"}
                  {activeInstance && (
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-cyan-400/15 border border-cyan-400/30 text-neon-cyan uppercase font-mono font-medium">
                      {activeInstance.loader} {activeInstance.mc_version}
                    </span>
                  )}
                </h3>
              </div>

              {instances.length > 1 && (
                <select
                  value={activeInstance?.id || ""}
                  onChange={(e) => onSelectInstance(e.target.value)}
                  className="bg-black/60 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-cyan-400 cursor-pointer"
                >
                  {instances.map((inst) => (
                    <option key={inst.id} value={inst.id} className="bg-[#141418] text-white">
                      {inst.name} ({inst.loader} {inst.mc_version})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-white/5">
              <button
                onClick={onGoToMods}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/5 text-xs text-gray-300 hover:text-white transition-colors cursor-pointer"
              >
                <Puzzle size={14} className="text-neon-cyan" />
                <span>Mody i dodatki</span>
              </button>

              <button
                onClick={onOpenFolder}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/5 text-xs text-gray-300 hover:text-white transition-colors cursor-pointer"
              >
                <FolderOpen size={14} className="text-neon-cyan" />
                <span>Folder gry</span>
              </button>

              <button
                onClick={onGoToInstances}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/5 text-xs text-gray-300 hover:text-white transition-colors cursor-pointer ml-auto"
              >
                <span>Wszystkie profile ({instances.length})</span>
              </button>
            </div>
          </div>
        </div>

        {/* Java Warning Banner if no Java found */}
        {javaCount === 0 && (
          <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="text-amber-400" size={20} />
              <div>
                <p className="text-sm font-semibold text-amber-200">
                  Potrzebujesz środowiska Java, aby odpalić Minecrafta
                </p>
                <p className="text-xs text-amber-400/80">
                  Jednym kliknięciem zainstalujemy dla Ciebie bezpieczne i szybkie środowisko Java 21 (Temurin OpenJDK).
                </p>
              </div>
            </div>
            <button
              onClick={onGoToJava}
              className="px-4 py-2 rounded-xl bg-amber-500 text-black font-semibold text-xs hover:bg-amber-400 transition-all cursor-pointer shadow-lg"
            >
              Pobierz Javę 21
            </button>
          </div>
        )}
      </div>

      {/* Bottom Section: Giant Play Button & Download Progress */}
      <div className="glass-panel rounded-3xl p-6 relative overflow-hidden border border-white/10 shadow-2xl">
        {/* Ambient pulse effect when launching */}
        {isLaunching && (
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-cyan-500/15 to-violet-500/5 animate-pulse pointer-events-none" />
        )}

        {/* Progress Bar (visible during download/launch) */}
        {downloadProgress && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold text-neon-cyan flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
                {downloadProgress.step}
              </span>
              <span className="font-mono text-gray-400">
                {downloadProgress.message} ({Math.round(downloadProgress.percentage)}%)
              </span>
            </div>
            <div className="w-full h-3 bg-black/60 rounded-full overflow-hidden border border-white/10 p-0.5">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full transition-all duration-300 shadow-[0_0_15px_rgba(0,242,255,0.5)]"
                style={{ width: `${downloadProgress.percentage}%` }}
              />
            </div>
          </div>
        )}

        {/* Main Action Bar */}
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div>
              <span className="text-[10px] text-gray-400 uppercase tracking-wider block font-semibold">Przydzielony RAM</span>
              <span className="font-mono text-sm font-bold text-white flex items-baseline gap-1.5">
                {((activeInstance?.memory_mb || settings.max_ram_mb) / 1024).toFixed(1)} GB
                <span className="text-[11px] text-gray-400 font-normal">
                  ({activeInstance?.memory_mb || settings.max_ram_mb} MB)
                </span>
              </span>
            </div>
            <div className="h-8 w-px bg-white/10"></div>
            <div>
              <span className="text-[10px] text-gray-400 uppercase tracking-wider block font-semibold">Wersja i Silnik</span>
              <span className="font-mono text-sm font-bold text-neon-cyan uppercase">
                {activeInstance ? `${activeInstance.loader} • ${activeInstance.mc_version}` : "Vanilla"}
              </span>
            </div>
          </div>

          {isGameRunning ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2.5 px-4 py-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold text-xs tracking-wider">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
                <span>GRA JEST URUCHOMIONA</span>
              </div>
              <button
                onClick={onKillGame}
                className="flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-2xl font-heading font-extrabold text-xs tracking-widest uppercase transition-all duration-300 cursor-pointer bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 hover:border-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.35)]"
                title="Wymuś natychmiastowe zakończenie gry"
              >
                <Square size={16} fill="currentColor" />
                <span>ZAMKNIJ GRĘ</span>
              </button>
            </div>
          ) : (
            <button
              onClick={onLaunch}
              disabled={isLaunching || !activeInstance}
              className={`flex items-center justify-center gap-3 px-10 py-4 rounded-2xl font-heading font-extrabold text-sm tracking-widest uppercase transition-all duration-300 cursor-pointer ${
                isLaunching
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 cursor-wait shadow-neon-cyan"
                  : !activeInstance
                  ? "opacity-50 bg-white/5 border border-white/10 text-gray-400 cursor-not-allowed"
                  : "btn-neon"
              }`}
            >
              {isLaunching ? (
                <Loader2 size={18} className="animate-spin text-neon-cyan" />
              ) : (
                <Play size={18} fill={isLaunching ? "none" : "currentColor"} />
              )}
              <span>
                {isLaunching
                  ? "ODPALANIE..."
                  : !activeInstance
                  ? "WYBIERZ PROFIL"
                  : "GRAJ"}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

import { Home, Layers, Puzzle, Cpu, Terminal, Sliders } from "lucide-react";

export type TabType = "home" | "instances" | "mods" | "java" | "console" | "settings";

interface DockProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  isGameRunning?: boolean;
}

export const Dock: React.FC<DockProps> = ({ activeTab, setActiveTab, isGameRunning }) => {
  const navItems = [
    { id: "home" as TabType, label: "START", icon: Home },
    { id: "instances" as TabType, label: "INSTANCJE", icon: Layers },
    { id: "mods" as TabType, label: "MODY", icon: Puzzle },
    { id: "java" as TabType, label: "JAVA", icon: Cpu },
    { id: "console" as TabType, label: "KONSOLA", icon: Terminal },
    { id: "settings" as TabType, label: "USTAWIENIA", icon: Sliders },
  ];

  return (
    <aside className="w-64 m-3.5 h-[calc(100vh-28px)] vant-dock rounded-3xl flex flex-col justify-between p-4 z-20 select-none transition-all duration-300">
      {/* Brand Header */}
      <div>
        <div className="flex items-center gap-3 px-3 py-3.5 mb-5 rounded-2xl bg-white/[0.02] border border-white/5">
          <div className="relative w-11 h-11 rounded-2xl bg-black/60 border border-white/10 flex items-center justify-center p-1.5 shadow-[0_0_20px_rgba(139,92,246,0.3)]">
            <img
              src="/logo.png"
              alt="Vant Logo"
              className="w-full h-full object-contain filter drop-shadow-[0_0_10px_rgba(0,242,255,0.6)]"
            />
            <span
              className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${
                isGameRunning
                  ? "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)] animate-ping"
                  : "bg-neon-cyan shadow-neon-cyan animate-pulse"
              }`}
            />
          </div>
          <div>
            <h1 className="font-heading font-extrabold text-lg tracking-widest text-white leading-none">
              VΛNT <span className="text-neon-cyan text-xs font-bold tracking-wider">CLIENT</span>
            </h1>
            <p className="text-[10px] text-gray-400 tracking-wider uppercase font-medium mt-1">
              {isGameRunning ? "Sesja w toku" : "System gotowy"}
            </p>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="flex flex-col gap-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  window.location.hash = item.id;
                  setActiveTab(item.id);
                }}
                className={`flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-semibold tracking-wider transition-all duration-200 cursor-pointer text-left ${
                  isActive
                    ? "bg-white text-black shadow-[0_0_25px_rgba(255,255,255,0.3)] font-bold scale-[1.02]"
                    : "text-gray-400 hover:text-white hover:bg-white/[0.05] hover:translate-x-1"
                }`}
              >
                <Icon size={18} className={isActive ? "text-black" : "text-gray-400"} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer info */}
      <div className="px-3 py-3 rounded-2xl bg-white/[0.02] border border-white/5 text-[11px] text-gray-400 flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span>Wersja</span>
          <span className="text-neon-cyan font-mono font-semibold">v1.0.0</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Tryb</span>
          <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            Non-Premium
          </span>
        </div>
        {isGameRunning && (
          <div className="flex items-center justify-between pt-1 border-t border-white/5">
            <span className="text-gray-400">Proces</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1 text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              AKTYWNY
            </span>
          </div>
        )}
      </div>
    </aside>
  );
};

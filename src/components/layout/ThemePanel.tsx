import { useUIStore, type ThemeKey } from "@/store/uiStore";
import { X, Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

const THEME_FAMILIES = [
  { key: "mm-cool", label: "Cool Blue", dark: "#0F2A40", light: "#ECF1F7", accent: "#E66B66" },
  { key: "mm-neutral", label: "Neutral", dark: "#1E1E1E", light: "#F0F0F0", accent: "#E66B66" },
  { key: "mm-warm", label: "Warm Sepia", dark: "#25201B", light: "#F2EBDD", accent: "#E66B66" },
] as const;

export default function ThemePanel() {
  const themePanelOpen   = useUIStore((s) => s.themePanelOpen);
  const setThemePanelOpen = useUIStore((s) => s.setThemePanelOpen);
  const theme            = useUIStore((s) => s.theme);
  const setTheme         = useUIStore((s) => s.setTheme);
  const darkMode         = useUIStore((s) => s.darkMode);
  const toggleDarkMode   = useUIStore((s) => s.toggleDarkMode);

  if (!themePanelOpen) return null;

  const currentFamily = theme.replace(/-dark$|-light$/, "");
  const currentMode = theme.endsWith("-dark") ? "dark" : "light";

  const applyTheme = (family: string, mode: "dark" | "light") => {
    setTheme(`${family}-${mode}` as ThemeKey);
  };

  const handleModeToggle = (mode: "dark" | "light") => {
    applyTheme(currentFamily, mode);
    // Sync legacy darkMode flag
    if ((mode === "dark") !== darkMode) toggleDarkMode();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={() => setThemePanelOpen(false)}
    >
      <div
        className="bg-gray-50 rounded-[32px] shadow-2xl border border-gray-200 w-96 p-8 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xl font-black text-gray-900 uppercase tracking-tighter">Appearance</h2>
          <button
            onClick={() => setThemePanelOpen(false)}
            className="p-2 hover:bg-gray-200 rounded-full transition-all active:scale-90"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Light / Dark / System */}
        <div className="flex gap-2 mb-8 bg-gray-200/50 p-1.5 rounded-2xl">
          <ModeButton
            icon={Sun}
            label="Light"
            active={currentMode === "light"}
            onClick={() => handleModeToggle("light")}
          />
          <ModeButton
            icon={Moon}
            label="Dark"
            active={currentMode === "dark"}
            onClick={() => handleModeToggle("dark")}
          />
          <ModeButton
            icon={Monitor}
            label="Auto"
            active={false}
            onClick={() => {
              const sys = window.matchMedia("(prefers-color-scheme: dark)").matches
                ? "dark"
                : "light";
              handleModeToggle(sys);
            }}
          />
        </div>

        {/* Color families */}
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 pl-1">Visual Styles</p>
        <div className="space-y-2.5">
          {THEME_FAMILIES.map((fam) => {
            const isActive = currentFamily === fam.key;
            return (
              <button
                key={fam.key}
                onClick={() => applyTheme(fam.key, currentMode)}
                className={cn(
                  "w-full flex items-center gap-4 px-5 py-4 rounded-2xl border transition-all text-left group",
                  isActive
                    ? "bg-gray-900 border-white/10 shadow-[0_0_20px_rgba(255,255,255,0.12)]"
                    : "border-gray-100 bg-gray-100/50 hover:border-gray-200 hover:bg-gray-100"
                )}
              >
                {/* Swatch */}
                <div className="flex -space-x-1.5 flex-shrink-0">
                  <div
                    className="w-6 h-6 rounded-full border-2 border-white shadow-sm"
                    style={{ background: fam.dark }}
                  />
                  <div
                    className="w-6 h-6 rounded-full border-2 border-white shadow-sm"
                    style={{ background: fam.accent }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-[13px] font-black uppercase tracking-tight", isActive ? "text-white" : "text-gray-700")}>
                    {fam.label}
                  </p>
                  <p className="text-[10px] text-gray-400 font-bold tracking-tight uppercase">Core brand palette</p>
                </div>
                {isActive && (
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                )}
              </button>
            );
          })}
        </div>

        {/* Custom theme hint */}
        <div className="mt-8 pt-6 border-t border-gray-100">
          <p className="text-[10px] text-gray-400 text-center font-bold uppercase tracking-widest leading-loose">
            Enterprise Grade <br/> 
            <span className="text-gray-300">Modular Misfits Interface System</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function ModeButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 active:scale-95",
        active
          ? "bg-gray-900 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)] border border-white/5"
          : "text-gray-500 hover:text-gray-900"
      )}
    >
      <Icon className={cn("w-3.5 h-3.5", active ? "text-blue-400" : "")} />
      {label}
    </button>
  );
}

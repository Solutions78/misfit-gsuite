import { useUIStore, type ThemeKey, type FontScale } from "@/store/uiStore";
import { X, Sun, Moon, Monitor, Type } from "lucide-react";
import { cn } from "@/lib/utils";

const THEME_FAMILIES = [
  { key: "mm-cool",    label: "Cool Blue",   dark: "#0D1117", surface: "#161B22", accent: "#E66B66" },
  { key: "mm-neutral", label: "Neutral",     dark: "#111111", surface: "#1A1A1A", accent: "#E66B66" },
  { key: "mm-warm",    label: "Warm Sepia",  dark: "#15100C", surface: "#1E1710", accent: "#E66B66" },
] as const;

const FONT_SIZES: { scale: FontScale; label: string; size: string }[] = [
  { scale: "sm", label: "S",  size: "13px" },
  { scale: "md", label: "M",  size: "15px" },
  { scale: "lg", label: "L",  size: "17px" },
  { scale: "xl", label: "XL", size: "19px" },
];

export default function ThemePanel() {
  const themePanelOpen    = useUIStore((s) => s.themePanelOpen);
  const setThemePanelOpen = useUIStore((s) => s.setThemePanelOpen);
  const theme             = useUIStore((s) => s.theme);
  const setTheme          = useUIStore((s) => s.setTheme);
  const darkMode          = useUIStore((s) => s.darkMode);
  const toggleDarkMode    = useUIStore((s) => s.toggleDarkMode);
  const fontScale         = useUIStore((s) => s.fontScale);
  const setFontScale      = useUIStore((s) => s.setFontScale);

  if (!themePanelOpen) return null;

  const currentFamily = theme.replace(/-dark$|-light$/, "");
  const currentMode   = theme.endsWith("-dark") ? "dark" : "light";

  const applyTheme = (family: string, mode: "dark" | "light") => {
    setTheme(`${family}-${mode}` as ThemeKey);
  };

  const handleMode = (mode: "dark" | "light") => {
    applyTheme(currentFamily, mode);
    if ((mode === "dark") !== darkMode) toggleDarkMode();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => setThemePanelOpen(false)}
    >
      <div
        className="relative rounded-[28px] border border-white/5 shadow-[0_0_60px_rgba(0,0,0,0.6)] w-[420px] overflow-hidden animate-slide-up"
        style={{ background: "var(--c-bg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-8 pb-6 border-b border-white/5">
          <h2 className="text-[11px] font-black text-white uppercase tracking-[0.25em]">Appearance</h2>
          <button
            onClick={() => setThemePanelOpen(false)}
            className="p-2 rounded-xl text-gray-500 hover:bg-white/5 hover:text-white transition-all active:scale-90"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-8 py-6 space-y-8">
          {/* Mode selector */}
          <div>
            <p className="text-[9px] font-black text-gray-500 uppercase tracking-[0.25em] mb-3">Mode</p>
            <div className="flex gap-2 bg-black/30 p-1.5 rounded-2xl border border-white/5">
              <ModeBtn icon={Sun}     label="Light"  active={currentMode === "light"} onClick={() => handleMode("light")} />
              <ModeBtn icon={Moon}    label="Dark"   active={currentMode === "dark"}  onClick={() => handleMode("dark")}  />
              <ModeBtn
                icon={Monitor}
                label="Auto"
                active={false}
                onClick={() => handleMode(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")}
              />
            </div>
          </div>

          {/* Color palette */}
          <div>
            <p className="text-[9px] font-black text-gray-500 uppercase tracking-[0.25em] mb-3">Color Palette</p>
            <div className="space-y-2">
              {THEME_FAMILIES.map((fam) => {
                const isActive = currentFamily === fam.key;
                return (
                  <button
                    key={fam.key}
                    onClick={() => applyTheme(fam.key, currentMode)}
                    className={cn(
                      "w-full flex items-center gap-4 px-5 py-4 rounded-2xl border transition-all duration-200 text-left group active:scale-[0.98]",
                      isActive
                        ? "bg-gray-900 border-white/10 shadow-[0_0_20px_rgba(255,255,255,0.08)]"
                        : "border-white/5 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/10"
                    )}
                  >
                    {/* Preview swatches */}
                    <div className="flex -space-x-1.5 flex-shrink-0">
                      <div className="w-7 h-7 rounded-full border-2 border-black/40 shadow-md" style={{ background: fam.dark }} />
                      <div className="w-7 h-7 rounded-full border-2 border-black/40 shadow-md" style={{ background: fam.surface }} />
                      <div className="w-7 h-7 rounded-full border-2 border-black/40 shadow-md" style={{ background: fam.accent }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "text-[11px] font-black uppercase tracking-widest",
                        isActive ? "text-white" : "text-gray-400 group-hover:text-white transition-colors"
                      )}>
                        {fam.label}
                      </p>
                      <p className="text-[9px] text-gray-600 font-bold tracking-widest uppercase mt-0.5">Core brand palette</p>
                    </div>
                    {isActive && (
                      <div className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Font size */}
          <div>
            <p className="text-[9px] font-black text-gray-500 uppercase tracking-[0.25em] mb-3 flex items-center gap-2">
              <Type className="w-3 h-3" />
              Text Size
            </p>
            <div className="flex gap-2 bg-black/30 p-1.5 rounded-2xl border border-white/5">
              {FONT_SIZES.map(({ scale, label }) => (
                <button
                  key={scale}
                  onClick={() => setFontScale(scale)}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 active:scale-95",
                    fontScale === scale
                      ? "bg-gray-900 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)] border border-white/5"
                      : "text-gray-500 hover:text-white"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest mt-2 text-center">
              Applies to all views
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 pb-8 pt-2 border-t border-white/5">
          <p className="text-[9px] text-gray-700 text-center font-black uppercase tracking-[0.2em] leading-loose">
            Enterprise Grade<br />
            <span className="text-gray-600">Modular Misfits Interface System</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function ModeBtn({
  icon: Icon, label, active, onClick,
}: {
  icon: React.ElementType; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 active:scale-95",
        active
          ? "bg-gray-900 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)] border border-white/5"
          : "text-gray-500 hover:text-white"
      )}
    >
      <Icon className={cn("w-3.5 h-3.5", active ? "text-blue-400" : "")} />
      {label}
    </button>
  );
}

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={() => setThemePanelOpen(false)}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-80 p-5 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900">Themes</h2>
          <button
            onClick={() => setThemePanelOpen(false)}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Light / Dark / System */}
        <div className="flex gap-2 mb-5">
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
            label="System"
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
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Color family</p>
        <div className="space-y-2">
          {THEME_FAMILIES.map((fam) => {
            const isActive = currentFamily === fam.key;
            return (
              <button
                key={fam.key}
                onClick={() => applyTheme(fam.key, currentMode)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left",
                  isActive
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                )}
              >
                {/* Swatch */}
                <div className="flex gap-1 flex-shrink-0">
                  <div
                    className="w-5 h-5 rounded-full border border-white/20"
                    style={{ background: fam.dark }}
                  />
                  <div
                    className="w-5 h-5 rounded-full border border-gray-300"
                    style={{ background: fam.light }}
                  />
                  <div
                    className="w-5 h-5 rounded-full"
                    style={{ background: fam.accent }}
                  />
                </div>
                <span className={cn("text-sm", isActive ? "font-medium text-blue-700" : "text-gray-700")}>
                  {fam.label}
                </span>
                {isActive && (
                  <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                    Active
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Custom theme hint */}
        <p className="text-xs text-gray-400 mt-4 text-center">
          Custom themes: set <code className="font-mono">data-theme</code> on &lt;html&gt; in DevTools
        </p>
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
        "flex-1 flex flex-col items-center gap-1 py-2 rounded-xl border text-xs font-medium transition-all",
        active
          ? "border-blue-500 bg-blue-50 text-blue-700"
          : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

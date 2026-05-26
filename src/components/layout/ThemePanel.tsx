import { useEffect, useState } from "react";
import { useUIStore, type ThemeKey, type FontScale } from "@/store/uiStore";
import { X, Sun, Moon, Monitor, Type, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  applyCustomThemeVariables,
  CUSTOM_THEME_FIELDS,
  loadCustomTheme,
  resetCustomTheme,
  saveCustomTheme,
  type CustomThemeColors,
  type ThemeMode,
} from "@/lib/appSettings";

const THEME_FAMILIES: Array<{
  key: string;
  label: string;
  description: string;
  dark?: string[];
  light?: string[];
  custom?: boolean;
}> = [
  {
    key: "mm-cool",
    label: "Cool Blue",
    description: "Blue-black operational palette",
    dark:  ["#0D1117", "#161B22", "#21262D", "#388BFD", "#E66B66"],
    light: ["#F6F8FA", "#FFFFFF", "#F0F2F4", "#0969DA", "#CF4335"],
  },
  {
    key: "mm-neutral",
    label: "Neutral",
    description: "High-contrast graphite palette",
    dark:  ["#111111", "#1A1A1A", "#252525", "#5B9CF6", "#E66B66"],
    light: ["#F5F5F5", "#FFFFFF", "#EBEBEB", "#1D4ED8", "#CF4335"],
  },
  {
    key: "mm-warm",
    label: "Warm Sepia",
    description: "Brown-black command palette",
    dark:  ["#15100C", "#1E1710", "#2A201A", "#7AA8C8", "#E66B66"],
    light: ["#F5EFE6", "#FFFDF8", "#EDE3D5", "#2A5FA8", "#CF4335"],
  },
  {
    key: "mm-custom",
    label: "Custom",
    description: "User-defined palette",
    custom: true,
  },
];

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
  const [customTheme, setCustomThemeState] = useState(() => loadCustomTheme());

  useEffect(() => {
    if (themePanelOpen) setCustomThemeState(loadCustomTheme());
  }, [themePanelOpen]);

  const currentFamily = theme.replace(/-dark$|-light$/, "");
  const currentMode: ThemeMode = theme.endsWith("-dark") ? "dark" : "light";
  const customColors = customTheme[currentMode];

  if (!themePanelOpen) return null;

  const applyTheme = (family: string, mode: ThemeMode) => {
    setTheme(`${family}-${mode}` as ThemeKey);
    if (family === "mm-custom") {
      applyCustomThemeVariables(customTheme[mode]);
    }
  };

  const handleMode = (mode: ThemeMode) => {
    applyTheme(currentFamily, mode);
    if ((mode === "dark") !== darkMode) toggleDarkMode();
  };

  const updateCustomColor = (key: keyof CustomThemeColors, value: string) => {
    const next = {
      ...customTheme,
      [currentMode]: {
        ...customTheme[currentMode],
        [key]: value,
      },
    };
    setCustomThemeState(next);
    saveCustomTheme(next);
    if (currentFamily === "mm-custom") {
      applyCustomThemeVariables(next[currentMode]);
    }
  };

  const handleResetCustom = () => {
    const next = resetCustomTheme();
    setCustomThemeState(next);
    if (currentFamily === "mm-custom") {
      applyCustomThemeVariables(next[currentMode]);
    }
  };

  const swatchesForFamily = (fam: (typeof THEME_FAMILIES)[number]) => {
    if (fam.custom) {
      return [
        customColors.bg,
        customColors.surface,
        customColors.overlay,
        customColors.info,
        customColors.accent,
      ];
    }
    return fam[currentMode] ?? [];
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => setThemePanelOpen(false)}
    >
      <div
        className="relative rounded-[28px] border shadow-[0_0_60px_rgba(0,0,0,0.6)] w-[420px] max-h-[calc(100vh-32px)] overflow-hidden animate-slide-up flex flex-col"
        style={{ background: "var(--c-bg)", borderColor: "var(--c-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-8 pb-6 border-b flex-shrink-0" style={{ borderColor: "var(--c-border)" }}>
          <h2 className="text-[11px] font-black uppercase tracking-[0.25em]" style={{ color: "var(--c-text-1)" }}>Appearance</h2>
          <button
            onClick={() => setThemePanelOpen(false)}
            className="p-2 rounded-xl transition-all active:scale-90"
            style={{ color: "var(--c-text-2)" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-8 py-6 space-y-8 overflow-y-auto custom-scrollbar">
          {/* Mode selector */}
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.25em] mb-3" style={{ color: "var(--c-text-2)" }}>Mode</p>
            <div className="flex gap-2 p-1.5 rounded-2xl border" style={{ background: "color-mix(in srgb, var(--c-bg) 70%, black)", borderColor: "var(--c-border)" }}>
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
            <p className="text-[9px] font-black uppercase tracking-[0.25em] mb-3" style={{ color: "var(--c-text-2)" }}>Color Palette</p>
            <div className="space-y-2">
              {THEME_FAMILIES.map((fam) => {
                const isActive = currentFamily === fam.key;
                const swatches = swatchesForFamily(fam);
                return (
                  <button
                    key={fam.key}
                    onClick={() => applyTheme(fam.key, currentMode)}
                    className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl border transition-all duration-200 text-left group active:scale-[0.98]"
                    style={{
                      background: isActive ? "color-mix(in srgb, var(--c-info) 14%, var(--c-surface))" : "var(--c-overlay)",
                      borderColor: isActive ? "color-mix(in srgb, var(--c-info) 35%, var(--c-border))" : "var(--c-border)",
                      boxShadow: isActive ? "0 0 22px rgba(56, 139, 253, 0.16)" : "none",
                    }}
                  >
                    {/* Preview swatches */}
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <div className="flex -space-x-1.5">
                        {swatches.map((color) => (
                          <div
                            key={color}
                            className="w-7 h-7 rounded-full border-2 shadow-md"
                            style={{ background: color, borderColor: "rgba(255,255,255,0.22)" }}
                          />
                        ))}
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden flex border" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
                        {swatches.map((color) => (
                          <div key={color} className="flex-1" style={{ background: color }} />
                        ))}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-black uppercase tracking-widest transition-colors" style={{ color: "var(--c-text-1)" }}>
                        {fam.label}
                      </p>
                      <p className="text-[9px] font-bold tracking-widest uppercase mt-0.5" style={{ color: "var(--c-text-2)" }}>{fam.description}</p>
                    </div>
                    {isActive && (
                      <div className="w-2 h-2 rounded-full shadow-[0_0_8px_rgba(96,165,250,0.8)]" style={{ background: "var(--c-info)" }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {currentFamily === "mm-custom" && (
            <div>
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="text-[9px] font-black uppercase tracking-[0.25em]" style={{ color: "var(--c-text-2)" }}>
                  Custom Colors — {currentMode}
                </p>
                <button
                  onClick={handleResetCustom}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all active:scale-95"
                  style={{ color: "var(--c-text-2)", borderColor: "var(--c-border)", background: "var(--c-overlay)" }}
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {CUSTOM_THEME_FIELDS.map((field) => (
                  <ColorField
                    key={field.key}
                    label={field.label}
                    value={customColors[field.key]}
                    onChange={(value) => updateCustomColor(field.key, value)}
                  />
                ))}
              </div>
              <p className="text-[9px] font-bold uppercase tracking-widest mt-3 leading-relaxed" style={{ color: "var(--c-text-2)" }}>
                These values are saved locally and applied across the full app when Custom is selected.
              </p>
            </div>
          )}

          {/* Font size */}
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.25em] mb-3 flex items-center gap-2" style={{ color: "var(--c-text-2)" }}>
              <Type className="w-3 h-3" />
              Text Size
            </p>
            <div className="flex gap-2 p-1.5 rounded-2xl border" style={{ background: "color-mix(in srgb, var(--c-bg) 70%, black)", borderColor: "var(--c-border)" }}>
              {FONT_SIZES.map(({ scale, label }) => (
                <button
                  key={scale}
                  onClick={() => setFontScale(scale)}
                  className="flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 active:scale-95 border"
                  style={{
                    background: fontScale === scale ? "color-mix(in srgb, var(--c-info) 14%, var(--c-surface))" : "transparent",
                    borderColor: fontScale === scale ? "color-mix(in srgb, var(--c-info) 35%, var(--c-border))" : "transparent",
                    color: fontScale === scale ? "var(--c-text-1)" : "var(--c-text-2)",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[9px] font-bold uppercase tracking-widest mt-2 text-center" style={{ color: "var(--c-text-2)" }}>
              Applies to all views
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 pb-8 pt-2 border-t flex-shrink-0" style={{ borderColor: "var(--c-border)" }}>
          <p className="text-[9px] text-center font-black uppercase tracking-[0.2em] leading-loose" style={{ color: "var(--c-text-2)" }}>
            Enterprise Grade<br />
            <span style={{ color: "var(--c-text-2)" }}>Modular Misfits Interface System</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label
      className="flex items-center gap-2 rounded-2xl border px-3 py-2"
      style={{ background: "var(--c-overlay)", borderColor: "var(--c-border)" }}
    >
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-8 h-8 rounded-lg overflow-hidden border-0 p-0 flex-shrink-0"
        style={{ background: "transparent" }}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[9px] font-black uppercase tracking-widest truncate" style={{ color: "var(--c-text-1)" }}>
          {label}
        </span>
        <span className="block text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--c-text-2)" }}>
          {value}
        </span>
      </span>
    </label>
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
        "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 active:scale-95 border"
      )}
      style={{
        background: active ? "color-mix(in srgb, var(--c-info) 14%, var(--c-surface))" : "transparent",
        borderColor: active ? "color-mix(in srgb, var(--c-info) 35%, var(--c-border))" : "transparent",
        color: active ? "var(--c-text-1)" : "var(--c-text-2)",
      }}
    >
      <Icon className="w-3.5 h-3.5" style={{ color: active ? "var(--c-info)" : "var(--c-text-2)" }} />
      {label}
    </button>
  );
}

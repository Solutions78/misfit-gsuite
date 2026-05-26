export const GEMINI_MODEL_STORAGE_KEY = "misfit-gsuite:gemini-model";
export const GEMINI_TIER_STORAGE_KEY = "misfit-gsuite:gemini-tier";
export const CUSTOM_THEME_STORAGE_KEY = "misfit-gsuite:custom-theme";
export const OPEN_INTEGRATIONS_SETTINGS_EVENT = "misfit:open-integrations-settings";
export const GEMINI_MODEL_CHANGED_EVENT = "misfit:gemini-model-changed";
export const CUSTOM_THEME_CHANGED_EVENT = "misfit:custom-theme-changed";

export type GeminiTier = "free" | "pro" | "ultra";

export function getGeminiTier(): GeminiTier {
  if (typeof window === "undefined") return "ultra";
  return (window.localStorage.getItem(GEMINI_TIER_STORAGE_KEY) as GeminiTier) ?? "ultra";
}

export function setGeminiTier(tier: GeminiTier): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GEMINI_TIER_STORAGE_KEY, tier);
}

export type ThemeMode = "dark" | "light";

export interface CustomThemeColors {
  bg: string;
  surface: string;
  overlay: string;
  border: string;
  accent: string;
  accentFg: string;
  text1: string;
  text2: string;
  text3: string;
  success: string;
  warning: string;
  error: string;
  info: string;
}

export interface CustomThemeConfig {
  dark: CustomThemeColors;
  light: CustomThemeColors;
}

export const CUSTOM_THEME_FIELDS: Array<{
  key: keyof CustomThemeColors;
  label: string;
  cssVar: string;
}> = [
  { key: "bg", label: "Canvas", cssVar: "--c-bg" },
  { key: "surface", label: "Surface", cssVar: "--c-surface" },
  { key: "overlay", label: "Overlay", cssVar: "--c-overlay" },
  { key: "border", label: "Border", cssVar: "--c-border" },
  { key: "accent", label: "Accent", cssVar: "--c-accent" },
  { key: "accentFg", label: "Accent Text", cssVar: "--c-accent-fg" },
  { key: "text1", label: "Primary Text", cssVar: "--c-text-1" },
  { key: "text2", label: "Secondary Text", cssVar: "--c-text-2" },
  { key: "text3", label: "Muted Text", cssVar: "--c-text-3" },
  { key: "success", label: "Success", cssVar: "--c-success" },
  { key: "warning", label: "Warning", cssVar: "--c-warning" },
  { key: "error", label: "Error", cssVar: "--c-error" },
  { key: "info", label: "Info", cssVar: "--c-info" },
];

export const DEFAULT_CUSTOM_THEME: CustomThemeConfig = {
  dark: {
    bg: "#101014",
    surface: "#181A20",
    overlay: "#242833",
    border: "#373D4A",
    accent: "#E66B66",
    accentFg: "#FFFFFF",
    text1: "#F2F4F8",
    text2: "#B6C0CC",
    text3: "#909AAA",
    success: "#4CAF6E",
    warning: "#E6A817",
    error: "#F06565",
    info: "#5B9CF6",
  },
  light: {
    bg: "#F6F7FB",
    surface: "#FFFFFF",
    overlay: "#EEF1F6",
    border: "#D2D8E2",
    accent: "#CF4335",
    accentFg: "#FFFFFF",
    text1: "#151820",
    text2: "#4B5563",
    text3: "#5F6977",
    success: "#166534",
    warning: "#854D0E",
    error: "#B91C1C",
    info: "#1D4ED8",
  },
};

export function getSelectedGeminiModel(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage.getItem(GEMINI_MODEL_STORAGE_KEY) || undefined;
}

export function setSelectedGeminiModel(model: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GEMINI_MODEL_STORAGE_KEY, model);
  window.dispatchEvent(new CustomEvent(GEMINI_MODEL_CHANGED_EVENT, { detail: model }));
}

export function openIntegrationsSettings() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_INTEGRATIONS_SETTINGS_EVENT));
}

function mergeCustomTheme(value: Partial<CustomThemeConfig> | null | undefined): CustomThemeConfig {
  return {
    dark: { ...DEFAULT_CUSTOM_THEME.dark, ...(value?.dark ?? {}) },
    light: { ...DEFAULT_CUSTOM_THEME.light, ...(value?.light ?? {}) },
  };
}

export function loadCustomTheme(): CustomThemeConfig {
  if (typeof window === "undefined") return DEFAULT_CUSTOM_THEME;

  try {
    const raw = window.localStorage.getItem(CUSTOM_THEME_STORAGE_KEY);
    if (!raw) return DEFAULT_CUSTOM_THEME;
    return mergeCustomTheme(JSON.parse(raw) as Partial<CustomThemeConfig>);
  } catch {
    return DEFAULT_CUSTOM_THEME;
  }
}

export function saveCustomTheme(theme: CustomThemeConfig) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify(mergeCustomTheme(theme)));
  window.dispatchEvent(new CustomEvent(CUSTOM_THEME_CHANGED_EVENT, { detail: theme }));
}

export function resetCustomTheme(): CustomThemeConfig {
  const theme = DEFAULT_CUSTOM_THEME;
  saveCustomTheme(theme);
  return theme;
}

export function applyCustomThemeVariables(colors: CustomThemeColors) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const field of CUSTOM_THEME_FIELDS) {
    root.style.setProperty(field.cssVar, colors[field.key]);
  }
}

export function clearCustomThemeVariables() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const field of CUSTOM_THEME_FIELDS) {
    root.style.removeProperty(field.cssVar);
  }
}

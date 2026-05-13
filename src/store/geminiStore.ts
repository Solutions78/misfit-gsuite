import { create } from "zustand";
import type { GeminiMessage } from "@/types";

interface GeminiStore {
  chatHistory: GeminiMessage[];
  isLoading: boolean;
  selectedEmailContext: string | null;
  lastResponse: string | null;

  addMessage: (msg: GeminiMessage) => void;
  setLoading: (loading: boolean) => void;
  setEmailContext: (context: string | null) => void;
  setLastResponse: (response: string | null) => void;
  clearHistory: () => void;
}

export const useGeminiStore = create<GeminiStore>((set) => ({
  chatHistory: [],
  isLoading: false,
  selectedEmailContext: null,
  lastResponse: null,

  addMessage: (msg) =>
    set((s) => ({ chatHistory: [...s.chatHistory, msg] })),

  setLoading: (isLoading) => set({ isLoading }),

  setEmailContext: (selectedEmailContext) => set({ selectedEmailContext }),

  setLastResponse: (lastResponse) => set({ lastResponse }),

  clearHistory: () => set({ chatHistory: [], lastResponse: null }),
}));

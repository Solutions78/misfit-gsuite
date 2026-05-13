import { create } from "zustand";
import type { AccountInfo } from "@/types";

interface AuthStore {
  currentAccount: AccountInfo | null;
  accounts: AccountInfo[];
  isAuthenticated: boolean;
  setCurrentAccount: (account: AccountInfo | null) => void;
  addAccount: (account: AccountInfo) => void;
  removeAccount: (email: string) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  currentAccount: null,
  accounts: [],
  isAuthenticated: false,

  setCurrentAccount: (account) =>
    set({ currentAccount: account, isAuthenticated: !!account }),

  addAccount: (account) =>
    set((state) => {
      const existing = state.accounts.find((a) => a.email === account.email);
      const accounts = existing
        ? state.accounts.map((a) => (a.email === account.email ? account : a))
        : [...state.accounts, account];
      return { accounts, currentAccount: account, isAuthenticated: true };
    }),

  removeAccount: (email) =>
    set((state) => {
      const accounts = state.accounts.filter((a) => a.email !== email);
      const currentAccount =
        state.currentAccount?.email === email ? accounts[0] ?? null : state.currentAccount;
      return { accounts, currentAccount, isAuthenticated: !!currentAccount };
    }),

  reset: () => set({ currentAccount: null, accounts: [], isAuthenticated: false }),
}));

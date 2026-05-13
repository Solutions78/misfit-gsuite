import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import "./App.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { getCurrentAccount, listAccounts } from "@/lib/tauri";
import AppShell from "@/components/layout/AppShell";
import LoginScreen from "@/components/auth/LoginScreen";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
  },
});

function AppContent() {
  const { isAuthenticated, setCurrentAccount, addAccount } = useAuthStore();

  useEffect(() => {
    // Restore session on app startup
    const restore = async () => {
      try {
        const [account, accounts] = await Promise.all([
          getCurrentAccount(),
          listAccounts(),
        ]);
        accounts.forEach((a) => addAccount(a));
        if (account) setCurrentAccount(account);
      } catch {
        // Not signed in yet
      }
    };
    restore();

    // Listen for auth events from Tauri backend
    const unlistenRestored = listen<string>("auth::restored", () => restore());
    const unlistenComplete = listen<string>("auth::complete", () => restore());

    return () => {
      unlistenRestored.then((fn) => fn());
      unlistenComplete.then((fn) => fn());
    };
  }, []);

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return <AppShell />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}

export default App;

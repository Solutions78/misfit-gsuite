import { useEffect, Component, type ReactNode, type ErrorInfo } from "react";
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

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      const err = this.state.error as Error;
      return (
        <div className="h-screen flex items-center justify-center bg-gray-50 p-8">
          <div className="max-w-lg w-full bg-white border border-red-200 rounded-2xl shadow-lg p-6">
            <h1 className="text-base font-semibold text-red-700 mb-2">Something went wrong</h1>
            <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 overflow-auto max-h-60 whitespace-pre-wrap">
              {err.message}
              {"\n\n"}
              {err.stack}
            </pre>
            <p className="text-xs text-gray-400 mt-3">Reload the app with ⌘R to recover.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const { isAuthenticated, setCurrentAccount, addAccount } = useAuthStore();

  useEffect(() => {
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
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <AppContent />
        </ErrorBoundary>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;

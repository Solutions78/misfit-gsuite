import { useEffect, useState, Component, type ReactNode, type ErrorInfo } from "react";
import { listen } from "@tauri-apps/api/event";
import "./App.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { getCurrentAccount, listAccounts } from "@/lib/tauri";
import { dbg } from "@/lib/debugLog";
import AppShell from "@/components/layout/AppShell";

const IS_DEV = import.meta.env.DEV;
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
              {import.meta.env.DEV && err.stack}
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
  const { isAuthenticated, setCurrentAccount, addAccount, reset } = useAuthStore();
  const [authChecked, setAuthChecked] = useState(false);
  const [hasStoredAccount, setHasStoredAccount] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let unlistenRestored: (() => void) | undefined;
    let unlistenComplete: (() => void) | undefined;
    let unlistenSignedOut: (() => void) | undefined;
    let unlistenRestoreFailed: (() => void) | undefined;
    let unlistenTokenRevoked: (() => void) | undefined;

    const restore = async () => {
      try {
        // Do this sequentially. getCurrentAccount() now validates the Keychain
        // token and removes stale DB rows when the Keychain item was deleted.
        const account = await getCurrentAccount();
        const accounts = await listAccounts();
        if (IS_DEV) dbg("Auth", "restoring accounts", { account, accounts });
        if (!isMounted) return;
        if (account) {
          accounts.forEach((a) => addAccount(a));
          setCurrentAccount(account);
          setHasStoredAccount(false);
        } else {
          setHasStoredAccount(accounts.length > 0);
        }
        setAuthChecked(true);
      } catch (err) {
        if (IS_DEV) dbg("Auth", "restore failed", err);
        if (!isMounted) return;
        reset();
        setHasStoredAccount(false);
        setAuthChecked(true);
      }
    };

    listen<string>("auth::restored", (event) => {
      if (IS_DEV) dbg("Auth", "event: restored", event.payload);
      restore();
    }).then((fn) => {
      if (!isMounted) fn();
      else unlistenRestored = fn;
    });

    listen<string>("auth::complete", (event) => {
      if (IS_DEV) dbg("Auth", "event: complete", event.payload);
      restore();
    }).then((fn) => {
      if (!isMounted) fn();
      else unlistenComplete = fn;
    });

    listen<string>("auth::signed_out", (event) => {
      if (IS_DEV) dbg("Auth", "event: signed_out", event.payload);
      reset();
      setHasStoredAccount(false);
      setAuthChecked(true);
    }).then((fn) => {
      if (!isMounted) fn();
      else unlistenSignedOut = fn;
    });

    listen<string>("auth::restore_failed", (event) => {
      if (IS_DEV) dbg("Auth", "event: restore_failed", event.payload);
      reset();
      setHasStoredAccount(false);
      setAuthChecked(true);
    }).then((fn) => {
      if (!isMounted) fn();
      else unlistenRestoreFailed = fn;
    });

    listen<string>("auth::token_revoked", (event) => {
      if (IS_DEV) dbg("Auth", "event: token_revoked — refresh token rejected by Google", event.payload);
      reset();
      setHasStoredAccount(false);
      setAuthChecked(true);
    }).then((fn) => {
      if (!isMounted) fn();
      else unlistenTokenRevoked = fn;
    });

    restore();

    return () => {
      isMounted = false;
      unlistenRestored?.();
      unlistenComplete?.();
      unlistenSignedOut?.();
      unlistenRestoreFailed?.();
      unlistenTokenRevoked?.();
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated || !authChecked || !hasStoredAccount) return;

    const timeout = window.setTimeout(() => {
      if (IS_DEV) {
        dbg("Auth", "stored account did not unlock; falling back to login");
      }
      reset();
      setHasStoredAccount(false);
    }, 10_000);

    return () => window.clearTimeout(timeout);
  }, [authChecked, hasStoredAccount, isAuthenticated, reset]);

  if (!isAuthenticated) {
    // Waiting for Keychain/Touch ID approval — show spinner instead of login screen.
    if (!authChecked || hasStoredAccount) {
      return (
        <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-semibold text-gray-700">Waiting for authentication…</p>
            <p className="text-xs text-gray-500">Use Touch ID, Apple Watch, or your Mac login password to unlock Google credentials.</p>
            {authChecked && (
              <button
                type="button"
                onClick={() => {
                  reset();
                  setHasStoredAccount(false);
                  setAuthChecked(true);
                }}
                className="mt-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-blue-700"
              >
                Sign in again
              </button>
            )}
          </div>
        </div>
      );
    }
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

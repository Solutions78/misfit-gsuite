import { useState } from "react";
import { Mail, Loader2 } from "lucide-react";
import { startOAuthFlow } from "@/lib/tauri";
import { useAuthStore } from "@/store/authStore";

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { addAccount } = useAuthStore();

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const account = await startOAuthFlow();
      addAccount(account);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="titlebar-drag-region absolute top-0 left-0 right-0" />
      <div className="bg-white rounded-2xl shadow-xl p-10 flex flex-col items-center gap-6 w-80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <Mail className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Misfit GSuite</h1>
            <p className="text-xs text-gray-500">Google Workspace Client</p>
          </div>
        </div>

        <p className="text-sm text-gray-600 text-center leading-relaxed">
          Sign in with your Google Workspace account to access Gmail, Calendar, Chat, and Gemini AI.
        </p>

        <button
          onClick={handleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border border-gray-300 rounded-xl shadow-sm hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
          ) : (
            <GoogleIcon />
          )}
          <span className="text-sm font-medium text-gray-700">
            {loading ? "Opening browser..." : "Sign in with Google"}
          </span>
        </button>

        {error && (
          <p className="text-xs text-red-600 text-center">{error}</p>
        )}

        <p className="text-xs text-gray-400 text-center">
          Your credentials are stored securely in the macOS Keychain.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.616z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" />
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  );
}

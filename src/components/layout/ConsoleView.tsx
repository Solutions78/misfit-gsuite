import { cn } from "@/lib/utils";
import { Sparkles, Terminal, ShieldAlert, ExternalLink, RefreshCw } from "lucide-react";
import { useState } from "react";

interface Props {
  type: "cloud" | "admin";
}

export default function ConsoleView({ type }: Props) {
  const [loading, setLoading] = useState(true);
  const url = type === "cloud" 
    ? "https://console.cloud.google.com" 
    : "https://admin.google.com";

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      {/* Console Header */}
      <div className="px-6 h-16 border-b border-gray-200 flex items-center justify-between bg-gray-50 flex-shrink-0 z-20">
        <div className="flex items-center gap-4 min-w-0">
          <div className={cn(
            "w-11 h-11 rounded-[18px] flex items-center justify-center flex-shrink-0 shadow-lg",
            type === "cloud" ? "bg-blue-600 shadow-blue-500/20" : "bg-gray-900 shadow-black/20"
          )}>
            {type === "cloud" ? <Terminal className="w-5 h-5 text-white" /> : <ShieldAlert className="w-5 h-5 text-white" />}
          </div>
          <div className="min-w-0">
            <h2 className="text-[15px] font-black text-gray-900 uppercase tracking-tighter truncate">
              {type === "cloud" ? "Google Cloud Platform" : "Workspace Administration"}
            </h2>
            <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Active Deployment Session</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
            <button 
                onClick={() => { setLoading(true); }}
                className="p-2.5 rounded-xl hover:bg-gray-200 text-gray-400 hover:text-gray-900 transition-all active:scale-95"
                title="Reload Console"
            >
                <RefreshCw className={cn("w-4.5 h-4.5", loading && "animate-spin")} />
            </button>
            <a 
                href={url} 
                target="_blank" 
                className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all hover:bg-black active:scale-95"
            >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>External</span>
            </a>
        </div>
      </div>

      {/* Pane 3: The Console Webview */}
      <div className="flex-1 bg-white relative overflow-hidden">
        {loading && (
            <div className="absolute inset-0 z-30 bg-gray-50 flex flex-col items-center justify-center gap-4 animate-in fade-in duration-500">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin shadow-2xl shadow-blue-500/20" />
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] animate-pulse">Establishing Secure Bridge</p>
            </div>
        )}
        <iframe 
          src={url}
          className="w-full h-full border-none relative z-10"
          title={`${type} Console`}
          onLoad={() => setLoading(false)}
          allow="autoplay; camera; clipboard-read; clipboard-write; encrypted-media; fullscreen; geolocation; microphone; midi"
        />
        
        {/* Gemini Integration Banner */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 w-[480px] max-w-[90%]">
            <div className="bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-[28px] p-4 shadow-2xl flex items-center gap-4 ring-1 ring-white/5">
                <div className="w-10 h-10 rounded-[18px] bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-lg">
                    <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-black text-white uppercase tracking-widest leading-none mb-1">Gemini Cloud Assistant</p>
                    <p className="text-[10px] text-gray-400 font-medium truncate italic">Ask for help navigating resources or optimizing costs...</p>
                </div>
                <button className="px-4 py-2 bg-white text-gray-900 rounded-xl text-[10px] font-black uppercase tracking-tighter hover:bg-blue-50 transition-all active:scale-95">
                    Consult
                </button>
            </div>
        </div>
      </div>
    </div>
  );
}

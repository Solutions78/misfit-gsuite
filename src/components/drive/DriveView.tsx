import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listDriveFiles } from "@/lib/tauri";
import { cn, formatFileSize } from "@/lib/utils";
import { 
  Folder, 
  HardDrive,
  File as FileIcon,
  ChevronRight,
  MoreVertical,
  ExternalLink,
  Search,
  Sparkles,
  FileText,
  Table2,
  Presentation,
  X,
  Maximize2,
  LayoutGrid,
  List,
  ArrowUp,
  ArrowDown
} from "lucide-react";
import type { DriveFile } from "@/types";

interface Props {
  filterType?: "drive" | "docs" | "sheets" | "slides";
}

const MIME_TYPES = {
  docs: "application/vnd.google-apps.document",
  sheets: "application/vnd.google-apps.spreadsheet",
  slides: "application/vnd.google-apps.presentation",
  folder: "application/vnd.google-apps.folder",
};

export default function DriveView({ filterType = "drive" }: Props) {
  const [currentFolderId, setCurrentFolderId] = useState<string>("root");
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [sortField, setSortField] = useState<"name" | "size" | "modified">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const getPane1Title = () => {
    switch (filterType) {
      case "docs": return "Documents";
      case "sheets": return "Data Sheets";
      case "slides": return "Presentations";
      default: return "Folders";
    }
  };

  return (
    <div className="flex h-full bg-gray-50 overflow-hidden">
      {/* Pane 2: Selection (Standardized Folders Pane) */}
      <div className="w-64 flex-shrink-0 border-r border-gray-200 flex flex-col bg-gray-50">
        <div className="px-5 py-6 border-b border-gray-100 flex items-center justify-between bg-transparent">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.25em]">{getPane1Title()}</span>
        </div>
        <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
          <FolderTree 
            activeId={currentFolderId} 
            onSelect={setCurrentFolderId} 
            filterType={filterType}
          />
        </div>
      </div>

      {/* Pane 3: Finder / Editor */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-50 shadow-2xl relative z-10 overflow-hidden">
        {selectedFile ? (
          <EditorView file={selectedFile} onClose={() => setSelectedFile(null)} />
        ) : (
          <div className="flex flex-col h-full">
            {/* Explorer Header */}
            <div className="px-8 py-5 border-b border-gray-100 flex items-center justify-between bg-transparent flex-shrink-0">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-gray-900 flex items-center justify-center shadow-lg shadow-black/20">
                  <Folder className="w-5 h-5 text-blue-400" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-[13px] font-black text-gray-900 uppercase tracking-tight truncate">Folder Contents</h2>
                  <div className="flex items-center gap-1.5 opacity-40">
                     <span className="text-[9px] font-black uppercase tracking-widest">Main Root</span>
                     <ChevronRight className="w-2.5 h-2.5" />
                     <span className="text-[9px] font-black uppercase tracking-widest">Files</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {/* View Switcher */}
                <div className="flex bg-gray-200/50 p-1 rounded-xl">
                    <button 
                        onClick={() => setViewMode("list")}
                        className={cn("p-2 rounded-lg transition-all", viewMode === "list" ? "bg-gray-900 text-white shadow-md" : "text-gray-400 hover:text-gray-900")}
                    >
                        <List className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={() => setViewMode("grid")}
                        className={cn("p-2 rounded-lg transition-all", viewMode === "grid" ? "bg-gray-900 text-white shadow-md" : "text-gray-400 hover:text-gray-900")}
                    >
                        <LayoutGrid className="w-4 h-4" />
                    </button>
                </div>

                <div className="relative group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input 
                    type="text" 
                    placeholder="Search directory..."
                    className="h-9 pl-10 pr-4 bg-gray-100 border border-gray-100 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:outline-none focus:ring-4 focus:ring-blue-500/5 transition-all w-56 shadow-inner"
                  />
                </div>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-white/50 backdrop-blur-sm">
              <FinderContent 
                folderId={currentFolderId} 
                filterType={filterType}
                viewMode={viewMode}
                onSelectFile={setSelectedFile} 
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FolderTree({ activeId, onSelect, filterType }: { activeId: string, onSelect: (id: string) => void, filterType: string }) {
  const { data: response } = useQuery({
    queryKey: ["drive-folders", "root"],
    queryFn: () => listDriveFiles(`mimeType = '${MIME_TYPES.folder}' and 'root' in parents and trashed = false`),
  });

  return (
    <div className="space-y-1 px-3">
      <button 
        onClick={() => onSelect("root")}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all duration-200 active:scale-95 group",
          activeId === "root" 
            ? "bg-gray-900 text-white shadow-[0_0_20px_rgba(255,255,255,0.12)] border border-white/5" 
            : "text-gray-500 hover:bg-gray-200/50 hover:text-gray-900"
        )}
      >
        <HardDrive className={cn("w-4.5 h-4.5 transition-transform", activeId === "root" ? "scale-110 text-blue-400" : "text-gray-400 group-hover:scale-110")} />
        Main Root
      </button>
      
      {response?.files.map(f => (
        <button 
          key={f.id}
          onClick={() => onSelect(f.id)}
          className={cn(
            "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all duration-200 active:scale-95 group",
            activeId === f.id 
              ? "bg-gray-900 text-white shadow-[0_0_20px_rgba(255,255,255,0.12)] border border-white/5" 
              : "text-gray-500 hover:bg-gray-200/50 hover:text-gray-900"
          )}
        >
          <Folder className={cn("w-4.5 h-4.5 transition-transform", activeId === f.id ? "scale-110 text-blue-400" : "text-gray-400 group-hover:scale-110")} />
          <span className="truncate flex-1 text-left">{f.name}</span>
          <ChevronRight className={cn("w-3.5 h-3.5 transition-opacity", activeId === f.id ? "opacity-40" : "opacity-0 group-hover:opacity-20")} />
        </button>
      ))}
    </div>
  );
}

function FinderContent({ folderId, filterType, viewMode, onSelectFile }: { folderId: string, filterType: string, viewMode: "grid" | "list", onSelectFile: (file: DriveFile) => void }) {
  const { data: response, isLoading } = useQuery({
    queryKey: ["drive-contents", folderId, filterType],
    queryFn: () => {
      let q = `'${folderId}' in parents and trashed = false`;
      if (filterType === "docs") q += ` and mimeType = '${MIME_TYPES.docs}'`;
      else if (filterType === "sheets") q += ` and mimeType = '${MIME_TYPES.sheets}'`;
      else if (filterType === "slides") q += ` and mimeType = '${MIME_TYPES.slides}'`;
      return listDriveFiles(q);
    },
  });

  if (isLoading) return (
    <div className="p-8 space-y-4">
        {[1,2,3,4,5,6].map(i => <div key={i} className="h-14 bg-gray-100/50 rounded-2xl animate-pulse" />)}
    </div>
  );

  if (viewMode === "grid") {
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 p-8">
            {response?.files.map(file => (
                <div 
                    key={file.id}
                    className="group bg-white border border-gray-100 rounded-[28px] p-6 flex flex-col items-center gap-4 hover:border-blue-600 hover:shadow-2xl transition-all duration-300 cursor-pointer"
                    onClick={() => onSelectFile(file)}
                >
                    <div className={cn(
                        "w-20 h-20 rounded-[24px] flex items-center justify-center shadow-sm transition-transform group-hover:scale-105",
                        file.mimeType === MIME_TYPES.folder ? "bg-blue-600 text-white" : "bg-gray-900 text-white"
                    )}>
                        {getFileIcon(file.mimeType)}
                    </div>
                    <div className="text-center min-w-0 w-full px-2">
                        <p className="text-[12px] font-black text-gray-900 uppercase tracking-tight truncate mb-1">{file.name}</p>
                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">
                           {file.mimeType.split(".").pop()?.toUpperCase() || "File"}
                        </p>
                    </div>
                </div>
            ))}
        </div>
    );
  }

  return (
    <div className="flex flex-col">
        {/* Table Header */}
        <div className="flex items-center px-8 py-3 border-b border-gray-100 bg-gray-50/50 sticky top-0 z-20 backdrop-blur-md">
            <div className="flex-1 flex items-center gap-2">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Name</span>
            </div>
            <div className="w-32 flex items-center gap-2">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Size</span>
            </div>
            <div className="w-48 flex items-center gap-2">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Modified</span>
            </div>
            <div className="w-16" />
        </div>

        <div className="flex flex-col">
            {response?.files.map(file => (
                <div 
                    key={file.id}
                    className="group flex items-center px-8 py-4 border-b border-gray-100 hover:bg-gray-900 transition-all duration-150 cursor-pointer group/row"
                    onClick={() => onSelectFile(file)}
                >
                    <div className="flex-1 flex items-center gap-4 min-w-0">
                        <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover/row:scale-110 shadow-sm",
                            file.mimeType === MIME_TYPES.folder ? "bg-blue-600 text-white" : "bg-gray-900 text-white shadow-[0_0_15px_rgba(255,255,255,0.05)]"
                        )}>
                            {getFileSmallIcon(file.mimeType)}
                        </div>
                        <span className="text-[13px] font-black text-gray-900 group-hover/row:text-white uppercase tracking-tight truncate transition-colors">
                            {file.name}
                        </span>
                    </div>
                    
                    <div className="w-32 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        {file.size ? formatFileSize(parseInt(file.size)) : "--"}
                    </div>
                    
                    <div className="w-48 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        {file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : "--"}
                    </div>

                    <div className="w-16 flex justify-end opacity-0 group-hover/row:opacity-100 transition-opacity">
                        <button className="p-2 hover:bg-white/10 rounded-xl text-white transition-colors">
                            <MoreVertical className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            ))}
        </div>
        
        {response?.files.length === 0 && (
            <div className="flex flex-col items-center justify-center py-40 opacity-10 grayscale">
                <Sparkles className="w-24 h-24 mb-8 animate-pulse" />
                <p className="text-xl font-black uppercase tracking-[0.5em]">System Empty</p>
            </div>
        )}
    </div>
  );
}

function getFileIcon(mime: string) {
    if (mime === MIME_TYPES.folder) return <Folder className="w-10 h-10" />;
    if (mime === MIME_TYPES.docs) return <FileText className="w-10 h-10 text-blue-400" />;
    if (mime === MIME_TYPES.sheets) return <Table2 className="w-10 h-10 text-emerald-400" />;
    if (mime === MIME_TYPES.slides) return <Presentation className="w-10 h-10 text-amber-400" />;
    return <FileIcon className="w-10 h-10" />;
}

function getFileSmallIcon(mime: string) {
    if (mime === MIME_TYPES.folder) return <Folder className="w-5 h-5" />;
    if (mime === MIME_TYPES.docs) return <FileText className="w-5 h-5 text-blue-400" />;
    if (mime === MIME_TYPES.sheets) return <Table2 className="w-5 h-5 text-emerald-400" />;
    if (mime === MIME_TYPES.slides) return <Presentation className="w-5 h-5 text-amber-400" />;
    return <FileIcon className="w-5 h-5" />;
}

function EditorView({ file, onClose }: { file: DriveFile, onClose: () => void }) {
  const editUrl = useMemo(() => {
    if (file.webViewLink) {
        return file.webViewLink.replace(/\/view(\?.*)?$/, "/edit$1");
    }
    return `https://docs.google.com/open?id=${file.id}`;
  }, [file]);

  return (
    <div className="flex flex-col h-full bg-gray-50 animate-in zoom-in-95 fade-in duration-300">
      <div className="px-8 h-20 border-b border-gray-100 flex items-center justify-between bg-transparent flex-shrink-0 z-10">
        <div className="flex items-center gap-5 min-w-0">
          <button 
            onClick={onClose}
            className="p-3 bg-gray-900 text-white rounded-2xl shadow-[0_0_15px_rgba(255,255,255,0.1)] border border-white/5 transition-all active:scale-90"
          >
            <ChevronRight className="w-5 h-5 rotate-180 text-blue-400" />
          </button>
          <div className="min-w-0">
            <h2 className="text-[15px] font-black text-gray-900 uppercase tracking-tighter truncate leading-none mb-1">{file.name}</h2>
            <div className="flex items-center gap-2 opacity-50">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Active Editing Session</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
            <button className="flex items-center gap-2.5 px-6 py-3 bg-gray-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-[0_0_20px_rgba(255,255,255,0.12)] border border-white/5 transition-all active:scale-95 group">
                <Sparkles className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
                <span>AI Insights</span>
            </button>
            <button onClick={onClose} className="p-3 rounded-2xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all active:scale-95">
                <X className="w-5 h-5" />
            </button>
        </div>
      </div>
      
      <div className="flex-1 bg-white overflow-hidden relative shadow-inner">
        <iframe 
          src={editUrl}
          className="w-full h-full border-none relative z-10"
          title="Google Workspace Editor"
          allow="autoplay; camera; clipboard-read; clipboard-write; encrypted-media; fullscreen; geolocation; microphone; midi"
        />
        <div className="absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-black/5 to-transparent pointer-events-none z-20" />
      </div>
    </div>
  );
}

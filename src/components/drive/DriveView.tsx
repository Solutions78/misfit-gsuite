import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { listDriveFiles, listDriveFilesRecursive, listSharedDrives, openDriveFile } from "@/lib/tauri";
import { useUIStore } from "@/store/uiStore";
import { setDriveContext, clearDriveContext } from "@/lib/geminiContextBridge";
import { useDocStore } from "@/store/docStore";
import { cn, formatFileSize } from "@/lib/utils";
import { 
  Folder, 
  HardDrive,
  File as FileIcon,
  ChevronRight,
  MoreVertical,
  Search,
  Sparkles,
  FileText,
  Table2,
  Presentation,
  X,
  Maximize2,
  LayoutGrid,
  List,
  Users,
  Database,
  Loader2,
  Layers,
  FileSearch
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
  const driveCategory = useUIStore((s) => s.driveCategory);
  const currentFolderId = useUIStore((s) => s.driveFolderId);
  const activeDriveId = useUIStore((s) => s.activeDriveId);
  const setDriveFolderId = useUIStore((s) => s.setDriveFolderId);
  const setActiveDriveId = useUIStore((s) => s.setActiveDriveId);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const setPendingFileId = useDocStore((s) => s.setPendingFileId);

  const [viewMode, setViewMode] = useState<"grid" | "list">("list");

  useEffect(() => {
    setDriveContext({
      activeView: filterType ?? "drive",
      currentFolderId: currentFolderId,
      driveId: activeDriveId,
    });
    return () => clearDriveContext();
  }, [filterType, currentFolderId, activeDriveId]);

  const handleSelectFile = (file: DriveFile) => {
    if (file.mimeType === MIME_TYPES.folder) return;
    if (file.mimeType === MIME_TYPES.docs) {
      setPendingFileId(file.id);
      setActiveView("docs");
    } else {
      const url = file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`;
      void openDriveFile(url);
    }
  };

  const getPane1Title = () => {
    switch (filterType) {
      case "docs": return "Documents";
      case "sheets": return "Data Sheets";
      case "slides": return "Presentations";
      default: return "Explorer";
    }
  };

  const getFolderTitle = () => {
    if (activeDriveId && currentFolderId === activeDriveId) return "Shared Drive Root";
    if (driveCategory === "starred") return "Starred Items";
    if (driveCategory === "recent") return "Recent Activity";
    if (driveCategory === "shared") return "Shared With Me";
    if (driveCategory === "shortcuts") return "Shortcuts";
    return "Folder Contents";
  };

  const isDeepScan = filterType !== "drive" && driveCategory === "all" && currentFolderId !== "root" && currentFolderId !== activeDriveId;
  const isFlatSearch = filterType !== "drive" && driveCategory === "all" && (currentFolderId === "root" || currentFolderId === activeDriveId);

  return (
    <div className="flex h-full overflow-hidden" style={{ background: "var(--c-bg)" }}>
      {/* Pane 2: Selection (Standardized Folders Pane) */}
      <div className="w-64 flex-shrink-0 border-r border-white/5 flex flex-col" style={{ background: "var(--c-bg)" }}>
        <div className="px-5 py-6 border-b border-white/5 flex items-center justify-between bg-transparent">
          <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.25em]">{getPane1Title()}</span>
        </div>
        <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
          <FolderTree 
            activeId={currentFolderId} 
            activeDriveId={activeDriveId}
            onSelectFolder={setDriveFolderId} 
            onSelectDrive={setActiveDriveId}
            category={driveCategory}
          />
        </div>
      </div>

      {/* Pane 3: Finder */}
      <div className="flex-1 flex flex-col min-w-0 shadow-2xl relative z-10 overflow-hidden" style={{ background: "var(--c-surface)" }}>
          <div className="flex flex-col h-full">
            {/* Explorer Header */}
            <div className="px-8 py-5 border-b border-white/5 flex items-center justify-between bg-transparent flex-shrink-0">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-gray-900 flex items-center justify-center shadow-[0_0_15px_rgba(255,255,255,0.05)] border border-white/5">
                  {driveCategory === "shared" ? <Users className="w-5 h-5 text-blue-400" /> : activeDriveId ? <Database className="w-5 h-5 text-emerald-400" /> : <Folder className="w-5 h-5 text-blue-400" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <h2 className="text-[13px] font-black text-white uppercase tracking-tight truncate">{getFolderTitle()}</h2>
                    {isDeepScan && (
                       <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded-md shadow-[0_0_10px_rgba(59,130,246,0.1)]">
                          <Layers className="w-2.5 h-2.5 text-blue-400" />
                          <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest">Deep Scan</span>
                       </div>
                    )}
                    {isFlatSearch && (
                       <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-md shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                          <FileSearch className="w-2.5 h-2.5 text-emerald-400" />
                          <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">Global Scan</span>
                       </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 opacity-40">
                     <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{activeDriveId ? "Shared Drive" : driveCategory === "shared" ? "Shared" : "Main Root"}</span>
                     <ChevronRight className="w-2.5 h-2.5 text-gray-400" />
                     <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Files</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {/* View Switcher */}
                <div className="flex bg-gray-900/40 p-1 rounded-xl border border-white/5">
                    <button 
                        onClick={() => setViewMode("list")}
                        className={cn(
                          "p-2 rounded-lg transition-all", 
                          viewMode === "list" 
                            ? "bg-gray-900 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)] border border-white/10" 
                            : "text-gray-500 hover:text-gray-300"
                        )}
                    >
                        <List className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={() => setViewMode("grid")}
                        className={cn(
                          "p-2 rounded-lg transition-all", 
                          viewMode === "grid" 
                            ? "bg-gray-900 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)] border border-white/10" 
                            : "text-gray-500 hover:text-gray-300"
                        )}
                    >
                        <LayoutGrid className="w-4 h-4" />
                    </button>
                </div>

                <div className="relative group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                  <input 
                    type="text" 
                    placeholder="Search directory..."
                    className="h-9 pl-10 pr-4 bg-gray-900 border border-white/5 rounded-2xl text-[10px] font-black text-white placeholder:text-gray-600 uppercase tracking-widest focus:outline-none focus:ring-4 focus:ring-blue-500/5 transition-all w-56"
                  />
                </div>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-transparent">
              <FinderContent 
                folderId={currentFolderId} 
                driveId={activeDriveId}
                category={driveCategory}
                filterType={filterType}
                viewMode={viewMode}
                onSelectFile={handleSelectFile}
              />
            </div>
          </div>
      </div>
    </div>
  );
}

function FolderTree({ activeId, activeDriveId, onSelectFolder, onSelectDrive, category }: { activeId: string, activeDriveId?: string, onSelectFolder: (id: string) => void, onSelectDrive: (id?: string) => void, category: string }) {
  const { data: response } = useQuery({
    queryKey: ["drive-folders", category, activeDriveId],
    queryFn: () => {
        let q = "mimeType = 'application/vnd.google-apps.folder' and trashed = false";
        if (category === "shared") q += " and sharedWithMe = true";
        else if (category === "starred") q += " and starred = true";
        else q += ` and '${activeDriveId || 'root'}' in parents`;
        return listDriveFiles(q, undefined, 50, activeDriveId);
    },
  });

  const { data: sharedDrives } = useQuery({
    queryKey: ["shared-drives"],
    queryFn: () => listSharedDrives(),
    staleTime: 5 * 60_000,
  });

  return (
    <div className="space-y-6 px-3">
      {/* Roots Section */}
      <div className="space-y-1">
        <button 
            onClick={() => { onSelectDrive(undefined); onSelectFolder("root"); }}
            className={cn(
            "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all duration-200 active:scale-95 group",
            (!activeDriveId && activeId === "root")
                ? "bg-gray-900 text-white shadow-[0_0_20px_rgba(255,255,255,0.12)] border border-white/5" 
                : "text-gray-500 hover:bg-gray-900/40 hover:text-white"
            )}
        >
            <HardDrive className={cn("w-4.5 h-4.5 transition-transform", (!activeDriveId && activeId === "root") ? "scale-110 text-blue-400" : "text-gray-500 group-hover:scale-110")} />
            My Drive
        </button>

        {sharedDrives?.drives.map(drive => (
            <button 
                key={drive.id}
                onClick={() => onSelectDrive(drive.id)}
                className={cn(
                "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all duration-200 active:scale-95 group",
                activeDriveId === drive.id
                    ? "bg-gray-900 text-white shadow-[0_0_20px_rgba(255,255,255,0.12)] border border-white/5" 
                    : "text-gray-500 hover:bg-gray-900/40 hover:text-white"
                )}
            >
                <Database className={cn("w-4.5 h-4.5 transition-transform", activeDriveId === drive.id ? "scale-110 text-emerald-400" : "text-gray-500 group-hover:scale-110")} />
                <span className="truncate flex-1 text-left">{drive.name}</span>
            </button>
        ))}
      </div>

      {/* Dynamic Folders Section */}
      {response?.files && response.files.length > 0 && (
        <div className="space-y-1">
            <span className="text-[9px] font-black text-gray-600 uppercase tracking-[0.2em] px-4 mb-2 block">Folders</span>
            {response.files.map(f => (
                <button 
                key={f.id}
                onClick={() => onSelectFolder(f.id)}
                className={cn(
                    "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all duration-200 active:scale-95 group",
                    activeId === f.id 
                    ? "bg-gray-900 text-white shadow-[0_0_20px_rgba(255,255,255,0.12)] border border-white/5" 
                    : "text-gray-500 hover:bg-gray-900/40 hover:text-white"
                )}
                >
                <Folder className={cn("w-4.5 h-4.5 transition-transform", activeId === f.id ? "scale-110 text-blue-400" : "text-gray-500 group-hover:scale-110")} />
                <span className="truncate flex-1 text-left">{f.name}</span>
                <ChevronRight className={cn("w-3.5 h-3.5 transition-opacity", activeId === f.id ? "opacity-40" : "opacity-0 group-hover:opacity-20")} />
                </button>
            ))}
        </div>
      )}
    </div>
  );
}

function FinderContent({ folderId, driveId, category, filterType, viewMode, onSelectFile }: { folderId: string, driveId?: string, category: string, filterType: string, viewMode: "grid" | "list", onSelectFile: (file: DriveFile) => void }) {
  const isDeepScan = filterType !== "drive" && category === "all" && folderId !== "root" && folderId !== driveId;
  const isFlatSearch = filterType !== "drive" && category === "all" && (folderId === "root" || folderId === driveId);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error
  } = useInfiniteQuery({
    queryKey: ["drive-contents-infinite", folderId, driveId, category, filterType],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      if (isDeepScan) {
        return listDriveFilesRecursive(folderId, MIME_TYPES[filterType as keyof typeof MIME_TYPES] || MIME_TYPES.docs, pageParam, 50, driveId);
      } else {
        let q = "trashed = false";
        let orderBy: string | undefined = undefined;

        if (category === "starred") q += " and starred = true";
        else if (category === "recent") orderBy = "viewedByMeTime desc";
        else if (category === "shared") q += " and sharedWithMe = true";
        else if (category === "shortcuts") q += " and mimeType = 'application/vnd.google-apps.shortcut'";
        else {
            // Only add parent filter in 'drive' mode or if we specifically want to restrict results to direct children.
            // For specialized views (Docs, Sheets, Slides), the root/drive selection uses a Global Scan (no parent filter).
            if (filterType === "drive") {
                q += ` and '${folderId}' in parents`;
            }
        }

        if (filterType !== "drive") {
            q += ` and mimeType = '${MIME_TYPES[filterType as keyof typeof MIME_TYPES]}'`;
        }
        
        return listDriveFiles(q, pageParam, 50, driveId, orderBy);
      }
    },
    getNextPageParam: (last) => last.nextPageToken ?? undefined,
    staleTime: 60_000,
  });

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (hasNextPage && !isFetchingNextPage && el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const allFiles = useMemo(() => {
    return data?.pages.flatMap(p => p.files) ?? [];
  }, [data]);

  if (isLoading) return (
    <div className="p-8 space-y-4">
        {[1,2,3,4,5,6].map(i => <div key={i} className="h-14 bg-gray-900/20 rounded-2xl animate-pulse" />)}
    </div>
  );

  if (isError) return (
    <div className="p-12 text-center">
        <p className="text-red-500 font-black uppercase tracking-widest text-[10px] mb-2">Scan Error</p>
        <p className="text-gray-500 text-[10px]">{String(error)}</p>
    </div>
  );

  if (viewMode === "grid") {
    return (
        <div onScroll={handleScroll} className="h-full overflow-y-auto custom-scrollbar">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 p-8">
                {allFiles.map(file => (
                    <div 
                        key={file.id}
                        className="group bg-gray-900/40 border border-white/5 rounded-[28px] p-6 flex flex-col items-center gap-4 hover:border-blue-600 hover:bg-gray-900 hover:shadow-[0_0_30px_rgba(0,0,0,0.3)] transition-all duration-300 cursor-pointer"
                        onClick={() => onSelectFile(file)}
                    >
                        <div className={cn(
                            "w-20 h-20 rounded-[24px] flex items-center justify-center shadow-sm transition-transform group-hover:scale-105",
                            file.mimeType === MIME_TYPES.folder ? "bg-blue-600 text-white" : "bg-gray-900 text-white border border-white/5 shadow-[0_0_15px_rgba(255,255,255,0.05)]"
                        )}>
                            {getFileIcon(file.mimeType)}
                        </div>
                        <div className="text-center min-w-0 w-full px-2">
                            <p className="text-[12px] font-black text-white uppercase tracking-tight truncate mb-1">{file.name}</p>
                            <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">
                            {file.mimeType.split(".").pop()?.toUpperCase() || "File"}
                            </p>
                        </div>
                    </div>
                ))}
                {isFetchingNextPage && <div className="col-span-full py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>}
            </div>
        </div>
    );
  }

  return (
    <div onScroll={handleScroll} className="h-full overflow-y-auto custom-scrollbar flex flex-col">
        <div className="flex items-center px-8 py-3 border-b border-white/5 bg-gray-900/20 sticky top-0 z-20 backdrop-blur-md">
            <div className="flex-1 flex items-center gap-2">
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Name</span>
            </div>
            <div className="w-32 flex items-center gap-2">
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Size</span>
            </div>
            <div className="w-48 flex items-center gap-2">
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Modified</span>
            </div>
            <div className="w-16" />
        </div>

        <div className="flex flex-col">
            {allFiles.map(file => (
                <div 
                    key={file.id}
                    className="group flex items-center px-8 py-4 border-b border-white/5 hover:bg-gray-900 transition-all duration-150 cursor-pointer group/row"
                    onClick={() => onSelectFile(file)}
                >
                    <div className="flex-1 flex items-center gap-4 min-w-0">
                        <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover/row:scale-110 shadow-sm",
                            file.mimeType === MIME_TYPES.folder ? "bg-blue-600 text-white" : "bg-gray-900 text-white border border-white/5 shadow-[0_0_15px_rgba(255,255,255,0.05)]"
                        )}>
                            {getFileSmallIcon(file.mimeType)}
                        </div>
                        <span className="text-[13px] font-black text-gray-300 group-hover/row:text-white uppercase tracking-tight truncate transition-colors">
                            {file.name}
                        </span>
                    </div>
                    
                    <div className="w-32 text-[10px] font-black text-gray-500 uppercase tracking-widest transition-colors group-hover/row:text-gray-400">
                        {file.size ? formatFileSize(parseInt(file.size)) : "--"}
                    </div>
                    
                    <div className="w-48 text-[10px] font-black text-gray-500 uppercase tracking-widest transition-colors group-hover/row:text-gray-400">
                        {file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : "--"}
                    </div>

                    <div className="w-16 flex justify-end items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                        <button className="p-2 hover:bg-white/10 rounded-xl text-white transition-colors">
                            <MoreVertical className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            ))}
            {isFetchingNextPage && <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>}
        </div>
        
        {allFiles.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center py-40 opacity-10 grayscale">
                <Sparkles className="w-24 h-24 mb-8 animate-pulse text-blue-400" />
                <p className="text-xl font-black text-white uppercase tracking-[0.5em]">System Empty</p>
            </div>
        )}
    </div>
  );
}

function getFileIcon(mime: string) {
    if (mime === MIME_TYPES.folder) return <Folder className="w-10 h-10 text-white" />;
    if (mime === MIME_TYPES.docs) return <FileText className="w-10 h-10 text-blue-400" />;
    if (mime === MIME_TYPES.sheets) return <Table2 className="w-10 h-10 text-emerald-400" />;
    if (mime === MIME_TYPES.slides) return <Presentation className="w-10 h-10 text-amber-400" />;
    return <FileIcon className="w-10 h-10 text-gray-400" />;
}

function getFileSmallIcon(mime: string) {
    if (mime === MIME_TYPES.folder) return <Folder className="w-5 h-5 text-white" />;
    if (mime === MIME_TYPES.docs) return <FileText className="w-5 h-5 text-blue-400" />;
    if (mime === MIME_TYPES.sheets) return <Table2 className="w-5 h-5 text-emerald-400" />;
    if (mime === MIME_TYPES.slides) return <Presentation className="w-5 h-5 text-amber-400" />;
    return <FileIcon className="w-5 h-5 text-gray-400" />;
}

function EditorView({ file, onClose }: { file: DriveFile, onClose: () => void }) {
  const editUrl = useMemo(() => {
    if (file.webViewLink) {
        return file.webViewLink.replace(/\/view(\?.*)?$/, "/edit$1");
    }
    return `https://docs.google.com/open?id=${file.id}`;
  }, [file]);

  return (
    <div className="flex flex-col h-full animate-in zoom-in-95 fade-in duration-300" style={{ background: "var(--c-bg)" }}>
      <div className="px-8 h-20 border-b border-white/5 flex items-center justify-between bg-transparent flex-shrink-0 z-10">
        <div className="flex items-center gap-5 min-w-0">
          <button 
            onClick={onClose}
            className="p-3 bg-gray-900 text-white rounded-2xl shadow-[0_0_15px_rgba(255,255,255,0.1)] border border-white/5 transition-all active:scale-90"
          >
            <ChevronRight className="w-5 h-5 rotate-180 text-blue-400" />
          </button>
          <div className="min-w-0">
            <h2 className="text-[15px] font-black text-white uppercase tracking-tighter truncate leading-none mb-1">{file.name}</h2>
            <div className="flex items-center gap-2 opacity-50">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Active Editing Session</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
            <button className="flex items-center gap-2.5 px-6 py-3 bg-gray-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-[0_0_20px_rgba(255,255,255,0.12)] border border-white/10 transition-all active:scale-95 group">
                <Sparkles className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
                <span>AI Insights</span>
            </button>
            <button onClick={onClose} className="p-3 rounded-2xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all active:scale-95">
                <X className="w-5 h-5" />
            </button>
        </div>
      </div>
      
      <div className="flex-1 bg-white overflow-hidden relative shadow-inner border-t border-white/5">
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

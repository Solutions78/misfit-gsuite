import React, { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Network, Play, RefreshCw, X, ExternalLink, Search } from "lucide-react";
import { getKgGraph, getKgStatus, startKgCrawl, listSharedDrives, openDriveFile } from "@/lib/tauri";
import type { KgEdgeView, KgGraphPayload, KgNodeView, KgStatusResponse, SharedDriveListResponse } from "@/types";

// Dynamic import — Three.js is large, don't block app startup
const ForceGraph3D = React.lazy(() => import("react-force-graph-3d"));

// ── Color helpers ─────────────────────────────────────────────────────────

const MIME_COLORS: Record<string, string> = {
  "application/vnd.google-apps.document": "#60a5fa",      // blue
  "application/vnd.google-apps.spreadsheet": "#34d399",   // emerald
  "application/vnd.google-apps.presentation": "#fb923c",  // orange
  "application/vnd.google-apps.folder": "#facc15",        // yellow
  "entity/person": "#a78bfa",                              // purple
  "entity/project": "#22d3ee",                             // cyan
  "entity/client": "#f472b6",                              // pink
  "entity/product": "#4ade80",                             // green
};

function mimeColor(mimeType: string): string {
  if (MIME_COLORS[mimeType]) return MIME_COLORS[mimeType];
  if (mimeType.startsWith("entity/")) return "#94a3b8";
  return "#64748b"; // slate default
}

function topicColor(tag: string | undefined): string {
  if (!tag) return "#64748b";
  // Deterministic hash → hue
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 60%)`;
}

function edgeColor(edgeType: string): string {
  switch (edgeType) {
    case "folder_hierarchy": return "rgba(148,163,184,0.25)";
    case "gemini_reference": return "rgba(99,179,237,0.7)";
    case "entity_link":      return "rgba(167,139,250,0.7)";
    default:                 return "rgba(148,163,184,0.3)";
  }
}

// ── Graph data transform ──────────────────────────────────────────────────

interface GraphNode {
  id: string;
  name: string;
  val: number;
  color: string;
  __kg: KgNodeView;
}

interface GraphLink {
  source: string;
  target: string;
  color: string;
  width: number;
  __kg: KgEdgeView;
}

function buildGraphData(
  payload: KgGraphPayload,
  filterTopic: string | null,
  filterDrive: string | null,
  search: string,
  showFolder: boolean,
  showGemini: boolean,
  showEntity: boolean,
): { nodes: GraphNode[]; links: GraphLink[] } {
  const lowerSearch = search.toLowerCase();

  const nodes: GraphNode[] = payload.nodes
    .filter((n) => {
      if (filterTopic && !n.topicTags.includes(filterTopic)) return false;
      if (filterDrive && n.driveId !== filterDrive) return false;
      if (lowerSearch && !n.name.toLowerCase().includes(lowerSearch)) return false;
      return true;
    })
    .map((n) => ({
      id: n.fileId,
      name: n.name,
      val: Math.max(1, n.importanceScore ?? 3),
      color: n.topicTags.length > 0 ? topicColor(n.topicTags[0]) : mimeColor(n.mimeType),
      __kg: n,
    }));

  const nodeSet = new Set(nodes.map((n) => n.id));

  const links: GraphLink[] = payload.edges
    .filter((e) => nodeSet.has(e.sourceId) && nodeSet.has(e.targetId))
    .filter((e) => {
      if (!showFolder && e.edgeType === "folder_hierarchy") return false;
      if (!showGemini && e.edgeType === "gemini_reference") return false;
      if (!showEntity && e.edgeType === "entity_link") return false;
      return true;
    })
    .map((e) => ({
      source: e.sourceId,
      target: e.targetId,
      color: edgeColor(e.edgeType),
      width: e.edgeType === "folder_hierarchy" ? 0.5 : 1.5,
      __kg: e,
    }));

  return { nodes, links };
}

// ── Main component ────────────────────────────────────────────────────────

export default function KnowledgeView() {
  const qc = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ w: 900, h: 700 });

  // Filters
  const [filterTopic, setFilterTopic] = useState<string | null>(null);
  const [filterDrive, setFilterDrive] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showFolder, setShowFolder] = useState(true);
  const [showGemini, setShowGemini] = useState(true);
  const [showEntity, setShowEntity] = useState(true);

  // Hover tooltip
  const [hovered, setHovered] = useState<{ node: GraphNode; x: number; y: number } | null>(null);

  // Crawl state
  const [crawling, setCrawling] = useState(false);
  const [crawlError, setCrawlError] = useState<string | null>(null);

  // ResizeObserver for accurate canvas sizing
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ w: Math.floor(width), h: Math.floor(height) });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const { data: status } = useQuery<KgStatusResponse>({
    queryKey: ["kg-status"],
    queryFn: getKgStatus,
    refetchInterval: crawling ? 2000 : 10000,
  });

  const { data: graph } = useQuery<KgGraphPayload>({
    queryKey: ["kg-graph"],
    queryFn: getKgGraph,
    staleTime: 30_000,
    enabled: (status?.crawledFiles ?? 0) > 0,
  });

  // Sync crawling state with status
  useEffect(() => {
    const cs = status?.crawlStatus as string | undefined;
    if (cs === "running") {
      setCrawling(true);
    } else if (crawling && cs !== "running") {
      setCrawling(false);
      void qc.invalidateQueries({ queryKey: ["kg-graph"] });
    }
  }, [status?.crawlStatus, crawling, qc]);

  const handleStartCrawl = useCallback(async () => {
    setCrawlError(null);
    setCrawling(true);
    try {
      await startKgCrawl();
    } catch (e) {
      setCrawlError(String(e));
      setCrawling(false);
    }
  }, []);

  const handleNodeClick = useCallback((node: object) => {
    const n = node as GraphNode;
    if (n.__kg?.webViewLink) {
      void openDriveFile(n.__kg.webViewLink);
    }
  }, []);

  const handleNodeHover = useCallback((node: object | null, _prev: object | null, event?: MouseEvent) => {
    if (!node) { setHovered(null); return; }
    const n = node as GraphNode;
    setHovered({ node: n, x: event?.clientX ?? 0, y: event?.clientY ?? 0 });
  }, []);

  // Fetch shared drive names for the filter dropdown
  const { data: sharedDrivesData } = useQuery<SharedDriveListResponse>({
    queryKey: ["shared-drives"],
    queryFn: () => listSharedDrives(),
    staleTime: 5 * 60_000,
  });

  // Map driveId → human name
  const driveNameMap = React.useMemo<Map<string, string>>(() => {
    const m = new Map<string, string>();
    sharedDrivesData?.drives.forEach((d) => m.set(d.id, d.name));
    return m;
  }, [sharedDrivesData]);

  // Derive filter options from graph data
  const allTopics = React.useMemo(() => {
    if (!graph) return [];
    const set = new Set<string>();
    graph.nodes.forEach((n) => n.topicTags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [graph]);

  // Unique driveIds present in the graph, with resolved names
  const allDrives = React.useMemo(() => {
    if (!graph) return [] as { id: string; name: string }[];
    const map = new Map<string, string>();
    graph.nodes.forEach((n) => {
      if (n.driveId) {
        const name = driveNameMap.get(n.driveId) ?? n.driveId;
        map.set(n.driveId, name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [graph, driveNameMap]);

  const graphData = React.useMemo(() => {
    if (!graph) return { nodes: [], links: [] };
    return buildGraphData(graph, filterTopic, filterDrive, search, showFolder, showGemini, showEntity);
  }, [graph, filterTopic, filterDrive, search, showFolder, showGemini, showEntity]);

  const isEmpty = !graph || graph.nodes.length === 0;
  const neverCrawled = (status?.totalFiles ?? 0) === 0 && status?.crawlStatus === "idle";

  return (
    <div className="flex flex-col h-full bg-gray-950 text-white overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-gray-900/60 shrink-0">
        <Network size={16} className="text-blue-400" />
        <span className="text-[11px] font-black uppercase tracking-widest text-white">
          Knowledge Graph
        </span>

        <div className="flex-1" />

        {/* Status badge */}
        {status && (
          <div className="flex items-center gap-2 text-[10px] text-gray-400 font-mono">
            {(status.crawlStatus as string) === "running" && (
              <RefreshCw size={11} className="animate-spin text-blue-400" />
            )}
            {status.totalFiles > 0 && (status.crawlStatus as string) === "running" && (
              <span className="text-blue-300">
                Crawling {status.crawledFiles.toLocaleString()} / {status.totalFiles.toLocaleString()}
              </span>
            )}
            {status.crawledFiles > 0 && (status.crawlStatus as string) !== "running" && (
              <span>
                {status.crawledFiles.toLocaleString()} indexed · {status.enrichedFiles.toLocaleString()} enriched
              </span>
            )}
            {status.pendingEnrichment > 0 && (
              <span className="text-yellow-400">
                · {status.pendingEnrichment.toLocaleString()} enriching
              </span>
            )}
          </div>
        )}

        {/* Start crawl button */}
        <button
          onClick={() => void handleStartCrawl()}
          disabled={crawling}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-[10px] font-black uppercase tracking-widest
                     bg-gray-900 border border-white/5 shadow-[0_0_20px_rgba(255,255,255,0.12)]
                     text-blue-400 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Play size={10} />
          {crawling ? "Crawling…" : neverCrawled ? "Start Crawl" : "Re-Crawl"}
        </button>
      </div>

      {/* Error banner */}
      {crawlError && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-900/40 border-b border-red-500/20 text-red-300 text-[11px] shrink-0">
          <span className="flex-1">{crawlError}</span>
          <button onClick={() => setCrawlError(null)}><X size={12} /></button>
        </div>
      )}

      {/* Filter bar */}
      {!isEmpty && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-white/5 bg-gray-900/30 shrink-0 flex-wrap">
          {/* Search */}
          <div className="flex items-center gap-1.5 bg-gray-900 rounded-2xl px-3 py-1 border border-white/5">
            <Search size={11} className="text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files…"
              className="bg-transparent text-[11px] text-white placeholder-gray-600 outline-none w-32"
            />
          </div>

          {/* Topic filter */}
          {allTopics.length > 0 && (
            <select
              value={filterTopic ?? ""}
              onChange={(e) => setFilterTopic(e.target.value || null)}
              className="bg-gray-900 border border-white/5 rounded-2xl px-3 py-1 text-[11px] text-gray-300 outline-none"
            >
              <option value="">All Topics</option>
              {allTopics.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}

          {/* Drive filter */}
          {allDrives.length > 1 && (
            <select
              value={filterDrive ?? ""}
              onChange={(e) => setFilterDrive(e.target.value || null)}
              className="bg-gray-900 border border-white/5 rounded-2xl px-3 py-1 text-[11px] text-gray-300 outline-none"
            >
              <option value="">All Drives</option>
              {allDrives.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}

          {/* Edge type toggles */}
          <div className="flex items-center gap-2 ml-auto">
            {[
              { key: "folder", label: "Folders", val: showFolder, set: setShowFolder, color: "text-gray-400" },
              { key: "gemini", label: "References", val: showGemini, set: setShowGemini, color: "text-blue-400" },
              { key: "entity", label: "Entities", val: showEntity, set: setShowEntity, color: "text-purple-400" },
            ].map(({ key, label, val, set, color }) => (
              <button
                key={key}
                onClick={() => set(!val)}
                className={`px-2 py-1 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-colors
                  ${val
                    ? `bg-gray-900 border-white/5 shadow-[0_0_20px_rgba(255,255,255,0.12)] ${color}`
                    : "bg-transparent border-white/5 text-gray-600"
                  }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main content */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        {neverCrawled && !crawling && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center">
            <Network size={48} className="text-gray-700" />
            <p className="text-[13px] font-black uppercase tracking-widest text-gray-500">
              No graph yet
            </p>
            <p className="text-[11px] text-gray-600 max-w-xs">
              Start a crawl to index all your Drive files and build a 3D knowledge graph enriched by Gemini.
            </p>
            <button
              onClick={() => void handleStartCrawl()}
              className="flex items-center gap-2 px-4 py-2 rounded-2xl text-[11px] font-black uppercase tracking-widest
                         bg-gray-900 border border-white/5 shadow-[0_0_20px_rgba(255,255,255,0.12)] text-blue-400 hover:text-white transition-colors"
            >
              <Play size={12} /> Start Crawl
            </button>
          </div>
        )}

        {crawling && isEmpty && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <RefreshCw size={32} className="animate-spin text-blue-400" />
            <p className="text-[12px] font-black uppercase tracking-widest text-gray-400">
              Crawling Drive…
            </p>
            {status && status.crawledFiles > 0 && (
              <p className="text-[11px] text-gray-600">
                {status.crawledFiles.toLocaleString()} files indexed · {status.enrichedFiles.toLocaleString()} enriched
              </p>
            )}
          </div>
        )}

        {!isEmpty && (
          <React.Suspense fallback={
            <div className="absolute inset-0 flex items-center justify-center">
              <RefreshCw size={24} className="animate-spin text-blue-400" />
            </div>
          }>
            <ForceGraph3D
              graphData={graphData}
              width={dimensions.w}
              height={dimensions.h}
              backgroundColor="#030712"
              nodeLabel={(node) => (node as GraphNode).__kg?.summary ?? (node as GraphNode).name}
              nodeColor={(node) => (node as GraphNode).color}
              nodeVal={(node) => (node as GraphNode).val}
              linkColor={(link) => (link as GraphLink).color}
              linkWidth={(link) => (link as GraphLink).width}
              linkDirectionalParticles={0}
              onNodeClick={handleNodeClick}
              onNodeHover={handleNodeHover as (node: object | null, prev: object | null) => void}
              nodeResolution={8}
              enableNodeDrag
              enableNavigationControls
              showNavInfo={false}
            />
          </React.Suspense>
        )}

        {/* Hover tooltip */}
        {hovered && (
          <div
            className="absolute pointer-events-none z-50 max-w-[240px] bg-gray-900 border border-white/10 rounded-2xl px-3 py-2 shadow-xl"
            style={{ left: hovered.x + 12, top: hovered.y - 40 }}
          >
            <p className="text-[11px] font-black text-white truncate">{hovered.node.name}</p>
            {hovered.node.__kg.summary && (
              <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2">{hovered.node.__kg.summary}</p>
            )}
            {hovered.node.__kg.topicTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {hovered.node.__kg.topicTags.slice(0, 3).map((t) => (
                  <span key={t} className="px-1.5 py-0.5 rounded-[6px] bg-gray-800 text-[9px] text-gray-300">
                    {t}
                  </span>
                ))}
              </div>
            )}
            {hovered.node.__kg.webViewLink && (
              <div className="flex items-center gap-1 mt-1.5 text-[9px] text-blue-400">
                <ExternalLink size={9} />
                <span>Click to open</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

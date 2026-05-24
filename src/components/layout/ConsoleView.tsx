import { cn } from "@/lib/utils";
import { Terminal, ShieldAlert, ExternalLink, LayoutDashboard, Database, Globe, Key, Users, BarChart3, Bell, Settings, CreditCard, Shield, Cloud, Cpu, HardDrive, Activity } from "lucide-react";
import { openDriveFile } from "@/lib/tauri";

interface Props {
  type: "cloud" | "admin";
}

interface QuickLink {
  label: string;
  description: string;
  url: string;
  icon: React.ReactNode;
  accent: string;
}

const CLOUD_LINKS: QuickLink[] = [
  { label: "Dashboard",      description: "Project overview & health",     url: "https://console.cloud.google.com/home/dashboard",           icon: <LayoutDashboard className="w-4 h-4" />, accent: "text-blue-400" },
  { label: "IAM & Admin",    description: "Permissions & service accounts", url: "https://console.cloud.google.com/iam-admin/iam",            icon: <Key className="w-4 h-4" />,            accent: "text-yellow-400" },
  { label: "APIs & Services",description: "Enable & monitor APIs",          url: "https://console.cloud.google.com/apis/dashboard",           icon: <Globe className="w-4 h-4" />,           accent: "text-green-400" },
  { label: "Cloud Storage",  description: "Buckets & object storage",       url: "https://console.cloud.google.com/storage/browser",          icon: <HardDrive className="w-4 h-4" />,       accent: "text-purple-400" },
  { label: "Compute Engine", description: "VMs & instance groups",          url: "https://console.cloud.google.com/compute/instances",        icon: <Cpu className="w-4 h-4" />,             accent: "text-red-400" },
  { label: "Cloud Run",      description: "Serverless container apps",      url: "https://console.cloud.google.com/run",                      icon: <Cloud className="w-4 h-4" />,           accent: "text-cyan-400" },
  { label: "Pub / Sub",      description: "Messaging & event ingestion",    url: "https://console.cloud.google.com/cloudpubsub/subscriptions",icon: <Bell className="w-4 h-4" />,            accent: "text-orange-400" },
  { label: "SQL",            description: "Cloud SQL instances",            url: "https://console.cloud.google.com/sql/instances",            icon: <Database className="w-4 h-4" />,        accent: "text-indigo-400" },
  { label: "Monitoring",     description: "Metrics, alerts & dashboards",   url: "https://console.cloud.google.com/monitoring",               icon: <Activity className="w-4 h-4" />,        accent: "text-emerald-400" },
  { label: "Billing",        description: "Usage & budget management",      url: "https://console.cloud.google.com/billing",                  icon: <CreditCard className="w-4 h-4" />,      accent: "text-pink-400" },
];

const ADMIN_LINKS: QuickLink[] = [
  { label: "Dashboard",      description: "Workspace org overview",         url: "https://admin.google.com/ac/home",                          icon: <LayoutDashboard className="w-4 h-4" />, accent: "text-blue-400" },
  { label: "Users",          description: "Manage accounts & provisioning", url: "https://admin.google.com/ac/users",                         icon: <Users className="w-4 h-4" />,           accent: "text-green-400" },
  { label: "Groups",         description: "Distribution & security groups", url: "https://admin.google.com/ac/groups",                        icon: <Users className="w-4 h-4" />,           accent: "text-purple-400" },
  { label: "Security",       description: "2-step verification & alerts",   url: "https://admin.google.com/ac/security",                      icon: <Shield className="w-4 h-4" />,          accent: "text-red-400" },
  { label: "Apps",           description: "Workspace app management",       url: "https://admin.google.com/ac/apps/google",                   icon: <Settings className="w-4 h-4" />,        accent: "text-yellow-400" },
  { label: "Reports",        description: "Audit & usage analytics",        url: "https://admin.google.com/ac/reporting/report/user/accounts",icon: <BarChart3 className="w-4 h-4" />,       accent: "text-cyan-400" },
  { label: "Billing",        description: "Subscriptions & payments",       url: "https://admin.google.com/ac/billing/buy",                   icon: <CreditCard className="w-4 h-4" />,      accent: "text-pink-400" },
  { label: "Domains",        description: "Verified domains & DNS",         url: "https://admin.google.com/ac/domains/manage",                icon: <Globe className="w-4 h-4" />,           accent: "text-orange-400" },
  { label: "Devices",        description: "Mobile & endpoint management",   url: "https://admin.google.com/ac/devices",                       icon: <Cpu className="w-4 h-4" />,             accent: "text-indigo-400" },
  { label: "Directory",      description: "Org structure & shared contacts",url: "https://admin.google.com/ac/directory",                     icon: <Database className="w-4 h-4" />,        accent: "text-emerald-400" },
];

function LinkCard({ link }: { link: QuickLink }) {
  return (
    <button
      onClick={() => openDriveFile(link.url)}
      className="group flex items-center gap-4 px-5 py-4 rounded-2xl bg-gray-900/40 border border-white/5 hover:bg-gray-900 hover:border-white/10 hover:shadow-[0_0_20px_rgba(255,255,255,0.06)] transition-all duration-200 active:scale-[0.98] text-left w-full"
    >
      <div className={cn("flex-shrink-0", link.accent)}>
        {link.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-black text-white uppercase tracking-widest truncate group-hover:text-white transition-colors">
          {link.label}
        </p>
        <p className="text-[10px] text-gray-600 group-hover:text-gray-400 truncate transition-colors mt-0.5">
          {link.description}
        </p>
      </div>
      <ExternalLink className="w-3 h-3 text-gray-700 group-hover:text-gray-400 flex-shrink-0 transition-colors" />
    </button>
  );
}

export default function ConsoleView({ type }: Props) {
  const isCloud = type === "cloud";
  const links = isCloud ? CLOUD_LINKS : ADMIN_LINKS;
  const rootUrl = isCloud ? "https://console.cloud.google.com" : "https://admin.google.com";
  const title = isCloud ? "Google Cloud Platform" : "Workspace Administration";

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "var(--c-bg)" }}>
      {/* Header */}
      <div className="px-8 py-5 border-b border-white/5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className={cn(
            "w-11 h-11 rounded-[18px] flex items-center justify-center flex-shrink-0",
            isCloud
              ? "bg-blue-600 shadow-[0_0_20px_rgba(37,99,235,0.4)]"
              : "bg-gray-900 shadow-[0_0_20px_rgba(255,255,255,0.08)] border border-white/10"
          )}>
            {isCloud
              ? <Terminal className="w-5 h-5 text-white" />
              : <ShieldAlert className="w-5 h-5 text-white" />
            }
          </div>
          <div>
            <h2 className="text-[13px] font-black text-white uppercase tracking-tight">{title}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
              <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Quick Access</p>
            </div>
          </div>
        </div>

        <button
          onClick={() => openDriveFile(rootUrl)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 border border-white/5 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-[0_0_20px_rgba(255,255,255,0.05)] hover:shadow-[0_0_20px_rgba(255,255,255,0.12)] transition-all active:scale-95"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>Open Console</span>
        </button>
      </div>

      {/* Notice banner */}
      <div className="mx-8 mt-5 px-5 py-3.5 rounded-2xl bg-gray-900/60 border border-white/5 flex items-center gap-3 flex-shrink-0">
        <Shield className="w-4 h-4 text-yellow-400 flex-shrink-0" />
        <p className="text-[10px] text-gray-400 font-medium">
          Google blocks console embedding in external apps. Use the links below for direct access, or click <span className="text-white font-black">Open Console</span> to launch in your browser.
        </p>
      </div>

      {/* Quick links grid */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-8 py-5">
        <p className="text-[9px] font-black text-gray-600 uppercase tracking-[0.3em] mb-4">Quick Links</p>
        <div className="grid grid-cols-2 gap-2.5">
          {links.map((link) => (
            <LinkCard key={link.label} link={link} />
          ))}
        </div>
      </div>
    </div>
  );
}

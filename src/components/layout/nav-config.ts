import {
  LayoutDashboard,
  Briefcase,
  Database,
  ShieldAlert,
  CheckCircle,
  BookOpen,
  Search,
  Archive,
  Users,
  BarChart2,
  Settings,
  ListChecks,
  FileText,
  TrendingUp,
  Building2,
  Cpu,
  Network,
  ClipboardList,
  AlertOctagon,
  FolderOpen,
  Globe,
  ScanSearch,
  Activity,
  Wrench,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  badge?: number;
  /** Permission required to see and open this item. Omitted = visible to all. */
  permission?: string;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    label: "Overview",
    items: [
      { label: "Executive Posture", href: "/dashboard", icon: LayoutDashboard , permission: "cases:read:all" },
      { label: "My Work", href: "/my-work", icon: ListChecks },
    ],
  },
  {
    label: "Risk",
    items: [
      { label: "Quantum Risks", href: "/risks", icon: ShieldAlert , permission: "cases:read:all" },
      { label: "Business Services", href: "/business-services", icon: Briefcase , permission: "cases:read:all" },
      { label: "Information Assets", href: "/information-assets", icon: Database , permission: "cases:read:all" },
    ],
  },
  {
    label: "Compliance",
    items: [
      { label: "Compliance Posture", href: "/compliance", icon: CheckCircle , permission: "cases:read:all" },
      { label: "Frameworks", href: "/frameworks", icon: BookOpen , permission: "cases:read:all" },
      { label: "Controls", href: "/controls", icon: ListChecks , permission: "cases:read:all" },
      { label: "Control Tests", href: "/control-tests", icon: FileText , permission: "cases:read:all" },
    ],
  },
  {
    label: "Discovery",
    items: [
      { label: "Crypto Inventory", href: "/discovery/crypto-inventory", icon: Archive , permission: "discovery:read" },
      { label: "Observations", href: "/discovery/observations", icon: Search , permission: "observations:read" },
      { label: "Assessment Analysis", href: "/discovery/scan-jobs", icon: Cpu , permission: "discovery:read" },
      { label: "Quantum Assessments", href: "/discovery/assessments", icon: ScanSearch , permission: "discovery:read" },
    ],
  },
  {
    label: "Governance",
    items: [
      { label: "Actions", href: "/actions", icon: AlertOctagon , permission: "actions:read:all" },
      { label: "Remediation Center", href: "/remediation", icon: Wrench , permission: "cases:read:all" },
      { label: "Programmes", href: "/programmes", icon: TrendingUp , permission: "cases:read:all" },
      { label: "Evidence", href: "/evidence", icon: FileText , permission: "cases:read:all" },
    ],
  },
  {
    label: "Third Parties",
    items: [
      { label: "Suppliers", href: "/suppliers", icon: Building2 , permission: "cases:read:all" },
      { label: "Assessments", href: "/supplier-assessments", icon: ClipboardList , permission: "cases:read:all" },
    ],
  },
  {
    label: "Reporting",
    items: [
      { label: "Board Reporting", href: "/reporting/board", icon: BarChart2 , permission: "reporting:board" },
      { label: "Executive Reports", href: "/reporting/executive", icon: FileText , permission: "reporting:board" },
      { label: "Trends", href: "/reporting/trends", icon: TrendingUp , permission: "reporting:trends" },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Organisation", href: "/admin/organisation", icon: Building2 , permission: "admin:config" },
      { label: "Users", href: "/admin/users", icon: Users , permission: "admin:users" },
      { label: "Environment Health", href: "/admin/environment", icon: Activity , permission: "admin:config" },
    ],
  },
];

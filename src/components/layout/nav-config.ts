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
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    label: "Overview",
    items: [
      { label: "Executive Posture", href: "/dashboard", icon: LayoutDashboard },
      { label: "My Work", href: "/my-work", icon: ListChecks },
    ],
  },
  {
    label: "Risk",
    items: [
      { label: "Quantum Risks", href: "/risks", icon: ShieldAlert },
      { label: "Business Services", href: "/business-services", icon: Briefcase },
      { label: "Information Assets", href: "/information-assets", icon: Database },
    ],
  },
  {
    label: "Compliance",
    items: [
      { label: "Compliance Posture", href: "/compliance", icon: CheckCircle },
      { label: "Frameworks", href: "/frameworks", icon: BookOpen },
      { label: "Controls", href: "/controls", icon: ListChecks },
      { label: "Control Tests", href: "/control-tests", icon: FileText },
    ],
  },
  {
    label: "Discovery",
    items: [
      { label: "Crypto Inventory", href: "/discovery/crypto-inventory", icon: Archive },
      { label: "Observations", href: "/discovery/observations", icon: Search },
      { label: "Assessment Analysis", href: "/discovery/scan-jobs", icon: Cpu },
      { label: "Quantum Assessments", href: "/discovery/assessments", icon: ScanSearch },
    ],
  },
  {
    label: "Governance",
    items: [
      { label: "Actions", href: "/actions", icon: AlertOctagon },
      { label: "Programmes", href: "/programmes", icon: TrendingUp },
      { label: "Evidence", href: "/evidence", icon: FileText },
    ],
  },
  {
    label: "Third Parties",
    items: [
      { label: "Suppliers", href: "/suppliers", icon: Building2 },
      { label: "Assessments", href: "/supplier-assessments", icon: ClipboardList },
    ],
  },
  {
    label: "Reporting",
    items: [
      { label: "Board Reporting", href: "/reporting/board", icon: BarChart2 },
      { label: "Executive Reports", href: "/reporting/executive", icon: FileText },
      { label: "Trends", href: "/reporting/trends", icon: TrendingUp },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Organisation", href: "/admin/organisation", icon: Building2 },
      { label: "Users", href: "/admin/users", icon: Users },
      { label: "Environment Health", href: "/admin/environment", icon: Activity },
    ],
  },
];

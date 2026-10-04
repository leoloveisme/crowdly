import EditableText from "@/components/EditableText";
import { Badge } from "@/components/ui/badge";
import type { BugArea, BugFrequency, BugSeverity, SupportCategory, SupportStatus } from "@/lib/supportApi";

// English defaults for every enum value shown on /support. Each is rendered
// through EditableText as `support-<group>-<value>` so translators can
// localize them like any other static UI string.

export const STATUS_LABELS: Record<SupportStatus, string> = {
  new: "New",
  triaged: "Triaged",
  confirmed: "Confirmed",
  in_progress: "In progress",
  fixed: "Fixed",
  released: "Released",
  resolved: "Resolved",
  wont_fix: "Won't fix",
  duplicate: "Duplicate",
  closed: "Closed",
};

export const CATEGORY_LABELS: Record<SupportCategory, string> = {
  account: "Account & sign-in",
  stories: "Stories & content",
  desktop_app: "Desktop app",
  spaces_sync: "Spaces & sync",
  other: "Something else",
};

export const AREA_LABELS: Record<BugArea, string> = {
  web_platform: "Web platform",
  desktop_app: "Desktop app",
  web_editor: "Web editor",
  other: "Other",
};

export const SEVERITY_LABELS: Record<BugSeverity, string> = {
  blocker: "Blocks me",
  annoying: "Annoying",
  cosmetic: "Cosmetic",
};

export const FREQUENCY_LABELS: Record<BugFrequency, string> = {
  always: "Always",
  sometimes: "Sometimes",
  once: "Happened once",
};

export const StatusLabel = ({ status }: { status: SupportStatus }) => (
  <EditableText id={`support-status-${status}`}>{STATUS_LABELS[status]}</EditableText>
);
export const CategoryLabel = ({ category }: { category: SupportCategory }) => (
  <EditableText id={`support-category-${category}`}>{CATEGORY_LABELS[category]}</EditableText>
);
export const AreaLabel = ({ area }: { area: BugArea }) => (
  <EditableText id={`support-area-${area}`}>{AREA_LABELS[area]}</EditableText>
);
export const SeverityLabel = ({ severity }: { severity: BugSeverity }) => (
  <EditableText id={`support-severity-${severity}`}>{SEVERITY_LABELS[severity]}</EditableText>
);
export const FrequencyLabel = ({ frequency }: { frequency: BugFrequency }) => (
  <EditableText id={`support-frequency-${frequency}`}>{FREQUENCY_LABELS[frequency]}</EditableText>
);

const STATUS_TONE: Partial<Record<SupportStatus, string>> = {
  new: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200",
  in_progress: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  fixed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  released: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  resolved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
};

export const StatusBadge = ({ status }: { status: SupportStatus }) => (
  <Badge variant="secondary" className={STATUS_TONE[status] ?? ""}>
    <StatusLabel status={status} />
  </Badge>
);

const SEVERITY_TONE: Record<BugSeverity, string> = {
  blocker: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  annoying: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  cosmetic: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
};

export const SeverityBadge = ({ severity }: { severity: BugSeverity }) => (
  <Badge variant="secondary" className={SEVERITY_TONE[severity]}>
    <SeverityLabel severity={severity} />
  </Badge>
);

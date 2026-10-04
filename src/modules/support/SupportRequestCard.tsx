import { useState } from "react";
import EditableText from "@/components/EditableText";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bug, ChevronDown, LifeBuoy, Loader2, Monitor } from "lucide-react";
import {
  BUG_STATUSES,
  REQUEST_STATUSES,
  attachmentUrl,
  type SupportRequest,
  type SupportStatus,
} from "@/lib/supportApi";
import { AreaLabel, CategoryLabel, FrequencyLabel, StatusBadge, StatusLabel, SeverityBadge } from "./labels";

interface Props {
  request: SupportRequest;
  /** Staff view: reporter details, technical info and the status control. */
  staff?: boolean;
  onStatusChange?: (status: SupportStatus, duplicateOf?: string) => Promise<void>;
}

const SupportRequestCard = ({ request, staff = false, onStatusChange }: Props) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingDuplicate, setPendingDuplicate] = useState(false);
  const [duplicateOf, setDuplicateOf] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);

  const isBug = request.kind === "bug";
  const d = request.details ?? {};
  const statuses = isBug ? BUG_STATUSES : REQUEST_STATUSES;
  const statusOptions = statuses.includes(request.status) ? statuses : [request.status, ...statuses];

  const changeStatus = async (status: SupportStatus, original?: string) => {
    if (!onStatusChange) return;
    setSaving(true);
    try {
      await onStatusChange(status, original);
      setPendingDuplicate(false);
      setDuplicateOf("");
    } finally {
      setSaving(false);
    }
  };

  const onSelectStatus = (value: string) => {
    if (value === "duplicate") {
      setPendingDuplicate(true);
      return;
    }
    setPendingDuplicate(false);
    changeStatus(value as SupportStatus);
  };

  return (
    <div className="rounded-xl border border-indigo-100 dark:border-indigo-800/60 bg-white/80 dark:bg-indigo-950/30 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="mt-0.5 text-indigo-500">
          {isBug ? <Bug className="h-5 w-5" /> : <LifeBuoy className="h-5 w-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 text-left font-semibold hover:underline">
            <span className="break-words">{request.subject}</span>
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <StatusBadge status={request.status} />
            {isBug && d.severity && <SeverityBadge severity={d.severity} />}
            {isBug && d.area ? (
              <Badge variant="outline"><AreaLabel area={d.area} /></Badge>
            ) : (
              !isBug && <Badge variant="outline"><CategoryLabel category={request.category} /></Badge>
            )}
            {request.source === "desktop" && (
              <Badge variant="outline" className="gap-1"><Monitor className="h-3 w-3" /> desktop</Badge>
            )}
            <span>{new Date(request.created_at).toLocaleString()}</span>
            {staff && <span>· {request.name ? `${request.name} ` : ""}&lt;{request.email}&gt;</span>}
          </div>
        </div>

        {staff && onStatusChange && (
          <div className="flex items-center gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <Select value={pendingDuplicate ? "duplicate" : request.status} onValueChange={onSelectStatus} disabled={saving}>
              <SelectTrigger className="h-8 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    <StatusLabel status={s} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {pendingDuplicate && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            value={duplicateOf}
            onChange={(e) => setDuplicateOf(e.target.value.trim())}
            placeholder="ID of the original report"
            className="h-8 max-w-xs font-mono text-xs"
          />
          <Button size="sm" disabled={!duplicateOf || saving} onClick={() => changeStatus("duplicate", duplicateOf)}>
            <EditableText id="support-dashboard-mark-duplicate">Mark as duplicate</EditableText>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPendingDuplicate(false)}>
            <EditableText id="support-dashboard-cancel">Cancel</EditableText>
          </Button>
        </div>
      )}

      {open && (
        <div className="mt-4 space-y-3 text-sm">
          {request.status === "duplicate" && request.duplicate_of && (
            <p className="text-xs text-muted-foreground">
              <EditableText id="support-card-duplicate-of">Duplicate of</EditableText>{" "}
              <code className="font-mono">{request.duplicate_of}</code>
            </p>
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {isBug ? (
                <EditableText id="support-card-steps">Steps to reproduce</EditableText>
              ) : (
                <EditableText id="support-card-message">Message</EditableText>
              )}
            </p>
            <p className="whitespace-pre-wrap break-words">{request.message}</p>
          </div>
          {isBug && d.expected && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <EditableText id="support-card-expected">Expected</EditableText>
              </p>
              <p className="whitespace-pre-wrap break-words">{d.expected}</p>
            </div>
          )}
          {isBug && d.actual && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <EditableText id="support-card-actual">Actual</EditableText>
              </p>
              <p className="whitespace-pre-wrap break-words">{d.actual}</p>
            </div>
          )}
          {isBug && d.frequency && (
            <p className="text-xs text-muted-foreground">
              <EditableText id="support-card-frequency">Frequency:</EditableText> <FrequencyLabel frequency={d.frequency} />
            </p>
          )}
          {request.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {request.attachments.map((a) => {
                const url = attachmentUrl(request.id, a.id);
                return (
                  <button key={a.id} type="button" onClick={() => setLightbox(url)} className="h-20 w-28 overflow-hidden rounded-md border">
                    <img src={url} alt={a.original_name} className="h-full w-full object-cover" loading="lazy" />
                  </button>
                );
              })}
            </div>
          )}
          {staff && d.tech && Object.keys(d.tech).length > 0 && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded bg-muted p-3 text-xs">
              {Object.entries(d.tech).map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="font-medium text-muted-foreground">{key}</dt>
                  <dd className="break-all">{String(value)}</dd>
                </div>
              ))}
            </dl>
          )}
          {staff && d.consoleErrors && d.consoleErrors.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <EditableText id="support-card-console">Console errors</EditableText>
              </p>
              <pre className="max-h-48 overflow-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap break-all">
                {d.consoleErrors.join("\n")}
              </pre>
            </div>
          )}
          {staff && <p className="font-mono text-[11px] text-muted-foreground">ID: {request.id}</p>}
        </div>
      )}

      <Dialog open={lightbox !== null} onOpenChange={(v) => !v && setLightbox(null)}>
        <DialogContent className="max-w-4xl p-2">
          <DialogTitle className="sr-only">Screenshot</DialogTitle>
          {lightbox && <img src={lightbox} alt="" className="max-h-[80vh] w-full object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SupportRequestCard;

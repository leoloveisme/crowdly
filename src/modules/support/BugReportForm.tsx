import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import EditableText from "@/components/EditableText";
import CaptchaField, { useCaptcha } from "@/components/CaptchaField";
import { useAuth } from "@/contexts/AuthContext";
import { useEditableContent } from "@/contexts/EditableContentContext";
import { useToast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bug, CheckCircle2, ChevronDown, ImagePlus, Loader2, X } from "lucide-react";
import { getRecentErrors } from "@/lib/errorBuffer";
import {
  BUG_AREAS,
  BUG_FREQUENCIES,
  BUG_SEVERITIES,
  submitSupportRequest,
  type BugArea,
  type BugFrequency,
  type BugSeverity,
} from "@/lib/supportApi";
import { AreaLabel, FrequencyLabel, SeverityLabel } from "./labels";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INPUT_CLASS = "border-indigo-100 dark:border-indigo-800/60 focus-visible:ring-indigo-400";
const LABEL_CLASS = "text-indigo-800 dark:text-indigo-100";
const MAX_FILES = 3;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

interface Props {
  onSubmitted?: () => void;
}

const BugReportForm = ({ onSubmitted }: Props) => {
  const { user } = useAuth();
  const { currentLanguage } = useEditableContent();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const captcha = useCaptcha(!user);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ?from=<path> (header menu), or ?from=desktop&app_version=…&os=… (desktop app, signed out).
  const from = searchParams.get("from") ?? "";
  const fromDesktop = from === "desktop";

  const [name, setName] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [subject, setSubject] = useState("");
  const [area, setArea] = useState<BugArea>(fromDesktop ? "desktop_app" : "web_platform");
  const [steps, setSteps] = useState("");
  const [expected, setExpected] = useState("");
  const [actual, setActual] = useState("");
  const [severity, setSeverity] = useState<BugSeverity>("annoying");
  const [frequency, setFrequency] = useState<BugFrequency>("always");
  const [files, setFiles] = useState<File[]>([]);
  const [includeErrors, setIncludeErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const recentErrors = useMemo(() => getRecentErrors(), []);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  const tech = useMemo(() => {
    const info: Record<string, string> = {};
    if (fromDesktop) {
      info.source = "desktop app (signed out)";
      const appVersion = searchParams.get("app_version");
      const os = searchParams.get("os");
      if (appVersion) info.appVersion = appVersion.slice(0, 100);
      if (os) info.os = os.slice(0, 200);
    } else {
      const page = from.startsWith("/") ? `${window.location.origin}${from}` : document.referrer;
      if (page) info.pageUrl = page.slice(0, 500);
    }
    info.userAgent = navigator.userAgent;
    info.viewport = `${window.innerWidth}×${window.innerHeight}`;
    info.language = currentLanguage;
    info.theme = document.documentElement.classList.contains("dark") ? "dark" : "light";
    info.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    info.buildVersion = String(import.meta.env.VITE_APP_VERSION ?? "dev");
    return info;
  }, [from, fromDesktop, searchParams, currentLanguage]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    const rejected = incoming.filter((f) => !ALLOWED_TYPES.includes(f.type) || f.size > MAX_FILE_BYTES);
    if (rejected.length > 0) {
      toast({ variant: "destructive", description: "Screenshots must be PNG, JPEG, WEBP or GIF images of up to 10 MB." });
    }
    const accepted = incoming.filter((f) => !rejected.includes(f));
    setFiles((prev) => {
      const next = [...prev, ...accepted];
      if (next.length > MAX_FILES) {
        toast({ variant: "destructive", description: "You can attach up to 3 screenshots." });
      }
      return next.slice(0, MAX_FILES);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const reset = () => {
    setSubject("");
    setSteps("");
    setExpected("");
    setActual("");
    setFiles([]);
    setIncludeErrors(false);
    setSubmitted(false);
    if (!user) captcha.reload();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (subject.trim().length === 0 || steps.trim().length === 0) {
      toast({ variant: "destructive", description: "Please add a title and the steps to reproduce the bug." });
      return;
    }
    if (!EMAIL_RE.test(email)) {
      toast({ variant: "destructive", description: "Please enter a valid email address." });
      return;
    }
    if (!user && (!captcha.captchaId || captcha.answer.trim().length === 0)) {
      toast({ variant: "destructive", description: "Please enter the code shown in the CAPTCHA image." });
      return;
    }

    setSubmitting(true);
    try {
      await submitSupportRequest({
        kind: "bug",
        name,
        email,
        category: area === "desktop_app" ? "desktop_app" : "other",
        subject,
        message: steps,
        details: {
          area,
          expected: expected.trim(),
          actual: actual.trim(),
          severity,
          frequency,
          tech,
          ...(includeErrors && recentErrors.length > 0 ? { consoleErrors: recentErrors } : {}),
        },
        captchaId: captcha.captchaId,
        captchaAnswer: captcha.answer,
        attachments: files,
      });
      setSubmitted(true);
      onSubmitted?.();
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Could not submit right now. Please try again.",
      });
      if (!user) captcha.reload();
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center text-center py-8 gap-3">
        <CheckCircle2 className="h-10 w-10 text-emerald-500" />
        <EditableText id="support-bug-thanks-title" as="p" className="text-lg font-semibold">
          Thanks for reporting this bug!
        </EditableText>
        <EditableText id="support-bug-thanks-desc" as="p" className="text-muted-foreground max-w-md">
          Our team will look into it. We'll let you know when its status changes.
        </EditableText>
        <Button variant="outline" onClick={reset}>
          <EditableText id="support-bug-another">Report another bug</EditableText>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="support-bug-name" className={LABEL_CLASS}>
            <EditableText id="support-form-name-label">Name</EditableText>
          </Label>
          <Input id="support-bug-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className={INPUT_CLASS} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="support-bug-email" className={LABEL_CLASS}>
            <EditableText id="support-form-email-label">Email</EditableText>
          </Label>
          <Input id="support-bug-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email" className={INPUT_CLASS} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="support-bug-title" className={LABEL_CLASS}>
          <EditableText id="support-bug-title-label">What went wrong?</EditableText>
        </Label>
        <Input id="support-bug-title" required maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Chapter disappears after saving" className={INPUT_CLASS} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="support-bug-area" className={LABEL_CLASS}>
          <EditableText id="support-bug-area-label">Where did it happen?</EditableText>
        </Label>
        <Select value={area} onValueChange={(v) => setArea(v as BugArea)}>
          <SelectTrigger id="support-bug-area" className={INPUT_CLASS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BUG_AREAS.map((a) => (
              <SelectItem key={a} value={a}>
                <AreaLabel area={a} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="support-bug-steps" className={LABEL_CLASS}>
          <EditableText id="support-bug-steps-label">Steps to reproduce</EditableText>
        </Label>
        <Textarea
          id="support-bug-steps"
          required
          rows={5}
          maxLength={5000}
          value={steps}
          onChange={(e) => setSteps(e.target.value)}
          placeholder={"1. Open a story\n2. Click …\n3. …"}
          className={INPUT_CLASS}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="support-bug-expected" className={LABEL_CLASS}>
            <EditableText id="support-bug-expected-label">What did you expect to happen?</EditableText>
          </Label>
          <Textarea id="support-bug-expected" rows={3} maxLength={2000} value={expected} onChange={(e) => setExpected(e.target.value)} className={INPUT_CLASS} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="support-bug-actual" className={LABEL_CLASS}>
            <EditableText id="support-bug-actual-label">What happened instead?</EditableText>
          </Label>
          <Textarea id="support-bug-actual" rows={3} maxLength={2000} value={actual} onChange={(e) => setActual(e.target.value)} className={INPUT_CLASS} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="space-y-2">
          <legend className={`text-sm font-medium mb-2 ${LABEL_CLASS}`}>
            <EditableText id="support-bug-severity-label">How bad is it?</EditableText>
          </legend>
          <RadioGroup value={severity} onValueChange={(v) => setSeverity(v as BugSeverity)}>
            {BUG_SEVERITIES.map((s) => (
              <div key={s} className="flex items-center gap-2">
                <RadioGroupItem value={s} id={`support-bug-severity-${s}`} />
                <Label htmlFor={`support-bug-severity-${s}`} className="font-normal">
                  <SeverityLabel severity={s} />
                </Label>
              </div>
            ))}
          </RadioGroup>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className={`text-sm font-medium mb-2 ${LABEL_CLASS}`}>
            <EditableText id="support-bug-frequency-label">How often does it happen?</EditableText>
          </legend>
          <RadioGroup value={frequency} onValueChange={(v) => setFrequency(v as BugFrequency)}>
            {BUG_FREQUENCIES.map((f) => (
              <div key={f} className="flex items-center gap-2">
                <RadioGroupItem value={f} id={`support-bug-frequency-${f}`} />
                <Label htmlFor={`support-bug-frequency-${f}`} className="font-normal">
                  <FrequencyLabel frequency={f} />
                </Label>
              </div>
            ))}
          </RadioGroup>
        </fieldset>
      </div>

      <div className="space-y-2">
        <span className={`text-sm font-medium ${LABEL_CLASS}`}>
          <EditableText id="support-bug-screenshots-label">Screenshots (optional, up to 3)</EditableText>
        </span>
        <div className="flex flex-wrap gap-3">
          {files.map((file, i) => (
            <div key={`${file.name}-${i}`} className="relative h-20 w-28 rounded-md overflow-hidden border border-indigo-100 dark:border-indigo-800/60">
              <img src={previews[i]} alt={file.name} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                aria-label={`Remove ${file.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {files.length < MAX_FILES && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-20 w-28 rounded-md border-2 border-dashed border-indigo-200 dark:border-indigo-700 flex flex-col items-center justify-center gap-1 text-xs text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
            >
              <ImagePlus className="h-5 w-5" />
              <EditableText id="support-bug-add-screenshot">Add image</EditableText>
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_TYPES.join(",")}
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      <div className="space-y-2 rounded-md border border-indigo-100 dark:border-indigo-800/60 p-3">
        <div className="flex items-start gap-2">
          <Checkbox
            id="support-bug-include-errors"
            checked={includeErrors}
            onCheckedChange={(v) => setIncludeErrors(v === true)}
            disabled={recentErrors.length === 0}
          />
          <Label htmlFor="support-bug-include-errors" className="font-normal leading-snug">
            <EditableText id="support-bug-include-errors-label">Include recent console errors from this browser tab</EditableText>
            {recentErrors.length === 0 && (
              <span className="block text-xs text-muted-foreground mt-1">
                <EditableText id="support-bug-no-errors">No errors have been recorded in this tab.</EditableText>
              </span>
            )}
          </Label>
        </div>
        {includeErrors && recentErrors.length > 0 && (
          <pre className="max-h-40 overflow-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap break-all">
            {recentErrors.join("\n")}
          </pre>
        )}
      </div>

      <Collapsible>
        <CollapsibleTrigger className="group flex items-center gap-1 text-sm text-indigo-700 dark:text-indigo-300 hover:underline">
          <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
          <EditableText id="support-bug-tech-toggle">Technical details sent with this report</EditableText>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded bg-muted p-3 text-xs">
            {Object.entries(tech).map(([key, value]) => (
              <React.Fragment key={key}>
                <dt className="font-medium text-muted-foreground">{key}</dt>
                <dd className="break-all">{value}</dd>
              </React.Fragment>
            ))}
          </dl>
        </CollapsibleContent>
      </Collapsible>

      <CaptchaField captcha={captcha} inputId="support-bug-captcha" textPrefix="support" />

      <Button
        type="submit"
        className="w-full bg-gradient-to-r from-indigo-600 to-pink-600 hover:from-indigo-700 hover:to-pink-700 text-white shadow-md"
        disabled={submitting}
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            <EditableText id="support-form-sending">Sending…</EditableText>
          </>
        ) : (
          <>
            <Bug className="mr-2 h-4 w-4" />
            <EditableText id="support-bug-submit">Submit bug report</EditableText>
          </>
        )}
      </Button>
    </form>
  );
};

export default BugReportForm;

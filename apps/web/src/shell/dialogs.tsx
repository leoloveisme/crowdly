import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import EditableText from "@/components/EditableText";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { submitSupportRequest } from "@/lib/supportApi";
import { getRecentErrors } from "@/lib/errorBuffer";
import { createComic, createScreenplay, createStory, parseWorkRef, resolveWorkKind } from "@web/lib/docs";
import { useWorkspace } from "./workspace";
import { platformLink } from "@web/lib/api";

// ---------------------------------------------------------------------------
// Sign in (one Crowdly session shared with the platform).
// ---------------------------------------------------------------------------
export const LoginDialog: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void }> = ({ open, onOpenChange }) => {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setBusy(true);
    try {
      await signIn(email, password);
      onOpenChange(false);
      setPassword("");
    } catch {
      /* AuthContext already showed a toast */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            <EditableText id="webapp-login-title">Log in to Crowdly</EditableText>
          </DialogTitle>
          <DialogDescription>
            <EditableText id="webapp-login-desc">One account for the platform, the desktop app and the web app.</EditableText>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="wa-email">
              <EditableText id="webapp-login-email">Email</EditableText>
            </Label>
            <Input id="wa-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="wa-password">
              <EditableText id="webapp-login-password">Password</EditableText>
            </Label>
            <Input id="wa-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <a className="text-sm underline self-center" href={platformLink("/register")} target="_blank" rel="noreferrer">
              <EditableText id="webapp-login-register">Create an account</EditableText>
            </a>
            <Button type="submit" disabled={busy}>
              <EditableText id="webapp-login-submit">Log in</EditableText>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// New story / screenplay / comic.
// ---------------------------------------------------------------------------
export type NewKind = "story" | "screenplay" | "comic";

export const NewDocumentDialog: React.FC<{
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialKind?: NewKind;
  spaceId?: string | null;
}> = ({ open, onOpenChange, initialKind = "story", spaceId }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [kind, setKind] = useState<NewKind>(initialKind);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (open) {
      setKind(initialKind);
      setTitle("");
    }
  }, [open, initialKind]);

  const create = async () => {
    if (!user) return;
    setBusy(true);
    try {
      if (kind === "story") {
        const r = await createStory(user.id, title, { spaceId });
        navigate(`/story/${r.storyTitleId}`);
      } else if (kind === "screenplay") {
        const r = await createScreenplay(title);
        navigate(`/screenplay/${r.screenplayId}`);
      } else {
        const r = await createComic(title);
        navigate(`/comic/${r.comicId}`);
      }
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Couldn't create it", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <EditableText id="webapp-new-title">What kind of story?</EditableText>
          </DialogTitle>
        </DialogHeader>
        {!user ? (
          <p className="text-sm text-muted-foreground">
            <EditableText id="webapp-new-login-needed">Log in to create stories.</EditableText>
          </p>
        ) : (
          <div className="space-y-4">
            <RadioGroup value={kind} onValueChange={(v) => setKind(v as NewKind)} className="grid grid-cols-3 gap-2">
              {(
                [
                  ["story", "webapp-new-kind-story", "Novel story"],
                  ["screenplay", "webapp-new-kind-screenplay", "Screenplay"],
                  ["comic", "webapp-new-kind-comic", "Comic / manga"],
                ] as const
              ).map(([value, id, label]) => (
                <Label
                  key={value}
                  htmlFor={`wa-kind-${value}`}
                  className={`flex cursor-pointer flex-col items-center gap-2 rounded-md border p-3 text-center ${kind === value ? "border-primary bg-primary/5" : ""}`}
                >
                  <RadioGroupItem id={`wa-kind-${value}`} value={value} className="sr-only" />
                  <EditableText id={id}>{label}</EditableText>
                </Label>
              ))}
            </RadioGroup>
            <div className="space-y-1">
              <Label htmlFor="wa-new-name">
                <EditableText id="webapp-new-name">Title</EditableText>
              </Label>
              <Input id="wa-new-name" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} autoFocus />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button onClick={create} disabled={busy || !user}>
            <EditableText id="webapp-new-create">Create</EditableText>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// Open a story on the web (by URL or id) — desktop "Open → Story on the web".
// ---------------------------------------------------------------------------
export const OpenWorkDialog: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void; newWindow?: boolean }> = ({
  open,
  onOpenChange,
  newWindow,
}) => {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const go = async () => {
    const ref = parseWorkRef(value);
    if (!ref) {
      toast({ title: "That doesn't look like a Crowdly link or id", variant: "destructive" });
      return;
    }
    setBusy(true);
    const kind = ref.kind ?? (await resolveWorkKind(ref.id));
    setBusy(false);
    if (!kind) {
      toast({ title: "Nothing found with that id", variant: "destructive" });
      return;
    }
    const path = `/${kind}/${ref.id}`;
    if (newWindow) window.open(`${import.meta.env.BASE_URL.replace(/\/$/, "")}${path}`, "_blank");
    else navigate(path);
    onOpenChange(false);
    setValue("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <EditableText id="webapp-open-title">Open a story from Crowdly</EditableText>
          </DialogTitle>
          <DialogDescription>
            <EditableText id="webapp-open-desc">Paste a link to a story, screenplay or comic, or its id.</EditableText>
          </DialogDescription>
        </DialogHeader>
        <Input value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} autoFocus placeholder="https://crowdly.cloud/story/…" />
        <DialogFooter>
          <Button onClick={go} disabled={busy || !value.trim()}>
            <EditableText id="webapp-open-go">Open</EditableText>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// Help → Report a bug (same support-requests pipeline as the platform and
// the desktop app; area is preset to the web app).
// ---------------------------------------------------------------------------
export const ReportBugDialog: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void }> = ({ open, onOpenChange }) => {
  const { user } = useAuth();
  const [subject, setSubject] = useState("");
  const [expected, setExpected] = useState("");
  const [actual, setActual] = useState("");
  const [busy, setBusy] = useState(false);

  // Signed out: the platform's /support form handles guests (captcha).
  React.useEffect(() => {
    if (open && !user) {
      window.open(platformLink("/support"), "_blank");
      onOpenChange(false);
    }
  }, [open, user, onOpenChange]);

  const send = async () => {
    if (!user || !subject.trim()) return;
    setBusy(true);
    try {
      await submitSupportRequest({
        kind: "bug",
        name: user.email,
        email: user.email,
        category: "other",
        subject: subject.trim(),
        message: actual.trim() || subject.trim(),
        details: {
          area: "web_editor",
          expected,
          actual,
          consoleErrors: getRecentErrors(),
          tech: { userAgent: navigator.userAgent, url: window.location.href, app: "web-app" },
        },
      });
      toast({ title: "Thanks — the bug report was sent" });
      onOpenChange(false);
      setSubject("");
      setExpected("");
      setActual("");
    } catch (err) {
      toast({ title: "Couldn't send the report", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open && !!user} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <EditableText id="webapp-bug-title">Report a bug</EditableText>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>
              <EditableText id="webapp-bug-subject">What went wrong?</EditableText>
            </Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>
              <EditableText id="webapp-bug-expected">What did you expect to happen?</EditableText>
            </Label>
            <Textarea value={expected} onChange={(e) => setExpected(e.target.value)} rows={3} />
          </div>
          <div className="space-y-1">
            <Label>
              <EditableText id="webapp-bug-actual">What happened instead?</EditableText>
            </Label>
            <Textarea value={actual} onChange={(e) => setActual(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={send} disabled={busy || !subject.trim()}>
            <EditableText id="webapp-bug-send">Send</EditableText>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// View → Show windows: the open tabs, to jump between them.
// ---------------------------------------------------------------------------
export const ShowTabsDialog: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void }> = ({ open, onOpenChange }) => {
  const { tabs } = useWorkspace();
  const navigate = useNavigate();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <EditableText id="webapp-tabs-title">Open documents</EditableText>
          </DialogTitle>
        </DialogHeader>
        <ul className="max-h-80 space-y-1 overflow-auto">
          {tabs.length === 0 && (
            <li className="text-sm text-muted-foreground">
              <EditableText id="webapp-tabs-empty">Nothing is open.</EditableText>
            </li>
          )}
          {tabs.map((t) => (
            <li key={t.path}>
              <button
                className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => {
                  navigate(t.path);
                  onOpenChange(false);
                }}
              >
                {t.title}
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
};

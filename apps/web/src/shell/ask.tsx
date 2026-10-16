import React, { useEffect, useRef, useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";

// In-app replacements for window.prompt / window.confirm (which look out of
// place, misbehave in installed PWAs and block the page). Call askText() /
// askConfirm() anywhere; <AskHost/> (mounted once in App) renders them.

type Request =
  | { kind: "text"; title: string; initial: string; resolve: (v: string | null) => void }
  | { kind: "confirm"; title: string; danger: boolean; resolve: (v: boolean) => void };

let push: ((r: Request) => void) | null = null;

export function askText(title: string, initial = ""): Promise<string | null> {
  return new Promise((resolve) => (push ? push({ kind: "text", title, initial, resolve }) : resolve(window.prompt(title, initial))));
}

export function askConfirm(title: string, danger = true): Promise<boolean> {
  return new Promise((resolve) => (push ? push({ kind: "confirm", title, danger, resolve }) : resolve(window.confirm(title))));
}

export const AskHost: React.FC = () => {
  const [req, setReq] = useState<Request | null>(null);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    push = (r) => {
      setReq(r);
      if (r.kind === "text") setValue(r.initial);
    };
    return () => {
      push = null;
    };
  }, []);

  const close = (ok: boolean) => {
    if (!req) return;
    if (req.kind === "text") req.resolve(ok ? value : null);
    else req.resolve(ok);
    setReq(null);
  };

  return (
    <AlertDialog open={!!req} onOpenChange={(o) => !o && close(false)}>
      <AlertDialogContent onOpenAutoFocus={(e) => {
        if (req?.kind === "text") {
          e.preventDefault();
          setTimeout(() => inputRef.current?.select(), 0);
        }
      }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{req?.title}</AlertDialogTitle>
          {req?.kind === "text" && (
            <AlertDialogDescription asChild>
              <div>
                <Input ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && close(true)} />
              </div>
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => close(true)}
            className={req?.kind === "confirm" && req.danger ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
          >
            OK
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

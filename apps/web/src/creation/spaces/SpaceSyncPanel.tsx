import React, { useCallback, useEffect, useState } from "react";
import EditableText from "@/components/EditableText";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Github, HardDrive, RefreshCw, Folder, ChevronRight } from "lucide-react";
import { api, get, post, qs } from "@web/lib/api";
import { platformLink } from "@web/lib/api";

// Space ⇄ GitHub and Space ⇄ Google Drive (desktop: Settings → Connect /
// Synchronisation with; backend: githubSync.js, googleDriveSync.js).
// Connecting an account (GitHub App install / Google OAuth) returns to the
// platform's Space page, so first-time connection starts there; everything
// after that — repo / folder choice, on/off, sync now, log, disconnect —
// happens here.

interface GithubStatus {
  configured: boolean;
  connected: boolean;
  enabled: boolean;
  repo?: string | null;
  branch?: string | null;
  lastSyncedAt?: string | null;
  installUrl?: string | null;
  existingInstallationId?: string | number | null;
  existingInstallationAccount?: string | null;
}
interface DriveStatus {
  configured: boolean;
  connected: boolean;
  enabled: boolean;
  folderName?: string | null;
  lastSyncedAt?: string | null;
  hasGoogleAccount?: boolean;
  googleEmail?: string | null;
  authUrl?: string | null;
  recentLog?: { created_at: string; action?: string; detail?: string; path?: string; message?: string }[];
}

const when = (d?: string | null) => (d ? new Date(d).toLocaleString() : "—");

export const SpaceSyncPanel: React.FC<{ spaceId: string }> = ({ spaceId }) => {
  const { user } = useAuth();
  const [gh, setGh] = useState<GithubStatus | null>(null);
  const [drive, setDrive] = useState<DriveStatus | null>(null);
  const [repos, setRepos] = useState<{ fullName: string }[] | null>(null);
  const [trail, setTrail] = useState<{ id: string; name: string }[]>([{ id: "root", name: "My Drive" }]);
  const [folders, setFolders] = useState<{ id: string; name: string }[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!user) return;
    get<GithubStatus>(`/creative-spaces/${spaceId}/github-sync/status${qs({ userId: user.id })}`).then(setGh).catch(() => setGh(null));
    get<DriveStatus>(`/creative-spaces/${spaceId}/drive-sync/status`).then(setDrive).catch(() => setDrive(null));
  }, [spaceId, user]);
  useEffect(load, [load]);

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      load();
    } catch (err) {
      toast({ title: "That didn't work", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const openFolder = async (f: { id: string; name: string }, i?: number) => {
    const next = i === undefined ? [...trail, f] : trail.slice(0, i + 1);
    setTrail(next);
    setFolders(null);
    const r = await get<{ folders: { id: string; name: string }[] }>(`/creative-spaces/${spaceId}/drive-sync/folders${qs({ parentId: next[next.length - 1].id })}`).catch(() => ({ folders: [] }));
    setFolders(r.folders);
  };

  if (!user) return null;

  return (
    <section className="space-y-4 rounded-md border p-4">
      <EditableText id="webapp-sync-title" as="h2" className="text-lg font-medium">
        Synchronisation
      </EditableText>

      {/* GitHub */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 font-medium">
          <Github className="h-4 w-4" />
          <EditableText id="webapp-sync-github">GitHub</EditableText>
        </div>
        {!gh?.configured ? (
          <EditableText id="webapp-sync-github-off" as="p" className="text-sm text-muted-foreground">
            GitHub sync isn't set up on this server.
          </EditableText>
        ) : gh.connected ? (
          <div className="space-y-2 text-sm">
            <p>
              {gh.repo} <span className="text-muted-foreground">({gh.branch})</span> · <EditableText id="webapp-sync-last">last synced</EditableText> {when(gh.lastSyncedAt)}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2">
                <Switch checked={gh.enabled} onCheckedChange={(enabled) => act("gh-toggle", () => api(`/creative-spaces/${spaceId}/github-sync`, { method: "PATCH", body: { userId: user.id, enabled } }))} />
                <EditableText id="webapp-sync-on">Sync on</EditableText>
              </label>
              <Button size="sm" variant="outline" className="gap-1" disabled={busy === "gh-run"} onClick={() => act("gh-run", () => post(`/creative-spaces/${spaceId}/github-sync/run`, { userId: user.id }))}>
                <RefreshCw className={`h-4 w-4 ${busy === "gh-run" ? "animate-spin" : ""}`} />
                <EditableText id="webapp-sync-now">Sync now</EditableText>
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => act("gh-off", () => post(`/creative-spaces/${spaceId}/github-sync/disconnect`, { userId: user.id }))}>
                <EditableText id="webapp-sync-disconnect">Disconnect</EditableText>
              </Button>
            </div>
          </div>
        ) : gh.existingInstallationId ? (
          <div className="space-y-2 text-sm">
            <p>
              <EditableText id="webapp-sync-github-pick">Choose a repository from</EditableText> {gh.existingInstallationAccount ?? "GitHub"}:
            </p>
            {repos === null ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  get<{ repositories: { fullName: string }[] }>(`/creative-spaces/${spaceId}/github-sync/installation-repos${qs({ installationId: String(gh.existingInstallationId), userId: user.id })}`)
                    .then((r) => setRepos(r.repositories ?? []))
                    .catch((e) => toast({ title: (e as Error).message, variant: "destructive" }))
                }
              >
                <EditableText id="webapp-sync-github-list">Show repositories</EditableText>
              </Button>
            ) : (
              <ul className="max-h-48 overflow-auto rounded border">
                {repos.map((r) => (
                  <li key={r.fullName}>
                    <button
                      className="w-full px-2 py-1.5 text-left hover:bg-muted"
                      onClick={() => act("gh-connect", () => post(`/creative-spaces/${spaceId}/github-sync/connect`, { userId: user.id, installationId: gh.existingInstallationId, repo: r.fullName }))}
                    >
                      {r.fullName}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <a href={gh.installUrl ?? platformLink(`/creative_space/${spaceId}`)} className="text-sm underline">
            <EditableText id="webapp-sync-github-connect">Connect a GitHub repository</EditableText>
          </a>
        )}
      </div>

      {/* Google Drive */}
      <div className="space-y-2 border-t pt-3">
        <div className="flex items-center gap-2 font-medium">
          <HardDrive className="h-4 w-4" />
          <EditableText id="webapp-sync-drive">Google Drive</EditableText>
        </div>
        {!drive?.configured ? (
          <EditableText id="webapp-sync-drive-off" as="p" className="text-sm text-muted-foreground">
            Google Drive sync isn't set up on this server.
          </EditableText>
        ) : drive.connected ? (
          <div className="space-y-2 text-sm">
            <p>
              {drive.folderName} <span className="text-muted-foreground">({drive.googleEmail})</span> · <EditableText id="webapp-sync-last-drive">last synced</EditableText> {when(drive.lastSyncedAt)}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2">
                <Switch checked={drive.enabled} onCheckedChange={(enabled) => act("d-toggle", () => api(`/creative-spaces/${spaceId}/drive-sync`, { method: "PATCH", body: { enabled } }))} />
                <EditableText id="webapp-sync-on-drive">Sync on</EditableText>
              </label>
              <Button size="sm" variant="outline" className="gap-1" disabled={busy === "d-run"} onClick={() => act("d-run", () => post(`/creative-spaces/${spaceId}/drive-sync/run`))}>
                <RefreshCw className={`h-4 w-4 ${busy === "d-run" ? "animate-spin" : ""}`} />
                <EditableText id="webapp-sync-now-drive">Sync now</EditableText>
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => act("d-off", () => post(`/creative-spaces/${spaceId}/drive-sync/disconnect`))}>
                <EditableText id="webapp-sync-disconnect-drive">Disconnect</EditableText>
              </Button>
            </div>
            {!!drive.recentLog?.length && (
              <details>
                <summary className="cursor-pointer text-muted-foreground">
                  <EditableText id="webapp-sync-drive-log">Sync log</EditableText>
                </summary>
                <ul className="mt-1 max-h-48 space-y-0.5 overflow-auto text-xs">
                  {drive.recentLog.map((l, i) => (
                    <li key={i}>
                      {when(l.created_at)} · {l.action ?? ""} {l.path ?? ""} {l.detail ?? l.message ?? ""}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ) : drive.hasGoogleAccount ? (
          <div className="space-y-2 text-sm">
            <p className="flex flex-wrap items-center gap-1">
              {trail.map((t, i) => (
                <React.Fragment key={t.id}>
                  {i > 0 && <ChevronRight className="h-3 w-3" />}
                  <button className="underline" onClick={() => openFolder(t, i)}>
                    {t.name}
                  </button>
                </React.Fragment>
              ))}
            </p>
            {folders === null ? (
              <Button size="sm" variant="outline" onClick={() => openFolder(trail[trail.length - 1], trail.length - 1)}>
                <EditableText id="webapp-sync-drive-browse">Choose a folder</EditableText>
              </Button>
            ) : (
              <>
                <ul className="max-h-48 overflow-auto rounded border">
                  {folders.map((f) => (
                    <li key={f.id}>
                      <button className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-muted" onClick={() => openFolder(f)}>
                        <Folder className="h-4 w-4 text-amber-600" />
                        {f.name}
                      </button>
                    </li>
                  ))}
                </ul>
                <Button size="sm" onClick={() => act("d-connect", () => post(`/creative-spaces/${spaceId}/drive-sync/connect`, { folderId: trail[trail.length - 1].id }))}>
                  <EditableText id="webapp-sync-drive-use">Sync this Space with this folder</EditableText>
                </Button>
              </>
            )}
          </div>
        ) : (
          <a href={drive.authUrl ?? platformLink(`/creative_space/${spaceId}`)} className="text-sm underline">
            <EditableText id="webapp-sync-drive-connect">Connect Google Drive</EditableText>
          </a>
        )}
      </div>
    </section>
  );
};

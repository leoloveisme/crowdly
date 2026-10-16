import React from "react";
import EditableText from "@/components/EditableText";
import { useAuth } from "@/contexts/AuthContext";
import { useEditableContent } from "@/contexts/EditableContentContext";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import AiConnectionsSection from "@/components/settings/AiConnectionsSection";
import { UI_LANGUAGES } from "@web/lib/languages";
import { platformLink } from "@web/lib/api";
import { useTabTitle, useWorkspace } from "@web/shell/workspace";

// Settings (the desktop keeps these in menus; the web app gathers them on
// one page): interface language, startup, panes, live co-editing, reader,
// bring-your-own-AI connections, and links to account settings.

const Row: React.FC<{ id: string; label: string; descId?: string; desc?: string; children: React.ReactNode }> = ({ id, label, descId, desc, children }) => (
  <div className="flex items-center justify-between gap-4 py-2">
    <div>
      <Label>
        <EditableText id={id}>{label}</EditableText>
      </Label>
      {desc && descId && (
        <EditableText id={descId} as="p" className="text-xs text-muted-foreground">
          {desc}
        </EditableText>
      )}
    </div>
    {children}
  </div>
);

const Section: React.FC<{ id: string; title: string; children: React.ReactNode }> = ({ id, title, children }) => (
  <section className="rounded-md border p-4">
    <EditableText id={id} as="h2" className="mb-2 text-lg font-medium">
      {title}
    </EditableText>
    <div className="divide-y">{children}</div>
  </section>
);

const select = "h-9 rounded border bg-background px-2 text-sm";

const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const { prefs, setPrefs } = useWorkspace();
  const { currentLanguage, setCurrentLanguage } = useEditableContent();
  useTabTitle("/settings", "Settings");

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-3 sm:p-6">
      <EditableText id="webapp-settings-title" as="h1" className="text-2xl font-semibold">
        Settings
      </EditableText>

      <Section id="webapp-settings-general" title="General">
        <Row id="webapp-settings-language" label="Interface language">
          <select className={select} value={currentLanguage} onChange={(e) => setCurrentLanguage(e.target.value)}>
            {UI_LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </Row>
        <Row id="webapp-settings-start" label="Start in">
          <select className={select} value={prefs.startMode} onChange={(e) => setPrefs({ startMode: e.target.value as "creation" | "discovery" })}>
            <option value="creation">Creation</option>
            <option value="discovery">Discovery</option>
          </select>
        </Row>
        <Row id="webapp-settings-launch" label="On launch">
          <select className={select} value={prefs.launch} onChange={(e) => setPrefs({ launch: e.target.value as "restore" | "default" })}>
            <option value="restore">Start where I left off</option>
            <option value="default">Start with default settings</option>
          </select>
        </Row>
      </Section>

      <Section id="webapp-settings-editor" title="Editor">
        <Row id="webapp-settings-source" label="Markdown (MD) / HTML pane">
          <Switch checked={prefs.showSource} onCheckedChange={(c) => setPrefs({ showSource: c, showVisual: c ? prefs.showVisual : true })} />
        </Row>
        <Row id="webapp-settings-visual" label="WYSIWYG pane">
          <Switch checked={prefs.showVisual} onCheckedChange={(c) => setPrefs({ showVisual: c, showSource: c ? prefs.showSource : true })} />
        </Row>
        <Row id="webapp-settings-live" label="Live co-editing" descId="webapp-settings-live-desc" desc="See and merge your team's edits as they type.">
          <Switch checked={prefs.liveCollab} onCheckedChange={(c) => setPrefs({ liveCollab: c })} />
        </Row>
      </Section>

      <Section id="webapp-settings-reader" title="Reader">
        <Row id="webapp-settings-font" label="Text size">
          <input type="range" min={12} max={32} value={prefs.readerFontSize} onChange={(e) => setPrefs({ readerFontSize: Number(e.target.value) })} />
        </Row>
        <Row id="webapp-settings-theme" label="Theme">
          <select className={select} value={prefs.readerTheme} onChange={(e) => setPrefs({ readerTheme: e.target.value as "light" | "sepia" | "dark" })}>
            <option value="light">Light</option>
            <option value="sepia">Sepia</option>
            <option value="dark">Dark</option>
          </select>
        </Row>
      </Section>

      {user && (
        <section className="rounded-md border p-4">
          <AiConnectionsSection />
        </section>
      )}

      {user && (
        <Section id="webapp-settings-account" title="Account">
          <Row id="webapp-settings-signed-in" label="Signed in as">
            <span className="text-sm">{user.email}</span>
          </Row>
          <div className="py-2">
            <a href={platformLink("/account-administration")} target="_blank" rel="noreferrer" className="text-sm underline">
              <EditableText id="webapp-settings-account-link">Account, password and privacy on the platform</EditableText>
            </a>
          </div>
        </Section>
      )}
    </div>
  );
};

export default SettingsPage;

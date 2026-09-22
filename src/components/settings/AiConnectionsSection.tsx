import React, { useState } from "react";
import { AlertTriangle, CheckCircle2, KeyRound, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import EditableText from "@/components/EditableText";
import { useToast } from "@/hooks/use-toast";
import {
  createAiConnection,
  deleteAiConnection,
  testAiConnection,
  updateAiConnection,
  useAiConnections,
  type AiCapability,
  type AiConnection,
  type AiProvider,
  type AiProviderId,
} from "@/lib/aiApi";

const CAPABILITY_LABELS: Record<AiCapability, React.ReactNode> = {
  translate: <EditableText id="profile-ai-cap-text">Text (translation drafts, comic scripts)</EditableText>,
  tts: <EditableText id="profile-ai-cap-tts">Narration (text-to-speech)</EditableText>,
  image: <EditableText id="profile-ai-cap-image">Images (comic frames)</EditableText>,
  video: <EditableText id="profile-ai-cap-video">Video (experimental)</EditableText>,
};

const CAPABILITY_SHORT: Record<AiCapability, string> = {
  translate: "text",
  tts: "narration",
  image: "images",
  video: "video",
};

/** Model / voice overrides for one capability of one provider. */
const SettingsFields: React.FC<{
  provider: AiProvider;
  capability: AiCapability;
  value: AiConnection["settings"];
  onChange: (next: AiConnection["settings"]) => void;
}> = ({ provider, capability, value, onChange }) => {
  const defaults = provider.defaults[capability] ?? {};
  const current = value[capability] ?? {};
  const set = (key: "model" | "voice", v: string) => onChange({ ...value, [capability]: { ...current, [key]: v } });
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <input
        value={current.model ?? ""}
        onChange={(e) => set("model", e.target.value)}
        placeholder={defaults.model ? `Model (default: ${defaults.model})` : "Model (required)"}
        className="border rounded px-2 py-1.5 text-sm"
      />
      {capability === "tts" && (
        <input
          value={current.voice ?? ""}
          onChange={(e) => set("voice", e.target.value)}
          placeholder={defaults.voice ? `Voice (default: ${defaults.voice})` : "Voice"}
          className="border rounded px-2 py-1.5 text-sm"
        />
      )}
    </div>
  );
};

const ConnectionCard: React.FC<{ connection: AiConnection; provider: AiProvider | undefined; onChanged: () => void }> = ({
  connection,
  provider,
  onChanged,
}) => {
  const { toast } = useToast();
  const [label, setLabel] = useState(connection.label ?? "");
  const [capabilities, setCapabilities] = useState<AiCapability[]>(connection.capabilities);
  const [settings, setSettings] = useState<AiConnection["settings"]>(connection.settings ?? {});
  const [newKey, setNewKey] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | null>(null);

  const run = async (kind: "save" | "test", action: () => Promise<unknown>, success: string) => {
    setBusy(kind);
    try {
      await action();
      toast({ title: success });
      setNewKey("");
      onChanged();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Something went wrong", variant: "destructive" });
      if (kind === "test") onChanged();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="border rounded-lg p-3 bg-white space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-medium">{connection.provider_label}</span>
          {connection.key_hint && (
            <span className="ml-2 inline-flex items-center gap-1 text-xs text-gray-500">
              <KeyRound className="h-3 w-3" />
              {connection.key_hint}
            </span>
          )}
          {connection.base_url && <span className="ml-2 text-xs text-gray-500">{connection.base_url}</span>}
        </div>
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Remove this AI connection? Its key is deleted from Crowdly.")) {
              run("save", () => deleteAiConnection(connection.id), "Connection removed");
            }
          }}
          className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
          title="Remove"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {connection.last_error ? (
        <p className="flex items-center gap-1 text-xs text-red-700">
          <AlertTriangle className="h-3.5 w-3.5" />
          {connection.last_error}
        </p>
      ) : connection.last_used_at ? (
        <p className="flex items-center gap-1 text-xs text-green-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <EditableText id="profile-ai-last-used">Last used</EditableText> {new Date(connection.last_used_at).toLocaleString()}
        </p>
      ) : null}

      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Name (optional), e.g. “My Claude”"
        className="w-full border rounded px-2 py-1.5 text-sm"
      />

      {(provider?.capabilities ?? []).map((cap) => (
        <div key={cap} className="space-y-1.5">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-blue-500"
              checked={capabilities.includes(cap)}
              onChange={(e) =>
                setCapabilities((prev) => (e.target.checked ? [...prev, cap] : prev.filter((c) => c !== cap)))
              }
            />
            {CAPABILITY_LABELS[cap]}
          </label>
          {capabilities.includes(cap) && provider && (
            <SettingsFields provider={provider} capability={cap} value={settings} onChange={setSettings} />
          )}
        </div>
      ))}

      <input
        type="password"
        autoComplete="off"
        value={newKey}
        onChange={(e) => setNewKey(e.target.value)}
        placeholder="Replace API key (optional)"
        className="w-full border rounded px-2 py-1.5 text-sm"
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() =>
            run(
              "save",
              () =>
                updateAiConnection(connection.id, {
                  label,
                  capabilities,
                  settings,
                  ...(newKey.trim() ? { apiKey: newKey.trim() } : {}),
                }),
              "Connection saved",
            )
          }
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy === "save" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          <EditableText id="profile-ai-save">Save</EditableText>
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run("test", () => testAiConnection(connection.id), "Connection works")}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded border hover:bg-gray-50 disabled:opacity-50"
        >
          {busy === "test" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          <EditableText id="profile-ai-test">Test connection</EditableText>
        </button>
      </div>
    </div>
  );
};

const AddConnectionForm: React.FC<{ providers: AiProvider[]; onAdded: () => void }> = ({ providers, onAdded }) => {
  const { toast } = useToast();
  const [providerId, setProviderId] = useState<AiProviderId>("anthropic");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const provider = providers.find((p) => p.id === providerId);

  const save = async () => {
    setSaving(true);
    try {
      await createAiConnection({
        provider: providerId,
        label: label || undefined,
        apiKey,
        baseUrl: provider?.needs_base_url ? baseUrl : undefined,
      });
      toast({ title: "AI connection added", description: "The key worked and is stored encrypted." });
      setApiKey("");
      setLabel("");
      setBaseUrl("");
      onAdded();
    } catch (err) {
      toast({ title: "Could not add connection", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border rounded-lg p-3 bg-gray-50 space-y-2">
      <div className="text-sm font-medium flex items-center gap-1">
        <Plus className="h-4 w-4" />
        <EditableText id="profile-ai-add-heading">Connect an AI provider</EditableText>
      </div>
      <select
        value={providerId}
        onChange={(e) => setProviderId(e.target.value as AiProviderId)}
        className="w-full border rounded px-2 py-1.5 text-sm bg-white"
      >
        {providers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label} —{" "}
            {p.capabilities.map((c) => CAPABILITY_SHORT[c]).join(" + ")}
          </option>
        ))}
      </select>
      {provider?.needs_base_url && (
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="Server URL, e.g. https://my-server.example/v1"
          className="w-full border rounded px-2 py-1.5 text-sm"
        />
      )}
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Name (optional)"
        className="w-full border rounded px-2 py-1.5 text-sm"
      />
      <input
        type="password"
        autoComplete="off"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="API key"
        className="w-full border rounded px-2 py-1.5 text-sm"
      />
      <button
        type="button"
        disabled={saving || apiKey.trim().length < 8 || (provider?.needs_base_url && !baseUrl.trim())}
        onClick={save}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        <EditableText id="profile-ai-add-btn">Check key and connect</EditableText>
      </button>
    </div>
  );
};

/**
 * "AI connections" — the user's own AI providers (their own API keys and
 * accounts). Used for machine-translation drafts and AI narration.
 */
const AiConnectionsSection: React.FC = () => {
  const { data, reload } = useAiConnections(true);

  return (
    <section className="mb-8 space-y-3">
      <h2 className="text-xl font-bold flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-purple-600" />
        <EditableText id="profile-ai-heading">AI connections</EditableText>
      </h2>
      <p className="text-sm text-gray-600 max-w-2xl">
        <EditableText id="profile-ai-desc">
          Connect your own AI accounts to draft translations and generate narrations. Crowdly uses your key only for the
          actions you start, and usage is billed by the provider to your account. Keys are stored encrypted and are never
          shown again.
        </EditableText>
      </p>

      {data && !data.configured && (
        <p className="flex items-center gap-1 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          <AlertTriangle className="h-4 w-4" />
          <EditableText id="profile-ai-not-configured">AI connections aren't enabled on this server yet.</EditableText>
        </p>
      )}

      {!data ? (
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.connections.map((c) => (
            <ConnectionCard
              key={`${c.id}-${c.last_used_at}-${c.last_error}`}
              connection={c}
              provider={data.providers.find((p) => p.id === c.provider)}
              onChanged={reload}
            />
          ))}
          {data.configured && <AddConnectionForm providers={data.providers} onAdded={reload} />}
        </div>
      )}
    </section>
  );
};

export default AiConnectionsSection;

import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import EditableText from "@/components/EditableText";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocales } from "./LanguageSwitcher";

type Start = "blank" | "copy";

interface TranslateStoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceLanguage: string;
  onCreate: (language: string, start: Start) => Promise<void>;
}

const StartOption: React.FC<{
  selected: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  title: React.ReactNode;
  description: React.ReactNode;
}> = ({ selected, disabled, onSelect, title, description }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onSelect}
    className={cn(
      "w-full text-left rounded-md border px-3 py-2 transition",
      selected ? "border-blue-400 bg-blue-50" : "hover:bg-gray-50",
      disabled && "opacity-50 cursor-not-allowed hover:bg-transparent",
    )}
  >
    <div className="text-sm font-medium">{title}</div>
    <div className="text-xs text-gray-500">{description}</div>
  </button>
);

/** Pick a target language and how the translation should start. */
const TranslateStoryDialog: React.FC<TranslateStoryDialogProps> = ({
  open,
  onOpenChange,
  sourceLanguage,
  onCreate,
}) => {
  const locales = useLocales();
  const sourceLocale = locales.find((l) => l.code === sourceLanguage);
  const [language, setLanguage] = useState("");
  const [start, setStart] = useState<Start>("blank");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!language) return;
    setCreating(true);
    try {
      await onCreate(language, start);
      onOpenChange(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <EditableText id="story-translate-title">Translate this story</EditableText>
          </DialogTitle>
          <DialogDescription>
            <EditableText id="story-translate-desc">
              The translation becomes its own story that you own, linked to the original chapter by chapter. It
              stays a draft until you publish it.
            </EditableText>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <span className="text-sm font-medium">
              <EditableText id="story-translate-language">Translate into</EditableText>
            </span>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a language" />
              </SelectTrigger>
              <SelectContent>
                {locales.map((l) => (
                  // The story's own language stays listed (disabled) so it's
                  // clear why it can't be picked, rather than silently missing.
                  <SelectItem key={l.code} value={l.code} disabled={l.code === sourceLanguage}>
                    {l.native_name || l.english_name}
                    {l.native_name && l.native_name !== l.english_name ? ` — ${l.english_name}` : ""}
                    {l.code === sourceLanguage && " · this story's language"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              <EditableText id="story-translate-source-lang">This story is marked as written in</EditableText>{" "}
              <span className="font-medium">{sourceLocale ? sourceLocale.native_name || sourceLocale.english_name : sourceLanguage.toUpperCase()}</span>.{" "}
              <EditableText id="story-translate-source-lang-hint">
                If that's wrong, the owner can change it in Settings → Language.
              </EditableText>
            </p>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">
              <EditableText id="story-translate-start">Start from</EditableText>
            </span>
            <StartOption
              selected={start === "blank"}
              onSelect={() => setStart("blank")}
              title={<EditableText id="story-translate-blank">Blank chapters</EditableText>}
              description={
                <EditableText id="story-translate-blank-desc">
                  Chapter titles are copied; you write each chapter next to the original.
                </EditableText>
              }
            />
            <StartOption
              selected={start === "copy"}
              onSelect={() => setStart("copy")}
              title={<EditableText id="story-translate-copy">Copy of the original text</EditableText>}
              description={
                <EditableText id="story-translate-copy-desc">
                  Every chapter starts with the original text for you to overwrite.
                </EditableText>
              }
            />
            <StartOption
              selected={false}
              disabled
              title={
                <>
                  <EditableText id="story-translate-ai">AI draft</EditableText>
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-500">
                    <EditableText id="story-coming-soon">Coming soon</EditableText>
                  </span>
                </>
              }
              description={
                <EditableText id="story-translate-ai-desc">
                  Pre-fill a draft using your own AI provider, connected in your settings.
                </EditableText>
              }
            />
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-3 py-1.5 text-sm rounded border bg-white hover:bg-gray-50"
          >
            <EditableText id="story-dialog-cancel">Cancel</EditableText>
          </button>
          <button
            type="button"
            disabled={!language || creating}
            onClick={handleCreate}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <EditableText id="story-translate-create">Create translation</EditableText>
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TranslateStoryDialog;

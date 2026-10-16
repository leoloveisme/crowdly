import React, { useEffect, useRef, useState } from "react";
import EditableText from "@/components/EditableText";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, X } from "lucide-react";

// Desktop search bar: match case, whole word, wrap around, previous/next,
// replace, replace all.
export interface FindOptions {
  matchCase: boolean;
  wholeWord: boolean;
  wrap: boolean;
}

export function buildFindRegex(query: string, opts: FindOptions) {
  const esc = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(opts.wholeWord ? `\\b${esc}\\b` : esc, opts.matchCase ? "g" : "gi");
}

interface Props {
  showReplace: boolean;
  onClose: () => void;
  onFind: (query: string, opts: FindOptions, dir: 1 | -1) => number;
  onReplace?: (query: string, replacement: string, opts: FindOptions) => void;
  onReplaceAll?: (query: string, replacement: string, opts: FindOptions) => number;
}

export const FindBar: React.FC<Props> = ({ showReplace, onClose, onFind, onReplace, onReplaceAll }) => {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [opts, setOpts] = useState<FindOptions>({ matchCase: false, wholeWord: false, wrap: true });
  const [count, setCount] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const find = (dir: 1 | -1) => setCount(onFind(query, opts, dir));

  const Opt: React.FC<{ k: keyof FindOptions; id: string; label: string }> = ({ k, id, label }) => (
    <label className="flex items-center gap-1 text-xs">
      <input type="checkbox" checked={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} />
      <EditableText id={id}>{label}</EditableText>
    </label>
  );

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-2 py-1.5" role="search">
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setCount(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") find(e.shiftKey ? -1 : 1);
          if (e.key === "Escape") onClose();
          if (e.key === "F3") {
            e.preventDefault();
            find(e.shiftKey ? -1 : 1);
          }
        }}
        placeholder="Find"
        className="h-7 w-40 text-sm"
      />
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => find(-1)} aria-label="Previous">
        <ChevronUp className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => find(1)} aria-label="Next">
        <ChevronDown className="h-4 w-4" />
      </Button>
      {count !== null && (
        <span className="text-xs text-muted-foreground">
          {count} <EditableText id="webapp-find-matches">matches</EditableText>
        </span>
      )}
      <Opt k="matchCase" id="webapp-find-case" label="Match case" />
      <Opt k="wholeWord" id="webapp-find-word" label="Whole word" />
      <Opt k="wrap" id="webapp-find-wrap" label="Wrap around" />
      {showReplace && onReplace && (
        <>
          <Input value={replacement} onChange={(e) => setReplacement(e.target.value)} placeholder="Replace with" className="h-7 w-40 text-sm" />
          <Button size="sm" variant="outline" className="h-7" onClick={() => onReplace(query, replacement, opts)} disabled={!query}>
            <EditableText id="webapp-find-replace">Replace</EditableText>
          </Button>
          <Button size="sm" variant="outline" className="h-7" onClick={() => setCount(onReplaceAll?.(query, replacement, opts) ?? 0)} disabled={!query}>
            <EditableText id="webapp-find-replace-all">Replace all</EditableText>
          </Button>
        </>
      )}
      <span className="flex-1" />
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose} aria-label="Close">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};

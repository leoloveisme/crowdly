import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { useWorkspace } from "./workspace";

// Desktop-style document tabs: drag to reorder, double-click to rename,
// middle-click or × to close.
export const TabsBar: React.FC = () => {
  const { tabs, closeTab, moveTab, renameTab } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  if (tabs.length === 0) return null;

  const close = (path: string) => {
    const next = closeTab(path);
    if (location.pathname === path) navigate(next ?? "/");
  };

  return (
    <nav className="flex shrink-0 items-end gap-0.5 overflow-x-auto border-b bg-muted/40 px-1 pt-1" role="tablist">
      {tabs.map((t, i) => {
        const active = location.pathname === t.path;
        return (
          <div
            key={t.path}
            role="tab"
            aria-selected={active}
            draggable
            onDragStart={() => setDragFrom(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragFrom !== null && dragFrom !== i) moveTab(dragFrom, i);
              setDragFrom(null);
            }}
            onAuxClick={(e) => e.button === 1 && close(t.path)}
            onClick={() => navigate(t.path)}
            onDoubleClick={() => setEditing(t.path)}
            className={`group flex max-w-[14rem] shrink-0 cursor-pointer items-center gap-1 rounded-t-md border border-b-0 px-3 py-1 text-sm ${
              active ? "bg-background font-medium" : "bg-muted/60 text-muted-foreground hover:bg-background/70"
            }`}
          >
            {editing === t.path ? (
              <input
                autoFocus
                defaultValue={t.title}
                className="w-32 bg-transparent outline-none"
                onBlur={(e) => {
                  renameTab(t.path, e.target.value.trim() || t.title);
                  setEditing(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setEditing(null);
                }}
              />
            ) : (
              <span className="truncate">{t.title}</span>
            )}
            <button
              aria-label="Close tab"
              className="rounded p-0.5 opacity-60 hover:bg-muted hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                close(t.path);
              }}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </nav>
  );
};

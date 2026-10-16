import React from "react";
import EditableText from "@/components/EditableText";
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Menu as MenuIcon, Check, ChevronRight } from "lucide-react";

// One menu model, two renderings: a desktop-app-style menu bar on wide
// screens and a drawer on phones/tablets. Labels are EditableText ids so
// translators can localize every entry.

export interface MenuEntry {
  id: string;
  label: string;
  /** Dynamic text (Space or tab names) is not translatable — rendered as-is. */
  raw?: boolean;
  onSelect?: () => void;
  disabled?: boolean;
  checked?: boolean;
  shortcut?: string;
  separatorBefore?: boolean;
  children?: MenuEntry[];
  hidden?: boolean;
}

export interface MenuGroup {
  id: string;
  label: string;
  items: MenuEntry[];
  hidden?: boolean;
}

const Label: React.FC<{ e: { id: string; label: string; raw?: boolean } }> = ({ e }) =>
  e.raw ? <span>{e.label}</span> : <EditableText id={e.id}>{e.label}</EditableText>;

function renderDesktopItems(items: MenuEntry[]): React.ReactNode {
  return items
    .filter((i) => !i.hidden)
    .map((i) => (
      <React.Fragment key={i.id}>
        {i.separatorBefore && <MenubarSeparator />}
        {i.children ? (
          <MenubarSub>
            <MenubarSubTrigger disabled={i.disabled}>
              <Label e={i} />
            </MenubarSubTrigger>
            <MenubarSubContent className="max-h-[70vh] overflow-auto">{renderDesktopItems(i.children)}</MenubarSubContent>
          </MenubarSub>
        ) : i.checked !== undefined ? (
          <MenubarCheckboxItem checked={i.checked} disabled={i.disabled} onSelect={() => i.onSelect?.()}>
            <Label e={i} />
          </MenubarCheckboxItem>
        ) : (
          <MenubarItem disabled={i.disabled || !i.onSelect} onSelect={() => i.onSelect?.()}>
            <Label e={i} />
            {i.shortcut && <MenubarShortcut>{i.shortcut}</MenubarShortcut>}
          </MenubarItem>
        )}
      </React.Fragment>
    ));
}

export const DesktopMenuBar: React.FC<{ groups: MenuGroup[] }> = ({ groups }) => (
  <Menubar className="h-8 border-0 bg-transparent p-0 shadow-none">
    {groups
      .filter((g) => !g.hidden)
      .map((g) => (
        <MenubarMenu key={g.id}>
          <MenubarTrigger className="px-2 py-1 text-sm font-normal">
            <Label e={g} />
          </MenubarTrigger>
          <MenubarContent>{renderDesktopItems(g.items)}</MenubarContent>
        </MenubarMenu>
      ))}
  </Menubar>
);

const MobileItems: React.FC<{ items: MenuEntry[]; close: () => void; depth?: number }> = ({ items, close, depth = 0 }) => {
  const [openSub, setOpenSub] = React.useState<string | null>(null);
  return (
    <ul className={depth ? "ml-3 border-l pl-2" : ""}>
      {items
        .filter((i) => !i.hidden)
        .map((i) => (
          <li key={i.id} className={i.separatorBefore ? "mt-1 border-t pt-1" : ""}>
            <button
              className="flex w-full items-center justify-between rounded px-2 py-2.5 text-left text-sm hover:bg-muted disabled:opacity-40"
              disabled={i.disabled || (!i.onSelect && !i.children)}
              onClick={() => {
                if (i.children) setOpenSub(openSub === i.id ? null : i.id);
                else {
                  i.onSelect?.();
                  close();
                }
              }}
            >
              <span className="flex items-center gap-2">
                {i.checked !== undefined && <Check className={`h-4 w-4 ${i.checked ? "" : "invisible"}`} />}
                <Label e={i} />
              </span>
              {i.children && <ChevronRight className={`h-4 w-4 transition-transform ${openSub === i.id ? "rotate-90" : ""}`} />}
            </button>
            {i.children && openSub === i.id && <MobileItems items={i.children} close={close} depth={depth + 1} />}
          </li>
        ))}
    </ul>
  );
};

export const MobileMenu: React.FC<{ groups: MenuGroup[] }> = ({ groups }) => {
  const [open, setOpen] = React.useState(false);
  const [group, setGroup] = React.useState<string | null>(null);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="rounded p-2 hover:bg-muted" aria-label="Menu">
          <MenuIcon className="h-5 w-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[85vw] max-w-sm overflow-y-auto p-3">
        <SheetHeader>
          <SheetTitle>
            <EditableText id="webapp-menu-title">Menu</EditableText>
          </SheetTitle>
        </SheetHeader>
        <ul className="mt-3">
          {groups
            .filter((g) => !g.hidden)
            .map((g) => (
              <li key={g.id}>
                <button
                  className="flex w-full items-center justify-between rounded px-2 py-2.5 text-left font-medium hover:bg-muted"
                  onClick={() => setGroup(group === g.id ? null : g.id)}
                >
                  <Label e={g} />
                  <ChevronRight className={`h-4 w-4 transition-transform ${group === g.id ? "rotate-90" : ""}`} />
                </button>
                {group === g.id && <MobileItems items={g.items} close={() => setOpen(false)} depth={1} />}
              </li>
            ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
};

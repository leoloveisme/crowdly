// Wording of ChapterSidebar for each kind of part: chapters (default),
// screenplay scenes and comic issues.

export type SidebarLabelKey =
  | "heading"
  | "view"
  | "edit"
  | "empty"
  | "untitled"
  | "placeholder"
  | "rename"
  | "insertAfter"
  | "publish"
  | "unpublish"
  | "delete"
  | "add"
  | "reorderHint"
  | "deleteTitle"
  | "deleteDesc"
  | "cancel";

/** EditableText id + English text for each sidebar string. */
export type ChapterSidebarLabels = Record<SidebarLabelKey, { id: string; text: string }>;

export const STORY_SIDEBAR_LABELS: ChapterSidebarLabels = {
  heading: { id: "story-sidebar-heading", text: "Chapters" },
  view: { id: "story-sidebar-view", text: "View" },
  edit: { id: "story-sidebar-edit", text: "Edit" },
  empty: { id: "story-sidebar-empty", text: "No chapters yet." },
  untitled: { id: "story-sidebar-untitled", text: "Untitled chapter" },
  placeholder: { id: "", text: "Chapter title" },
  rename: { id: "story-chapter-rename-btn", text: "Rename" },
  insertAfter: { id: "story-sidebar-insert-after", text: "Insert chapter after" },
  publish: { id: "story-sidebar-publish", text: "Publish chapter" },
  unpublish: { id: "story-sidebar-unpublish", text: "Unpublish chapter" },
  delete: { id: "story-chapter-delete-btn", text: "Delete" },
  add: { id: "story-chapter-add-btn", text: "+ Add chapter" },
  reorderHint: {
    id: "story-sidebar-reorder-hint",
    text: "Drag the handle or use the ⋯ menu to reorder. Double-click a title to rename.",
  },
  deleteTitle: { id: "story-chapter-delete-title", text: "Delete this chapter?" },
  deleteDesc: { id: "story-chapter-delete-desc", text: "This cannot be undone." },
  cancel: { id: "story-dialog-cancel", text: "Cancel" },
};

/**
 * Sidebar labels for another kind of part (scenes, issues): ids are
 * `${prefix}-sidebar-*`, texts use the given singular/plural nouns.
 */
export function sidebarLabelsFor(prefix: string, singular: string, plural: string): ChapterSidebarLabels {
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
  const id = (key: string) => `${prefix}-sidebar-${key}`;
  return {
    heading: { id: id("heading"), text: cap(plural) },
    view: { id: id("view"), text: "View" },
    edit: { id: id("edit"), text: "Edit" },
    empty: { id: id("empty"), text: `No ${plural} yet.` },
    untitled: { id: id("untitled"), text: `Untitled ${singular}` },
    placeholder: { id: "", text: `${cap(singular)} title` },
    rename: { id: id("rename"), text: "Rename" },
    insertAfter: { id: id("insert-after"), text: `Insert ${singular} after` },
    publish: { id: id("publish"), text: `Publish ${singular}` },
    unpublish: { id: id("unpublish"), text: `Unpublish ${singular}` },
    delete: { id: id("delete"), text: "Delete" },
    add: { id: id("add"), text: `+ Add ${singular}` },
    reorderHint: {
      id: id("reorder-hint"),
      text: "Drag the handle or use the ⋯ menu to reorder. Double-click a title to rename.",
    },
    deleteTitle: { id: id("delete-title"), text: `Delete this ${singular}?` },
    deleteDesc: { id: id("delete-desc"), text: "This cannot be undone." },
    cancel: { id: id("cancel"), text: "Cancel" },
  };
}

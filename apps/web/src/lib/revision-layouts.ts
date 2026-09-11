// Revision-compare tiling presets: 2 layouts for 2 revisions, 4 for 3
// revisions, and 19 for 4 revisions — an exact match, preset-for-preset,
// with the desktop editor's `_LAYOUTS` table in
// apps/desktop/src/editor/ui/compare_revisions.py (lines 66-167), which
// expresses each preset as (row, col, rowSpan, colSpan) grid-geometry
// tuples. This file re-expresses the same 19 four-tile geometries as
// nested binary/n-ary splits (the data shape RevisionComparison.tsx's
// resizable-panel renderer already expects) — every one of the desktop's
// grid geometries decomposes cleanly into nested horizontal/vertical
// splits, so no rendering-model change was needed to reach parity.
//
// This module is intentionally duplicated verbatim in apps/web/src/lib/
// (root `src/` and `apps/web/` are separate Vite projects with no shared
// workspace/package linking them) so the main platform and the web editor
// can't silently drift apart on which layouts exist — keep both copies
// byte-identical. A real shared package is the better long-term home for
// this if/when the two apps are moved into an npm workspace.

export type LayoutLeaf = { type: "leaf"; tileIndex: number };
export type LayoutSplit = {
  type: "split";
  direction: "horizontal" | "vertical";
  children: LayoutNode[];
  sizes?: number[]; // default panel sizes (percentages)
};
export type LayoutNode = LayoutLeaf | LayoutSplit;

export interface LayoutPreset {
  label: string;
  tree: LayoutNode;
}

function leaf(tileIndex: number): LayoutLeaf {
  return { type: "leaf", tileIndex };
}
function split(direction: "horizontal" | "vertical", children: LayoutNode[], sizes?: number[]): LayoutSplit {
  return { type: "split", direction, children, sizes };
}

export const REVISION_LAYOUTS: Record<number, LayoutPreset[]> = {
  2: [
    { label: "Side by side", tree: split("horizontal", [leaf(0), leaf(1)]) },
    { label: "Top / bottom", tree: split("vertical", [leaf(0), leaf(1)]) },
  ],
  3: [
    {
      label: "One top, two below",
      tree: split("vertical", [leaf(0), split("horizontal", [leaf(1), leaf(2)])]),
    },
    {
      label: "Two top, one below",
      tree: split("vertical", [split("horizontal", [leaf(0), leaf(1)]), leaf(2)]),
    },
    {
      label: "Two left, one right",
      tree: split("horizontal", [split("vertical", [leaf(0), leaf(1)]), leaf(2)]),
    },
    {
      label: "One left, two right",
      tree: split("horizontal", [leaf(0), split("vertical", [leaf(1), leaf(2)])]),
    },
  ],
  // Order below matches apps/desktop/src/editor/ui/compare_revisions.py's
  // _LAYOUTS[4] indices 0-18 one-for-one — index N here IS desktop preset N.
  4: [
    // 0: 2x2 grid
    {
      label: "2x2 grid",
      tree: split("vertical", [
        split("horizontal", [leaf(0), leaf(1)]),
        split("horizontal", [leaf(2), leaf(3)]),
      ]),
    },
    // 1: four vertical columns
    { label: "4 columns", tree: split("horizontal", [leaf(0), leaf(1), leaf(2), leaf(3)]) },
    // 2: four horizontal rows
    { label: "4 rows", tree: split("vertical", [leaf(0), leaf(1), leaf(2), leaf(3)]) },
    // 3: two wide rows on top, one row split in two on the bottom
    {
      label: "Two wide top, two below",
      tree: split("vertical", [leaf(0), leaf(1), split("horizontal", [leaf(2), leaf(3)])], [33, 33, 34]),
    },
    // 4: two split on top, two wide rows below
    {
      label: "Two top, two wide below",
      tree: split("vertical", [split("horizontal", [leaf(0), leaf(1)]), leaf(2), leaf(3)], [34, 33, 33]),
    },
    // 5: 1+2 stacked on the left; 3 and 4 each tall full-height columns
    {
      label: "Two stacked left, two tall right",
      tree: split("horizontal", [split("vertical", [leaf(0), leaf(1)]), leaf(2), leaf(3)]),
    },
    // 6: 1 and 2 each tall full-height columns; 3+4 stacked on the right
    {
      label: "Two tall left, two stacked right",
      tree: split("horizontal", [leaf(0), leaf(1), split("vertical", [leaf(2), leaf(3)])]),
    },
    // 7: one tall left, three stacked right
    {
      label: "One tall left, three right",
      tree: split("horizontal", [leaf(0), split("vertical", [leaf(1), leaf(2), leaf(3)])]),
    },
    // 8: three stacked left, one tall right
    {
      label: "Three left, one tall right",
      tree: split("horizontal", [split("vertical", [leaf(0), leaf(1), leaf(2)]), leaf(3)]),
    },
    // 9: one wide top, three in a row below
    {
      label: "One wide top, three below",
      tree: split("vertical", [leaf(0), split("horizontal", [leaf(1), leaf(2), leaf(3)])]),
    },
    // 10: three in a row on top, one wide below
    {
      label: "Three top, one wide below",
      tree: split("vertical", [split("horizontal", [leaf(0), leaf(1), leaf(2)]), leaf(3)]),
    },
    // 11: 1 wide on top; 2,3 stacked left; 4 tall right (below the top row)
    {
      label: "Wide top, stacked left, tall right",
      tree: split("vertical", [
        leaf(0),
        split("horizontal", [split("vertical", [leaf(1), leaf(2)]), leaf(3)]),
      ]),
    },
    // 12: 1 wide on top; 2 tall left; 3,4 stacked right (below the top row)
    {
      label: "Wide top, tall left, stacked right",
      tree: split("vertical", [
        leaf(0),
        split("horizontal", [leaf(1), split("vertical", [leaf(2), leaf(3)])]),
      ]),
    },
    // 13: 1,2 stacked left; 3 tall right (above); 4 wide bottom
    {
      label: "Stacked left, tall right, wide bottom",
      tree: split("vertical", [
        split("horizontal", [split("vertical", [leaf(0), leaf(1)]), leaf(2)]),
        leaf(3),
      ]),
    },
    // 14: 1 tall left; 2,3 stacked right (above); 4 wide bottom
    {
      label: "Tall left, stacked right, wide bottom",
      tree: split("vertical", [
        split("horizontal", [leaf(0), split("vertical", [leaf(1), leaf(2)])]),
        leaf(3),
      ]),
    },
    // 15: 1 tall left; 2,3 on top row (right side); 4 wide under 2+3
    {
      label: "Tall left, two top right, wide bottom right",
      tree: split("horizontal", [
        leaf(0),
        split("vertical", [split("horizontal", [leaf(1), leaf(2)]), leaf(3)]),
      ]),
    },
    // 16: 1 tall left; 2 wide top right; 3,4 on bottom row (right side)
    {
      label: "Tall left, wide top right, two bottom right",
      tree: split("horizontal", [
        leaf(0),
        split("vertical", [leaf(1), split("horizontal", [leaf(2), leaf(3)])]),
      ]),
    },
    // 17: 1,2 on top row (left side); 3 tall right; 4 wide under 1+2
    {
      label: "Two top left, tall right, wide bottom left",
      tree: split("horizontal", [
        split("vertical", [split("horizontal", [leaf(0), leaf(1)]), leaf(3)]),
        leaf(2),
      ]),
    },
    // 18: 1 wide top (left side); 2,3 on bottom row (left side); 4 tall right
    {
      label: "Wide top left, two bottom left, tall right",
      tree: split("horizontal", [
        split("vertical", [leaf(0), split("horizontal", [leaf(1), leaf(2)])]),
        leaf(3),
      ]),
    },
  ],
};

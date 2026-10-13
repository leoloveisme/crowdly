// Checks the web app's .story/.screenplay/.comic parsers against the
// fixtures the desktop app's tests use (apps/desktop/tests/fixtures/formats),
// so both apps read and write these files identically.
//   node apps/web/scripts/test-formats.ts
import { readFileSync } from "node:fs";
import { deepStrictEqual } from "node:assert";
import { fileURLToPath } from "node:url";
import { parseStory, storyToDsl } from "../src/formats/story.ts";
import { parseScreenplay, screenplayToDsl } from "../src/formats/screenplay.ts";
import { parseComic, comicToDsl } from "../src/formats/comic.ts";
import { parseBlocks, parseAttrs } from "../src/formats/dsl.ts";
import { parseMaster, serializeMaster } from "../src/formats/master.ts";

const dir = fileURLToPath(new URL("../../desktop/tests/fixtures/formats/", import.meta.url));
const read = (f: string) => readFileSync(dir + f, "utf8");
let failed = 0;
const check = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL ${name}\n${(err as Error).message}`);
  }
};

const cases = [
  ["story", parseStory, storyToDsl],
  ["screenplay", parseScreenplay, screenplayToDsl],
  ["comic", parseComic, comicToDsl],
] as const;

// "sample": the base formats; "branching": branches, sync ids, comic layers and alternatives.
for (const name of ["sample", "branching"]) {
  for (const [ext, parse, write] of cases) {
    const expected = JSON.parse(read(`${name}.${ext}.json`));
    check(`${name}.${ext}: parse matches fixture`, () => deepStrictEqual(parse(read(`${name}.${ext}`)), expected));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    check(`${name}.${ext}: round trip`, () => deepStrictEqual(parse((write as (d: any) => string)(expected)), expected));
  }
}
check("bracketed prose is not a tag", () => deepStrictEqual(parseBlocks("He said [sic] twice.\n\n[paragraph]Real.[/paragraph]").map((b) => b.tag), ["raw", "paragraph"]));
check("quoted attributes", () => deepStrictEqual(parseAttrs('center name="Two words" bold'), { align: "center", name: "Two words", bold: "1" }));

check("master: round trip with escapes", () => {
  const cs = [
    { label: "chapters/one.md", title: "One", titleEditedAt: 1760000000.5, content: "Text\n---\nmore" },
    { label: null, title: "", titleEditedAt: null, content: "## not a title\nbody" },
  ];
  deepStrictEqual(parseMaster(serializeMaster(cs)), cs);
});

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall format checks passed");

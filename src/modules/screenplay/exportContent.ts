import type { ScreenplayBlock, ScreenplayScene } from "@/lib/screenplayApi";

// HTML / Markdown renderings of a whole screenplay for the shared
// ExportDialog (moved from the old screenplay template module).

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const sceneBlocks = (blocks: ScreenplayBlock[], sceneId: string) =>
  blocks.filter((b) => b.scene_id === sceneId).sort((a, b) => a.block_index - b.block_index);

export function screenplayToHtml(title: string, scenes: ScreenplayScene[], blocks: ScreenplayBlock[]): string {
  let html = `<h1>${escapeHtml(title)}</h1>\n`;
  for (const scene of scenes) {
    html += `<h2>${escapeHtml(scene.slugline || "UNTITLED SCENE")}</h2>\n`;
    for (const block of sceneBlocks(blocks, scene.scene_id)) {
      const text = escapeHtml(block.text);
      switch (block.block_type) {
        case "scene_heading":
          html += `<h3>${text}</h3>\n`;
          break;
        case "character":
          html += `<p style="text-align:center"><strong>${text}</strong></p>\n`;
          break;
        case "dialogue":
          html += `<p style="margin-left:2em;margin-right:2em">${text}</p>\n`;
          break;
        case "parenthetical":
          html += `<p style="text-align:center"><em>${text}</em></p>\n`;
          break;
        case "transition":
          html += `<p style="text-align:right"><strong>${text}</strong></p>\n`;
          break;
        default:
          html += `<p>${text}</p>\n`;
      }
    }
  }
  return html;
}

export function screenplayToMarkdown(title: string, scenes: ScreenplayScene[], blocks: ScreenplayBlock[]): string {
  let md = `# ${title}\n\n`;
  for (const scene of scenes) {
    md += `## ${scene.slugline || "UNTITLED SCENE"}\n\n`;
    for (const block of sceneBlocks(blocks, scene.scene_id)) {
      switch (block.block_type) {
        case "scene_heading":
          md += `## ${block.text}\n\n`;
          break;
        case "character":
          md += `${block.text.toUpperCase()}\n`;
          break;
        case "dialogue":
          md += `${block.text}\n\n`;
          break;
        case "parenthetical":
          md += `(${block.text.replace(/^\(|\)$/g, "")})\n`;
          break;
        case "transition":
          md += `${block.text.toUpperCase()}\n\n`;
          break;
        default:
          md += `${block.text}\n\n`;
      }
    }
  }
  return md;
}

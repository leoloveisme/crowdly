/** Word / paragraph counts for the status bar (same rules as the desktop app). */
export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

export function countParagraphs(paragraphs: string[]): number {
  return paragraphs.filter((p) => p.trim()).length;
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  const d = (...a: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
  d.flush = () => t && clearTimeout(t);
  return d;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const safeFileName = (name: string) => (name || "untitled").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 120);

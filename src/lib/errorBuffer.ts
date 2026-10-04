// Keeps the last few JS errors in memory so a bug report can optionally
// include them ("Include recent console errors" on /support). Nothing is
// sent anywhere unless the user ticks that box on the bug form.

const MAX_ENTRIES = 20;
const MAX_LENGTH = 500;
const entries: string[] = [];
let installed = false;

function stringify(value: unknown): string {
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function record(parts: unknown[]) {
  const line = `${new Date().toISOString()} ${parts.map(stringify).join(" ")}`;
  entries.push(line.length > MAX_LENGTH ? `${line.slice(0, MAX_LENGTH)}…` : line);
  if (entries.length > MAX_ENTRIES) entries.shift();
}

export function installErrorBuffer() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    record(args);
    originalError(...args);
  };

  window.addEventListener("error", (event) => {
    record([event.error ?? event.message]);
  });
  window.addEventListener("unhandledrejection", (event) => {
    record(["Unhandled rejection:", event.reason]);
  });
}

export function getRecentErrors(): string[] {
  return [...entries];
}

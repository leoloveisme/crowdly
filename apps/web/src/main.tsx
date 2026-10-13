import { createRoot } from "react-dom/client";
import "@/index.css";
import "./app.css";
import { installErrorBuffer } from "@/lib/errorBuffer";
import App from "./App";

installErrorBuffer();

createRoot(document.getElementById("root")!).render(<App />);

// Installable, offline-capable app (public/sw.js). Dev builds skip it so
// hot reload isn't served stale files.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {});
  });
}

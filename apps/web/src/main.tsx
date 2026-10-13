import { createRoot } from "react-dom/client";
import "@/index.css";
import "./app.css";
import { installErrorBuffer } from "@/lib/errorBuffer";
import App from "./App";

installErrorBuffer();

createRoot(document.getElementById("root")!).render(<App />);

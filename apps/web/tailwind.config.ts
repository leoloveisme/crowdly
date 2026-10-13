import type { Config } from "tailwindcss";
import platform from "../../tailwind.config";

// Same theme as the platform; scans both trees since the web app renders
// platform components too.
export default {
  ...platform,
  content: ["./index.html", "./src/**/*.{ts,tsx}", "../../src/**/*.{ts,tsx}"],
} satisfies Config;

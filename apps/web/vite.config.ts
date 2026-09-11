import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Allow access from other devices on the local network (e.g. mobile on Wi‑Fi)
  server: {
    host: true, // equivalent to '0.0.0.0'
    port: 5173,
  },
});

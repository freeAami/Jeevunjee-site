import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Vercel serves the site from the root. GitHub Pages serves it under /Jeevunjee-site/ (set by its workflow).
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
});

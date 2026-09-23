import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Served from https://freeaami.github.io/Jeevunjee-site/
  base: '/Jeevunjee-site/',
  plugins: [react()],
});

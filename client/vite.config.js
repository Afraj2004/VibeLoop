import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import seoPages from './seo/plugin.js';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), seoPages()],
  server: {
    port: 3000
  }
});

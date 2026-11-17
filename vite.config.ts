import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  server: {
    port: 5173,
    open: false,
  },
  build: {
    target: 'esnext',
  },
});

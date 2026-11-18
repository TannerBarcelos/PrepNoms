import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', assetsDir: 'assets', modulePreload: false,
    rollupOptions: { output: { entryFileNames: 'assets/app.js', assetFileNames: 'assets/app[extname]', chunkFileNames: 'assets/[name].js' } } },
})

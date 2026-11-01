import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' ist Pflicht für HA Ingress (App läuft unter /api/hassio_ingress/<token>/)
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', assetsDir: 'assets', chunkSizeWarningLimit: 1500 },
  server: { proxy: { '/api': 'http://127.0.0.1:8099' } },
})

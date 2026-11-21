import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/dejavutacos/',
  plugins: [react(), tailwindcss()],
  server: {
    // The walkthrough container calls this dev server as host.docker.internal.
    allowedHosts: true,
    proxy: {
      '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:8000',
    },
  },
})

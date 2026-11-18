import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Where the Django back end runs. Inside Docker Compose this is http://backend:8000.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    // Forward /api calls to Django so the browser sees one origin in development.
    // This is what lets the SameSite=Strict refresh cookie work locally.
    proxy: {
      '/api': apiTarget,
      // Uploaded files in development (production serves them from S3).
      '/media': apiTarget,
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
})

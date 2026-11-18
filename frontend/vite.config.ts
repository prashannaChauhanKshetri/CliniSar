import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Where the Django back end runs. Inside Docker Compose this is http://backend:8000.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // Forward API calls to Django so the browser sees ONE origin in development.
    // This is what lets the SameSite=Strict refresh cookie work locally.
    proxy: {
      '/api': apiTarget,
      // Uploaded files in development (production serves them from S3).
      '/media': apiTarget,
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Libraries change rarely, our code often. Separate files let browsers keep the
        // libraries cached between releases. Higher priority wins when a file matches two.
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/,
              priority: 4,
            },
            { name: 'mantine', test: /node_modules[\\/]@mantine[\\/]/, priority: 3 },
            {
              name: 'charts',
              test: /node_modules[\\/](recharts|d3-[a-z-]+|victory-vendor)[\\/]/,
              priority: 3,
            },
            { name: 'vendor', test: /node_modules/, priority: 1 },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
})

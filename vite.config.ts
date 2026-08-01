import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    manifest: {
      name: 'Menengs - Sistem Stok & Penjualan',
      short_name: 'Menengs',
      description: 'Sistem stok dan penjualan seluruh outlet Menengs.',
      lang: 'id',
      theme_color: '#bc2018',
      background_color: '#fff8eb',
      display: 'standalone',
      start_url: '/',
      icons: [
        { src: '/menengs-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/menengs-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    },
    workbox: { 
      navigateFallback: '/index.html',
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024 
    },
  })],
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  build: {
    rollupOptions: {
      output: {
        // Grafik tidak diperlukan pada layar kasir/operasional awal; pisahkan
        // agar bundle utama tetap ringan saat aplikasi pertama dibuka.
        manualChunks: {
          charts: ['recharts'],
        },
      },
    },
  },
})

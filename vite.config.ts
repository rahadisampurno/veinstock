import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    manifest: {
      name: 'VEINSTOCK - Sistem Stok UMKM',
      short_name: 'VEINSTOCK',
      description: 'Sistem stok dan penjualan multi-UMKM dan multi-lokasi.',
      lang: 'id',
      theme_color: '#092f4f',
      background_color: '#f3f6f8',
      display: 'standalone',
      start_url: '/',
      icons: [
        { src: '/veinstock-icon-192-v2.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/veinstock-icon-512-v2.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    },
    workbox: { 
      navigateFallback: '/index.html',
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024 
    },
  })],
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
})

# VEINSTOCK

Sistem stok dan penjualan multi-UMKM dan multi-lokasi berbasis web/PWA.

## Multi-UMKM

- Setiap UMKM mendaftar dan memperoleh ruang kerja (`organization`) sendiri.
- Data produk, lokasi, stok, penjualan, transfer, opname, dan histori dipisahkan berdasarkan ID organisasi pada backend.
- ID organisasi ditandatangani di JWT dan tidak dipercaya dari input browser.
- Owner dapat menambah lokasi serta akun PIC/Keuangan khusus usahanya.
- PIC hanya dapat memproses transaksi outlet yang ditugaskan; Keuangan memiliki akses baca.
- Pengujian isolasi memastikan perubahan pada UMKM A tidak muncul pada UMKM B.

## Fitur MVP

- Login dan pembatasan menu berdasarkan role Owner, PIC Outlet, dan Keuangan.
- Registrasi produk, varian, SKU, harga, minimum stok, dan konversi gelas ke gram.
- Saldo stok terpisah untuk gudang owner dan setiap outlet.
- Transfer stok dengan alur kirim dan konfirmasi penerimaan outlet.
- Penjualan offline, online, dan reseller dengan pengurangan stok otomatis.
- Pencatatan produk mix berdasarkan jumlah gelas.
- Stock opname dan koreksi tanpa menghapus histori sebelumnya.
- Jejak audit setiap perubahan stok.
- Dashboard dan laporan penjualan per kanal.
- Ekspor laporan CSV dengan notifikasi lokasi folder Unduhan/Downloads.
- PWA yang dapat dipasang di HP, tablet, Windows, dan macOS.
- Penyimpanan pusat MySQL dengan pemeriksaan versi untuk mencegah data lama menimpa data baru.
- Otorisasi backend: Keuangan hanya baca, PIC terbatas pada outletnya, dan master data hanya dapat diubah Owner.

## Menjalankan secara lokal

```bash
npm install
npm run dev
```

Frontend berjalan pada `http://localhost:5173` dan API pada `http://localhost:8787`.

Tanpa konfigurasi database, server menggunakan memori untuk demonstrasi. Akun lokal:

- Owner: `owner@meneng.id`
- PIC: `pic@meneng.id`
- Keuangan: `finance@meneng.id`
- Password demo: `VeinStock123!`

## Build production

```bash
npm run build
npm start
```

Server production menyajikan hasil build dari folder `dist` dan API dari proses Node.js yang sama.

## Deployment Hostinger

1. Buat database MySQL baru di hPanel.
2. Salin `.env.example` menjadi variabel environment pada Web App Hostinger.
3. Isi `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, dan `DB_PASSWORD` dari detail database Hostinger.
4. Buat nilai acak panjang untuk `JWT_SECRET`.
5. Tambahkan `CLOUDINARY_URL` melalui Environment Variables Hostinger, jangan ditulis di source code.
6. Tentukan `INITIAL_ADMIN_EMAIL` dan password awal yang kuat sebelum deployment pertama.
7. Tambahkan Node.js Web App dari repository GitHub.
8. Gunakan Node.js 22.x, build command `npm run build`, dan entry file `server/index.mjs`.
9. Hubungkan domain atau subdomain dan aktifkan SSL.

Database dan akun demo awal dibuat otomatis ketika aplikasi pertama kali berjalan. UMKM baru dapat memilih **Daftar UMKM** pada halaman masuk dan langsung memperoleh workspace privat. Ganti password demo sebelum aplikasi diberikan kepada pengguna operasional.

### Kecocokan paket Hostinger

Aplikasi memakai satu Node.js Web App dan satu database MySQL bersama dengan pemisahan tenant secara logis. Tidak membutuhkan VPS, aplikasi desktop, atau database terpisah untuk setiap UMKM. Berdasarkan paket Hostinger yang sudah diperiksa pada 23 Juli 2026, resource dan slot Web App yang tersedia mencukupi untuk peluncuran awal VEINSTOCK; kapasitas perlu dipantau dan dinaikkan ketika jumlah pengguna serta transaksi sudah besar.

## Environment variables

Lihat [.env.example](.env.example). Jangan commit file `.env` atau kredensial production.

## Optimasi gambar

Upload gambar diproses di backend sebelum dikirim ke Cloudinary. File dibatasi maksimal 5 MB, orientasi diperbaiki otomatis, ukuran maksimum dibuat 1200×1200 piksel tanpa memperbesar gambar kecil, metadata dibuang, dan hasil dikonversi ke WebP kualitas 75. Setiap tenant disimpan pada folder Cloudinary `veinstock/{organizationId}`.

## Catatan sinkronisasi

Data production disimpan di MySQL Hostinger. Setiap penyimpanan membawa nomor versi. Jika dua perangkat mengubah versi yang sama, perangkat kedua menerima peringatan untuk memuat ulang sehingga data terbaru tidak tertimpa diam-diam.

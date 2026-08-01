# MENENGS

Sistem stok dan penjualan internal Menengs untuk gudang dan outlet berbasis web/PWA.

## Operasional Menengs

- Owner dapat menambah lokasi serta akun PIC/Keuangan untuk operasional Menengs.
- PIC hanya dapat memproses transaksi outlet yang ditugaskan; Keuangan memiliki akses baca.
- Pendaftaran akun publik dimatikan secara default. Owner membuat akun tim dari menu Pengaturan.

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
- Password awal ditentukan melalui variabel `INITIAL_ADMIN_PASSWORD`; jangan gunakan kredensial contoh untuk deployment produksi.

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

Database dan akun awal dibuat otomatis ketika aplikasi pertama kali berjalan. Ganti password awal sebelum aplikasi digunakan secara operasional. Pendaftaran mandiri hanya dapat diaktifkan secara eksplisit dengan `ALLOW_SELF_REGISTRATION=true` untuk kebutuhan pengembangan/migrasi.

### Kecocokan paket Hostinger

Aplikasi memakai satu Node.js Web App dan satu database MySQL untuk seluruh operasional Menengs. Berdasarkan paket Hostinger yang sudah diperiksa pada 23 Juli 2026, resource dan slot Web App yang tersedia mencukupi untuk peluncuran awal; kapasitas tetap perlu dipantau saat jumlah pengguna serta transaksi bertambah.

## Environment variables

Lihat [.env.example](.env.example). Jangan commit file `.env` atau kredensial production.

## Optimasi gambar

Upload gambar diproses di backend sebelum dikirim ke Cloudinary. File dibatasi maksimal 5 MB, orientasi diperbaiki otomatis, ukuran maksimum dibuat 1200×1200 piksel tanpa memperbesar gambar kecil, metadata dibuang, dan hasil dikonversi ke WebP kualitas 75. Setiap organisasi disimpan pada folder Cloudinary `menengs/{organizationId}`.

## Catatan sinkronisasi

Data production disimpan di MySQL Hostinger. Setiap penyimpanan membawa nomor versi. Jika dua perangkat mengubah versi yang sama, perangkat kedua menerima peringatan untuk memuat ulang sehingga data terbaru tidak tertimpa diam-diam.

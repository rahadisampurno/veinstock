# Fase 4A — Regression Production MENENGS

Tanggal pengujian: 4 Agustus 2026 (WIB)
Environment: Production — `https://aquamarine-weasel-163192.hostingersite.com/`
Commit: `6c90aa2` (`main`)
Penanda transaksi uji: `UAT-F4A-20260804`

## Ringkasan

Fase 4A dinyatakan **LULUS**. Build yang diuji telah aktif di production, seluruh gate otomatis lulus, API dan database sehat, validasi transaksi menolak payload invalid, dan alur bisnis terkendali berhasil direkonsiliasi ke saldo awal.

Fase ini belum menjadi persetujuan serah-terima final karena backup–restore drill dan sign-off UAT pengguna masih harus diselesaikan pada Fase 4B.

## Hasil Gate

| Gate | Hasil | Bukti ringkas |
|---|---|---|
| Automated test | LULUS | 33/33 tes lulus |
| Lint | LULUS | Tidak ada error ESLint |
| Production build | LULUS | Vite + PWA berhasil dibangun |
| Dependency audit | LULUS | 0 vulnerability |
| Deployment | LULUS | Bundle production `index-DNSm78sy.js` aktif |
| Database health | LULUS | `/api/health`: `ok=true`, database `mysql` |
| Authentication | LULUS | Login Owner production berhasil; endpoint tanpa token mengembalikan 401 |
| Legacy overwrite protection | LULUS | `PUT /api/state` mengembalikan 410 |
| PWA | LULUS | Manifest, service worker, dan bundle mengembalikan 200 |
| Security headers | LULUS | HSTS, nosniff, SAMEORIGIN, no-referrer, dan CSP aktif |
| Runtime browser | LULUS | Tidak ada log error/warning selama smoke dan responsive test |

## Regression Transaksi dan Rekonsiliasi

Varian uji: `Cemilan Mix Meneng · Balado` (`v-balado`).

### Gudang Owner

Saldo awal: **8.833**
Saldo akhir: **8.833**

Alur yang diuji:

1. Opname `8.833 → 8.834`.
2. Opname pemulihan `8.834 → 8.833`.
3. Stok masuk `+1`.
4. Retur supplier `-1`.
5. Penjualan offline `-1`.
6. Retur pelanggan `+1`.

Semua command mengembalikan HTTP 201 dan saldo akhir sama dengan saldo awal.

### Transfer Dua Arah

| Lokasi | Saldo awal | Saldo akhir |
|---|---:|---:|
| Gudang Owner | 8.833 | 8.833 |
| Outlet Meneng 1 | 2.273 | 2.273 |

Transfer `Gudang Owner → Outlet Meneng 1` dan transfer balik berhasil diterima. Bukti kirim/terima tersimpan dan kedua lokasi kembali ke saldo awal.

Dokumen uji:

- `TRF-20260804-7C50`
- `TRF-20260804-45BA`

## Gate Validasi Negatif

Payload berikut ditolak dengan HTTP 400 dan **tidak menaikkan versi state**:

- Penjualan tanpa item.
- Transfer dengan lokasi asal dan tujuan yang sama.
- Retur supplier melebihi stok.
- Opname tanpa alasan.
- Resep HPP invalid.

Versi state sebelum dan sesudah rangkaian invalid tetap `54`.

## HPP dan Marketplace

- Popup penerapan HPP menampilkan daftar produk terlebih dahulu.
- Klik produk membuka checklist beberapa varian.
- Resep lama tetap terbaca melalui kompatibilitas `variantId`/`variantIds`.
- Preset Shopee, Tokopedia, TikTok Shop, Facebook Marketplace, dan Di luar Marketplace tersedia.
- Komisi affiliate tersedia pada Shopee/TikTok.
- Input nominal menggunakan format Rupiah.
- Modal HPP menampilkan sumber resep yang digunakan.

## Responsive dan Accessibility Smoke

Viewport yang diuji:

- Mobile: 390×844.
- Tablet: 768×1024.
- Desktop: 1440×900.

Hasil:

- Tidak ditemukan overflow horizontal.
- Navigasi mobile tetap dapat diakses.
- Tidak ditemukan kontrol interaktif terlihat tanpa nama aksesibel.
- Tidak ada error/warning browser selama pengujian.

## Data Uji Production

Transaksi uji tidak dihapus agar jejak audit tetap utuh. Semua transaksi diberi penanda `UAT-F4A-20260804` dan dibuat berpasangan sehingga saldo akhirnya kembali ke kondisi awal.

## Gate Fase 4B yang Masih Wajib

1. Backup database production dan verifikasi usia/retensi backup.
2. Restore drill ke database terisolasi, lalu cocokkan jumlah record dan saldo.
3. UAT pengguna untuk Owner, Admin, Gudang, PIC/Kasir, dan Keuangan memakai akun khusus masing-masing.
4. Persetujuan formal atas known limitation: bundle JavaScript utama masih menghasilkan warning ukuran di atas 500 kB, tetapi tidak menghambat fungsi.
5. Penandatanganan checklist UAT dan berita acara serah-terima.

## Keputusan

**Fase 4A: LULUS.**
**Status serah-terima final: MENUNGGU FASE 4B (backup–restore dan sign-off UAT).**

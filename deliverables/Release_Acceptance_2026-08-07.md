# Release Acceptance MENENGS — 7 Agustus 2026

## Keputusan

Status repository lokal: **ZERO KNOWN ERROR pada cakupan yang dapat diverifikasi di lingkungan lokal**.

Release ke client tetap harus menunggu verifikasi environment-specific pada domain production: TLS/domain, pengiriman email SMTP, Cloudinary production, kamera/perangkat fisik, dan browser/device milik client. Item tersebut tidak dapat dibuktikan hanya dari localhost.

## Perbaikan release-hardening

1. Input Rupiah tidak lagi memakai React event yang sudah kedaluwarsa di `requestAnimationFrame`.
2. Jumlah cicilan kasbon dibaca langsung dari input saat submit dan dihitung ulang server.
3. Lokasi tidak dapat dinonaktifkan bila masih dipakai staf aktif atau memiliki saldo stok.
4. Akun PIC lokal yang orphan dipindahkan ke outlet aktif.
5. Stock opname tidak lagi default ke nol; hasil hitung wajib diisi sebelum Simpan aktif.
6. Retur pelanggan otomatis memakai lokasi penjualan selesai terbaru.
7. Perubahan hash URL ditangani dan URL tanpa izin dikembalikan ke halaman aman.
8. Nama pelaku pada dokumen stok masuk/opname ditampilkan sebagai nama pengguna, bukan ID internal.
9. Mutasi per organisasi diserialisasi agar dua kasir tidak dapat menjual unit terakhir bersamaan.
10. SKU dan barcode kini unik lintas seluruh produk dalam organisasi.
11. Snapshot `unitCost` penjualan disimpan ke MySQL dan tetap tersedia setelah refresh/restart.
12. Production menambahkan CSP, HSTS, proteksi frame/content sniffing, CORS allowlist, dan rate limit reset password.
13. Validasi bisnis 4xx tidak lagi dicatat sebagai error server internal.

## Bukti otomatis

- Vitest: 8 test files, 43 tests, seluruhnya lulus.
- ESLint: lulus tanpa error.
- TypeScript + Vite production build: lulus.
- PWA service worker dan manifest: berhasil dibuat.
- `npm audit --omit=dev --audit-level=high`: 0 vulnerability.
- Secret scan repository: tidak menemukan secret aktual; hanya placeholder `.env.example`.

## Matriks peran

| Peran | Login/state | Lokasi | Mutasi yang diizinkan | Mutasi terlarang |
|---|---:|---|---|---|
| Owner | Lulus | Semua | Semua tindakan Owner | — |
| Admin Cabang | Lulus | Semua | Sesuai policy dinamis | Validasi data tetap aktif |
| Keuangan | Lulus | Semua data laporan | Baca/ekspor | Penjualan ditolak 403 |
| Staf Gudang | Lulus | Gudang penugasan | Stok masuk/operasional gudang | Penjualan/lokasi lain ditolak 403 |
| PIC Outlet | Lulus | Outlet penugasan | Penjualan dan operasi outlet | Lokasi lain ditolak 403 |
| Kasir | Lulus | Outlet penugasan | Penjualan outlet | Opname ditolak 403 |
| Karyawan | Lulus di integration test | Lokasi kerja sendiri | Absensi sendiri | Data usaha lain tidak dikirim |

Menu tersembunyi bukan satu-satunya proteksi. Endpoint command memeriksa permission dan lokasi pada server.

## Siklus bisnis yang direkonsiliasi

Data UAT `UAT-OWNER-20260807`:

- Stok masuk: +50.
- Transfer keluar/masuk: 10 antar-outlet.
- Penjualan: -2 dengan omzet Rp30.000.
- Retur pelanggan: +1.
- Opname: -1.
- Saldo akhir: 40 + 8 = 48 unit.
- HPP penjualan: Rp16.000.
- Laba kotor: Rp14.000.
- Laporan: transaksi 1/1 cocok dan snapshot HPP 1/1 lengkap.

Kasbon regresi:

- Nominal Rp120.000.
- Tenor 3.
- Cicilan Rp40.000 × 3 tersimpan di UI dan database.

## Negative dan concurrency testing

Sistem menolak tanpa mengubah saldo:

- Penjualan melebihi stok.
- Transfer melebihi stok.
- Transfer ke lokasi yang sama.
- Retur supplier melebihi stok.
- Opname bernilai negatif.
- Produk dengan SKU/barcode duplikat.
- Email pengguna duplikat.
- Produk dengan harga jual nol.
- Mutation akun ke lokasi lain.
- Perubahan role policy oleh non-Owner.
- Token JWT rusak.
- Payload JSON rusak.
- Percobaan pola SQL injection pada login.

Dua penjualan paralel terhadap satu unit menghasilkan tepat satu sukses dan satu penolakan; saldo akhir nol dan tidak pernah negatif.

## Persistensi, restart, dan pemulihan

- Frontend/backend direstart dan data tetap sama.
- Database health: MySQL.
- Migrasi kolom `sale_items.unit_cost` berhasil.
- Backup-restore drill memakai database sementara terisolasi.
- 14 tabel, 1.205 baris, SHA-256 per tabel cocok, mismatch 0.
- Database restore sementara dihapus setelah drill.

## Security acceptance

- Login rate limit: percobaan ke-11 menerima HTTP 429.
- Forgot password rate limit: permintaan ke-4 menerima HTTP 429.
- Reset password memiliki rate limit dan OTP maksimal lima percobaan, kedaluwarsa 15 menit, serta sekali pakai.
- JWT kedaluwarsa 12 jam dan token rusak menerima HTTP 401.
- CORS origin asing tidak memperoleh `Access-Control-Allow-Origin`.
- CSP, HSTS, `nosniff`, frame policy, referrer policy, dan permissions policy aktif pada production mode.
- Upload dibatasi satu file, 5 MB, MIME gambar terpilih, diproses ulang oleh Sharp menjadi WebP, dan dipisah per organisasi.
- Password disimpan menggunakan bcrypt.
- Database menggunakan parameterized queries.

## Production smoke dan performa lokal

- Production-mode server berhasil boot dengan database wajib.
- Health endpoint: OK/MySQL.
- Login Owner: 344,3 ms.
- Pembacaan state: 21,2 ms untuk payload 12.001 byte.
- 50 pembacaan state paralel: seluruhnya berhasil dalam 162,6 ms.
- PDF dan Excel berhasil dibuat dari UI.
- Browser console setelah seluruh regresi: 0 error, 0 warning.

Angka ini adalah baseline mesin lokal, bukan SLA internet client.

## Gate yang harus dilakukan pada environment client

Release belum boleh ditandatangani sampai seluruh item ini diperiksa di domain production:

- [ ] HTTPS dan sertifikat domain valid tanpa mixed content.
- [ ] `APP_ORIGIN` hanya berisi origin production yang disetujui.
- [ ] `JWT_SECRET`, password database, password Owner awal, SMTP, dan Cloudinary memakai secret production baru.
- [ ] `ALLOW_SELF_REGISTRATION=false` dan `ALLOW_LEGACY_SNAPSHOT=false`.
- [ ] OTP benar-benar diterima melalui email client.
- [ ] Upload foto benar-benar tersimpan di akun Cloudinary client.
- [ ] Kamera barcode diuji pada Android dan iPhone fisik.
- [ ] UI diuji dan disetujui client pada Chrome, Edge, Safari macOS/iPhone, dan Chrome Android.
- [ ] PDF/Excel dibuka dari folder unduhan perangkat client.
- [ ] Backup terjadwal production dibuat dan satu restore terisolasi berhasil.
- [ ] Owner client menyetujui daftar pengguna, lokasi, saldo awal, serta matriks hak akses.
- [ ] Semua akun/data UAT dihapus atau dinonaktifkan sebelum go-live.

## Known limitations non-blocking

- Build menghasilkan chunk aplikasi sekitar 536 KB sebelum gzip (sekitar 152 KB gzip). Build lulus dan performa lokal baik, tetapi code splitting tambahan disarankan bila data/fitur bertambah besar.
- Backup lokal membuktikan prosedur restore database saat ini; keberhasilan backup terjadwal provider tetap harus diuji di akun hosting client.
- Kamera, permission perangkat, email provider, dan TLS tidak dapat disimulasikan secara sah dari localhost.

## Sign-off

| Pihak | Nama | Tanggal | Status | Tanda tangan |
|---|---|---|---|---|
| Developer |  |  | Technical acceptance |  |
| Owner bisnis |  |  | Data dan alur operasional |  |
| Client |  |  | Production acceptance |  |

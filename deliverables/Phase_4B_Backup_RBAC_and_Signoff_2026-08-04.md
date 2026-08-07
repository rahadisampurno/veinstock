# Fase 4B — Backup, RBAC, dan Sign-off MENENGS

Tanggal pengujian: 4 Agustus 2026 (WIB)
Environment aplikasi: Production
Deployment: `https://aquamarine-weasel-163192.hostingersite.com/`
Commit aplikasi: `6c90aa2`

## Ringkasan

Gate teknis Fase 4B dinyatakan **LULUS**:

- Backup database production tersedia dan dapat diunduh.
- Backup database MENENGS berhasil dipulihkan ke database terisolasi.
- Matriks akses production untuk Admin, Keuangan, Gudang, PIC, dan Kasir sesuai kebijakan.
- Seluruh akun UAT sementara telah dinonaktifkan.
- Database restore sementara telah dihapus.

Status serah-terima adalah **SIAP UNTUK SIGN-OFF MANUSIA**. Tanda tangan/konfirmasi Owner dan penerima sistem tetap tidak dapat digantikan oleh pengujian teknis.

## Backup Production

Sumber backup: Hostinger hPanel → Backup → Pulihkan dan download → Backup database.

| Item | Hasil |
|---|---|
| Database | `u690108464_veinstock` |
| Waktu snapshot | 3 Agustus 2026 17:49 |
| Backup otomatis | Aktif, harian |
| File | `u690108464_veinstock.20260803104938.sql.gz` |
| Ukuran file | 13.404 byte |
| SHA-256 | `ce40f5773f2b4f7dd4711c8d20cf6557127d4a0a5d1227c258936d9312f5a3ce` |
| Integritas gzip | LULUS |

File backup tersimpan di folder Downloads pengguna dan mengandung data sensitif. File tidak boleh dimasukkan ke Git atau dibagikan melalui kanal publik.

Catatan: satu backup database WordPress `u690108464_l3zkL` juga terunduh saat identifikasi database. File tersebut bukan backup MENENGS dan tidak digunakan sebagai bukti restore.

## Restore Drill Terisolasi

Backup production MENENGS dipulihkan ke database sementara dengan prefix `veinstock_restore_f4b_`. Tidak ada perintah restore yang diarahkan ke database production.

Hasil restore:

- 14 tabel berhasil dibuat.
- 153 record berhasil dipulihkan.
- Tidak ada tabel inti yang hilang.
- Database sementara berhasil dihapus setelah verifikasi.

| Tabel | Jumlah record |
|---|---:|
| app_state | 10 |
| balances | 12 |
| locations | 15 |
| organizations | 10 |
| products | 2 |
| sale_items | 11 |
| sales | 7 |
| stock_counts | 4 |
| stock_movements | 33 |
| transfers | 7 |
| user_location_assignments | 0 |
| users | 36 |
| variant_location_min_stock | 0 |
| variants | 6 |

Skrip drill:

- `server/restore_sql_backup_drill.mjs` untuk restore file backup Hostinger.
- `server/backup_restore_drill.mjs` untuk verifikasi logical copy database yang dikonfigurasi melalui `.env`.

Kedua skrip memakai flag eksplisit, nama database sementara tervalidasi, dan blok cleanup otomatis.

## Matriks Role Production

Akun UAT sementara dibuat melalui Owner, diuji melalui API production, lalu dinonaktifkan.

| Role | Login | Scope data | Gate mutation |
|---|---|---|---|
| Owner | LULUS | Semua lokasi | Akses operasional penuh |
| Admin | LULUS | Semua lokasi | Konfigurasi diizinkan; pembuatan user tetap Owner-only |
| Keuangan | LULUS | Semua lokasi, read-only | Mutation ditolak 403 |
| Gudang | LULUS | Gudang yang ditugaskan | Stok masuk diizinkan; lokasi lain dan penjualan ditolak |
| PIC | LULUS | Outlet yang ditugaskan | Penjualan outlet diizinkan; lokasi lain ditolak |
| Kasir | LULUS | Outlet yang ditugaskan | Penjualan diizinkan; opname ditolak |

Ringkasan cleanup:

- Akun UAT dibuat: 5.
- Akun UAT aktif setelah tes: 0.
- Akun UAT nonaktif setelah tes: 5.
- Database restore sementara tersisa: 0.

## Checklist Sign-off Serah-terima

### Pihak Pengembang

- [x] Regression production Fase 4A lulus.
- [x] Backup database production teridentifikasi dan dapat diunduh.
- [x] Restore drill terisolasi lulus.
- [x] RBAC production untuk seluruh role utama lulus.
- [x] Akun dan data sementara direkonsiliasi/dinonaktifkan.
- [x] Automated test, lint, build, dan dependency audit lulus.
- [x] Known limitation dicatat.

### Owner/Penerima Sistem

- [ ] Owner memeriksa skenario UAT dan menerima hasilnya.
- [ ] Daftar pengguna serta penempatan lokasi telah dikonfirmasi.
- [ ] SOP operasional dan jalur eskalasi telah diterima.
- [ ] Kebijakan retensi backup telah disetujui.
- [ ] Known limitation ukuran bundle JavaScript diterima sebagai non-blocker.
- [ ] Berita acara serah-terima ditandatangani.

## Known Limitation Non-blocker

Build production masih memberi warning bahwa satu bundle JavaScript utama lebih dari 500 kB setelah minifikasi. Fungsi, runtime, dan responsive smoke tidak menunjukkan kegagalan. Optimasi code splitting dapat dimasukkan ke backlog pasca-serah-terima.

## Keputusan

**Fase 4B teknis: LULUS.**
**Kesiapan produk: SIAP DISERAHKAN untuk persetujuan akhir Owner/penerima.**
**Serah-terima administratif: MENUNGGU sign-off dan berita acara.**

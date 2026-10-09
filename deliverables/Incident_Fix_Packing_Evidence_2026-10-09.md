# Laporan Perbaikan Insiden Upload Bukti Packing

Tanggal investigasi: 9 Oktober 2026  
Sistem: Menengs — Pengiriman Pesanan dan Kehadiran  
Status: **Perbaikan lokal selesai dan lolos verifikasi otomatis; menunggu deployment dan retest production.**

## Keluhan pengguna

- Sistem dan proses masuk terasa lambat.
- Operator sudah memindai nomor resi dan memilih foto bukti packing, tetapi penyimpanan berlangsung lama.
- Nomor resi tersimpan, sedangkan foto tidak terlihat dan paket tetap berstatus **Menunggu bukti packing**.
- Dashboard hosting menampilkan penggunaan memori tinggi sekitar 1,4 GB pada saat pemeriksaan.

## Hasil tracing

Alur lama melakukan pekerjaan berikut untuk satu upload foto:

1. Memuat state organisasi lengkap untuk validasi awal.
2. Memproses gambar dan mengunggahnya ke Cloudinary.
3. Memuat state organisasi lengkap lagi untuk transaksi penyimpanan paket.
4. Setelah server sukses, browser kembali mengunduh state organisasi lengkap.

Dengan demikian satu upload dapat memicu tiga siklus pemuatan state penuh. Selain memperpanjang waktu tunggu dan penggunaan memori, refresh terakhir membuat UI dapat menampilkan pesan seolah-olah foto gagal walaupun transaksi utama sebenarnya telah berhasil.

Nomor resi juga memang dibuat terlebih dahulu sebagai `pending_packing` pada alur penjualan. Jika tahap foto gagal sebelum commit, nomor resi tetap ada dan statusnya tetap **Menunggu bukti packing**. Kondisi ini sesuai dengan keluhan pengguna.

## Perbaikan yang diterapkan

1. Menghapus pemuatan state lengkap yang duplikat sebelum upload. Validasi awal sekarang hanya membaca data otorisasi dan lokasi yang diperlukan.
2. Respons command upload sekarang langsung membawa data paket yang telah tersimpan.
3. Frontend langsung memperbarui paket dari respons server dan tidak lagi mengunduh `/api/state` penuh setelah upload sukses.
4. Pesan sukses baru diberikan setelah server mengembalikan paket dengan status kanonis.
5. Menambahkan log terstruktur untuk setiap upload:
   - status HTTP;
   - total durasi;
   - durasi upload gambar;
   - durasi commit paket;
   - ukuran file asli;
   - tahap dan kode error ketika gagal.
6. Membatasi cache Sharp menjadi 32 MB dan jumlah worker pemrosesan gambar maksimal dua untuk mengurangi lonjakan memori ketika beberapa operator mengunggah foto bersamaan.
7. Menambahkan regression assertion bahwa endpoint upload mengembalikan paket yang benar dengan status `ready`.

## Dampak teknis yang terukur

| Indikator | Sebelum | Sesudah |
|---|---:|---:|
| Siklus pemuatan state penuh per upload | 3 | 1 |
| Refresh state penuh setelah upload sukses | Ya | Tidak |
| Data paket langsung pada respons upload | Tidak | Ya |
| Batas cache pemrosesan gambar | Default library | 32 MB |
| Batas worker pemrosesan gambar | Default mesin | Maksimal 2 |
| Log durasi per tahap upload | Tidak ada | Ada |

## Bukti verifikasi lokal

- Automated test: **135 lulus**, 2 dilewati sesuai konfigurasi.
- Test file: **21 lulus**, 1 dilewati sesuai konfigurasi.
- TypeScript dan production build: **lulus**.
- ESLint: **lulus tanpa error**.
- Pemeriksaan whitespace/diff: **lulus**.

## Retest production setelah deployment

Deployment belum dianggap selesai sebelum seluruh pemeriksaan berikut lulus:

- [ ] Deployment Hostinger menggunakan commit perbaikan terbaru dan berstatus **Selesai**.
- [ ] Proses Node.js telah restart pada deployment tersebut.
- [ ] Login akun operasional berhasil pada koneksi seluler.
- [ ] Resi pada tab **Menunggu bukti packing** dapat diberi foto dan langsung berpindah ke **Siap diangkut**.
- [ ] Foto bukti dapat dibuka kembali.
- [ ] Nomor resi baru dapat dipindai, diberi foto kamera, dan disimpan satu kali tanpa duplikasi.
- [ ] Log runtime menampilkan `Packing evidence command completed` dengan HTTP 201, `uploadMs`, `commitMs`, dan `totalMs`.
- [ ] Tidak ada `Packing evidence command failed` pada percobaan sukses.
- [ ] Penggunaan memori diamati sebelum dan sesudah minimal lima upload berurutan.

## Bukti yang perlu disimpan untuk klien

1. Screenshot deployment Hostinger dengan commit perbaikan dan status **Selesai**.
2. Screenshot paket sebelum upload pada status **Menunggu bukti packing**.
3. Screenshot paket sesudah upload pada status **Siap diangkut**.
4. Screenshot foto bukti yang berhasil dibuka.
5. Potongan log runtime yang menampilkan status 201 dan durasi setiap tahap, tanpa kredensial atau data rahasia.
6. Screenshot penggunaan memori setelah retest.

## Kesimpulan

Perbaikan lokal menghilangkan dua dari tiga pemuatan state penuh pada jalur upload, mencegah refresh UI pasca-upload menjadi sumber false failure, membatasi sumber daya pemrosesan gambar, dan menyediakan log yang dapat membuktikan hasil di production. Status akhir baru dapat diubah menjadi **Production Verified** setelah deployment dan checklist retest di atas selesai.

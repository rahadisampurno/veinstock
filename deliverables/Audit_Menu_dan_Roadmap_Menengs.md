# Audit Menu dan Roadmap Produk Menengs

Tanggal audit: 31 Juli 2026
Dasar audit: implementasi menu React, kontrol RBAC, command API Express, model data, dan pengujian otomatis pada codebase Menengs.

## Ringkasan Eksekutif

Menengs sudah berkembang dari aplikasi stok menjadi sistem operasional usaha snack dengan tiga poros utama: inventaris multi-lokasi, POS/multi-kanal, dan pengelolaan usaha. Struktur menu saat ini **masih relevan**, tetapi perlu diperjelas menjadi dua lapisan:

1. **Operasional harian:** stok, transfer, penerimaan, POS, retur, dan opname.
2. **Pengendalian bisnis:** harga/HPP, laporan, analitik, SDM, dan integrasi kanal online.

Nilai terkuat aplikasi adalah alur stok dan transaksi yang sudah menggunakan command API. Potensi bisnis terbesar berikutnya adalah menyatukan pesanan marketplace melalui BigSeller, menetapkan harga dari HPP, dan mengubah data operasional menjadi keputusan pembelian/produksi.

## Hasil Validasi Teknis

| Pemeriksaan | Hasil | Catatan |
|---|---:|---|
| Lint | Lulus | Tidak ada pelanggaran ESLint. |
| Unit/integration test | Lulus, 16 test | Mencakup otorisasi, isolasi tenant, POS, transfer, penerimaan, dan persistensi command. |
| Production build | Lulus | Bundle Vite/PWA berhasil dibuat. |
| Uji database nyata end-to-end | Belum tercakup | Suite berjalan dalam mode demo tanpa DB host; perlu dijalankan terhadap MySQL staging. |
| Uji BigSeller/marketplace nyata | Belum ada | Belum ada connector maupun webhook BigSeller pada codebase. |

## Temuan Prioritas Kritis

### P0 — Konsistensi penyimpanan data SDM

POS, transfer, penerimaan transfer, stok masuk, retur, opname, produk, lokasi, minimum stok, dan HPP sudah memakai endpoint command yang melakukan validasi serta commit dari state server terbaru.

Sebaliknya, menu **Karyawan, Kehadiran, Kasbon, dan Penggajian** masih memperbarui `setData`, lalu dikirim melalui `PUT /api/state` sebagai snapshot organisasi. Pola ini berisiko konflik versi ketika dua perangkat mengubah data berdekatan dan tidak sejalan dengan arsitektur command API yang lebih aman.

**Keputusan yang disarankan:** sebelum menambah fitur SDM, pindahkan seluruh aksi tersebut ke command API terpisah: `employees`, `attendance`, `payroll`, dan `loans`. Semua command harus menjalankan validasi peran, lokasi, dan transaksi database atomik.

### P0 — Database belum sepenuhnya menjadi model sumber tunggal

Database relasional sudah digunakan untuk lokasi, produk, varian, saldo, penjualan, transfer, pergerakan stok, dan opname. Namun data seperti supplier, retur, penerimaan, SDM, HPP, konfigurasi marketplace, kanal penjualan, dan beberapa field transaksi masih bergantung pada payload `app_state` JSON.

**Dampak:** data tetap dapat tersimpan, tetapi kemampuan audit, query laporan skala besar, integrasi BigSeller, dan pemeliharaan jangka panjang menjadi lebih terbatas.

**Keputusan yang disarankan:** lakukan migrasi bertahap dari `app_state` ke tabel relasional dan pertahankan payload hanya sebagai cache migrasi sementara. Tambahkan migrasi skema, repository/query layer, serta test database nyata sebelum menghapus jalur lama.

### P1 — Integrasi online belum ada, baru analitik manual

Menu Penjualan sudah membedakan kanal `offline`, `online`, dan `reseller`; HPP & Marketplace juga sudah menghitung biaya platform. Tetapi belum ada connector BigSeller, inbox pesanan, webhook, pemetaan SKU, atau proses sinkronisasi stok/pesanan.

**Keputusan yang disarankan:** jadikan **Omnichannel / BigSeller** sebagai kemampuan baru, bukan sekadar input penjualan online manual.

## Audit Relevansi per Menu

| Kelompok / menu | Status | Nilai saat ini | Perbaikan atau potensi pengembangan |
|---|---|---|---|
| **Dashboard** | Pertahankan dan fokuskan | Ringkasan stok, transfer, peringatan, serta penjualan menurut kanal sudah relevan. | Tambahkan “Action Center” berisi transfer menunggu, stok kritis, pesanan online baru, selisih opname, dan tugas PIC. Beri filter lokasi/waktu untuk owner. |
| **Analitik Bisnis** | Pertahankan, perlu diperdalam | Omzet, HPP, laba kotor, tren 7 hari, produk terlaris, dan kanal offline/online tersedia. | Tambahkan filter tanggal/lokasi/kanal, laba bersih setelah biaya marketplace, performa per marketplace, dan perbandingan target vs aktual. Jangan tampilkan analitik global kepada PIC outlet. |
| **Produk & Varian** | Sangat relevan | SKU, barcode EAN-13, harga, modal, minimum stok, dan cetak label mendukung POS. | Tambahkan status “siap dijual online”, pemetaan SKU marketplace/BigSeller, bundle/paket, foto katalog, dan riwayat perubahan harga. |
| **Lokasi Usaha** | Relevan | Gudang/outlet aktif, gudang pusat, dan akses spesifik lokasi sudah mendukung multi-outlet. | Tambahkan alamat/koordinat, jadwal kerja, kapasitas penyimpanan, PIC utama, dan status operasional outlet. |
| **HPP & Marketplace** | Strategis | Resep bahan baku, biaya tambahan, yield, margin, serta preset biaya marketplace sudah ada. | Jadikan HPP sebagai sumber rekomendasi harga. Tambahkan versioning resep, biaya per batch, harga pembulatan, histori harga, dan simulasi semua kanal sekaligus. Akses ubah sebaiknya Owner/Admin saja. |
| **Stok Masuk** | Relevan, perlu dilengkapi | Penerimaan supplier/hasil produksi dan dokumen multi-varian telah tersedia. | Tambahkan master supplier, PO pembelian, hutang supplier, foto faktur, batch/expired date, dan approval penerimaan. |
| **Stok per Lokasi** | Sangat relevan | Menampilkan saldo yang dibatasi lokasi sesuai peran. | Tambahkan nilai persediaan per lokasi, stok tersedia vs stok dalam perjalanan/terpesan online, dan rekomendasi restock berbasis sell-through. |
| **Transfer Stok** | Sangat relevan | Dokumen transfer induk, beberapa varian, penerimaan PIC, bulk receive, dan histori ada. | Tambahkan draft → dikirim → diterima sebagian → selesai, bukti foto, selisih penerimaan, SLA pengiriman, serta notifikasi PIC penerima. |
| **Stock Opname** | Relevan | Koreksi saldo dan jejak pergerakan mendukung akurasi stok. | Tambahkan sesi opname per lokasi, mode scan barcode, blind count, approval selisih, dan laporan shrinkage per produk/outlet. |
| **Riwayat Stok** | Relevan | Jejak pergerakan membantu audit. | Tambahkan reference link yang konsisten ke dokumen sumber, filter tipe pergerakan, export, dan saldo sebelum/sesudah untuk investigasi. |
| **Penjualan (POS)** | Sangat relevan | Variant picker, pencarian/barcode, keranjang, kanal, pembayaran, dan pembatalan sudah mendukung transaksi outlet. | Tambahkan shortcut keyboard, produk favorit, hold/resume cart, diskon berotorisasi, cetak/kirim struk, shift kasir, buka/tutup kas, dan rekonsiliasi QRIS/tunai. Ini prioritas UX tertinggi untuk antrian. |
| **Retur** | Relevan | Retur pelanggan/supplier mengoreksi stok. | Tambahkan referensi penjualan/penerimaan asal, kondisi barang, foto bukti, alasan baku, dan dampak refund/piutang. |
| **Karyawan** | Relevan, tetapi belum matang secara persistence | Akun karyawan, jabatan, lokasi kerja, dan gaji sudah tersedia. | Pindahkan CRUD ke command API. Tambahkan status kontrak, jadwal shift, penanggung jawab outlet, dan arsip/nonaktif yang tidak mengganggu riwayat. |
| **Kehadiran** | Berguna namun P0 secara data | Check-in/out GPS dan toleransi keterlambatan sudah tersedia. | Pindahkan ke command API. Tambahkan radius geofence, bukti foto/selfie bila diperlukan, koreksi absensi dengan approval, dan rekap per periode. |
| **Kasbon & Penggajian** | Relevan untuk owner, tetapi belum payroll penuh | Pencatatan gaji dan kasbon sebagai pengingat tersedia. | Pindahkan ke command API. Tambahkan aturan potong kasbon yang eksplisit, slip gaji, komponen tunjangan/potongan, approval pembayaran, dan audit bukti transfer. |
| **Laporan** | Relevan | Filter periode/lokasi/produk/kanal serta ekspor Excel/PDF tersedia. | Buat laporan operasional terpisah: penjualan, stok, transfer, opname, margin per kanal, kasir/shift, dan arus pembelian. PDF sebaiknya dibuat server-side agar format stabil. |
| **Profil Usaha** | Pertahankan | Profil, logo, kebijakan stok negatif mendukung konfigurasi dasar. | Tambahkan konfigurasi fiskal, rekening payout, aturan pembulatan harga, wilayah/zona waktu, dan kebijakan notifikasi. |
| **Pengguna & Akses** | Sangat penting | Peran Owner, Admin, Gudang, PIC, Kasir, Finance, dan Karyawan sudah didefinisikan. | Jadikan matriks izin dapat diaudit: riwayat perubahan peran, multi-lokasi per user, persetujuan akses sensitif, reset perangkat/sesi, dan review akses berkala. |
| **Pusat Bantuan** | Pertahankan | Membantu adopsi proses transfer dan alur dasar. | Tambahkan SOP per peran, checklist buka/tutup outlet, video singkat, serta tombol lapor masalah yang menyertakan konteks menu. |

## Menu Baru yang Direkomendasikan

### 1. Omnichannel / BigSeller — prioritas bisnis tertinggi

Tempatkan di kelompok **Transaksi** atau **Integrasi**, bukan sebagai submenu HPP.

Kemampuan fase awal:

- Status koneksi setiap marketplace dan akun BigSeller.
- Pemetaan SKU Menengs ↔ SKU marketplace/BigSeller.
- Inbox pesanan masuk dengan status: baru, diproses, dikemas, dikirim, selesai, dibatalkan.
- Reservasi stok saat pesanan diterima agar stok outlet/gudang tidak oversell.
- Sinkronisasi stok terjadwal atau berbasis webhook dengan log keberhasilan/gagal.
- Tautan pesanan ke penjualan Menengs agar laporan kanal, HPP, dan margin tetap satu sumber.

Prasyarat: langganan BigSeller, izin API/channel yang didukung, desain idempotency webhook, dan keputusan lokasi pemenuhan pesanan.

### 2. Pengadaan & Supplier — prioritas operasional tinggi

Master supplier sudah ada di tipe data tetapi belum memiliki menu. Tambahkan menu **Supplier & Pembelian** untuk supplier, purchase order, penerimaan, harga beli terakhir, dan pengingat restock.

### 3. Kas & Shift Kasir — prioritas POS tinggi

Tambahkan buka kas, saldo awal, mutasi, tutup kas, selisih kas, QRIS/transfer reconciliation, dan laporan kasir per shift. Ini menghubungkan antrean outlet dengan kontrol keuangan owner.

### 4. Produksi — prioritas bila Menengs memproduksi sendiri

HPP sudah memodelkan resep/yield. Langkah berikutnya adalah work order produksi yang mengurangi bahan baku, menambah barang jadi, mencatat hasil aktual/susut, dan memperbarui biaya batch.

## Struktur Navigasi Target

```text
Utama
  Dashboard | Analitik
Master Data
  Produk & Varian | Lokasi | HPP & Harga | Supplier
Operasional Stok
  Stok Masuk | Produksi | Stok per Lokasi | Transfer | Opname | Riwayat
Penjualan
  POS Kasir | Pesanan Online / BigSeller | Retur | Kas & Shift
Tim
  Karyawan | Kehadiran | Penggajian
Laporan
  Laporan Operasional | Laporan Keuangan | Audit Aktivitas
Pengaturan
  Profil Usaha | Pengguna & Akses | Integrasi | Pusat Bantuan
```

## Roadmap yang Disarankan

### Fase 0 — Fondasi aman (sebelum menambah banyak menu)

1. Hilangkan penulisan snapshot untuk SDM dan pindahkan ke command API atomik.
2. Normalisasi data yang masih berada di `app_state` JSON, dimulai dari transaksi yang membutuhkan audit tinggi: penerimaan, retur, supplier, kanal penjualan, HPP, attendance, payroll.
3. Buat test E2E terhadap database staging dan matriks RBAC seluruh peran.
4. Hapus/isolasi utilitas `localStorage` legacy yang tidak lagi boleh menjadi sumber data operasional.

### Fase 1 — Maksimalkan penjualan dan stok (nilai cepat)

1. Tingkatkan POS untuk transaksi cepat dan shift kasir.
2. Tambahkan Supplier & Pembelian.
3. Tambahkan action center dashboard dan rekomendasi restock.
4. Tambahkan laporan margin per kanal dan per outlet.

### Fase 2 — Omnichannel dan BigSeller

1. Hubungkan channel, pemetaan SKU, dan log sinkronisasi.
2. Masukkan pesanan online ke inbox dan proses fulfillment.
3. Terapkan reservasi stok serta penanganan gagal sinkron.
4. Rekonsiliasi order, payout, biaya platform, dan laba bersih.

### Fase 3 — Produksi dan kontrol bisnis

1. Work order produksi dari resep HPP.
2. Batch/expired date jika diperlukan.
3. Forecast kebutuhan bahan dan stok per outlet.
4. Dashboard target omzet, margin, shrinkage, dan produktivitas outlet.

## Rekomendasi Keputusan Produk Saat Ini

Jangan menambah banyak menu tanpa menyelesaikan Fase 0. Untuk Menengs, urutan investasi terbaik adalah:

1. **Data & command API yang konsisten** — menjaga kepercayaan terhadap stok dan transaksi.
2. **POS cepat + kas/shift** — dampak langsung pada antrean dan penjualan outlet.
3. **Supplier/pengadaan + restock** — menjaga ketersediaan produk.
4. **BigSeller omnichannel** — menyatukan penjualan online dengan stok dan laporan.
5. **Produksi/HPP lanjutan** — menaikkan akurasi margin dan keputusan harga.

Dengan urutan ini, Menengs tidak hanya menjadi aplikasi pencatatan, tetapi pusat kendali stok, transaksi, dan profitabilitas usaha snack multi-kanal.

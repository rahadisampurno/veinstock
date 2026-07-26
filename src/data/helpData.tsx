import { Store, Boxes, ArrowRightLeft, ShoppingCart, TrendingUp, Users, LifeBuoy } from "lucide-react";

export const sections = [
  {
    id: "setup",
    icon: <Store />,
    title: "Mulai Menggunakan VEINSTOCK",
    desc: "Siapkan usaha, lokasi, produk, dan stok awal sebelum mulai mencatat aktivitas.",
    articles: [
      {
        id: "setup-1",
        title: "Membuat profil usaha.",
        content: (
          <div className="article-body">
            <p>Profil usaha berisi informasi dasar bisnis Anda seperti nama, alamat, nomor telepon, dan logo. Data ini juga akan digunakan dalam cetakan laporan.</p>
            <ol>
              <li>Buka menu profil di ujung kanan atas layar (atau klik ikon pengguna/avatar).</li>
              <li>Pilih opsi <strong>Edit Profil Usaha</strong>.</li>
              <li>Isi kolom yang tersedia.</li>
              <li>Klik tombol <strong>Simpan Perubahan</strong>.</li>
            </ol>
          </div>
        )
      },
      {
        id: "setup-2",
        title: "Menambahkan gudang dan outlet.",
        content: (
          <div className="article-body">
            <p>Setiap stok barang di VeinStock akan dipisahkan berdasarkan Lokasi (bisa berupa Gudang Pusat, Outlet Cabang, atau Toko Fisik).</p>
            <ol>
              <li>Pilih menu <strong>Lokasi Usaha</strong> di sidebar sebelah kiri.</li>
              <li>Klik tombol <strong>Tambah Lokasi</strong>.</li>
              <li>Masukkan nama lokasi (misal: "Gudang Utama" atau "Cabang Sudirman").</li>
              <li>Simpan lokasi. Anda bisa membuat banyak lokasi sesuai kebutuhan operasional.</li>
            </ol>
          </div>
        )
      },
      {
        id: "setup-3",
        title: "Membuat produk dan varian.",
        content: (
          <div className="article-body">
            <p>Sebelum bisa menambah stok, Anda harus mendaftarkan nama barang/produknya terlebih dahulu.</p>
            <ol>
              <li>Pilih menu <strong>Produk & Varian</strong>.</li>
              <li>Klik <strong>Tambah Produk</strong>.</li>
              <li>Masukkan Nama Produk (misal: Kaos Polos) dan Deskripsi.</li>
              <li>Jika produk memiliki warna atau ukuran berbeda, klik <strong>Tambah Varian</strong> (misal: Varian Merah L, Biru XL).</li>
              <li>Tentukan Harga Jual dan batas Stok Minimum.</li>
              <li>Klik <strong>Simpan</strong>.</li>
            </ol>
          </div>
        )
      },
      {
        id: "setup-4",
        title: "Memilih satuan produk.",
        content: (
          <div className="article-body">
            <p>Saat membuat produk, Anda dapat menentukan satuan (Unit of Measurement) seperti Pcs, Box, Kg, dll. Pastikan konsisten agar perhitungan stok akurat.</p>
          </div>
        )
      },
      {
        id: "setup-5",
        title: "Mengisi stok yang sudah tersedia saat membuat produk.",
        content: (
          <div className="article-body">
            <p>Jika saat ini fisik barang Anda sudah ada di gudang, Anda harus mencatat <strong>Stok Awal</strong>.</p>
            <ol>
              <li>Buka menu <strong>Stok Masuk</strong> dari sidebar.</li>
              <li>Pilih lokasi (misal Gudang Pusat) dan tanggal masuk.</li>
              <li>Pada kolom Catatan, tulis "Stok Awal".</li>
              <li>Cari produk/varian yang ingin dimasukkan, lalu isi jumlah stok nyatanya (kuantitas).</li>
              <li>Klik <strong>Simpan</strong>. Stok barang di sistem kini sudah sinkron dengan barang fisik.</li>
            </ol>
          </div>
        )
      },
      {
        id: "setup-6",
        title: "Mengatur stok minimum.",
        content: (
          <div className="article-body">
            <p>Stok minimum berguna sebagai alarm agar Anda segera memesan ulang barang yang hampir habis.</p>
            <p>Pengaturan ini dilakukan saat membuat atau mengedit produk di menu <strong>Produk & Varian</strong>. Jika jumlah stok menyentuh batas ini, produk akan muncul dalam notifikasi "Stok Menipis" di Dashboard.</p>
          </div>
        )
      },
      {
        id: "setup-7",
        title: "Mengimpor data awal jika tersedia.",
        content: (
          <div className="article-body">
            <p>Saat ini fitur impor data via Excel/CSV secara massal belum tersedia. Anda dapat menambahkan produk dan lokasi satu per satu melalui formulir yang disediakan.</p>
          </div>
        )
      }
    ]
  },
  {
    id: "stock",
    icon: <Boxes />,
    title: "Mengelola Stok",
    desc: "Catat stok masuk, stok keluar, koreksi, dan hasil hitung stok fisik.",
    articles: [
      {
        id: "stock-1",
        title: "Menambahkan stok masuk.",
        content: (
          <div className="article-body">
            <p>Gunakan fitur ini ketika ada pengiriman barang dari Supplier atau hasil produksi baru.</p>
            <ol>
              <li>Buka menu <strong>Stok Masuk</strong>.</li>
              <li>Pilih lokasi penerima barang.</li>
              <li>Tambahkan produk-produk yang diterima beserta jumlah kuantitasnya.</li>
              <li>Isi keterangan (contoh: "Kulakan dari supplier A").</li>
              <li>Klik Simpan. Stok di lokasi tersebut otomatis bertambah.</li>
            </ol>
          </div>
        )
      },
      {
        id: "stock-2",
        title: "Mengurangi stok keluar.",
        content: (
          <div className="article-body">
            <p>Pengurangan stok karena penjualan dicatat secara otomatis melalui menu Penjualan. Anda tidak perlu menggunakan fitur ini untuk mencatat barang laku.</p>
            <p>Namun, jika ada barang yang harus dikeluarkan untuk keperluan lain (misal: barang sampel, promosi), Anda bisa menyesuaikannya di fitur Stok Opname atau Koreksi.</p>
          </div>
        )
      },
      {
        id: "stock-3",
        title: "Melihat stok per lokasi.",
        content: (
          <div className="article-body">
            <p>Untuk memantau jumlah stok barang di setiap gudang/cabang:</p>
            <ol>
              <li>Buka menu <strong>Stok per Lokasi</strong>.</li>
              <li>Gunakan tombol <em>dropdown</em> filter lokasi di bagian atas untuk memilih gudang atau cabang tertentu.</li>
              <li>Daftar barang dan jumlah stok yang tersisa di lokasi tersebut akan ditampilkan secara real-time.</li>
            </ol>
          </div>
        )
      },
      {
        id: "stock-4",
        title: "Memperbaiki jumlah stok yang tidak sesuai.",
        content: (
          <div className="article-body">
            <p>Jika jumlah barang fisik tidak sama dengan jumlah di sistem (misal karena rusak, hilang, atau selisih hitung), gunakan <strong>Stok Opname</strong>.</p>
            <ol>
              <li>Buka menu <strong>Stok Opname</strong>, lalu buat laporan opname baru.</li>
              <li>Pilih Lokasi yang ingin disesuaikan.</li>
              <li>Sistem akan menampilkan jumlah stok saat ini. Masukkan <strong>Jumlah Fisik Nyata</strong> pada kolom yang tersedia.</li>
              <li>Sistem akan otomatis menghitung selisihnya (kurang atau lebih).</li>
              <li>Klik Simpan. Stok sistem akan tertimpa dan langsung disesuaikan dengan jumlah fisik nyata tersebut.</li>
            </ol>
          </div>
        )
      },
      {
        id: "stock-5",
        title: "Mencatat barang rusak atau hilang.",
        content: (
          <div className="article-body">
            <p>Barang rusak atau hilang ditangani layaknya penyesuaian stok biasa (melalui menu Stok Opname). Kurangi nilai jumlah fisik agar sistem mencatat pengeluaran barang tersebut.</p>
            <p>Pastikan Anda menuliskan keterangan yang jelas (misal: "Barang cacat produksi") di catatan Opname agar mudah dilacak di Riwayat Stok.</p>
          </div>
        )
      },
      {
        id: "stock-6",
        title: "Menyesuaikan stok sistem dengan jumlah barang fisik (Opname).",
        content: (
          <div className="article-body">
            <p>Stok Opname sangat disarankan dilakukan secara berkala (misal sebulan sekali) untuk menjaga akurasi data. Prosesnya sama seperti perbaikan stok tidak sesuai: buat Opname baru, lalu input jumlah stok nyatanya.</p>
          </div>
        )
      },
      {
        id: "stock-7",
        title: "Memahami riwayat stok.",
        content: (
          <div className="article-body">
            <p>Buka menu <strong>Riwayat Stok</strong> untuk melihat seluruh aktivitas yang mengubah jumlah barang (seperti masuk, keluar, penjualan, retur, transfer, opname).</p>
            <p>Setiap baris mencatat waktu kejadian, lokasi yang terpengaruh, alasan perubahan, dan pelakunya, sehingga dapat diaudit jika terjadi kecurigaan kecurangan.</p>
          </div>
        )
      },
      {
        id: "stock-8",
        title: "Menangani pesan stok tidak mencukupi.",
        content: (
          <div className="article-body">
            <p>Pesan ini muncul ketika Anda mencoba menjual atau mentransfer barang yang jumlah stok di sistemnya kurang dari permintaan Anda (atau 0).</p>
            <p><strong>Solusi:</strong> Pastikan Anda telah melakukan "Stok Masuk" terlebih dahulu, atau pastikan "Transfer dari Gudang" sudah dikonfirmasi (Diterima) oleh lokasi Anda.</p>
          </div>
        )
      }
    ]
  },
  {
    id: "transfer",
    icon: <ArrowRightLeft />,
    title: "Transfer Antar-Lokasi",
    desc: "Pindahkan stok dari gudang atau outlet ke lokasi lain dengan riwayat yang jelas.",
    articles: [
      {
        id: "transfer-1",
        title: "Cara mengirim stok ke lokasi lain.",
        content: (
          <div className="article-body">
            <ol>
              <li>Buka menu <strong>Transfer Stok</strong>, lalu klik <strong>Buat Transfer</strong>.</li>
              <li>Pilih Lokasi Asal pengirim barang dan Lokasi Tujuan penerima.</li>
              <li>Masukkan daftar barang beserta kuantitasnya.</li>
              <li>Klik Simpan. Status transfer ini akan menjadi <strong>Dikirim (Menunggu Konfirmasi)</strong>.</li>
            </ol>
            <div className="alert-info">Stok di lokasi asal otomatis langsung berkurang, namun stok di lokasi tujuan BELUM bertambah.</div>
          </div>
        )
      },
      {
        id: "transfer-2",
        title: "Cara menerima kiriman stok.",
        content: (
          <div className="article-body">
            <p>Ketika barang tiba di lokasi cabang/outlet, staf penerima harus memverifikasinya:</p>
            <ol>
              <li>Buka menu <strong>Transfer Stok</strong>.</li>
              <li>Cari dokumen transfer yang berstatus "Dalam Perjalanan".</li>
              <li>Klik tombol <strong>Terima</strong>.</li>
              <li>Stok lokasi penerima baru akan bertambah saat tombol Terima ini ditekan. Status berubah menjadi <strong>Selesai</strong>.</li>
            </ol>
          </div>
        )
      },
      {
        id: "transfer-3",
        title: "Kapan stok lokasi asal berkurang dan tujuan bertambah.",
        content: (
          <div className="article-body">
            <ul>
              <li><strong>Lokasi Asal:</strong> Stok langsung dipotong saat form transfer disimpan.</li>
              <li><strong>Lokasi Tujuan:</strong> Stok baru ditambahkan ke sistem ketika staf di lokasi tujuan mengklik tombol "Terima". Selama belum ditekan, barang dianggap "Dalam Perjalanan".</li>
            </ul>
          </div>
        )
      },
      {
        id: "transfer-4",
        title: "Cara membatalkan transfer.",
        content: (
          <div className="article-body">
            <p>Jika terjadi kesalahan input atau batal dikirim, Anda dapat menekan tombol <strong>Batal</strong> (ikon silang/X merah) pada dokumen transfer yang belum diterima.</p>
            <p>Stok yang tadinya sudah terpotong di lokasi asal akan otomatis dikembalikan ke saldo semula.</p>
          </div>
        )
      },
      {
        id: "transfer-5",
        title: "Memahami stok dalam perjalanan.",
        content: (
          <div className="article-body">
            <p>Stok dalam perjalanan (In Transit) merujuk pada jumlah barang yang sudah dikirim oleh gudang asal namun belum diverifikasi penerimaannya oleh gudang tujuan. Barang ini tidak bisa dijual karena secara fisik tidak berada di gudang manapun.</p>
          </div>
        )
      },
      {
        id: "transfer-6",
        title: "Mengatasi jumlah barang yang tidak sesuai saat diterima.",
        content: (
          <div className="article-body">
            <p>Jika staf cabang menerima kiriman dengan jumlah fisik barang yang kurang atau lebih dari dokumen transfer:</p>
            <ol>
              <li>Staf cabang <strong>harus tetap mengklik Terima</strong> dokumen transfer tersebut.</li>
              <li>Setelah itu, staf harus segera melakukan <strong>Stok Opname</strong> di lokasinya untuk mengoreksi jumlah yang sebenarnya.</li>
              <li>Tulis di catatan Opname bahwa ada perbedaan selisih kiriman.</li>
            </ol>
          </div>
        )
      }
    ]
  },
  {
    id: "sales",
    icon: <ShoppingCart />,
    title: "Penjualan, Pembatalan & Retur",
    desc: "Catat barang terjual dan kembalikan stok dengan benar saat transaksi dibatalkan atau diretur.",
    articles: [
      {
        id: "sales-1",
        title: "Mencatat barang terjual.",
        content: (
          <div className="article-body">
            <p>Aktivitas harian paling penting untuk mencatat omset:</p>
            <ol>
              <li>Buka menu <strong>Penjualan & Retur</strong>, klik <strong>Catat Penjualan</strong>.</li>
              <li>Pilih Lokasi dari mana barang tersebut dikeluarkan (terjual).</li>
              <li>Pilih Metode Pembayaran dan Kanal Penjualan (Toko, E-commerce, dll).</li>
              <li>Pilih barang dan atur Harga Jual/Diskon secara fleksibel.</li>
              <li>Klik Simpan.</li>
            </ol>
          </div>
        )
      },
      {
        id: "sales-2",
        title: "Memahami kapan stok berkurang.",
        content: (
          <div className="article-body">
            <p>Di VeinStock, setiap data penjualan yang disimpan akan <strong>secara otomatis seketika itu juga memotong jumlah stok</strong> di gudang/lokasi yang dipilih. Tidak perlu mencatat pengeluaran stok secara manual.</p>
          </div>
        )
      },
      {
        id: "sales-3",
        title: "Membatalkan transaksi yang salah.",
        content: (
          <div className="article-body">
            <p>Jika Anda (atau kasir) salah mencatat harga atau barang pada nota penjualan, Anda bisa membatalkannya.</p>
            <ol>
              <li>Cari transaksi yang salah di daftar Penjualan.</li>
              <li>Klik ikon <strong>Batal</strong> (silang/X merah).</li>
              <li>Berikan alasan pembatalan jika diperlukan.</li>
            </ol>
          </div>
        )
      },
      {
        id: "sales-4",
        title: "Mengembalikan stok dari transaksi batal.",
        content: (
          <div className="article-body">
            <p>Kabar baiknya, ketika Anda membatalkan sebuah dokumen Penjualan, sistem VeinStock akan <strong>otomatis mengembalikan stok</strong> barang-barang di nota tersebut ke gudang asal penjualan.</p>
          </div>
        )
      },
      {
        id: "sales-5",
        title: "Mencatat retur barang.",
        content: (
          <div className="article-body">
            <p>Gunakan tab <strong>Retur</strong> jika pembeli mengembalikan barang yang dibelinya karena tidak cocok/cacat.</p>
            <ol>
              <li>Buka menu Penjualan & Retur, pindah ke tab <strong>Retur Pelanggan</strong>.</li>
              <li>Klik Buat Retur.</li>
              <li>Pilih Lokasi tujuan pengembalian stok.</li>
              <li>Masukkan jumlah barang yang diretur. Setelah disimpan, stok tersebut otomatis bertambah kembali di sistem Anda.</li>
            </ol>
          </div>
        )
      },
      {
        id: "sales-6",
        title: "Memahami hak akses Kasir dan PIC.",
        content: (
          <div className="article-body">
            <p>Pengguna dengan peran (role) <strong>Kasir</strong> atau <strong>PIC Outlet</strong> tidak bisa membatalkan penjualan. Opsi pembatalan hanya tersedia bagi Owner atau Admin demi alasan keamanan dan pencegahan kecurangan kasir (menjual lalu membatalkan diam-diam).</p>
          </div>
        )
      }
    ]
  },
  {
    id: "reports",
    icon: <TrendingUp />,
    title: "Laporan & Riwayat Stok",
    desc: "Pantau posisi dan pergerakan stok serta unduh laporan sesuai kebutuhan.",
    articles: [
      {
        id: "rep-1",
        title: "Melihat posisi stok saat ini.",
        content: (
          <div className="article-body">
            <p>Informasi ringkasan tentang stok menipis dan nilai stok secara keseluruhan dapat dilihat langsung pada layar muka <strong>Dashboard</strong>.</p>
            <p>Untuk detail rinci kuantitasnya, buka menu <strong>Stok per Lokasi</strong>.</p>
          </div>
        )
      },
      {
        id: "rep-2",
        title: "Melihat stok berdasarkan lokasi.",
        content: (
          <div className="article-body">
            <p>Buka menu Laporan, gunakan filter <strong>Lokasi</strong> di pojok kanan atas layar untuk memisahkan data laporan antar tiap cabang Anda.</p>
          </div>
        )
      },
      {
        id: "rep-3",
        title: "Memahami riwayat pergerakan barang.",
        content: (
          <div className="article-body">
            <p>Di halaman Riwayat Stok, setiap baris mewakili 1 aktivitas spesifik (Penjualan, Masuk, Opname). Tabel ini memudahkan investigasi karena Anda dapat melacak jejak pasti barang keluar/masuk kapan dan oleh siapa.</p>
          </div>
        )
      },
      {
        id: "rep-4",
        title: "Melihat barang dengan stok menipis.",
        content: (
          <div className="article-body">
            <p>Widget "Stok Menipis" di layar utama Dashboard secara otomatis menampilkan daftar produk yang jumlah fisiknya berada di bawah atau sama dengan batas "Stok Minimum" yang Anda tetapkan.</p>
          </div>
        )
      },
      {
        id: "rep-5",
        title: "Memahami perkiraan nilai stok.",
        content: (
          <div className="article-body">
            <p>Nilai stok dihitung dengan mengalikan <strong>Harga Beli (Modal)</strong> barang dengan sisa kuantitas. Jika Anda tidak memasukkan harga beli pada master produk, perkiraan nilai stok tidak akan akurat.</p>
          </div>
        )
      },
      {
        id: "rep-6",
        title: "Mengunduh dan mengekspor laporan.",
        content: (
          <div className="article-body">
            <p>Pada sebagian besar tabel (Penjualan, Riwayat Stok, Laporan), akan tersedia tombol <strong>Unduh</strong> atau ikon CSV. Klik untuk mengekspor data yang tampil di layar tersebut ke dalam format Excel yang siap diolah lebih lanjut.</p>
          </div>
        )
      },
      {
        id: "rep-7",
        title: "Memfilter data berdasarkan tanggal, produk, dan lokasi.",
        content: (
          <div className="article-body">
            <p>Gunakan baris pencarian ("Search") dan input tanggal ("Dari" - "Hingga") yang tersedia di setiap modul untuk memotong (*slice*) rentang data sebelum Anda mengunduhnya, sehingga ukuran laporan lebih spesifik.</p>
          </div>
        )
      }
    ]
  },
  {
    id: "team",
    icon: <Users />,
    title: "Pengguna & Hak Akses",
    desc: "Atur pengguna, tugas, dan lokasi kerja sesuai tanggung jawabnya.",
    articles: [
      {
        id: "team-1",
        title: "Memahami tugas dan akses setiap pengguna (Owner, Admin, Kasir, dll).",
        content: (
          <div className="article-body">
            <p>Sistem membagi izin (role) pengguna ke beberapa tingkatan:</p>
            <ul>
              <li><strong>Owner (Pemilik):</strong> Memiliki akses penuh ke semua fitur, profil usaha, hak membatalkan transaksi, laporan, dan merubah akun staf.</li>
              <li><strong>Admin Cabang:</strong> Membantu fungsi manajemen di cabang tertentu.</li>
              <li><strong>PIC Outlet / Kepala Toko:</strong> Hanya bisa mengakses dan melihat data transaksi di outlet yang ditugaskan kepadanya.</li>
              <li><strong>Staf Gudang:</strong> Fokus pada input Stok Masuk, Transfer, dan Opname. Tidak memiliki akses ke laporan nilai uang/penjualan.</li>
              <li><strong>Kasir:</strong> Hanya bisa membuat Penjualan dan melihat Stok. Tidak bisa membatalkan nota yang sudah dicetak.</li>
              <li><strong>Keuangan:</strong> Fokus pada data Penjualan dan Laporan Omset, namun tidak bisa mengedit stok.</li>
            </ul>
          </div>
        )
      },
      {
        id: "team-2",
        title: "Menambahkan pengguna baru.",
        content: (
          <div className="article-body">
            <ol>
              <li>Hanya Pemilik (Owner) yang bisa mengakses menu <strong>Manajemen Tim</strong>.</li>
              <li>Klik Tambah Tim.</li>
              <li>Masukkan Email staf (pastikan aktif karena dipakai untuk login) dan Nama.</li>
              <li>Pilih Role yang sesuai dengan jabatannya.</li>
            </ol>
          </div>
        )
      },
      {
        id: "team-3",
        title: "Menentukan lokasi kerja pengguna.",
        content: (
          <div className="article-body">
            <p>Bagi staf seperti Kasir atau Kepala Toko, Anda <strong>wajib menetapkan Lokasi Penempatan</strong>-nya. Dengan begitu, setiap kali Kasir tersebut melakukan Penjualan, sistem otomatis memotong stok dari lokasi tempatnya bekerja.</p>
          </div>
        )
      },
      {
        id: "team-4",
        title: "Memindahkan lokasi penempatan staf.",
        content: (
          <div className="article-body">
            <p>Buka menu Manajemen Tim, edit (ubah) akun pengguna tersebut, lalu pilih lokasi penempatan (Outlet) yang baru dari dropdown. Penjualan berikutnya akan menyesuaikan lokasi barunya.</p>
          </div>
        )
      },
      {
        id: "team-5",
        title: "Mengaktifkan dan menonaktifkan akun.",
        content: (
          <div className="article-body">
            <p>Jika ada karyawan yang *resign* atau diberhentikan, tidak perlu menghapus akunnya. Edit akun pengguna dan set statusnya menjadi <strong>Tidak Aktif</strong>. Ia tidak akan bisa login lagi ke aplikasi, namun riwayat transaksinya di masa lalu tetap ada untuk audit.</p>
          </div>
        )
      },
      {
        id: "team-6",
        title: "Mengatasi akses yang ditolak.",
        content: (
          <div className="article-body">
            <p>Jika staf Anda melihat layar terkunci atau tombol hilang, itu normal. Sistem secara otomatis menyembunyikan modul sensitif yang bukan menjadi hak dan tanggung jawab Role staf tersebut.</p>
          </div>
        )
      }
    ]
  },
  {
    id: "troubleshoot",
    icon: <LifeBuoy />,
    title: "Masalah yang Sering Terjadi",
    desc: "Temukan solusi cepat ketika data atau fitur tidak bekerja seperti yang diharapkan.",
    articles: [
      {
        id: "tb-1",
        title: "Stok produk tidak berubah setelah transaksi.",
        content: (
          <div className="article-body">
            <p>Periksa kembali <strong>Lokasi</strong> yang dipilih saat melakukan penjualan. Seringkali pengguna menjual dari "Gudang A" padahal stoknya berada di "Outlet B". Pastikan mencatat dari lokasi yang tepat.</p>
          </div>
        )
      },
      {
        id: "tb-2",
        title: "Produk tidak muncul di lokasi tertentu.",
        content: (
          <div className="article-body">
            <p>Produk belum terdistribusi. Lakukan <strong>Stok Masuk</strong> langsung ke lokasi tersebut atau <strong>Transfer Stok</strong> dari Gudang Utama menuju lokasi tersebut.</p>
          </div>
        )
      },
      {
        id: "tb-3",
        title: "Tidak bisa memilih lokasi.",
        content: (
          <div className="article-body">
            <p>Ada dua kemungkinan: Anda tidak memiliki akses ke lokasi tersebut, atau status Lokasi tersebut telah ditandai "Tidak Aktif" di master data Lokasi Usaha.</p>
          </div>
        )
      },
      {
        id: "tb-4",
        title: "Tidak bisa melakukan koreksi stok atau menerima transfer.",
        content: (
          <div className="article-body">
            <p>Sistem membatasi aktivitas ini agar stok tetap terkendali. Fitur-fitur rawan seperti ini kadang tidak diizinkan untuk peran/role level bawah seperti Kasir. Hubungi Admin atau Owner.</p>
          </div>
        )
      },
      {
        id: "tb-5",
        title: "Stok di sistem berbeda dengan barang fisik.",
        content: (
          <div className="article-body">
            <p>Perbedaan bisa terjadi akibat barang hilang dicuri, cacat produksi, human error tidak mencatat penjualan, atau kesalahan transfer. Lakukan rekonsiliasi lewat fitur <strong>Stok Opname</strong> secepatnya untuk menyamakan saldo.</p>
          </div>
        )
      },
      {
        id: "tb-6",
        title: "Data tidak muncul setelah disimpan.",
        content: (
          <div className="article-body">
            <p>Cobalah periksa apakah Anda menggunakan Filter (misal Filter Tanggal, atau Filter Status) yang secara tidak sengaja menyembunyikan data yang baru saja Anda buat. Reset semua kolom pencarian/filter.</p>
          </div>
        )
      },
      {
        id: "tb-7",
        title: "Akun tidak memiliki akses.",
        content: (
          <div className="article-body">
            <p>Sistem keamanan kami memproteksi fitur esensial. Hanya Owner dan Admin yang memiliki kuasa penuh atas perputaran data yang krusial.</p>
          </div>
        )
      }
    ]
  }
];

export const popularArticles = [
  "setup-5", // Cara menambahkan stok awal
  "stock-4", // Cara memperbaiki stok yang tidak sesuai
  "transfer-1", // Cara mengirim stok ke lokasi lain
  "stock-8"  // Mengapa stok tidak mencukupi
];

# Zykun — Catatan Keuangan

Aplikasi web berbahasa Indonesia untuk mencatat keuangan pribadi dan usaha, termasuk pemasukan, pengeluaran, utang, piutang, dan pembayaran cicilan. Aplikasi ini tidak memerlukan proses build atau dependensi.

## Menjalankan aplikasi

1. Ekstrak folder `catatan-keuangan` jika diunduh sebagai arsip.
2. Buka `index.html` di browser modern (Chrome, Edge, Firefox, atau Safari).
3. Mulai dengan tombol **Catat transaksi** atau **Tambah catatan** pada halaman Utang & Piutang.

Untuk menjalankannya lewat server lokal, buka terminal pada folder ini dan jalankan:

```bash
python -m http.server 8000
```

Lalu buka `http://localhost:8000`.

## Fitur

- Dashboard saldo, pemasukan, pengeluaran, arus kas, dan jatuh tempo.
- Ruang **Pribadi** dan **Usaha** dengan data, ringkasan, kategori, serta utang/piutang yang terpisah. Catatan lama tetap berada di ruang Pribadi.
- Kategori usaha untuk penjualan, jasa, stok barang, operasional, gaji, sewa, pemasaran, dan biaya lainnya.
- Pencatatan, pencarian, filter, edit, dan penghapusan transaksi.
- Catatan utang/piutang dengan progres pelunasan dan pembayaran cicilan.
- Kategori yang dapat disesuaikan.
- Ringkasan bulanan dan pengeluaran per kategori.
- Penyimpanan otomatis di `localStorage` browser.
- Ekspor dan impor cadangan JSON dari menu Pengaturan.

## Sinkronisasi HP dan laptop dengan Firebase

Aplikasi ini memakai Firebase Authentication (email dan kata sandi) dan Cloud Firestore. Setiap akun hanya dapat membaca dan mengubah catatannya sendiri melalui Firestore Security Rules. Untuk penggunaan Firebase, siapkan proyek milikmu:

1. Buat proyek di [Firebase Console](https://console.firebase.google.com/) dan daftarkan aplikasi web. Salin konfigurasi web ke `firebase-config.js` (`apiKey`, `authDomain`, `projectId`, dan `appId`). Jangan masukkan service-account key atau private key ke aplikasi.
2. Pada **Authentication → Sign-in method**, aktifkan **Email/Password**.
3. Buat database di **Firestore Database**. Pada tab **Rules**, terapkan isi berkas `firestore.rules`.
4. Pada pengaturan Authentication, tambahkan domain `zykun04.github.io` ke daftar domain resmi aplikasi.
5. Unggah berkas proyek yang diperbarui ke repositori GitHub Pages. Sesudah deploy, buat akun dari situs Zykun.
6. Di perangkat yang menyimpan catatan lama, masuk lalu pilih **Unggah catatan perangkat**. Masuk dengan akun yang sama di perangkat lain; bila ada catatan lokal yang berbeda, pilih **Gabungkan catatan**.

Perubahan tersimpan di Firestore dan dikirim ke perangkat lain yang sedang membuka aplikasi. Firestore membatasi ukuran satu dokumen menjadi 1 MiB; aplikasi menolak unggahan saat data mencapai sekitar 900 KiB agar tidak menyentuh batas tersebut. [Batas ukuran dokumen Firestore](https://firebase.google.com/docs/firestore/quotas).

Konfigurasi web Firebase memang berada di sisi browser; akses data dibatasi oleh login dan Security Rules. Jangan membuka aturan Firestore untuk semua orang. Firebase Spark menyediakan kuota tanpa biaya untuk Firestore, termasuk 1 GiB penyimpanan, 20.000 penulisan per hari, dan 50.000 pembacaan per hari; jika kuota terlampaui, layanan terkait berhenti sampai siklus berikutnya. [Kuota dan paket Firebase](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans).

Data lokal lama tidak dikirim otomatis. Proses unggah atau penggabungan membutuhkan klik pengguna. Data yang belum dipindahkan tetap berada di browser perangkat asal; ekspor JSON tetap tersedia sebagai cadangan.

## Mengunduh APK Android

Workflow **Build Android APK Zykun** membuat APK debug setiap kali aplikasi diperbarui di branch `main`. Setelah workflow selesai:

1. Buka tab **Actions** di repositori GitHub.
2. Pilih proses **Build Android APK Zykun** yang paling baru dan pastikan statusnya berhasil.
3. Pada bagian **Artifacts**, unduh `Zykun-Android-APK` lalu ekstrak berkas ZIP.
4. Buka `app-debug.apk` di HP Android dan izinkan pemasangan aplikasi jika diminta.

APK memuat versi aplikasi saat proses build dan memakai akun Firebase yang sama. Perangkat memerlukan internet untuk masuk serta menyinkronkan catatan. APK debug ini untuk dipasang langsung, bukan untuk diterbitkan ke Play Store.

## Menerbitkan ke web dengan GitHub Pages

Workflow GitHub Actions sudah disertakan pada `.github/workflows/deploy.yml`.

1. Buat repositori baru di GitHub, misalnya `catatan-keuangan`.
2. Unggah **isi folder ini** ke akar repositori. Pastikan `index.html`, `styles.css`, `app.js`, dan folder `.github` berada langsung di akar repositori.
3. Buka **Settings → Pages** pada repositori tersebut, lalu pilih **GitHub Actions** sebagai sumber publikasi.
4. Buka tab **Actions** dan tunggu workflow **Deploy Zykun to GitHub Pages** selesai.
5. Alamat situs akan muncul di **Settings → Pages**. Setelah publikasi pertama, perubahan pada branch `main` akan diterbitkan otomatis.

Untuk menyiapkan repositori melalui Git di komputer, buka terminal di folder ini lalu jalankan:

```bash
git init
git add .
git commit -m "Siapkan aplikasi catatan keuangan"
git branch -M main
git remote add origin https://github.com/USERNAME/catatan-keuangan.git
git push -u origin main
```

Ganti `USERNAME` dengan nama akun GitHub. Setelah push pertama, aktifkan sumber **GitHub Actions** di **Settings → Pages**.

## Struktur berkas

- `index.html` — halaman dan dialog aplikasi.
- `styles.css` — tampilan responsif.
- `business.css` — kontrol pemilih ruang Pribadi/Usaha.
- `cloud.css` — formulir masuk dan status sinkronisasi.
- `app.js` — fitur dan penyimpanan lokal.
- `firebase-sync.js` dan `firebase-config.js` — koneksi Firebase dan konfigurasi proyek.
- `firestore.rules` — aturan akses data per akun.
- `.github/workflows/deploy.yml` — publikasi otomatis ke GitHub Pages.

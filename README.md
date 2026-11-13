# Rapi — Catatan Keuangan

Aplikasi web pribadi berbahasa Indonesia untuk mencatat pemasukan, pengeluaran, utang, piutang, dan pembayaran cicilan. Aplikasi ini tidak memerlukan proses build atau dependensi.

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
- Pencatatan, pencarian, filter, edit, dan penghapusan transaksi.
- Catatan utang/piutang dengan progres pelunasan dan pembayaran cicilan.
- Kategori yang dapat disesuaikan.
- Ringkasan bulanan dan pengeluaran per kategori.
- Penyimpanan otomatis di `localStorage` browser.
- Ekspor dan impor cadangan JSON dari menu Pengaturan.

Data tersimpan pada browser dan perangkat yang digunakan. Gunakan **Ekspor cadangan** secara berkala sebelum membersihkan data browser atau berpindah perangkat.

## Menerbitkan ke web dengan GitHub Pages

Workflow GitHub Actions sudah disertakan pada `.github/workflows/deploy.yml`.

1. Buat repositori baru di GitHub, misalnya `catatan-keuangan`.
2. Unggah **isi folder ini** ke akar repositori. Pastikan `index.html`, `styles.css`, `app.js`, dan folder `.github` berada langsung di akar repositori.
3. Buka **Settings → Pages** pada repositori tersebut, lalu pilih **GitHub Actions** sebagai sumber publikasi.
4. Buka tab **Actions** dan tunggu workflow **Deploy Rapi to GitHub Pages** selesai.
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
- `app.js` — fitur dan penyimpanan lokal.
- `.github/workflows/deploy.yml` — publikasi otomatis ke GitHub Pages.

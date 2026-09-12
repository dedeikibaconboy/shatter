# Panduan Setting Google Sheets + Apps Script

Supaya room terlihat dari seluruh dunia dan statistik pengunjung/pemain tersimpan, ikuti langkah ini sekali saja.

Created by **Muhammad Rizki Azri Mulyana**

---

## 1. Buat Google Sheet

1. Buka [https://sheets.google.com](https://sheets.google.com)
2. Klik **Blank spreadsheet**
3. Ganti judul jadi: `Monmon Shatter Server`
4. Biarkan sheet-nya kosong. Script akan membuat sheet `Rooms` dan `Stats` otomatis.

---

## 2. Buka Apps Script

1. Di Google Sheet, klik menu **Extensions** (Ekstensi) → **Apps Script**
2. Hapus semua kode default di editor
3. Buka file `apps-script.gs` dari folder game ini
4. Salin **semua isinya**, tempel ke editor Apps Script
5. Klik ikon disket **Save**, nama proyek misalnya: `Monmon Shatter API`

---

## 3. Deploy sebagai Web App

1. Di editor Apps Script, klik **Deploy** → **New deployment**
2. Klik ikon roda gigi di samping "Select type", pilih **Web app**
3. Isi:
   - Description: `Monmon Shatter v1`
   - Execute as: **Me** (akun Google kamu)
   - Who has access: **Anyone**
     - Pilih **Anyone** (bukan "Anyone with Google account")
     - Ini penting agar pemain dari seluruh dunia bisa akses tanpa login
4. Klik **Deploy**
5. Jika muncul izin, klik **Authorize access**
   - Pilih akun Google kamu
   - Klik **Advanced** → **Go to Monmon Shatter API (unsafe)**
   - Klik **Allow**
6. Salin **Web app URL**
   - Bentuknya seperti:
     `https://script.google.com/macros/s/AKfycbxxxxx/exec`

---

## 4. Masukkan URL ke game

1. Buka file `config.js` di folder game
2. Tempel URL-nya:

```js
window.MONMON_API = 'https://script.google.com/macros/s/AKfycbxxxxx/exec';
```

3. Simpan file
4. Upload ulang folder game ke GitHub Pages

---

## 5. Tes

1. Buka game di browser
2. Angka **Pengunjung** harus naik
3. Klik **Buat Room**
4. Buka game di HP / laptop lain
5. Room kamu harus muncul di daftar **Room Online**

Kalau tidak muncul:
- Pastikan `Who has access` = **Anyone**
- Pastikan URL di `config.js` berakhiran `/exec` (bukan `/dev`)
- Setelah mengubah kode Apps Script, selalu **Deploy → Manage deployments → Edit (pensil) → New version → Deploy**

---

## Cara kerja singkat

| Fitur | Cara kerja |
|---|---|
| Statistik pengunjung | Setiap orang yang buka game (sekali per sesi) menambah `visits` |
| Statistik pemain | Setiap kali ada yang mulai main (solo atau tanding) menambah `plays` |
| Room publik | Tampil di daftar, orang lain bisa Join tanpa kode |
| Room ber-kode | Tidak bisa join tanpa kode. Ada tombol Copy Kode |
| Room hilang otomatis | Jika host tutup tab lebih dari 45 detik |

Tidak perlu bayar. Google Sheets gratis cukup untuk teman-teman bermain.

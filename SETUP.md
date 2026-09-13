# Setting Google Sheets + Apps Script

Created by Muhammad Rizky Azri Mulyana

## Penting setelah update ini
Kamu sudah punya Web App. Sekarang **wajib deploy versi baru**:

1. Buka Apps Script project yang lama
2. Hapus semua kode lama, tempel isi `apps-script.gs` yang baru
3. Save
4. Deploy → Manage deployments → ikon pensil → Version: **New version** → Deploy
5. URL `/exec` biasanya tetap sama, tidak perlu ganti `config.js`

Tanpa New version, daftar room bisa tetap kosong / lambat.

## Setup awal (kalau belum pernah)
1. Buat Google Sheet kosong
2. Extensions → Apps Script
3. Tempel `apps-script.gs` → Save
4. Deploy → New deployment → Web app
   - Execute as: Me
   - Who has access: **Anyone**
5. Izinkan akses
6. Tempel URL `/exec` ke `config.js`

Header sheet dibuat otomatis. Tidak perlu diketik manual.


## Kalau host gagal daftar room
Create harus cepat. Tempel apps-script.gs terbaru lalu Deploy New version.
Klik Keluar tetap ada di layar room. Di dalam game ada tombol Keluar di pojok lives.


## Mode satu lapangan
Isi Firebase di `config.js`. Panduan lengkap: lihat **FIREBASE.md**.

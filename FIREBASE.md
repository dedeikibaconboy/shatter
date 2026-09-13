# Firebase saja (tanpa Google Sheet)

Created by Muhammad Rizky Azri Mulyana

V3.2 memakai **Firebase Realtime Database** untuk semua fitur online:
daftar room, join, mulai match, skor, bola, bata, paddle.

Google Sheet dan Apps Script **tidak dipakai lagi**.

Paket Spark (gratis) cukup selama room bersamaan tidak terlalu banyak
(batas penting: 100 koneksi bersamaan, 10 GB download/bulan).
Game ini sudah dihemat: world 8x/detik data dipadatkan, skor & paddle
tidak ditulis setiap frame, room hilang otomatis jika host menutup tab.

## 1. Project
1. https://console.firebase.google.com
2. Project `monmon-shatter` (atau buat baru)
3. Analytics boleh off

## 2. Realtime Database
1. Build → Realtime Database → Create Database
2. Lokasi: asia-southeast1
3. Mulai locked, lalu ganti rules

## 3. Anonymous Auth (wajib)
1. Build → Authentication → Get started
2. Sign-in method → Anonymous → Enable

Tanpa ini pemain tidak bisa baca/tulis database.

## 4. Rules
Realtime Database → Rules → tempel isi `database.rules.json` → Publish.

Intinya:
- harus login anonim
- host saja yang boleh tulis `lobby`, `meta`, `world`
- tiap pemain hanya tulis `pads/{uid}` dan `players/{uid}` sendiri
- statistik hanya boleh bertambah +1

## 5. Config web
Project settings → Your apps → Web → copy `firebaseConfig`
ke `config.js` (`window.MONMON_FIREBASE`).
Wajib ada `apiKey` dan `databaseURL`.

## 6. Cek
1. Buka game, stats tidak boleh terus "—"
2. Buat room → di console RTDB muncul `lobby/KODE` dan `rooms/KODE`
3. Tutup tab host → node itu hilang (onDisconnect)

## Hemat kuota Spark
- Jangan buka puluhan tab sekaligus (1 tab = 1 koneksi)
- Jangan taruh screenshot/video di RTDB
- Kalau download mendekati 10 GB/bulan, kurangi world write
  (sudah 120 ms) atau batasi pemain

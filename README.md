# Monmon Shatter Online

**Multiplayer Brick Breaker — V3.1 (revisi UI/UX)**  
Created by **Muhammad Rizky Azri Mulyana**  
Brand Colors: Red • Green • Black

Perbaikan V3.1: HUD skor lebih kebaca, tombol Pause, overlay tidak bertumpuk, opsi room dipisah dari Main Sendiri, aturan mode ditampilkan, Main Lagi reset dari awal, status koneksi lebih ramah, peerId dikirim setelah PeerJS siap. Setelah update, deploy ulang Apps Script (New version) supaya heartbeat bisa menyimpan peerId.

## Fitur
- Main sendiri atau tanding online
- Room publik terlihat dari seluruh dunia
- Host bisa pilih: room bebas join atau wajib kode
- Tombol Copy Kode untuk share ke teman
- Statistik: pengunjung, sudah main, room online
- Responsive HP dan laptop

## Setup server (wajib untuk lobby dunia)
Baca **SETUP.md**. Intinya:
1. Buat Google Sheet
2. Tempel `apps-script.gs` ke Apps Script
3. Deploy Web App, akses Anyone
4. Tempel URL ke `config.js`

Tanpa langkah itu, game tetap bisa dimainkan sendiri.

## File
- index.html
- style.css
- script.js
- levels.json
- config.js
- apps-script.gs
- SETUP.md
- README.md

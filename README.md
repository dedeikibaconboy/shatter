# Monmon Shatter Online

**Multiplayer Brick Breaker — V3.3.9+Chat**  
Created by **Muhammad Rizky Azri Mulyana**

Online sepenuhnya lewat Firebase Realtime Database.
Tidak perlu Google Sheet atau Apps Script.

## Fitur baru
- **Animasi & suara bata hancur** disamakan (solo = multiplayer), partikel sekarang benar-benar digambar.
- **Solo Satu lapangan vs CPU**: setelah pemain kehabisan nyawa, CPU tetap bermain dan raketnya mengejar bola (tidak diam).
- **Chat online** (gaya Discord/Slack side panel):
  - Daftar pemain online + negara/wilayah
  - Chat privat (DM) 1:1 realtime
  - Ruang chat grup: password opsional, kunci ruang, permintaan join + pertanyaan, approve/tolak manual
  - Ruang/DM otomatis dihapus dari database setelah **1 hari** tidak aktif (hemat kuota)
  - Riwayat pesan dibatasi (~40 terakhir)

## Setup
Baca FIREBASE.md:
1. Nyalakan Realtime Database
2. Nyalakan Anonymous Auth
3. Publish rules dari **database.rules.json** (sudah termasuk `presence` + `chats`)
4. Pastikan config.js berisi config Firebase

Tanpa Firebase, Main Sendiri tetap jalan (chat & online list butuh Firebase).

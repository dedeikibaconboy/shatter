# Monmon Shatter Online

**Multiplayer Brick Breaker — V3.4 Chat UX**  
Created by **Muhammad Rizky Azri Mulyana**

## Chat UX (v2)

### Soft DM
1. User A klik nama User B → mulai kirim pesan
2. Setelah **2 pesan** dari A, User B bisa:
   - **Blokir**
   - **Biarkan lanjut**
   - **Jadikan Rekan DM** (privat, user lain tidak bisa baca)

### Rekan DM → Ruang
- Tombol **Buat Ruang dari DM** (nama default: `NamaA & NamaB`)
- Hanya anggota yang bisa baca isi

### Peek & join ruang
1. User C klik ruang di list → **collapse** daftar anggota
2. Anggota dalam (A/B) dapat **notif toast** + banner “C melihat ruang”
3. C bisa **sapa maks 2×** (isi chat tetap tersembunyi)
4. Saat **Izinkan**, pilih opsi:
   - Bisa lihat riwayat chat?
   - Bisa undang / izinkan orang lain?

### Hak owner
- Hapus ruang, keluarkan anggota
- Beri hak ke user lain: approve, invite, kick, manage

### Screenshot ringan
- Ctrl+V / tombol 🖼️ → kompres JPEG kecil
- **Auto-hapus dari database ~45 detik**

### Hemat DB
- Pesan max ~40/room
- Room/DM idle > 24 jam dihapus otomatis

## Setup
1. Nyalakan Realtime Database + Anonymous Auth
2. Publish **database.rules.json** (ada `presence` + `chats`)
3. Isi `config.js`

Tanpa Firebase, Main Sendiri tetap jalan.

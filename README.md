# Monmon Shatter Online

**Multiplayer Brick Breaker — V3.3**  
Created by **Muhammad Rizky Azri Mulyana**  
Situs: https://shatter.silverhawk.web.id

Game bata online. Mode Balapan (lapangan sendiri) atau Satu lapangan (satu bola bergiliran).  
Bisa main sendiri lawan CPU, atau room online sampai 6 pemain.

Online memakai **Firebase Realtime Database saja**.  
Google Sheet dan Apps Script tidak dipakai.

## Fitur
- Lobby, buat room, join kode, daftar room publik
- Satu lapangan: giliran memukul, hukuman nyawa, GET READY 3 detik
- Raket giliran lebih besar; pemain habis nyawa raket transparan
- Pemain terakhir tidak otomatis menang — ada tombol Akhiri
- Selebrasi hasil + bagikan tautan situs
- Main sendiri memakai animasi dan suara yang sama
- Tombol **Cara Main** dan **Kredit** di lobby

## Setup
Baca `FIREBASE.md` dan `SETUP.md`.

Ringkas:
1. Nyalakan Realtime Database
2. Nyalakan Anonymous Auth
3. Publish rules dari `database.rules.json`
4. Isi `config.js` dengan config Firebase project

Tanpa Firebase, **Main Sendiri** tetap jalan.

## Kontrol
- Desktop: panah kiri/kanan atau gerakkan pointer
- HP: geser jari di lapangan

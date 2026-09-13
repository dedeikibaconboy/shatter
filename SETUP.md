# Setup singkat — Monmon Shatter V3.3

Created by Muhammad Rizky Azri Mulyana  
https://shatter.silverhawk.web.id

Google Sheet / Apps Script tidak dipakai.

## Yang wajib untuk mode online
1. Anonymous Authentication ON  
   https://console.firebase.google.com/project/monmon-shatter/authentication/providers
2. Publish rules dari `database.rules.json`  
   https://console.firebase.google.com/project/monmon-shatter/database/monmon-shatter-default-rtdb/rules
3. `config.js` berisi config project `monmon-shatter`

Tanpa tiga langkah itu, tombol Buat Room / Join gagal.  
**Main Sendiri** tetap bisa.

## Setelah upload file
Hard refresh (Ctrl+Shift+R) di HP dan desktop.  
Tes suara: ketuk layar sekali, pecahkan bata. Volume Web Audio di HP lebih kecil dari video; game ini sudah dinaikkan gain-nya.

## File penting
- `index.html` — lobby, panduan, kredit, game
- `script.js` — game + Firebase
- `style.css` — tampilan
- `levels.json` — pola bata
- `database.rules.json` — rules RTDB
- `config.js` — kunci Firebase
- `FIREBASE.md` — langkah console lengkap

File `apps-script.gs` boleh diabaikan.

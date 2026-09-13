# Setting Firebase (bola & bata live)

Created by Muhammad Rizky Azri Mulyana

Google Sheet tetap untuk daftar room. Firebase dipakai supaya bola dan bata
di host serta guest sama dan tidak nge-freeze.

## 1. Buat project
1. Buka https://console.firebase.google.com
2. Add project → nama bebas, misalnya `monmon-shatter`
3. Google Analytics boleh off

## 2. Aktifkan Realtime Database
1. Build → Realtime Database → Create Database
2. Pilih lokasi terdekat (asia-southeast1 jika ada)
3. Mulai mode **locked**, nanti diganti rules

## 3. Aktifkan Anonymous Auth
1. Build → Authentication → Get started
2. Sign-in method → Anonymous → Enable

## 4. Tempel rules
Realtime Database → Rules → tempel ini → Publish:

```
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    }
  }
}
```

## 5. Ambil config
1. Project settings (ikon gerigi) → Your apps → Web (</>)
2. Daftarkan app, nama `monmon`
3. Copy objek `firebaseConfig`

## 6. Tempel ke config.js
Isi `window.MONMON_FIREBASE` dengan nilai dari Firebase.
Yang wajib ada: `apiKey` dan `databaseURL`.

Contoh:

```
window.MONMON_FIREBASE = {
  apiKey: "AIza...",
  authDomain: "monmon-shatter.firebaseapp.com",
  databaseURL: "https://monmon-shatter-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "monmon-shatter",
  storageBucket: "monmon-shatter.appspot.com",
  messagingSenderId: "123",
  appId: "1:123:web:abc"
};
```

## 7. Upload
Upload folder game (termasuk config.js yang sudah diisi) ke GitHub Pages.

Tanpa langkah 6, room Sheet tetap jalan, tapi bola satu lapangan
bisa freeze seperti sebelumnya.

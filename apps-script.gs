/**
 * Monmon Shatter — Google Apps Script Backend
 * Created by Muhammad Rizki Azri Mulyana
 *
 * Tempel seluruh file ini ke Editor Apps Script.
 * Lalu deploy sebagai Web App (lihat SETUP.md).
 */

const ROOM_TTL_MS = 45000; // room hilang jika host offline > 45 detik

function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function ensureSheets() {
  const ss = getSpreadsheet();

  let rooms = ss.getSheetByName('Rooms');
  if (!rooms) {
    rooms = ss.insertSheet('Rooms');
    rooms.getRange(1, 1, 1, 8).setValues([[
      'roomId', 'hostName', 'peerId', 'requiresCode', 'status', 'lastSeen', 'createdAt', 'players'
    ]]);
    rooms.setFrozenRows(1);
  }

  let stats = ss.getSheetByName('Stats');
  if (!stats) {
    stats = ss.insertSheet('Stats');
    stats.getRange(1, 1, 3, 2).setValues([
      ['metric', 'value'],
      ['visits', 0],
      ['plays', 0]
    ]);
  }

  return { rooms, stats };
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function nowIso() {
  return new Date().toISOString();
}

function nowMs() {
  return Date.now();
}

function randomRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

function cleanName(name) {
  return String(name || 'Player').replace(/[^\w\s\-_.]/g, '').substring(0, 16) || 'Player';
}

function cleanupRooms(rooms) {
  const lastRow = rooms.getLastRow();
  if (lastRow < 2) return;
  const data = rooms.getRange(2, 1, lastRow - 1, 8).getValues();
  const cutoff = nowMs() - ROOM_TTL_MS;
  for (let i = data.length - 1; i >= 0; i--) {
    const lastSeen = Number(data[i][5]) || 0;
    const status = String(data[i][4] || '');
    if (lastSeen < cutoff || status === 'closed') {
      rooms.deleteRow(i + 2);
    }
  }
}

function findRoomRow(rooms, roomId) {
  const lastRow = rooms.getLastRow();
  if (lastRow < 2) return -1;
  const ids = rooms.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).toUpperCase() === String(roomId).toUpperCase()) {
      return i + 2;
    }
  }
  return -1;
}

function doGet(e) {
  try {
    const p = (e && e.parameter) ? e.parameter : {};
    const action = String(p.action || 'stats');
    const { rooms, stats } = ensureSheets();

    if (action === 'stats') {
      return jsonOut(readStats(stats, rooms));
    }

    if (action === 'visit') {
      bumpStat(stats, 'visits');
      return jsonOut(readStats(stats, rooms));
    }

    if (action === 'play') {
      bumpStat(stats, 'plays');
      return jsonOut(readStats(stats, rooms));
    }

    if (action === 'list') {
      cleanupRooms(rooms);
      return jsonOut({ ok: true, rooms: listPublicRooms(rooms), stats: readStats(stats, rooms) });
    }

    if (action === 'create') {
      cleanupRooms(rooms);
      const hostName = cleanName(p.hostName);
      const peerId = String(p.peerId || '').substring(0, 80);
      const requiresCode = String(p.requiresCode) === '1' || String(p.requiresCode) === 'true';
      if (!peerId) return jsonOut({ ok: false, error: 'peerId required' });

      let roomId = randomRoomId();
      while (findRoomRow(rooms, roomId) !== -1) roomId = randomRoomId();

      rooms.appendRow([
        roomId,
        hostName,
        peerId,
        requiresCode ? 'YES' : 'NO',
        'waiting',
        nowMs(),
        nowIso(),
        1
      ]);

      return jsonOut({
        ok: true,
        roomId: roomId,
        requiresCode: requiresCode,
        hostName: hostName
      });
    }

    if (action === 'heartbeat') {
      const roomId = String(p.roomId || '').toUpperCase();
      const row = findRoomRow(rooms, roomId);
      if (row === -1) return jsonOut({ ok: false, error: 'room not found' });
      rooms.getRange(row, 6).setValue(nowMs());
      if (p.status) rooms.getRange(row, 5).setValue(String(p.status).substring(0, 20));
      if (p.players) rooms.getRange(row, 8).setValue(Number(p.players) || 1);
      return jsonOut({ ok: true });
    }

    if (action === 'joininfo') {
      cleanupRooms(rooms);
      const roomId = String(p.roomId || '').toUpperCase();
      const givenCode = String(p.code || '').toUpperCase();
      const row = findRoomRow(rooms, roomId);
      if (row === -1) return jsonOut({ ok: false, error: 'Room tidak ditemukan atau sudah tutup.' });

      const vals = rooms.getRange(row, 1, 1, 8).getValues()[0];
      const requiresCode = String(vals[3]) === 'YES';
      if (requiresCode && givenCode !== roomId) {
        return jsonOut({ ok: false, error: 'Kode room salah.' });
      }

      return jsonOut({
        ok: true,
        roomId: vals[0],
        hostName: vals[1],
        peerId: vals[2],
        requiresCode: requiresCode,
        status: vals[4]
      });
    }

    if (action === 'close') {
      const roomId = String(p.roomId || '').toUpperCase();
      const row = findRoomRow(rooms, roomId);
      if (row !== -1) rooms.deleteRow(row);
      return jsonOut({ ok: true });
    }

    return jsonOut({ ok: false, error: 'unknown action' });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function bumpStat(stats, key) {
  const lastRow = stats.getLastRow();
  const data = stats.getRange(1, 1, lastRow, 2).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]) === key) {
      const next = Number(data[i][1] || 0) + 1;
      stats.getRange(i + 1, 2).setValue(next);
      return next;
    }
  }
  stats.appendRow([key, 1]);
  return 1;
}

function readStats(stats, rooms) {
  const lastRow = stats.getLastRow();
  const data = stats.getRange(1, 1, Math.max(lastRow, 1), 2).getValues();
  const out = { visits: 0, plays: 0, roomsOnline: 0 };
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]) === 'visits') out.visits = Number(data[i][1] || 0);
    if (String(data[i][0]) === 'plays') out.plays = Number(data[i][1] || 0);
  }
  const rLast = rooms.getLastRow();
  if (rLast >= 2) out.roomsOnline = rLast - 1;
  return out;
}

function listPublicRooms(rooms) {
  const lastRow = rooms.getLastRow();
  if (lastRow < 2) return [];
  const data = rooms.getRange(2, 1, lastRow - 1, 8).getValues();
  const list = [];
  data.forEach(row => {
    const requiresCode = String(row[3]) === 'YES';
    const status = String(row[4] || 'waiting');
    if (status === 'closed') return;
    list.push({
      roomId: String(row[0]),
      hostName: String(row[1]),
      requiresCode: requiresCode,
      status: status,
      players: Number(row[7] || 1)
    });
  });
  return list;
}

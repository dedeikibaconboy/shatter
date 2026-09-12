/**
 * Monmon Shatter — Google Apps Script Backend
 * Created by Muhammad Rizki Azri Mulyana
 *
 * PENTING: setelah menempel kode baru,
 * Deploy → Manage deployments → Edit pensil → New version → Deploy
 */

const ROOM_TTL_MS = 120000;
const MAX_PLAYERS = 6;

function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function ensureSheets() {
  const ss = getSpreadsheet();
  let rooms = ss.getSheetByName('Rooms');
  if (!rooms) {
    rooms = ss.insertSheet('Rooms');
    rooms.getRange(1, 1, 1, 9).setValues([[
      'roomId', 'hostName', 'peerId', 'requiresCode', 'status',
      'lastSeen', 'createdAt', 'players', 'allowGuestStart'
    ]]);
    rooms.setFrozenRows(1);
  } else if (String(rooms.getRange(1, 9).getValue()) !== 'allowGuestStart') {
    rooms.getRange(1, 9).setValue('allowGuestStart');
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

var JSONP_CB = '';

function jsonOut(obj) {
  const text = JSON.stringify(obj);
  if (JSONP_CB && /^[A-Za-z0-9_]+$/.test(JSONP_CB)) {
    return ContentService
      .createTextOutput(JSONP_CB + '(' + text + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(text)
    .setMimeType(ContentService.MimeType.JSON);
}

function nowMs() { return Date.now(); }
function nowIso() { return new Date().toISOString(); }

function randomRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
  return id;
}

function cleanName(name) {
  return String(name || 'Player').replace(/[^\w\s\-_.]/g, '').substring(0, 16) || 'Player';
}

function cleanCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 10);
}

function cleanupRooms(rooms) {
  const lastRow = rooms.getLastRow();
  if (lastRow < 2) return;
  const data = rooms.getRange(2, 1, lastRow - 1, 9).getValues();
  const cutoff = nowMs() - ROOM_TTL_MS;
  for (let i = data.length - 1; i >= 0; i--) {
    const lastSeen = Number(data[i][5]) || 0;
    const status = String(data[i][4] || '');
    if (status === 'closed' || lastSeen < cutoff) {
      rooms.deleteRow(i + 2);
    }
  }
}

function findRoomRow(rooms, roomId) {
  const lastRow = rooms.getLastRow();
  if (lastRow < 2) return -1;
  const ids = rooms.getRange(2, 1, lastRow - 1, 1).getValues();
  const want = String(roomId).toUpperCase();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).toUpperCase() === want) return i + 2;
  }
  return -1;
}

function doGet(e) {
  try {
    const p = (e && e.parameter) ? e.parameter : {};
    JSONP_CB = String(p.callback || '');
    const action = String(p.action || 'stats');
    const { rooms, stats } = ensureSheets();

    if (action === 'stats') return jsonOut(Object.assign({ ok: true }, readStats(stats, rooms)));

    if (action === 'visit') {
      bumpStat(stats, 'visits');
      return jsonOut(Object.assign({ ok: true }, readStats(stats, rooms)));
    }

    if (action === 'play') {
      bumpStat(stats, 'plays');
      return jsonOut(Object.assign({ ok: true }, readStats(stats, rooms)));
    }

    if (action === 'list') {
      cleanupRooms(rooms);
      return jsonOut({ ok: true, rooms: listRooms(rooms), stats: readStats(stats, rooms) });
    }

    if (action === 'create') {
      cleanupRooms(rooms);
      const hostName = cleanName(p.hostName);
      const peerId = String(p.peerId || '').substring(0, 80);
      const requiresCode = String(p.requiresCode) === '1' || String(p.requiresCode) === 'true';
      const allowGuestStart = String(p.allowGuestStart) === '1' || String(p.allowGuestStart) === 'true';
      if (!peerId) return jsonOut({ ok: false, error: 'peerId required' });

      let roomId = cleanCode(p.customCode);
      if (roomId && roomId.length < 3) {
        return jsonOut({ ok: false, error: 'Kode custom minimal 3 huruf/angka.' });
      }
      if (roomId && findRoomRow(rooms, roomId) !== -1) {
        return jsonOut({ ok: false, error: 'Kode itu sudah dipakai. Pilih kode lain.' });
      }
      if (!roomId) {
        roomId = randomRoomId();
        while (findRoomRow(rooms, roomId) !== -1) roomId = randomRoomId();
      }

      rooms.appendRow([
        roomId, hostName, peerId, requiresCode ? 'YES' : 'NO',
        'waiting', String(nowMs()), nowIso(), 1, allowGuestStart ? 'YES' : 'NO'
      ]);

      return jsonOut({
        ok: true,
        roomId: roomId,
        requiresCode: requiresCode,
        allowGuestStart: allowGuestStart,
        hostName: hostName
      });
    }

    if (action === 'heartbeat') {
      const roomId = cleanCode(p.roomId);
      const row = findRoomRow(rooms, roomId);
      if (row === -1) return jsonOut({ ok: false, error: 'room not found' });
      rooms.getRange(row, 6).setValue(String(nowMs()));
      if (p.status) rooms.getRange(row, 5).setValue(String(p.status).substring(0, 20));
      if (p.players) rooms.getRange(row, 8).setValue(Math.min(MAX_PLAYERS, Number(p.players) || 1));
      return jsonOut({ ok: true });
    }

    if (action === 'joininfo') {
      cleanupRooms(rooms);
      const roomId = cleanCode(p.roomId);
      const givenCode = cleanCode(p.code);
      const row = findRoomRow(rooms, roomId);
      if (row === -1) return jsonOut({ ok: false, error: 'Room tidak ditemukan atau sudah tutup.' });

      const vals = rooms.getRange(row, 1, 1, 9).getValues()[0];
      const requiresCode = String(vals[3]) === 'YES';
      const players = Number(vals[7] || 1);
      if (players >= MAX_PLAYERS) {
        return jsonOut({ ok: false, error: 'Room penuh (maksimal 6 pemain).' });
      }
      if (requiresCode && givenCode !== String(vals[0]).toUpperCase()) {
        return jsonOut({ ok: false, error: 'Kode room salah.' });
      }

      return jsonOut({
        ok: true,
        roomId: String(vals[0]),
        hostName: String(vals[1]),
        peerId: String(vals[2]),
        requiresCode: requiresCode,
        status: String(vals[4]),
        players: players,
        allowGuestStart: String(vals[8]) === 'YES'
      });
    }

    if (action === 'close') {
      const roomId = cleanCode(p.roomId);
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

function listRooms(rooms) {
  const lastRow = rooms.getLastRow();
  if (lastRow < 2) return [];
  const data = rooms.getRange(2, 1, lastRow - 1, 9).getValues();
  const list = [];
  data.forEach(row => {
    const status = String(row[4] || 'waiting');
    if (status === 'closed') return;
    list.push({
      roomId: String(row[0]),
      hostName: String(row[1]),
      requiresCode: String(row[3]) === 'YES',
      status: status,
      players: Number(row[7] || 1),
      allowGuestStart: String(row[8]) === 'YES'
    });
  });
  return list;
}

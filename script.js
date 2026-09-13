/**
 * Monmon Shatter Online
 * Created by Muhammad Rizky Azri Mulyana
 */
(() => {
  const MAX_PLAYERS = 6;
  const IS_MOBILE = matchMedia('(pointer:coarse)').matches || innerWidth < 700;

  const lobbyEl = document.getElementById('lobby');
  const roomEl = document.getElementById('room');
  const gameScreenEl = document.getElementById('game-screen');
  const playerNameInput = document.getElementById('playerName');
  const roomCodeInput = document.getElementById('roomCode');
  const customCodeInput = document.getElementById('customCode');
  const requireCodeEl = document.getElementById('requireCode');
  const allowGuestStartEl = document.getElementById('allowGuestStart');
  const customCodeWrap = document.getElementById('customCodeWrap');
  const publicRoomsEl = document.getElementById('publicRooms');
  const apiWarnEl = document.getElementById('apiWarn');
  const btnSolo = document.getElementById('btn-solo');
  const btnCreate = document.getElementById('btn-create');
  const btnJoin = document.getElementById('btn-join');
  const btnStartMatch = document.getElementById('btn-start-match');
  const btnLeave = document.getElementById('btn-leave');
  const displayRoomCode = document.getElementById('displayRoomCode');
  const playersListEl = document.getElementById('playersList');
  const roomStatusEl = document.getElementById('roomStatus');
  const copyRow = document.getElementById('copyRow');
  const copyCodeInput = document.getElementById('copyCodeInput');
  const btnCopy = document.getElementById('btn-copy');
  const roomHint = document.getElementById('roomHint');
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const scoreEl = document.getElementById('score');
  const livesEl = document.getElementById('lives');
  const myNameHud = document.getElementById('myNameHud');
  const liveScoresEl = document.getElementById('live-scores');
  const levelUpOverlay = document.getElementById('level-up');
  const gameOverOverlay = document.getElementById('game-over');
  const nextLevelBtn = document.getElementById('next-level-btn');
  const restartBtn = document.getElementById('restart-btn');
  const backLobbyBtn = document.getElementById('back-lobby-btn');
  const goTitle = document.getElementById('go-title');
  const finalResults = document.getElementById('final-results');
  const levelMessage = document.getElementById('level-message');

  let gameData = null, settings = null;
  let currentLevel = 0, score = 0, lives = 3, bricks = [];
  let paddle = { x: 0, y: 0, width: 90, height: 14, speed: 8 };
  let ball = { x: 0, y: 0, radius: 8, dx: 0, dy: 0, speed: 5.2 };
  let rightPressed = false, leftPressed = false;
  let isRunning = false, isPaused = false, animationId = null;
  let particles = [];
  let lastTs = 0;

  let myName = 'Player';
  let myNetId = Math.random().toString(36).slice(2, 8);
  let isHost = false, isMultiplayer = false;
  let peer = null, hostConns = [], guestConn = null;
  let myPeerId = null, roomCode = '';
  let roomRequiresCode = false, allowGuestStart = false;
  let roster = [];
  let matchStarted = false;
  let gameMode = 'race';
  let lastHitter = null;
  let turnId = null;
  let pendingBricks = [];
  let splashTimer = null;
  let paddles = [];
  let waitPollFast = null;
  let heartbeatTimer = null, roomsPollTimer = null;

  if (requireCodeEl) {
    requireCodeEl.addEventListener('change', () => {
      customCodeWrap.classList.toggle('hidden', !requireCodeEl.checked);
    });
  }

  function apiBase() {
    return String(window.MONMON_API || '').trim().replace(/\/$/, '');
  }

  let fbDb = null, fbReady = false;
  let fbWorldUnsub = null, fbPadUnsub = null, fbCmdUnsub = null;
  let lastFbWorldWrite = 0, lastFbPadWrite = 0;

  function fbEnabled() {
    const c = window.MONMON_FIREBASE || {};
    return !!(c.apiKey && c.databaseURL && window.firebase);
  }

  async function fbInit() {
    if (fbReady) return true;
    if (!fbEnabled()) return false;
    try {
      if (!firebase.apps.length) firebase.initializeApp(window.MONMON_FIREBASE);
      fbDb = firebase.database();
      await firebase.auth().signInAnonymously();
      fbReady = true;
      return true;
    } catch (e) {
      console.warn('Firebase gagal', e);
      return false;
    }
  }

  function fbRoomPath() {
    return 'rooms/' + String(roomCode || 'x').toUpperCase();
  }

  function applyWorldState(data) {
    if (!data || !data.ball) return;
    ball.x = data.ball.x; ball.y = data.ball.y;
    ball.dx = data.ball.dx; ball.dy = data.ball.dy;
    if (data.ball.speed) ball.speed = data.ball.speed;
    lastHitter = data.lastHitter || lastHitter;
    if (data.turnId) turnId = data.turnId;
    if (Array.isArray(data.bricks)) bricks = data.bricks;
    if (Array.isArray(data.pending)) pendingBricks = data.pending;
    if (Array.isArray(data.paddles)) {
      data.paddles.forEach(s => {
        const pad = paddles.find(p => p.id === s.id);
        if (pad && s.id !== myNetId) {
          pad.x = s.x; pad.y = s.y; pad.slow = !!s.slow;
        }
      });
    }
    if (Array.isArray(data.roster)) {
      data.roster.forEach(s => {
        const r = roster.find(p => p.id === s.id);
        if (r) {
          if (r.id !== myNetId) {
            r.score = s.score; r.lives = s.lives; r.finished = s.finished;
          }
        }
      });
      renderLiveScores();
      refreshWaitBoard();
    }
  }

  function fbStop() {
    try { if (fbWorldUnsub) fbWorldUnsub(); } catch(e){}
    try { if (fbPadUnsub) fbPadUnsub(); } catch(e){}
    try { if (fbCmdUnsub) fbCmdUnsub(); } catch(e){}
    fbWorldUnsub = fbPadUnsub = fbCmdUnsub = null;
    if (fbDb && roomCode) {
      try { fbDb.ref(fbRoomPath() + '/pads/' + myNetId).remove(); } catch(e){}
    }
  }

  function fbStartRoomSync() {
    if (!fbReady || !fbDb || !roomCode) return;
    fbStop();
    const base = fbDb.ref(fbRoomPath());
    const worldH = base.child('world').on('value', (snap) => {
      if (isHost) return;
      applyWorldState(snap.val());
    });
    fbWorldUnsub = () => base.child('world').off('value', worldH);
    const padH = base.child('pads').on('value', (snap) => {
      const v = snap.val() || {};
      Object.keys(v).forEach((id) => {
        if (id === myNetId) return;
        const pad = paddles.find(p => p.id === id);
        if (pad && v[id] && typeof v[id].x === 'number') {
          pad.x = v[id].x;
          if (v[id].y != null) pad.y = v[id].y;
          pad.slow = !!v[id].slow;
        }
      });
    });
    fbPadUnsub = () => base.child('pads').off('value', padH);
    const cmdH = base.child('cmd').on('value', (snap) => {
      const v = snap.val();
      if (!v) return;
      if (v.start && !matchStarted && roster.length >= 2) {
        matchStarted = true;
        startMultiplayerMatch();
      }
    });
    fbCmdUnsub = () => base.child('cmd').off('value', cmdH);
  }


  function apiJsonp(action, extra) {
    return new Promise((resolve, reject) => {
      const base = apiBase();
      const cb = 'monmon_cb_' + Date.now() + '_' + Math.floor(Math.random()*9999);
      const params = new URLSearchParams(Object.assign({ action, callback: cb }, extra || {}));
      const s = document.createElement('script');
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('timeout'));
      }, 20000);
      function cleanup() {
        clearTimeout(timer);
        try { delete window[cb]; } catch(e) { window[cb] = undefined; }
        if (s.parentNode) s.parentNode.removeChild(s);
      }
      window[cb] = (data) => { cleanup(); resolve(data); };
      s.onerror = () => { cleanup(); reject(new Error('Gagal menghubungi Apps Script.')); };
      s.src = base + '?' + params.toString();
      document.head.appendChild(s);
    });
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function apiGet(action, extra) {
    const base = apiBase();
    if (!base) throw new Error('API kosong. Isi config.js');
    try {
      const params = new URLSearchParams(Object.assign({ action }, extra || {}));
      const ctrl = new AbortController();
      const tmr = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(base + '?' + params.toString(), { cache: 'no-store', signal: ctrl.signal });
      clearTimeout(tmr);
      const text = await res.text();
      if (!text || text.trim().charAt(0) === '<') throw new Error('HTML');
      return JSON.parse(text);
    } catch (e) {
      return apiJsonp(action, extra);
    }
  }

  async function recoverRoom(roomId) {
    if (!roomId) return null;
    for (let i = 0; i < 6; i++) {
      try {
        const data = await apiGet('roomstate', { roomId });
        if (data && data.ok) return data;
      } catch (e) {}
      await sleep(1200);
    }
    return null;
  }
  function setStats(s) {
    if (!s) return;
    document.getElementById('statVisits').textContent = s.visits ?? '—';
    document.getElementById('statPlays').textContent = s.plays ?? '—';
    document.getElementById('statRooms').textContent = s.roomsOnline ?? '—';
  }
  function escapeHtml(t) {
    const d = document.createElement('div'); d.textContent = t; return d.innerHTML;
  }
  function showScreen(name) {
    lobbyEl.classList.add('hidden');
    roomEl.classList.add('hidden');
    gameScreenEl.classList.add('hidden');
    if (name === 'lobby') lobbyEl.classList.remove('hidden');
    if (name === 'room') roomEl.classList.remove('hidden');
    if (name === 'game') gameScreenEl.classList.remove('hidden');
  }
  function getPlayerName() {
    const n = (playerNameInput.value || '').trim();
    const name = n || ('Player' + Math.floor(Math.random() * 900 + 100));
    if (!playerNameInput.value.trim()) playerNameInput.value = name;
    localStorage.setItem('monmon_name', name);
    return name;
  }

  function applySheetRoster(list) {
    if (!Array.isArray(list)) return;
    const mine = roster.find(r => r.id === myNetId);
    roster = list.map(p => ({
      id: p.id,
      name: p.name,
      score: (isRunning && p.id === myNetId && mine) ? mine.score : Number(p.score || 0),
      lives: (isRunning && p.id === myNetId && mine && mine.lives != null) ? mine.lives : Number(p.lives != null ? p.lives : 3),
      finished: !!p.finished,
      host: !!p.host
    }));
    updatePlayersList();
    renderLiveScores();
  }

  async function pollRoomState() {
    if (!roomCode || !apiBase() || isRunning) return;
    try {
      const data = await apiGet('roomstate', { roomId: roomCode });
      if (!data.ok) return;
      if (typeof data.allowGuestStart === 'boolean') allowGuestStart = data.allowGuestStart;
      if (data.gameMode) gameMode = data.gameMode;
      applySheetRoster(data.roster);
      refreshWaitBoard();
      if (data.status === 'playing' && !matchStarted && roster.length >= 2) {
        matchStarted = true;
        startMultiplayerMatch();
      }
    } catch (e) {}
  }

  function startHeartbeat() {
    fbStartRoomSync();
    stopHeartbeat();
    const beat = () => {
      if (!roomCode || !apiBase()) return;
      apiGet('heartbeat', {
        roomId: roomCode,
        status: isRunning ? 'playing' : 'waiting',
        players: Math.max(1, roster.length)
      }).catch(() => {});
      pollRoomState();
    };
    beat();
    heartbeatTimer = setInterval(beat, 2000);
  }
  function stopHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  function selectedMode() {
    const el = document.querySelector('input[name="roomPlayMode"]:checked');
    return (el && el.value === 'shared') ? 'shared' : 'race';
  }

  function renderPublicRooms(list) {
    const keep = document.activeElement;
    const keepId = keep && keep.id;
    const start = (keep && typeof keep.selectionStart === 'number') ? keep.selectionStart : null;
    const end = (keep && typeof keep.selectionEnd === 'number') ? keep.selectionEnd : null;
    if (!list || !list.length) {
      publicRoomsEl.innerHTML = '<p class="muted">Belum ada room. Buat room pertama!</p>';
      return;
    }
    publicRoomsEl.innerHTML = list.map(r => {
      const full = (r.players || 1) >= MAX_PLAYERS;
      const lock = r.requiresCode ? 'Butuh kode' : 'Publik';
      const btn = full
        ? `<button class="btn secondary" disabled>Penuh</button>`
        : r.requiresCode
          ? `<button class="btn secondary js-need-code" data-id="${escapeHtml(r.roomId)}">Kode</button>`
          : `<button class="btn primary js-quick-join" data-id="${escapeHtml(r.roomId)}">Join</button>`;
      return `<div class="room-item">
        <div class="meta">
          <div class="host-name">${escapeHtml(r.hostName)}</div>
          <div class="lock">${lock} · ${r.players || 1}/${MAX_PLAYERS} · ${escapeHtml(r.status)}</div>
        </div>${btn}</div>`;
    }).join('');
    publicRoomsEl.querySelectorAll('.js-quick-join').forEach(btn => {
      btn.onclick = () => joinByRoomId(btn.dataset.id, '');
    });
    publicRoomsEl.querySelectorAll('.js-need-code').forEach(btn => {
      btn.onclick = () => {
        roomCodeInput.value = btn.dataset.id;
        roomCodeInput.focus();
      };
    });
    if (keepId) {
      const el = document.getElementById(keepId);
      if (el && keepId !== 'roomCode') {
        el.focus();
        try { if (start != null) el.setSelectionRange(start, end); } catch (e) {}
      }
    }
  }

  async function refreshLobby() {
    if (!apiBase()) {
      apiWarnEl.textContent = 'Server belum disetting. Isi URL di config.js (SETUP.md).';
      apiWarnEl.classList.remove('hidden');
      publicRoomsEl.innerHTML = '<p class="muted">Room global belum aktif.</p>';
      return;
    }
    apiWarnEl.classList.add('hidden');
    try {
      const data = await apiGet('list');
      setStats(data.stats);
      renderPublicRooms(data.rooms);
    } catch (e) {
      publicRoomsEl.innerHTML = '<p class="muted">Gagal memuat room. Deploy ulang Apps Script versi baru.</p>';
    }
  }

  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  function playTone(freq, duration, type = 'square', volume = 0.07) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type; osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(); osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
  }
  const sfxPaddle = () => playTone(220, 0.06);
  function sfxBrick(brick) {
    const hard = Number((brick && (brick.maxHp || brick.points)) || 10);
    if (hard >= 30) {
      [392, 523, 659, 784].forEach((f, i) => setTimeout(() => playTone(f, 0.16, i ? 'triangle' : 'square', 0.07 + i * 0.015), i * 55));
    } else if (hard >= 20) {
      [440, 554, 659].forEach((f, i) => setTimeout(() => playTone(f, 0.12, 'triangle', 0.07), i * 45));
    } else {
      playTone(480, 0.07, 'triangle', 0.08);
    }
  }
  const sfxWall = () => playTone(180, 0.05, 'sine', 0.04);
  const sfxLife = () => playTone(120, 0.2, 'sawtooth', 0.08);

  async function loadData() {
    try {
      const res = await fetch('levels.json');
      gameData = await res.json();
      settings = gameData.settings;
    } catch (e) {
      gameData = { levels: [{ level:1, name:'A', ballSpeed:5, pattern:[[1,1,1,1,1,1,1,1],[2,2,2,2,2,2,2,2],[3,3,3,3,3,3,3,3]] }],
        brickTypes: { "0":{color:null,points:0,hp:0}, "1":{color:"#e63946",points:10,hp:1}, "2":{color:"#2a9d8f",points:20,hp:1}, "3":{color:"#ff9f1c",points:30,hp:2} } };
      settings = { paddleWidth:90, paddleHeight:14, ballRadius:8, ballSpeed:5.2, paddleSpeed:8, lives:3, brickPadding:4, brickOffsetTop:46, brickOffsetLeft:16 };
    }
  }

  function sendAll(data) {
    if (isHost) hostConns.forEach(c => { if (c.open) try { c.send(data); } catch(e){} });
    else if (guestConn && guestConn.open) try { guestConn.send(data); } catch(e){}
  }
  function relayFromGuest(data, fromConn) {
    if (!isHost) return;
    hostConns.forEach(c => {
      if (c !== fromConn && c.open) try { c.send(data); } catch(e){}
    });
  }

  function isPeerLive() {
    if (isHost) return hostConns.some(c => c && c.open);
    return !!(guestConn && guestConn.open);
  }

  function upsertPlayer(id, name, isHostPlayer) {
    if (!id) return null;
    let p = roster.find(x => x.id === id);
    if (!p) {
      if (roster.length >= MAX_PLAYERS) return null;
      p = { id, name: name || 'Player', score: 0, finished: false, host: !!isHostPlayer };
      roster.push(p);
    } else {
      if (name) p.name = name;
      if (isHostPlayer) p.host = true;
    }
    return p;
  }

  function canClickStart() {
    if (roster.length < 2) return false;
    if (isRunning) return false;
    return isHost || allowGuestStart;
  }

  function updatePlayersList() {
    playersListEl.innerHTML = roster.map(p => {
      const you = p.id === myNetId ? ' (Kamu)' : '';
      const cls = p.host ? 'player-row host' : 'player-row';
      const badge = p.host ? 'HOST' : 'GUEST';
      return `<div class="${cls}"><span class="name">${escapeHtml(p.name)}${you}</span><span class="badge">${badge}</span></div>`;
    }).join('') || '<p class="muted">Menunggu pemain...</p>';
    const guests = roster.filter(p => !p.host).length;
    btnStartMatch.disabled = !canClickStart();
    if (guests < 1) {
      roomStatusEl.textContent = 'Menunggu pemain join...';
    } else if (canClickStart()) {
      roomStatusEl.textContent = roster.map(p => p.name).join(', ') + ' siap. Bisa klik Mulai.';
    } else {
      roomStatusEl.textContent = roster.map(p => p.name).join(', ') + ' sudah masuk. Menunggu host mulai.';
    }
    renderLiveScores();
  }

  function renderLiveScores() {
    if (!isMultiplayer) { liveScoresEl.textContent = ''; return; }
    liveScoresEl.innerHTML = roster.map(p => {
      const heart = '♥'.repeat(Math.max(0, p.lives != null ? p.lives : 0));
      return `${escapeHtml(p.name)} ${p.score} ${heart || '✗'}`;
    }).join('<br>');
  }

  function refreshWaitBoard() {
    if (!gameOverOverlay || gameOverOverlay.classList.contains('hidden')) return;
    if (!isMultiplayer) return;
    finalResults.innerHTML = roster.map(p => {
      const heart = '♥'.repeat(Math.max(0, Number(p.lives || 0)));
      const mark = p.finished ? '✓' : '▶';
      return `<p>${escapeHtml(p.name)}: <strong>${p.score}</strong> <span class="wait-lives">${heart || 'habis'}</span> ${mark}</p>`;
    }).join('');
  }

  function handleNet(data, fromConn) {
    if (!data || !data.type) return;
    if (isHost && fromConn && data.type !== 'hello') relayFromGuest(data, fromConn);
    switch (data.type) {
      case 'hello':
        if (fromConn) fromConn.playerId = data.id;
        upsertPlayer(data.id, data.name, false);
        if (isHost) {
          sendAll({ type: 'roster', roster, allowGuestStart });
          updatePlayersList();
          startHeartbeat();
        }
        break;
      case 'roster':
        roster = Array.isArray(data.roster) ? data.roster : roster;
        if (typeof data.allowGuestStart === 'boolean') allowGuestStart = data.allowGuestStart;
        updatePlayersList();
        break;
      case 'start':
        if (roster.length < 2 && !isHost) return;
        startMultiplayerMatch();
        break;
      case 'input':
        if (isHost && gameMode === 'shared') {
          const pad = paddles.find(p => p.id === data.id);
          if (pad && typeof data.x === 'number') pad.x = data.x;
        }
        break;
      case 'world':
        if (!isHost && gameMode === 'shared' && data.ball) {
          ball.x = data.ball.x; ball.y = data.ball.y; ball.dx = data.ball.dx; ball.dy = data.ball.dy;
          if (Array.isArray(data.paddles)) {
            data.paddles.forEach(s => {
              const pad = paddles.find(p => p.id === s.id);
              if (pad && s.id !== myNetId) { pad.x = s.x; pad.y = s.y; pad.slow = s.slow; }
            });
          }
          if (Array.isArray(data.bricks)) bricks = data.bricks;
    if (Array.isArray(data.pending)) pendingBricks = data.pending;
          if (Array.isArray(data.roster)) {
            data.roster.forEach(s => {
              const r = roster.find(p => p.id === s.id);
              if (r && r.id !== myNetId) { r.score = s.score; r.lives = s.lives; r.finished = s.finished; }
            });
            renderLiveScores();
          }
          lastHitter = data.lastHitter;
          if (data.turnId) turnId = data.turnId;
        }
        break;
      case 'score': {
        const p = roster.find(x => x.id === data.id);
        if (p) {
          p.score = data.score;
          if (data.lives != null) p.lives = data.lives;
        }
        renderLiveScores();
        refreshWaitBoard();
        break;
      }
      case 'finished': {
        const p = roster.find(x => x.id === data.id);
        if (p) { p.finished = true; p.score = data.score; }
        checkAllFinished();
        break;
      }
    }
  }

  function bindConn(connection, asHostSide) {
    connection.on('data', (d) => handleNet(d, connection));
    const ready = () => {
      if (asHostSide) {
        if (!hostConns.includes(connection)) hostConns.push(connection);
        sendAll({ type: 'roster', roster, allowGuestStart });
        updatePlayersList();
      } else {
        guestConn = connection;
        sendAll({ type: 'hello', id: myNetId, name: myName });
        roomStatusEl.textContent = 'Terhubung. Menunggu daftar pemain dari host...';
      }
    };
    if (connection.open) ready();
    else connection.on('open', ready);
    connection.on('close', () => {
      hostConns = hostConns.filter(c => c !== connection);
      if (asHostSide && connection.playerId) {
        roster = roster.filter(p => p.id !== connection.playerId);
        sendAll({ type: 'roster', roster, allowGuestStart });
      }
      if (connection === guestConn) {
        guestConn = null;
        roomStatusEl.textContent = 'Terputus dari host.';
        btnStartMatch.disabled = true;
      }
      updatePlayersList();
    });
  }

  function makePeer() {
    if (peer) try { peer.destroy(); } catch(e){}
    hostConns = []; guestConn = null;
    peer = new Peer({ debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } });
    return peer;
  }

  function createRoom() {
    myName = getPlayerName();
    isMultiplayer = true; isHost = true;
    roomRequiresCode = !!(requireCodeEl && requireCodeEl.checked);
    allowGuestStart = !!(allowGuestStartEl && allowGuestStartEl.checked);
    gameMode = (document.querySelector('input[name="roomPlayMode"]:checked') || {value:'race'}).value;
    matchStarted = false;
    roster = [{ id: myNetId, name: myName, score: 0, finished: false, host: true }];

    showScreen('room');
    displayRoomCode.textContent = '...';
    roomStatusEl.textContent = 'Menyiapkan koneksi...';
    btnStartMatch.disabled = true;
    updatePlayersList();

    const custom = roomRequiresCode ? (customCodeInput.value || '').trim().toUpperCase() : '';
    if (custom) {
      displayRoomCode.textContent = custom;
      copyCodeInput.value = custom;
    }

    async function finishHostRoom(id, peerId) {
      roomCode = id;
      displayRoomCode.textContent = id;
      copyCodeInput.value = id;
      roomHint.textContent = roomRequiresCode
        ? 'Room privat. Copy kode lalu kirim ke teman.'
        : 'Room publik. Laptop lain akan melihat room ini.';
      try {
        const joined = await apiGet('joinplayer', {
          roomId: id, playerId: myNetId, name: myName, isHost: '1', code: id
        });
        if (joined && joined.roster) applySheetRoster(joined.roster);
      } catch (e) {}
      startHeartbeat();
      roomStatusEl.textContent = 'Menunggu pemain join...';
    }

    (async () => {
      if (!apiBase()) {
        roomStatusEl.textContent = 'Isi config.js dulu.';
        return;
      }
      roomStatusEl.textContent = 'Mendaftarkan room...';
      try {
        const created = await apiGet('create', {
          hostName: myName,
          peerId: myPeerId || '-',
          requiresCode: roomRequiresCode ? '1' : '0',
          allowGuestStart: allowGuestStart ? '1' : '0',
          customCode: custom,
          gameMode: (document.querySelector('input[name="roomPlayMode"]:checked') || {value:'race'}).value
        });
        if (created && created.ok) {
          await finishHostRoom(created.roomId);
          return;
        }
        throw new Error((created && created.error) || 'gagal');
      } catch (err) {
        const guess = custom || roomCode;
        const recovered = guess ? await recoverRoom(guess) : null;
        if (recovered) {
          await finishHostRoom(recovered.roomId);
          return;
        }
        roomStatusEl.textContent = 'Server Google sedang lambat. Jika guest sudah masuk room ini, klik Keluar lalu Join pakai kode yang sama. Atau buat room lagi.';
      }
    })();

    const p = makePeer();
    p.on('open', (id) => { myPeerId = id; });
    p.on('connection', (c) => {
      if (roster.length >= MAX_PLAYERS) { c.close(); return; }
      bindConn(c, true);
    });
  }

  function joinRoom() {
    const code = (roomCodeInput.value || '').trim().toUpperCase();
    if (!code) { alert('Isi kode room.'); return; }
    joinByRoomId(code, code);
  }

  async function joinByRoomId(roomId, code) {
    myName = getPlayerName();
    isMultiplayer = true; isHost = false;
    matchStarted = false;
    roster = [];
    roomCode = roomId;
    showScreen('room');
    displayRoomCode.textContent = roomId;
    copyCodeInput.value = roomId;
    roomHint.textContent = 'Menghubungkan...';
    roomStatusEl.textContent = 'Menghubungkan ke host...';
    btnStartMatch.disabled = true;

    let peerId = roomId;
    if (apiBase()) {
      try {
        const info = await apiGet('joininfo', { roomId, code: code || roomId });
        if (!info.ok) { roomStatusEl.textContent = info.error || 'Gagal join'; return; }
        peerId = info.peerId;
        allowGuestStart = !!info.allowGuestStart;
        if (info.gameMode) gameMode = info.gameMode;
        roomHint.textContent = 'Masuk room ' + (info.hostName || 'host');
        const joined = await apiGet('joinplayer', {
          roomId: roomId,
          playerId: myNetId,
          name: myName,
          isHost: '0',
          code: code || roomId
        });
        if (!joined.ok) { roomStatusEl.textContent = joined.error || 'Gagal join'; return; }
        if (joined.roster) applySheetRoster(joined.roster);
        startHeartbeat();
      } catch (e) {
        roomStatusEl.textContent = 'Gagal cek room. Deploy ulang script.';
        return;
      }
    }

    const p = makePeer();
    p.on('open', () => bindConn(p.connect(peerId, { reliable: true }), false));
    p.on('error', (err) => { roomStatusEl.textContent = 'Gagal join: ' + err.type; });
  }


  const VW = 400, VH = 640;
  function sx(x) { return x * canvas.width / VW; }
  function sy(y) { return y * canvas.height / VH; }
  function sw(w) { return w * canvas.width / VW; }
  function sh(h) { return h * canvas.height / VH; }

  function resizeCanvas() {
    const box = document.getElementById('game-container');
    const hud = document.getElementById('hud');
    if (!box || !hud) return;
    const w = Math.min(box.clientWidth || 400, 520);
    const h = Math.max(260, (box.clientHeight || 600) - hud.offsetHeight - (IS_MOBILE ? 22 : 0));
    canvas.width = w;
    canvas.height = h;
  }

  function createBricks(levelIndex) {
    bricks = [];
    const level = gameData.levels[levelIndex];
    const pattern = level.pattern;
    const rows = pattern.length, cols = pattern[0].length;
    const pad = 5;
    const left = 16;
    const avail = VW - left * 2;
    const bw = (avail - pad * (cols - 1)) / cols;
    const bh = 18;
    const top = 52;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const typeId = pattern[r][c];
        if (!typeId) continue;
        const type = gameData.brickTypes[String(typeId)];
        bricks.push({
          x: left + c * (bw + pad),
          y: top + r * (bh + pad),
          width: bw, height: bh, color: type.color, points: type.points, hp: type.hp, maxHp: type.hp
        });
      }
    }
  }

  const PADDLE_COLORS = ['#e63946','#2a9d8f','#ff9f1c','#4cc9f0','#f72585','#b8f2e6'];
  function fairPaddleSpeed() { return VW / 55; }
  function fairBallSpeed() {
    const level = gameData.levels[currentLevel] || {};
    return (VW / 78) * ((level.ballSpeed || 5.2) / 5.2);
  }

  function resetBallAndPaddle() {
    paddle.width = 78;
    paddle.height = 14;
    paddle.speed = fairPaddleSpeed();
    paddle.slow = false;
    paddle.x = VW / 2 - paddle.width / 2;
    paddle.y = VH - 28;
    ball.radius = 7;
    ball.x = VW / 2;
    ball.y = paddle.y - ball.radius - 3;
    ball.speed = fairBallSpeed();
    const angle = (Math.random() * 0.5 - 0.25) - Math.PI / 2;
    ball.dx = Math.cos(angle) * ball.speed;
    ball.dy = Math.sin(angle) * ball.speed;
    if (gameMode === 'shared') initSharedPaddles(true);
  }

  function initSharedPaddles(keepX) {
    paddles = roster.map((p, i) => {
      const old = paddles.find(x => x.id === p.id);
      return {
        id: p.id,
        name: p.name,
        color: PADDLE_COLORS[i % PADDLE_COLORS.length],
        width: 64,
        height: 12,
        x: keepX && old ? old.x : (VW / (roster.length + 1)) * (i + 1) - 32,
        y: VH - 26,
        speed: fairPaddleSpeed(),
        slow: false
      };
    });
    if (!turnId && roster.length) turnId = roster[0].id;
  }

  function alivePlayers() {
    return roster.filter(r => !r.finished && (r.lives == null || r.lives > 0));
  }
  function nextTurnAfter(id) {
    const list = alivePlayers();
    if (!list.length) return id;
    const i = Math.max(0, list.findIndex(p => p.id === id));
    return list[(i + 1) % list.length].id;
  }
  function currentTurnName() {
    const p = roster.find(r => r.id === turnId);
    return p ? p.name : '-';
  }
  function nextTurnName() {
    const nid = nextTurnAfter(turnId);
    const p = roster.find(r => r.id === nid);
    return p ? p.name : '-';
  }

  function sfxDrruit() {
    [180, 140, 110, 90, 70].forEach((f, i) => setTimeout(() => playTone(f, 0.18, 'sawtooth', 0.07), i * 70));
  }

  function showLifeSplash(reason, autoHide) {
    const box = document.getElementById('life-splash');
    if (!box) return;
    document.getElementById('splash-title').textContent = autoHide ? 'NYAWA BERKURANG' : 'KAMU TERELIMINASI';
    document.getElementById('splash-sub').textContent = reason || '';
    document.getElementById('splash-hint').textContent = autoHide
      ? 'Hilang 5 detik. Game tetap jalan di belakang.'
      : 'Menunggu pemain lain selesai. Skor masih update.';
    renderSplashBoard();
    box.classList.remove('hidden');
    if (splashTimer) clearTimeout(splashTimer);
    if (autoHide) {
      splashTimer = setTimeout(() => box.classList.add('hidden'), 5000);
    }
  }
  function renderSplashBoard() {
    const board = document.getElementById('splash-board');
    if (!board) return;
    const sorted = roster.slice().sort((a,b)=>(b.score||0)-(a.score||0));
    board.innerHTML = `<p>Skor kamu: <strong>${score}</strong> · Nyawa: ${'♥'.repeat(Math.max(0,lives)) || 'habis'}</p>` +
      sorted.map((p,i) => `<p>${i+1}. ${escapeHtml(p.name)} — ${p.score||0} ${'♥'.repeat(Math.max(0,p.lives||0))}</p>`).join('');
  }
  function hideLifeSplash() {
    const box = document.getElementById('life-splash');
    if (box) box.classList.add('hidden');
    if (splashTimer) clearTimeout(splashTimer);
  }

  function applyLifeLoss(playerId, reason) {
    const r = roster.find(p => p.id === playerId);
    if (!r) return;
    r.lives = Math.max(0, (r.lives == null ? 3 : r.lives) - 1);
    if (r.lives <= 0) r.finished = true;
    if (playerId === myNetId) {
      lives = r.lives;
      showLifeSplash(reason, lives > 0);
    }
    updateHUD();
    sfxLife();
  }

  function broadcastWorld() {
    if (gameMode !== 'shared') return;
    if (isMultiplayer && !isHost) return;
    const payload = {
      type: 'world',
      ball: { x: ball.x, y: ball.y, dx: ball.dx, dy: ball.dy, speed: ball.speed },
      paddles: paddles.map(p => ({ id: p.id, x: p.x, y: p.y, slow: p.slow })),
      lastHitter,
      turnId,
      bricks: bricks.map(b => ({ x:b.x,y:b.y,width:b.width,height:b.height,color:b.color,hp:b.hp,maxHp:b.maxHp,points:b.points })),
      pending: pendingBricks.map(b => ({ x:b.x,y:b.y,width:b.width,height:b.height,color:b.color,hp:b.hp,maxHp:b.maxHp,points:b.points, backAt:b.backAt })),
      roster
    };
    sendAll(payload);
    if (fbReady && fbDb && roomCode) {
      const now = Date.now();
      if (now - lastFbWorldWrite >= 80) {
        lastFbWorldWrite = now;
        fbDb.ref(fbRoomPath() + '/world').set(payload).catch(()=>{});
      }
    }
  }

  function startLevel(idx) {
    currentLevel = idx;
    createBricks(idx);
    resetBallAndPaddle();
    particles = [];
    updateHUD();
  }

  function updateHUD() {
    scoreEl.textContent = score;
    livesEl.textContent = '♥ '.repeat(Math.max(0, lives)).trim() || '—';
    const me = roster.find(p => p.id === myNetId);
    if (me) { me.score = score; me.lives = lives; }
    renderLiveScores();
    if (isMultiplayer) {
      sendAll({ type: 'score', id: myNetId, score, lives });
      if (apiBase() && roomCode) apiGet('score', {
        roomId: roomCode, playerId: myNetId, score: String(score),
        lives: String(lives), finished: lives <= 0 ? '1' : '0'
      }).catch(()=>{});
    }
  }

  function spawnParticles(x, y, color) {
    const n = IS_MOBILE ? 4 : 8;
    for (let i = 0; i < n; i++) {
      particles.push({ x, y, dx:(Math.random()-.5)*5, dy:(Math.random()-.5)*5, life:20, maxLife:20, color, size:2 });
    }
  }

  function collideBallBrick(b, brick) {
    const cx = Math.max(brick.x, Math.min(b.x, brick.x + brick.width));
    const cy = Math.max(brick.y, Math.min(b.y, brick.y + brick.height));
    return (b.x-cx)**2 + (b.y-cy)**2 < b.radius**2;
  }

  function shadeColor(color, percent) {
    const num = parseInt(color.replace('#',''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, Math.min(255, (num >> 16) + amt));
    const G = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amt));
    const B = Math.max(0, Math.min(255, (num & 0xff) + amt));
    return `#${(0x1000000 + R*0x10000 + G*0x100 + B).toString(16).slice(1)}`;
  }

  function moveCpu() {
    const cpu = paddles.find(p => p.id === 'cpu');
    if (!cpu) return;
    const myTurn = turnId === 'cpu';
    const target = myTurn ? (ball.x - cpu.width / 2) : (ball.x < VW/2 ? VW - cpu.width - 10 : 10);
    const spd = fairPaddleSpeed() * (myTurn ? 0.9 : 0.55);
    if (Math.abs(target - cpu.x) < spd) cpu.x = target;
    else cpu.x += target > cpu.x ? spd : -spd;
    cpu.x = Math.max(0, Math.min(VW - cpu.width, cpu.x));
  }

  let worldTick = 0;
  function update(dt) {
    if (!isRunning || isPaused) return;
    const step = 1;
    const shared = gameMode === 'shared';
    const myPad = shared ? paddles.find(p => p.id === myNetId) : paddle;
    const mySpeed = (myPad && myPad.slow) ? fairPaddleSpeed() / 10 : fairPaddleSpeed();
    if (myPad) {
      if (rightPressed) myPad.x += mySpeed * step;
      if (leftPressed) myPad.x -= mySpeed * step;
      myPad.x = Math.max(0, Math.min(VW - myPad.width, myPad.x));
      if (!shared) paddle.x = myPad.x;
      else if (isMultiplayer && isHost && fbReady && fbDb && roomCode) {
        const now = Date.now();
        if (now - lastFbPadWrite >= 70) {
          lastFbPadWrite = now;
          fbDb.ref(fbRoomPath() + '/pads/' + myNetId).set({ x: myPad.x, y: myPad.y, slow: !!myPad.slow }).catch(()=>{});
        }
      } else if (isMultiplayer && !isHost) {
        sendAll({ type: 'input', id: myNetId, x: myPad.x });
        if (fbReady && fbDb && roomCode) {
          const now = Date.now();
          if (now - lastFbPadWrite >= 70) {
            lastFbPadWrite = now;
            fbDb.ref(fbRoomPath() + '/pads/' + myNetId).set({ x: myPad.x, y: myPad.y, slow: !!myPad.slow }).catch(()=>{});
          }
        }
      }
    }
    if (shared && paddles.some(p => p.id === 'cpu')) moveCpu();

    const simulate = !shared || !isMultiplayer || isHost;
    if (!simulate && shared) {
      ball.x += ball.dx * step;
      ball.y += ball.dy * step;
    }
    if (simulate) {
      ball.x += ball.dx * step;
      ball.y += ball.dy * step;
      if (ball.x - ball.radius < 0) { ball.x = ball.radius; ball.dx = Math.abs(ball.dx); sfxWall(); }
      else if (ball.x + ball.radius > VW) { ball.x = VW - ball.radius; ball.dx = -Math.abs(ball.dx); sfxWall(); }
      if (ball.y - ball.radius < 0) { ball.y = ball.radius; ball.dy = Math.abs(ball.dy); sfxWall(); }

      if (ball.y - ball.radius > VH) {
        if (shared) {
          applyLifeLoss(turnId || myNetId, 'Giliran ' + currentTurnName() + ' terlewat. Bola jatuh.');
          turnId = nextTurnAfter(turnId);
          const alive = alivePlayers();
          if (alive.length <= 1) { playerFinished(); return; }
          resetBallAndPaddle();
        } else {
          lives--; updateHUD(); sfxLife();
          if (lives <= 0) { playerFinished(); return; }
          resetBallAndPaddle();
        }
        return;
      }

      const hitList = shared && paddles.length ? paddles : [paddle];
      let consumedHit = false;
      let scoringOwner = turnId;
      let advanceTurn = false;
      hitList.forEach(pad => {
        if (consumedHit) return;
        if (ball.y + ball.radius >= pad.y && ball.y + ball.radius <= pad.y + pad.height + 12 && ball.dy > 0 &&
            ball.x >= pad.x && ball.x <= pad.x + pad.width) {
          const hitPos = (ball.x - (pad.x + pad.width/2)) / (pad.width/2);
          const angle = -Math.PI/2 + hitPos * (Math.PI/3);
          ball.speed = fairBallSpeed();
          ball.dx = Math.cos(angle) * ball.speed;
          ball.dy = Math.sin(angle) * ball.speed;
          ball.y = pad.y - ball.radius - 1;
          sfxPaddle();
          if (shared) {
            lastHitter = pad.id || myNetId;
            scoringOwner = turnId;
            if (lastHitter !== turnId) {
              applyLifeLoss(lastHitter, 'Bukan giliranmu. Giliran ' + currentTurnName());
            } else {
              advanceTurn = true;
            }
          }
          consumedHit = true;
        }
      });

      const now = Date.now();
      pendingBricks = pendingBricks.filter(pb => {
        if (now < pb.backAt) return true;
        bricks.push({ x:pb.x,y:pb.y,width:pb.width,height:pb.height,color:pb.color,hp:pb.maxHp||pb.hp||1,maxHp:pb.maxHp||1,points:pb.points });
        sfxDrruit();
        return false;
      });

      for (let i = bricks.length-1; i >= 0; i--) {
        const brick = bricks[i];
        if (collideBallBrick(ball, brick)) {
          const prevX = ball.x - ball.dx;
          if (prevX < brick.x || prevX > brick.x + brick.width) ball.dx = -ball.dx;
          else ball.dy = -ball.dy;
          const owner = shared ? (scoringOwner || turnId || lastHitter || myNetId) : myNetId;
          brick.hp--; sfxBrick(brick);
          spawnParticles(brick.x + brick.width/2, brick.y + brick.height/2, brick.color);
          if (brick.hp <= 0) {
            const rp = roster.find(r => r.id === owner);
            if (shared) {
              if (rp) rp.score += brick.points;
              if (owner === myNetId) score += brick.points;
              if (lastHitter && lastHitter !== turnId) {
                pendingBricks.push(Object.assign({}, brick, { backAt: Date.now() + 2000 }));
              }
            } else {
              score += brick.points;
            }
            bricks.splice(i,1);
            updateHUD();
          } else brick.color = shadeColor(brick.color, -35);
          break;
        }
      }
      if (shared && advanceTurn) turnId = nextTurnAfter(scoringOwner || turnId);
      if (bricks.length === 0) { levelComplete(); return; }
      if (shared && (!isMultiplayer || isHost)) {
        worldTick++;
        if (worldTick % 2 === 0) broadcastWorld();
      }
    }
    for (let i = particles.length-1; i >= 0; i--) {
      const pt = particles[i];
      pt.x += pt.dx; pt.y += pt.dy; pt.life--;
      if (pt.life <= 0) particles.splice(i,1);
    }
  }

  function draw() {
    ctx.fillStyle = '#0c0c0c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    bricks.forEach(brick => {
      ctx.fillStyle = brick.color;
      ctx.fillRect(sx(brick.x), sy(brick.y), sw(brick.width), sh(brick.height));
    });
    if (gameMode === 'shared' && paddles.length) {
      const blink = Math.sin(Date.now() / 180) > 0;
      const nid = nextTurnAfter(turnId);
      paddles.forEach(pad => {
        const isTurn = pad.id === turnId;
        const isNext = pad.id === nid && pad.id !== turnId;
        if (isTurn && blink) {
          ctx.fillStyle = '#fff';
          ctx.globalAlpha = 0.35;
          ctx.fillRect(sx(pad.x) - 4, sy(pad.y) - 4, sw(pad.width) + 8, sh(pad.height) + 8);
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = pad.color || '#e63946';
        ctx.fillRect(sx(pad.x), sy(pad.y), sw(pad.width), sh(pad.height));
        ctx.font = isTurn ? 'bold 12px Rajdhani' : '11px Rajdhani';
        if (isTurn && blink) ctx.fillStyle = '#fff';
        else if (isNext && blink) ctx.fillStyle = '#a7ffeb';
        else ctx.fillStyle = '#ddd';
        ctx.fillText(pad.name || '', sx(pad.x), sy(pad.y) - 3);
      });
    } else {
      ctx.fillStyle = '#e63946';
      ctx.fillRect(sx(paddle.x), sy(paddle.y), sw(paddle.width), sh(paddle.height));
    }
    ctx.fillStyle = '#2a9d8f';
    ctx.beginPath(); ctx.arc(sx(ball.x), sy(ball.y), sw(ball.radius), 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(42,157,143,.55)';
    ctx.font = '12px Rajdhani';
    ctx.fillText('LEVEL ' + (currentLevel+1) + (gameMode==='shared' ? (' · GILIRAN ' + currentTurnName()) : ''), 8, 14);
  }

  let accTime = 0;
  function loop(ts) {
    const dt = lastTs ? (ts - lastTs) : 16;
    lastTs = ts;
    accTime += Math.min(dt, 50);
    let steps = 0;
    while (accTime >= 16.67 && steps < 5) {
      update(16.67);
      accTime -= 16.67;
      steps++;
    }
    draw();
    animationId = requestAnimationFrame(loop);
  }

  function startSolo(resumeLevel) {
    myName = getPlayerName();
    localStorage.setItem('monmon_name', myName);
    gameMode = selectedMode();
    isMultiplayer = false;
    lastHitter = null; turnId = myNetId; pendingBricks = [];
    lives = settings.lives;
    if (!resumeLevel) { score = 0; currentLevel = 0; }
    if (gameMode === 'shared') {
      roster = [
        { id: myNetId, name: myName, score: 0, finished: false, host: true, lives: settings.lives },
        { id: 'cpu', name: 'CPU', score: 0, finished: false, host: false, lives: settings.lives }
      ];
      myNameHud.textContent = myName + ' vs CPU';
    } else {
      roster = [];
      myNameHud.textContent = myName;
    }
    if (apiBase()) apiGet('play').then(setStats).catch(()=>{});
    showScreen('game');
    gameOverOverlay.classList.add('hidden');
    levelUpOverlay.classList.add('hidden');
    resizeCanvas();
    startLevel(currentLevel);
    isRunning = true; isPaused = false; lastTs = 0;
    if (!animationId) animationId = requestAnimationFrame(loop);
  }

  function startMultiplayerMatch() {
    if (isMultiplayer && roster.length < 2) {
      roomStatusEl.textContent = 'Belum ada lawan yang terhubung.';
      return;
    }
    if (apiBase()) apiGet('play').then(setStats).catch(()=>{});
    showScreen('game');
    myNameHud.textContent = roster.length ? roster.map(p => p.name).join(' vs ') : myName;
    score = 0; lives = settings.lives; currentLevel = 0;
    lastHitter = null; pendingBricks = [];
    roster.forEach(p => { p.score = 0; p.finished = false; p.lives = settings.lives; });
    if (gameMode === 'shared') {
      turnId = roster[0] ? roster[0].id : myNetId;
      initSharedPaddles(false);
    }
    gameOverOverlay.classList.add('hidden');
    levelUpOverlay.classList.add('hidden');
    resizeCanvas(); startLevel(0);
    isRunning = true; isPaused = false; lastTs = 0;
    if (!animationId) animationId = requestAnimationFrame(loop);
  }

  function levelComplete() {
    isRunning = false;
    if (currentLevel >= gameData.levels.length - 1) playerFinished();
    else {
      levelMessage.textContent = `Level ${currentLevel+1} selesai! Score: ${score}`;
      levelUpOverlay.classList.remove('hidden');
    }
  }
  function nextLevel() {
    levelUpOverlay.classList.add('hidden');
    startLevel(currentLevel + 1);
    isRunning = true;
  }
  function playerFinished() {
    isRunning = false;
    if (isMultiplayer) {
      sendAll({ type: 'finished', id: myNetId, score });
      const me = roster.find(p => p.id === myNetId);
      if (me) { me.finished = true; me.score = score; }
      checkAllFinished();
    } else endMatch();
  }
  function checkAllFinished() {
    if (!roster.length) return;
    if (roster.every(p => p.finished)) endMatch();
    else {
      goTitle.textContent = 'Menunggu pemain lain...';
      gameOverOverlay.classList.remove('hidden');
      refreshWaitBoard();
    }
  }
  function endMatch() {
    isRunning = false;
    hideLifeSplash();
    goTitle.textContent = 'HASIL AKHIR';
    gameOverOverlay.classList.add('final-shot');
    const cele = document.getElementById('celebration');
    const podium = document.getElementById('podium');
    if (cele) { cele.classList.remove('hidden'); cele.textContent = '🏆🎉🔥'; }
    const medals = ['🥇','🥈','🥉'];
    const cls = ['gold','silver','bronze'];
    const list = (roster.length ? roster : [{name: myName, score, lives}]).slice().sort((a,b)=>(b.score||0)-(a.score||0));
    if (podium) podium.innerHTML = list.map((p,i) =>
      `<div class="podium-row ${cls[i]||''}"><span><span class="rank">${medals[i]||(i+1)+'.'}</span>${escapeHtml(p.name)}</span><strong>${p.score||0} poin</strong></div>`
    ).join('');
    const top = list[0];
    finalResults.innerHTML = `<div class="winner">${escapeHtml(top.name)} JUARA 1 · ${top.score||0} POIN</div>
      <p>Level ${currentLevel+1} · ${list.length} pemain</p>`;
    try {
      [523,659,784,1046,1318].forEach((f,i)=>setTimeout(()=>playTone(f,0.28,'triangle',0.11), i*130));
      setTimeout(() => playTone(1568, 0.4, 'square', 0.08), 700);
    } catch(e) {}
    gameOverOverlay.classList.remove('hidden');
  }

  function leaveAll() {
    if (roomCode && apiBase()) {
      apiGet(isHost ? 'close' : 'leaveplayer', {
        roomId: roomCode, playerId: myNetId, isHost: isHost ? '1' : '0'
      }).catch(()=>{});
    }
    stopHeartbeat();
    hostConns.forEach(c => { try { c.close(); } catch(e){} });
    if (guestConn) try { guestConn.close(); } catch(e){}
    if (peer) try { peer.destroy(); } catch(e){}
    peer = null; hostConns = []; guestConn = null;
    isRunning = false;
    fbStop();
    paddles = []; lastHitter = null;
    if (animationId) cancelAnimationFrame(animationId);
    animationId = null;
    showScreen('lobby');
    refreshLobby();
  }

  document.addEventListener('keydown', e => {
    if (['ArrowRight','d','D'].includes(e.key)) rightPressed = true;
    if (['ArrowLeft','a','A'].includes(e.key)) leftPressed = true;
  });
  document.addEventListener('keyup', e => {
    if (['ArrowRight','d','D'].includes(e.key)) rightPressed = false;
    if (['ArrowLeft','a','A'].includes(e.key)) leftPressed = false;
  });
  function pointerMove(clientX) {
    if (!isRunning) return;
    const rect = canvas.getBoundingClientRect();
    const vx = (clientX - rect.left) * (VW / rect.width);
    const target = vx - paddle.width / 2;
    if (gameMode === 'shared') {
      const myPad = paddles.find(p => p.id === myNetId);
      if (myPad) myPad.x = Math.max(0, Math.min(VW - myPad.width, target));
    } else {
      paddle.x = Math.max(0, Math.min(VW - paddle.width, target));
    }
  }
  canvas.addEventListener('mousemove', e => pointerMove(e.clientX));
  canvas.addEventListener('touchmove', e => { e.preventDefault(); if (e.touches[0]) pointerMove(e.touches[0].clientX); }, {passive:false});
  canvas.addEventListener('touchstart', e => { e.preventDefault(); if (e.touches[0]) pointerMove(e.touches[0].clientX); }, {passive:false});

  btnSolo.onclick = () => { if (audioCtx.state==='suspended') audioCtx.resume(); startSolo(); };
  btnCreate.onclick = () => { if (audioCtx.state==='suspended') audioCtx.resume(); createRoom(); };
  btnJoin.onclick = () => { if (audioCtx.state==='suspended') audioCtx.resume(); joinRoom(); };
  btnStartMatch.onclick = () => {
    if (!canClickStart()) {
      roomStatusEl.textContent = 'Tunggu sampai nama lawan muncul di daftar.';
      return;
    }
    matchStarted = true;
    if (apiBase()) apiGet('startmatch', { roomId: roomCode }).catch(()=>{});
    if (fbReady && fbDb && roomCode) fbDb.ref(fbRoomPath() + '/cmd').set({ start: true, t: Date.now() }).catch(()=>{});
    sendAll({ type: 'start' });
    startMultiplayerMatch();
  };
  btnLeave.onclick = leaveAll;
  nextLevelBtn.onclick = nextLevel;
  restartBtn.onclick = () => {
    gameOverOverlay.classList.add('hidden');
    if (isMultiplayer) {
      if (isHost || allowGuestStart) {
        sendAll({ type: 'start' });
        startMultiplayerMatch();
      } else {
        goTitle.textContent = 'Menunggu host...';
        gameOverOverlay.classList.remove('hidden');
      }
    } else startSolo(true);
  };
  backLobbyBtn.onclick = leaveAll;
  const pauseOverlay = document.getElementById('pause-overlay');
  const btnQuitGame = document.getElementById('btn-quit-game');
  const btnResume = document.getElementById('btn-resume');
  const btnPauseLobby = document.getElementById('btn-pause-lobby');
  const btnLevelLobby = document.getElementById('btn-level-lobby');
  if (btnQuitGame) btnQuitGame.onclick = () => {
    isPaused = true;
    if (pauseOverlay) pauseOverlay.classList.remove('hidden');
  };
  if (btnResume) btnResume.onclick = () => {
    if (pauseOverlay) pauseOverlay.classList.add('hidden');
    isPaused = false;
  };
  if (btnPauseLobby) btnPauseLobby.onclick = () => {
    if (pauseOverlay) pauseOverlay.classList.add('hidden');
    leaveAll();
  };
  if (btnLevelLobby) btnLevelLobby.onclick = leaveAll;
  btnCopy.onclick = async () => {
    try { await navigator.clipboard.writeText(copyCodeInput.value); }
    catch (e) { copyCodeInput.select(); document.execCommand('copy'); }
    btnCopy.textContent = 'Tersalin';
    btnCopy.classList.add('copied');
    setTimeout(() => { btnCopy.textContent = 'Copy'; btnCopy.classList.remove('copied'); }, 1200);
  };
  window.addEventListener('resize', () => { if (!gameScreenEl.classList.contains('hidden')) resizeCanvas(); });

  async function init() {
    await loadData();
    await fbInit();
    const saved = localStorage.getItem('monmon_name');
    if (saved) playerNameInput.value = saved;
    playerNameInput.addEventListener('input', () => localStorage.setItem('monmon_name', playerNameInput.value.trim()));
    const btnReset = document.getElementById('btn-reset-data');
    if (btnReset) btnReset.onclick = () => {
      localStorage.removeItem('monmon_name');
      sessionStorage.removeItem('monmon_visited');
      playerNameInput.value = '';
      playerNameInput.focus();
      alert('Data lokal dihapus. Ketik nama baru lalu main.');
    };
    if (apiBase()) {
      if (!sessionStorage.getItem('monmon_visited')) {
        sessionStorage.setItem('monmon_visited', '1');
        apiGet('visit').then(setStats).catch(()=>{});
      }
      refreshLobby();
      roomsPollTimer = setInterval(refreshLobby, 2500);
    } else {
      apiWarnEl.textContent = 'Server belum disetting. Isi URL di config.js.';
      apiWarnEl.classList.remove('hidden');
    }
  }
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (e.ctrlKey && (k === 'u' || k === 's')) e.preventDefault();
    if (k === 'f12') e.preventDefault();
  });

  init();
})();

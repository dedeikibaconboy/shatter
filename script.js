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

  if (requireCodeEl) {
    requireCodeEl.addEventListener('change', () => {
      customCodeWrap.classList.toggle('hidden', !requireCodeEl.checked);
    });
  }

  let myName = 'Player';
  let myNetId = '';
  let isHost = false, isMultiplayer = false;
  let roomCode = '';
  let roomRequiresCode = false, allowGuestStart = false;
  let roster = [];
  let matchStarted = false;
  let roomBornAt = 0;
  let gameMode = 'race';
  let lastHitter = null;
  let turnId = null;
  let pendingBricks = [];
  let splashTimer = null;
  let paddles = [];
  let pendingAdvance = false;
  let warnHits = {};
  let floatTexts = [];
  let lastTurnAnnounced = null;
  let heartbeatTimer = null;
  let lastFbWorldWrite = 0, lastFbPadWrite = 0, lastFbScoreWrite = 0;
  let netFx = [];
  let fxSeq = 0;
  let lastFxSeq = 0;
  let pendingStartCmd = false;
  let readyUntil = 0;
  const SITE_URL = 'https://shatter.silverhawk.web.id';

  let fbDb = null, fbReady = false;
  let fbWorldUnsub = null, fbPadUnsub = null, fbCmdUnsub = null, fbPlayerUnsub = null, fbLobbyUnsub = null;

  function fbEnabled() {
    const c = window.MONMON_FIREBASE || {};
    return !!(c.apiKey && c.databaseURL && window.firebase);
  }
  function setConnStatus(ok) {
    const el = document.getElementById('connStatus');
    if (!el) return;
    if (!fbEnabled()) el.textContent = 'Isi config Firebase dulu';
    else if (ok === false) el.textContent = 'Firebase error — cek Anonymous Auth + Rules';
    else if (!fbReady) el.textContent = 'Menghubungkan ke Firebase…';
    else el.textContent = 'Firebase realtime siap';
  }
  function fbRoomPath() {
    return 'rooms/' + String(roomCode || 'x').toUpperCase();
  }
  function fbRoom() { return fbDb.ref(fbRoomPath()); }
  function nowMs() { return Date.now(); }
  function randomRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    for (let i = 0; i < 6; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
    return id;
  }
  function cleanCode(code) {
    return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 10);
  }

  async function fbInit() {
    if (fbReady) return true;
    if (!fbEnabled()) return false;
    try {
      if (!firebase.apps.length) firebase.initializeApp(window.MONMON_FIREBASE);
      fbDb = firebase.database();
      const cred = await firebase.auth().signInAnonymously();
      myNetId = (cred && cred.user && cred.user.uid) || firebase.auth().currentUser.uid;
      fbReady = true;
      setConnStatus(true);
      return true;
    } catch (e) {
      console.warn('Firebase gagal', e);
      setConnStatus(false);
      return false;
    }
  }

  async function bumpStat(key) {
    if (!fbReady || !fbDb) return;
    try {
      await fbDb.ref('stats/' + key).transaction((v) => (Number(v) || 0) + 1);
    } catch (e) {}
  }

  function unpackBricks(list) {
    if (!Array.isArray(list)) return [];
    return list.map((b) => {
      if (b && typeof b === 'object' && !Array.isArray(b)) return b;
      return {
        x: b[0], y: b[1], width: b[2], height: b[3],
        color: b[4], hp: b[5], maxHp: b[6], points: b[7],
        backAt: b[8]
      };
    });
  }
  function packBricks(list) {
    return (list || []).map((b) => [
      Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10,
      Math.round(b.width * 10) / 10, b.height,
      b.color, b.hp, b.maxHp || b.hp, b.points || 0, b.backAt || 0
    ]);
  }

  function emitNetFx(type, extra) {
    fxSeq += 1;
    netFx.push(Object.assign({ id: fxSeq, type }, extra || {}));
    if (netFx.length > 10) netFx = netFx.slice(-10);
  }
  function playNetFx(ev) {
    if (!ev || !ev.type) return;
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    if (ev.type === 'paddle') sfxPaddle();
    else if (ev.type === 'wall') sfxWall();
    else if (ev.type === 'brick') {
      sfxBrick({ points: ev.points, maxHp: ev.maxHp });
      if (ev.x != null) spawnParticles(ev.x, ev.y, ev.color || '#e63946');
    } else if (ev.type === 'life') {
      showLifeLostFX(ev.who, ev.name, ev.reason, ev.lives);
      if (ev.who === myNetId && ev.lives != null) {
        lives = ev.lives;
        updateHUD();
      }
    } else if (ev.type === 'ready') {
      playTone(523, 0.12, 'triangle', 0.08);
    } else if (ev.type === 'warn') {
      playTone(200, 0.1, 'square', 0.06);
      spawnFloat(ev.x || VW / 2, ev.y || VH - 40, ev.text || 'AWAS', '#ffd166');
    } else if (ev.type === 'drruit') sfxDrruit();
    else if (ev.type === 'score') {
      spawnFloat(ev.x || 40, ev.y || 40, ev.text || '', ev.color || '#2a9d8f');
    }
  }
  function applyWorldState(data) {
    if (!data || !data.ball) return;
    ball.x = data.ball.x; ball.y = data.ball.y;
    ball.dx = data.ball.dx; ball.dy = data.ball.dy;
    if (data.ball.speed) ball.speed = data.ball.speed;
    lastHitter = data.lastHitter || lastHitter;
    if (data.turnId) setTurn(data.turnId);
    if (data.bricks) bricks = unpackBricks(data.bricks);
    if (data.pending) pendingBricks = unpackBricks(data.pending);
    if (typeof data.level === 'number' && data.level !== currentLevel && !isHost) {
      currentLevel = data.level;
    }
    if (data.readyUntil != null) readyUntil = Number(data.readyUntil) || 0;
    if (!isHost && Array.isArray(data.fx)) {
      data.fx.forEach((ev) => {
        if (!ev || ev.id == null || ev.id <= lastFxSeq) return;
        lastFxSeq = ev.id;
        playNetFx(ev);
      });
    }
  }

  function applyPlayersMap(val) {
    const map = val || {};
    const prevMine = roster.find((r) => r.id === myNetId);
    const prevLives = prevMine && prevMine.lives != null ? prevMine.lives : null;
    const list = Object.keys(map).map((id) => {
      const p = map[id] || {};
      const mine = roster.find((r) => r.id === id);
      const keepLocal = isRunning && mine && (
        isHost || (id === myNetId && gameMode !== 'shared')
      );
      return {
        id,
        name: p.name || 'Player',
        score: keepLocal ? mine.score : Number(p.score || 0),
        lives: keepLocal && mine.lives != null ? mine.lives : Number(p.lives != null ? p.lives : 3),
        finished: keepLocal ? !!mine.finished : !!p.finished,
        host: !!p.host
      };
    });
    list.sort((a, b) => (b.host - a.host) || String(a.name).localeCompare(String(b.name)));
    roster = list;
    if (!isHost && gameMode === 'shared') {
      const me = roster.find((r) => r.id === myNetId);
      if (me) {
        score = me.score;
        lives = me.lives;
      }
    }
    updatePlayersList();
    renderLiveScores();
    refreshWaitBoard();
    if (isMultiplayer && roster.length && roster.every((p) => p.finished)) endMatch();
    if (pendingStartCmd && !isRunning && roster.length >= 2) {
      matchStarted = true;
      startMultiplayerMatch();
    }
  }

  function fbStop() {
    try { if (fbWorldUnsub) fbWorldUnsub(); } catch (e) {}
    try { if (fbPadUnsub) fbPadUnsub(); } catch (e) {}
    try { if (fbCmdUnsub) fbCmdUnsub(); } catch (e) {}
    try { if (fbPlayerUnsub) fbPlayerUnsub(); } catch (e) {}
    fbWorldUnsub = fbPadUnsub = fbCmdUnsub = fbPlayerUnsub = null;
  }

  function cancelPresence() {
    if (!fbDb || !roomCode) return;
    try { fbDb.ref(fbRoomPath() + '/players/' + myNetId).onDisconnect().cancel(); } catch (e) {}
    try { fbDb.ref(fbRoomPath() + '/pads/' + myNetId).onDisconnect().cancel(); } catch (e) {}
    if (isHost) {
      try { fbDb.ref('lobby/' + roomCode).onDisconnect().cancel(); } catch (e) {}
      try { fbDb.ref(fbRoomPath()).onDisconnect().cancel(); } catch (e) {}
    }
  }

  async function attachPresence() {
    if (!fbReady || !fbDb || !roomCode || !myNetId) return;
    const padRef = fbDb.ref(fbRoomPath() + '/pads/' + myNetId);
    const plyRef = fbDb.ref(fbRoomPath() + '/players/' + myNetId);
    padRef.onDisconnect().remove();
    if (isHost) {
      fbDb.ref('lobby/' + roomCode).onDisconnect().remove();
      fbDb.ref(fbRoomPath()).onDisconnect().remove();
    } else {
      plyRef.onDisconnect().remove();
    }
  }

  function fbStartRoomSync() {
    if (!fbReady || !fbDb || !roomCode) return;
    fbStop();
    const base = fbRoom();
    const worldH = base.child('world').on('value', (snap) => {
      if (isHost) return;
      applyWorldState(snap.val());
    });
    fbWorldUnsub = () => base.child('world').off('value', worldH);
    const padH = base.child('pads').on('value', (snap) => {
      const v = snap.val() || {};
      Object.keys(v).forEach((id) => {
        if (id === myNetId) return;
        const pad = paddles.find((p) => p.id === id);
        if (pad && v[id] && typeof v[id].x === 'number') {
          pad.x = v[id].x;
          if (v[id].y != null) pad.y = v[id].y;
          pad.slow = !!v[id].slow;
        }
      });
    });
    fbPadUnsub = () => base.child('pads').off('value', padH);
    const plyH = base.child('players').on('value', (snap) => {
      applyPlayersMap(snap.val());
    });
    fbPlayerUnsub = () => base.child('players').off('value', plyH);
    const cmdH = base.child('cmd').on('value', (snap) => {
      const v = snap.val();
      if (!v || !v.t) return;
      if (v.t < roomBornAt - 1500) return;
      if (v.start) pendingStartCmd = true;
      if (v.start && !isRunning && roster.length >= 2) {
        matchStarted = true;
        startMultiplayerMatch();
      }
      if (v.levelClear && !isHost && matchStarted) {
        isRunning = false;
        levelMessage.textContent = 'Level ' + ((v.level || 0) + 1) + ' selesai!';
        levelUpOverlay.classList.remove('hidden');
      }
      if (v.nextLevel && !isHost && matchStarted) {
        levelUpOverlay.classList.add('hidden');
        if (typeof v.level === 'number') startLevel(v.level);
        isRunning = true;
      }
      if (v.restart && matchStarted) {
        startMultiplayerMatch();
      }
    });
    fbCmdUnsub = () => base.child('cmd').off('value', cmdH);
  }

  function writeMyPlayer(extra) {
    if (!fbReady || !fbDb || !roomCode || !myNetId) return;
    if (gameMode === 'shared' && !isHost) {
      fbDb.ref(fbRoomPath() + '/players/' + myNetId).update({
        name: myName, host: false, lastSeen: nowMs()
      }).catch(() => {});
      return;
    }
    const now = nowMs();
    if (now - lastFbScoreWrite < 280 && !(extra && extra.finished)) return;
    lastFbScoreWrite = now;
    const payload = Object.assign({
      name: myName,
      host: !!isHost,
      score,
      lives,
      finished: lives <= 0,
      lastSeen: now
    }, extra || {});
    fbDb.ref(fbRoomPath() + '/players/' + myNetId).update(payload).catch(() => {});
  }
  function writePlayerState(playerId, extra) {
    if (!isHost || !fbReady || !fbDb || !roomCode || !playerId) return;
    const r = roster.find((p) => p.id === playerId) || {};
    fbDb.ref(fbRoomPath() + '/players/' + playerId).update(Object.assign({
      name: r.name || 'Player',
      host: !!r.host,
      score: r.score || 0,
      lives: r.lives != null ? r.lives : 3,
      finished: !!r.finished,
      lastSeen: nowMs()
    }, extra || {})).catch(() => {});
  }

  function writeLobbyMeta() {
    if (!isHost || !fbReady || !fbDb || !roomCode) return;
    fbDb.ref('lobby/' + roomCode).update({
      hostName: myName,
      hostId: myNetId,
      requiresCode: !!roomRequiresCode,
      allowGuestStart: !!allowGuestStart,
      gameMode,
      status: isRunning ? 'playing' : 'waiting',
      players: Math.max(1, roster.length),
      lastSeen: nowMs()
    }).catch(() => {});
    fbDb.ref(fbRoomPath() + '/meta').update({
      status: isRunning ? 'playing' : 'waiting',
      players: Math.max(1, roster.length),
      lastSeen: nowMs()
    }).catch(() => {});
  }

  function startHeartbeat() {
    fbStartRoomSync();
    stopHeartbeat();
    const beat = () => { if (roomCode) writeLobbyMeta(); };
    beat();
    heartbeatTimer = setInterval(beat, 5000);
  }
  function stopHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  function selectedMode() {
    const el = document.querySelector('input[name="roomPlayMode"]:checked');
    return (el && el.value === 'shared') ? 'shared' : 'race';
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
  function hideOverlays(except) {
    ['pause-overlay', 'level-up', 'game-over', 'life-splash'].forEach((id) => {
      if (except && id === except) return;
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
    if (except !== 'life-splash' && splashTimer) clearTimeout(splashTimer);
  }
  function showScreen(name) {
    lobbyEl.classList.add('hidden');
    roomEl.classList.add('hidden');
    gameScreenEl.classList.add('hidden');
    if (name !== 'game') hideOverlays();
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

  function renderPublicRooms(list) {
    if (!list || !list.length) {
      publicRoomsEl.innerHTML = '<p class="muted">Belum ada room. Buat room pertama!</p>';
      return;
    }
    publicRoomsEl.innerHTML = list.map((r) => {
      const full = (r.players || 1) >= MAX_PLAYERS;
      const lock = r.requiresCode ? 'Butuh kode' : 'Publik';
      const mode = r.gameMode === 'shared' ? 'Satu lapangan' : 'Balapan';
      const btn = full
        ? `<button class="btn secondary" disabled>Penuh</button>`
        : r.requiresCode
          ? `<button class="btn secondary js-need-code" data-id="${escapeHtml(r.roomId)}">Kode</button>`
          : `<button class="btn primary js-quick-join" data-id="${escapeHtml(r.roomId)}">Join</button>`;
      return `<div class="room-item">
        <div class="meta">
          <div class="host-name">${escapeHtml(r.hostName || 'Host')}</div>
          <div class="lock">${lock} · ${mode} · ${r.players || 1}/${MAX_PLAYERS} · ${escapeHtml(r.status || 'waiting')}</div>
        </div>${btn}</div>`;
    }).join('');
    publicRoomsEl.querySelectorAll('.js-quick-join').forEach((btn) => {
      btn.onclick = () => joinByRoomId(btn.dataset.id, '');
    });
    publicRoomsEl.querySelectorAll('.js-need-code').forEach((btn) => {
      btn.onclick = () => {
        roomCodeInput.value = btn.dataset.id;
        roomCodeInput.focus();
      };
    });
  }

  function startLobbyWatch() {
    if (!fbReady || !fbDb) return;
    if (fbLobbyUnsub) return;
    const h = fbDb.ref('lobby').on('value', (snap) => {
      const val = snap.val() || {};
      const cutoff = nowMs() - 90000;
      const list = Object.keys(val).map((id) => Object.assign({ roomId: id }, val[id]))
        .filter((r) => (r.lastSeen || 0) > cutoff && r.status !== 'closed');
      renderPublicRooms(list);
      fbDb.ref('stats').once('value').then((st) => {
        const s = st.val() || {};
        setStats({ visits: s.visits || 0, plays: s.plays || 0, roomsOnline: list.length });
      }).catch(() => setStats({ visits: '—', plays: '—', roomsOnline: list.length }));
    });
    fbLobbyUnsub = () => fbDb.ref('lobby').off('value', h);
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

  function canClickStart() {
    if (roster.length < 2) return false;
    if (isRunning) return false;
    return isHost || allowGuestStart;
  }

  function updatePlayersList() {
    playersListEl.innerHTML = roster.map((p) => {
      const you = p.id === myNetId ? ' (Kamu)' : '';
      const cls = p.host ? 'player-row host' : 'player-row';
      const badge = p.host ? 'HOST' : 'GUEST';
      return `<div class="${cls}"><span class="name">${escapeHtml(p.name)}${you}</span><span class="badge">${badge}</span></div>`;
    }).join('') || '<p class="muted">Menunggu pemain...</p>';
    const guests = roster.filter((p) => !p.host).length;
    btnStartMatch.disabled = !canClickStart();
    btnStartMatch.textContent = canClickStart() ? 'Mulai' : (guests < 1 ? 'Menunggu lawan' : 'Menunggu host');
    if (guests < 1) {
      roomStatusEl.textContent = 'Menunggu pemain join...';
    } else if (canClickStart()) {
      roomStatusEl.textContent = roster.map((p) => p.name).join(', ') + ' siap. Bisa klik Mulai.';
    } else {
      roomStatusEl.textContent = roster.map((p) => p.name).join(', ') + ' sudah masuk. Menunggu host mulai.';
    }
    renderLiveScores();
  }

  function modeLabel() {
    return gameMode === 'shared' ? 'Satu lapangan' : 'Balapan';
  }
  function updateModeLabels() {
    const chip = document.getElementById('roomModeChip');
    const badge = document.getElementById('modeBadge');
    const help = document.getElementById('modeHelp');
    const hint = document.getElementById('soloHint');
    const shared = selectedMode() === 'shared';
    if (chip) chip.textContent = roomCode ? ('Mode: ' + modeLabel()) : '';
    if (badge) badge.textContent = isRunning || !gameScreenEl.classList.contains('hidden') ? modeLabel() : '';
    if (help) {
      help.textContent = shared
        ? 'Bergiliran memukul. Bola jatuh = nyawa pemain giliran. Pukul saat bukan giliranmu = nyawa -1, skor bata tetap ke pemilik giliran. Lalu GET READY 3 detik.'
        : 'Tiap pemain main di lapangannya sendiri. Yang skornya paling tinggi menang.';
    }
    if (hint) {
      hint.textContent = shared
        ? 'Main Sendiri di mode ini = lawan CPU di satu lapangan.'
        : 'Main Sendiri di mode ini = brick breaker klasik, lapangan sendiri.';
    }
  }
  function renderLiveScores() {
    if (!roster.length) { liveScoresEl.textContent = ''; return; }
    liveScoresEl.innerHTML = roster.map((p) => {
      const heart = '♥'.repeat(Math.max(0, p.lives != null ? p.lives : 0));
      const you = p.id === myNetId ? ' •' : '';
      return `${escapeHtml(p.name)}${you} ${p.score} ${heart || '✗'}`;
    }).join('<br>');
  }
  function refreshWaitBoard() {
    if (!gameOverOverlay || gameOverOverlay.classList.contains('hidden')) return;
    if (!isMultiplayer) return;
    finalResults.innerHTML = roster.map((p) => {
      const heart = '♥'.repeat(Math.max(0, Number(p.lives || 0)));
      const mark = p.finished ? '✓' : '▶';
      return `<p>${escapeHtml(p.name)}: <strong>${p.score}</strong> <span class="wait-lives">${heart || 'habis'}</span> ${mark}</p>`;
    }).join('');
  }

  async function createRoom() {
    myName = getPlayerName();
    if (!await fbInit()) {
      showScreen('room');
      roomStatusEl.textContent = 'Firebase belum siap. Nyalakan Anonymous Auth dan tempel rules di FIREBASE.md.';
      setConnStatus(false);
      return;
    }
    isMultiplayer = true; isHost = true;
    roomRequiresCode = !!(requireCodeEl && requireCodeEl.checked);
    allowGuestStart = !!(allowGuestStartEl && allowGuestStartEl.checked);
    gameMode = selectedMode();
    matchStarted = false;
    roomBornAt = nowMs();
    roster = [{ id: myNetId, name: myName, score: 0, lives: 3, finished: false, host: true }];

    showScreen('room');
    displayRoomCode.textContent = '...';
    roomStatusEl.textContent = 'Membuat room di Firebase…';
    btnStartMatch.disabled = true;
    updatePlayersList();
    setConnStatus(true);

    let custom = roomRequiresCode ? cleanCode(customCodeInput.value) : '';
    if (custom && custom.length < 3) {
      roomStatusEl.textContent = 'Kode custom minimal 3 huruf/angka.';
      return;
    }
    try {
      let id = custom;
      if (id) {
        const exists = await fbDb.ref('lobby/' + id).once('value');
        if (exists.exists()) {
          roomStatusEl.textContent = 'Kode itu sudah dipakai. Pilih kode lain.';
          return;
        }
      } else {
        id = randomRoomId();
        for (let i = 0; i < 8; i++) {
          const exists = await fbDb.ref('lobby/' + id).once('value');
          if (!exists.exists()) break;
          id = randomRoomId();
        }
      }
      roomCode = id;
      displayRoomCode.textContent = id;
      copyCodeInput.value = id;
      roomHint.textContent = roomRequiresCode
        ? 'Room privat. Copy kode lalu kirim ke teman.'
        : 'Room publik. Pemain lain akan melihat room ini.';
      const meta = {
        hostName: myName,
        hostId: myNetId,
        requiresCode: !!roomRequiresCode,
        allowGuestStart: !!allowGuestStart,
        gameMode,
        status: 'waiting',
        createdAt: nowMs(),
        lastSeen: nowMs(),
        players: 1
      };
      await fbDb.ref(fbRoomPath() + '/meta').set(meta);
      await fbDb.ref(fbRoomPath() + '/cmd').set({ start: false, t: nowMs() });
      await fbDb.ref(fbRoomPath() + '/players/' + myNetId).set({
        name: myName, host: true, score: 0, lives: 3, finished: false, lastSeen: nowMs()
      });
      await fbDb.ref('lobby/' + id).set({
        hostName: myName, hostId: myNetId, requiresCode: !!roomRequiresCode,
        allowGuestStart: !!allowGuestStart, gameMode, status: 'waiting',
        players: 1, lastSeen: nowMs()
      });
      await attachPresence();
      startHeartbeat();
      updateModeLabels();
      roomStatusEl.textContent = 'Menunggu pemain join...';
    } catch (e) {
      console.warn(e);
      roomStatusEl.textContent = 'Gagal buat room. Cek rules Firebase (lihat FIREBASE.md).';
    }
  }

  function joinRoom() {
    const code = cleanCode(roomCodeInput.value);
    if (!code) { roomStatusEl && (roomStatusEl.textContent = 'Isi kode room.'); return; }
    joinByRoomId(code, code);
  }

  async function joinByRoomId(roomId, code) {
    myName = getPlayerName();
    if (!await fbInit()) {
      showScreen('room');
      roomStatusEl.textContent = 'Firebase belum siap.';
      return;
    }
    isMultiplayer = true; isHost = false;
    matchStarted = false;
    roomBornAt = nowMs();
    roster = [];
    roomCode = cleanCode(roomId);
    showScreen('room');
    displayRoomCode.textContent = roomCode;
    copyCodeInput.value = roomCode;
    roomHint.textContent = 'Menghubungkan…';
    roomStatusEl.textContent = 'Cek room di Firebase…';
    btnStartMatch.disabled = true;
    setConnStatus(true);
    try {
      const metaSnap = await fbDb.ref(fbRoomPath() + '/meta').once('value');
      if (!metaSnap.exists()) {
        roomStatusEl.textContent = 'Room tidak ditemukan atau sudah tutup.';
        return;
      }
      const meta = metaSnap.val();
      if (meta.requiresCode && cleanCode(code || roomCodeInput.value) !== roomCode) {
        roomStatusEl.textContent = 'Kode room salah.';
        return;
      }
      const plySnap = await fbDb.ref(fbRoomPath() + '/players').once('value');
      const count = plySnap.exists() ? Object.keys(plySnap.val() || {}).length : 0;
      if (count >= MAX_PLAYERS) {
        roomStatusEl.textContent = 'Room penuh (maksimal 6 pemain).';
        return;
      }
      allowGuestStart = !!meta.allowGuestStart;
      gameMode = meta.gameMode === 'shared' ? 'shared' : 'race';
      roomRequiresCode = !!meta.requiresCode;
      roomHint.textContent = 'Masuk room ' + (meta.hostName || 'host');
      await fbDb.ref(fbRoomPath() + '/players/' + myNetId).set({
        name: myName, host: false, score: 0, lives: 3, finished: false, lastSeen: nowMs()
      });
      await attachPresence();
      startHeartbeat();
      updateModeLabels();
    } catch (e) {
      console.warn(e);
      roomStatusEl.textContent = 'Gagal join. Cek koneksi / rules Firebase.';
    }
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
    ball.speed = fairBallSpeed();
    if (gameMode === 'shared') {
      initSharedPaddles(true);
      serveBallFromTop(true);
    } else {
      ball.x = VW / 2;
      ball.y = paddle.y - ball.radius - 3;
      const angle = (Math.random() * 0.5 - 0.25) - Math.PI / 2;
      ball.dx = Math.cos(angle) * ball.speed;
      ball.dy = Math.sin(angle) * ball.speed;
    }
  }

  function paddleScaleByAlive(n) {
    const aliveN = Math.max(1, n);
    if (aliveN <= 2) return 1;
    return 1 - Math.min(1, (aliveN - 2) / 4) * 0.5;
  }
  function basePaddleWidth() {
    const aliveN = Math.max(1, alivePlayers().length);
    const normal = Math.min(78, VW / 2 - 16);
    return Math.max(30, normal * paddleScaleByAlive(aliveN));
  }
  function initSharedPaddles(keepX) {
    const all = roster.length ? roster : [{ id: myNetId, name: myName, lives: 3 }];
    const baseW = basePaddleWidth();
    const slot = VW / Math.max(1, all.length);
    paddles = all.map((p, i) => {
      const old = paddles.find(x => x.id === p.id);
      const dead = !!(p.finished || (p.lives != null && p.lives <= 0));
      const isTurn = !dead && p.id === turnId;
      let w = baseW;
      if (isTurn) w = Math.min(VW * 0.44, baseW * 1.45);
      if (dead) w = baseW * 0.5;
      let x;
      if (keepX && old) x = Math.max(0, Math.min(VW - w, old.x + (old.width - w) / 2));
      else x = i * slot + (slot - w) / 2;
      return {
        id: p.id,
        name: p.name,
        color: PADDLE_COLORS[i % PADDLE_COLORS.length],
        width: w,
        height: isTurn ? 14 : 11,
        x, y: VH - 26,
        speed: fairPaddleSpeed(),
        slow: false,
        dead
      };
    });
    if (!turnId) {
      const first = alivePlayers()[0] || all[0];
      if (first) setTurn(first.id);
    }
  }

  function serveBallFromTop(startCountdown) {
    const bottom = bricks.length
      ? Math.max(...bricks.map(b => b.y + b.height)) + 30
      : 170;
    ball.x = VW / 2;
    ball.y = Math.min(bottom, VH * 0.4);
    ball.dx = 0;
    ball.dy = 0;
    ball.speed = fairBallSpeed();
    if (startCountdown !== false) {
      readyUntil = Date.now() + 3000;
      emitNetFx('ready');
      broadcastWorld(true);
    } else {
      readyUntil = 0;
    }
  }
  function launchReadyBall() {
    readyUntil = 0;
    ball.speed = fairBallSpeed();
    const jitter = Math.random() * 0.5 - 0.25;
    ball.dx = Math.sin(jitter) * ball.speed;
    ball.dy = Math.abs(Math.cos(jitter) * ball.speed);
    broadcastWorld(true);
  }

  function setTurn(id) {
    if (!id) { turnId = id; updateTurnBanner(); return; }
    const changed = turnId !== id;
    turnId = id;
    pendingAdvance = false;
    updateTurnBanner();
    if (gameMode === 'shared') initSharedPaddles(true);
    if (changed && lastTurnAnnounced !== id) {
      lastTurnAnnounced = id;
      playTone(id === myNetId ? 880 : 520, 0.12, 'triangle', 0.08);
    }
  }
  function updateTurnBanner() {
    const el = document.getElementById('turnBanner');
    if (!el) return;
    if (gameMode !== 'shared') { el.textContent = ''; return; }
    const mine = turnId === myNetId;
    el.textContent = (mine ? 'GILIRAN KAMU' : ('GILIRAN: ' + currentTurnName()));
    el.classList.toggle('mine', mine);
  }
  function spawnFloat(x, y, text, color) {
    floatTexts.push({ x, y, text, color: color || '#b8f2e6', life: 50 });
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

  let lastSplashAt = 0;
  function showLifeSplash(reason, autoHide) {
    const box = document.getElementById('life-splash');
    if (!box) return;
    if (Date.now() - lastSplashAt < 500) return;
    lastSplashAt = Date.now();
    document.getElementById('splash-title').textContent = autoHide ? 'NYAWA BERKURANG' : 'KAMU TERELIMINASI';
    document.getElementById('splash-sub').textContent = reason || '';
    document.getElementById('splash-hint').textContent = autoHide
      ? 'Hilang sebentar. Lapangan tetap kelihatan.'
      : 'Menunggu pemain lain selesai. Skor masih update.';
    renderSplashBoard();
    box.classList.remove('hidden');
    if (splashTimer) clearTimeout(splashTimer);
    if (autoHide) {
      splashTimer = setTimeout(() => box.classList.add('hidden'), 2500);
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

  function pulseLivesHud() {
    if (!livesEl) return;
    livesEl.classList.remove('life-pop');
    void livesEl.offsetWidth;
    livesEl.classList.add('life-pop');
  }
  function showLifeLostFX(who, name, reason, remain) {
    const label = name || (roster.find(p => p.id === who) || {}).name || 'Pemain';
    spawnFloat(VW / 2, VH * 0.38, '♥ -1  ' + label, '#e63946');
    if (reason) spawnFloat(VW / 2, VH * 0.44, reason, '#ffb4b4');
    spawnParticles(VW / 2, VH * 0.4, '#e63946');
    sfxLife();
    pulseLivesHud();
    renderLiveScores();
  }
  function applyLifeLoss(playerId, reason) {
    const r = roster.find(p => p.id === playerId);
    if (!r) return;
    r.lives = Math.max(0, (r.lives == null ? 3 : r.lives) - 1);
    if (r.lives <= 0) r.finished = true;
    if (playerId === myNetId) lives = r.lives;
    showLifeLostFX(playerId, r.name, reason, r.lives);
    updateHUD();
    emitNetFx('life', {
      who: playerId,
      name: r.name,
      lives: r.lives,
      reason: reason || 'Nyawa berkurang'
    });
    writePlayerState(playerId, { lives: r.lives, finished: !!r.finished, score: r.score || 0 });
    if (gameMode === 'shared') initSharedPaddles(true);
    broadcastWorld(true);
  }

  function broadcastWorld(force) {
    if (gameMode !== 'shared') return;
    if (isMultiplayer && !isHost) return;
    if (!fbReady || !fbDb || !roomCode) return;
    const now = Date.now();
    if (!force && now - lastFbWorldWrite < 70) return;
    lastFbWorldWrite = now;
    fbDb.ref(fbRoomPath() + '/world').set({
      ball: { x: ball.x, y: ball.y, dx: ball.dx, dy: ball.dy, speed: ball.speed },
      lastHitter,
      turnId,
      level: currentLevel,
      readyUntil,
      bricks: packBricks(bricks),
      pending: packBricks(pendingBricks),
      fx: netFx
    }).catch(() => {});
  }

  function startLevel(idx) {
    currentLevel = idx;
    pendingAdvance = false;
    pendingBricks = [];
    warnHits = {};
    createBricks(idx);
    resetBallAndPaddle();
    updateTurnBanner();
    particles = [];
    updateHUD();
  }

  function updateHUD() {
    scoreEl.textContent = score;
    livesEl.textContent = '♥ '.repeat(Math.max(0, lives)).trim() || '—';
    const me = roster.find(p => p.id === myNetId);
    if (me) { me.score = score; me.lives = lives; }
    renderLiveScores();
    if (isMultiplayer) writeMyPlayer({ score, lives, finished: lives <= 0 });
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
        if (fbReady && fbDb && roomCode) {
          const now = Date.now();
          if (now - lastFbPadWrite >= 80) {
            lastFbPadWrite = now;
            fbDb.ref(fbRoomPath() + '/pads/' + myNetId).set({ x: myPad.x, y: myPad.y, slow: !!myPad.slow }).catch(()=>{});
          }
        }
      }
    }
    if (shared && paddles.some(p => p.id === 'cpu')) moveCpu();

    const simulate = !shared || !isMultiplayer || isHost;
    if (readyUntil && Date.now() < readyUntil) {
      ball.dx = 0;
      ball.dy = 0;
    } else if (simulate && readyUntil && Date.now() >= readyUntil) {
      launchReadyBall();
    }
    if (!simulate && !(readyUntil && Date.now() < readyUntil)) {
      ball.x += ball.dx * step;
      ball.y += ball.dy * step;
    }
    if (simulate && !(readyUntil && Date.now() < readyUntil)) {
      ball.x += ball.dx * step;
      ball.y += ball.dy * step;
      if (ball.x - ball.radius < 0) { ball.x = ball.radius; ball.dx = Math.abs(ball.dx); sfxWall(); emitNetFx('wall'); }
      else if (ball.x + ball.radius > VW) { ball.x = VW - ball.radius; ball.dx = -Math.abs(ball.dx); sfxWall(); emitNetFx('wall'); }
      if (ball.y - ball.radius < 0) { ball.y = ball.radius; ball.dy = Math.abs(ball.dy); sfxWall(); emitNetFx('wall'); }

      if (ball.y - ball.radius > VH) {
        if (shared) {
          applyLifeLoss(turnId || myNetId, 'Bola jatuh · giliran ' + currentTurnName());
          setTurn(nextTurnAfter(turnId));
          if (alivePlayers().length <= 1) { endMatch(); return; }
          serveBallFromTop(true);
        } else {
          lives--; updateHUD(); sfxLife();
          if (lives <= 0) { playerFinished(); return; }
          resetBallAndPaddle();
        }
        return;
      }

      if (shared && pendingAdvance && ball.dy < 0 && ball.y < VH * 0.48) {
        setTurn(nextTurnAfter(turnId));
        pendingAdvance = false;
      }

      const hitList = shared && paddles.length ? paddles.filter(p => !p.dead) : [paddle];
      let consumedHit = false;
      let scoringOwner = turnId;
      hitList.forEach(pad => {
        if (consumedHit) return;
        if (ball.y + ball.radius >= pad.y && ball.y + ball.radius <= pad.y + pad.height + 12 && ball.dy > 0 &&
            ball.x >= pad.x && ball.x <= pad.x + pad.width) {
          if (shared && pad.id !== turnId) {
            lastHitter = pad.id;
            applyLifeLoss(pad.id, 'Raket salah · giliran ' + currentTurnName());
            const hitPos = (ball.x - (pad.x + pad.width/2)) / (pad.width/2);
            const angle = -Math.PI/2 + hitPos * (Math.PI/3);
            ball.speed = fairBallSpeed();
            ball.dx = Math.cos(angle) * ball.speed;
            ball.dy = Math.sin(angle) * ball.speed;
            ball.y = pad.y - ball.radius - 1;
            scoringOwner = turnId;
            consumedHit = true;
            if (alivePlayers().length <= 1) { endMatch(); return; }
            return;
          }
          const hitPos = (ball.x - (pad.x + pad.width/2)) / (pad.width/2);
          const angle = -Math.PI/2 + hitPos * (Math.PI/3);
          ball.speed = fairBallSpeed();
          ball.dx = Math.cos(angle) * ball.speed;
          ball.dy = Math.sin(angle) * ball.speed;
          ball.y = pad.y - ball.radius - 1;
          sfxPaddle();
          emitNetFx('paddle');
          if (shared) {
            lastHitter = pad.id || myNetId;
            scoringOwner = turnId;
            pendingAdvance = true;
          }
          consumedHit = true;
          broadcastWorld(true);
        }
      });

      const now = Date.now();
      pendingBricks = pendingBricks.filter(pb => {
        if (now < pb.backAt) return true;
        bricks.push({ x:pb.x,y:pb.y,width:pb.width,height:pb.height,color:pb.color,hp:pb.maxHp||pb.hp||1,maxHp:pb.maxHp||1,points:pb.points });
        sfxDrruit();
        emitNetFx('drruit');
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
          emitNetFx('brick', {
            x: brick.x + brick.width / 2,
            y: brick.y + brick.height / 2,
            color: brick.color,
            points: brick.points,
            maxHp: brick.maxHp
          });
          if (brick.hp <= 0) {
            const rp = roster.find(r => r.id === owner);
            if (shared) {
              if (rp) rp.score += brick.points;
              if (owner === myNetId) score += brick.points;
              writePlayerState(owner, { score: rp ? rp.score : brick.points });
              spawnFloat(brick.x, brick.y, '+' + brick.points + ' ' + (rp ? rp.name : ''), '#2a9d8f');
              emitNetFx('score', {
                x: brick.x, y: brick.y,
                text: '+' + brick.points + ' ' + (rp ? rp.name : ''),
                color: '#2a9d8f'
              });
            } else {
              score += brick.points;
            }
            bricks.splice(i,1);
            updateHUD();
          } else brick.color = shadeColor(brick.color, -35);
          broadcastWorld(true);
          break;
        }
      }
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
    for (let i = floatTexts.length-1; i >= 0; i--) {
      floatTexts[i].y -= 0.4; floatTexts[i].life--;
      if (floatTexts[i].life <= 0) floatTexts.splice(i,1);
    }
  }

  function draw() {
    ctx.fillStyle = '#0c0c0c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    bricks.forEach(brick => {
      ctx.fillStyle = brick.color;
      ctx.fillRect(sx(brick.x), sy(brick.y), sw(brick.width), sh(brick.height));
    });
    const blink = Math.sin(Date.now() / 160) > 0;
    pendingBricks.forEach(pb => {
      ctx.globalAlpha = blink ? 0.55 : 0.2;
      ctx.strokeStyle = pb.color || '#fff';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx(pb.x), sy(pb.y), sw(pb.width), sh(pb.height));
      ctx.globalAlpha = 1;
    });
    if (gameMode === 'shared' && paddles.length) {
      const pblink = Math.sin(Date.now() / 180) > 0;
      const nid = nextTurnAfter(turnId);
      paddles.forEach(pad => {
        const isTurn = !pad.dead && pad.id === turnId;
        const isNext = !pad.dead && pad.id === nid && pad.id !== turnId;
        if (pad.dead) ctx.globalAlpha = 0.5;
        if (isTurn && pblink) {
          ctx.fillStyle = '#fff';
          ctx.globalAlpha = 0.35;
          ctx.fillRect(sx(pad.x) - 4, sy(pad.y) - 4, sw(pad.width) + 8, sh(pad.height) + 8);
          ctx.globalAlpha = pad.dead ? 0.5 : 1;
        }
        ctx.fillStyle = pad.color || '#e63946';
        ctx.fillRect(sx(pad.x), sy(pad.y), sw(pad.width), sh(pad.height));
        ctx.font = isTurn ? 'bold 12px Rajdhani' : '11px Rajdhani';
        if (isTurn && pblink) ctx.fillStyle = '#fff';
        else if (isNext && pblink) ctx.fillStyle = '#a7ffeb';
        else ctx.fillStyle = '#ddd';
        ctx.fillText(pad.name || '', sx(pad.x), sy(pad.y) - 3);
        ctx.globalAlpha = 1;
      });
    } else {
      ctx.fillStyle = '#e63946';
      ctx.fillRect(sx(paddle.x), sy(paddle.y), sw(paddle.width), sh(paddle.height));
    }
    ctx.fillStyle = '#2a9d8f';
    ctx.beginPath(); ctx.arc(sx(ball.x), sy(ball.y), sw(ball.radius), 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(42,157,143,.55)';
    ctx.font = '12px Rajdhani';
    ctx.fillText('LEVEL ' + (currentLevel+1), 8, 14);
    floatTexts.forEach(ft => {
      ctx.globalAlpha = Math.max(0, ft.life / 50);
      ctx.fillStyle = ft.color;
      ctx.font = 'bold 13px Rajdhani';
      ctx.fillText(ft.text, sx(ft.x), sy(ft.y));
      ctx.globalAlpha = 1;
    });
    if (gameMode === 'shared' && readyUntil && Date.now() < readyUntil) {
      const sec = Math.max(1, Math.ceil((readyUntil - Date.now()) / 1000));
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillRect(sx(40), sy(VH * 0.46), sw(320), sh(70));
      ctx.fillStyle = '#b8f2e6';
      ctx.font = 'bold 22px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('GET READY', sx(VW / 2), sy(VH * 0.51));
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 28px Orbitron, sans-serif';
      ctx.fillText(String(sec), sx(VW / 2), sy(VH * 0.56));
      ctx.textAlign = 'left';
    }
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
    bumpStat('plays');
    showScreen('game');
    hideOverlays();
    updateModeLabels();
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
    bumpStat('plays');
    writeLobbyMeta();
    showScreen('game');
    myNameHud.textContent = roster.length ? roster.map(p => p.name).join(' vs ') : myName;
    score = 0; lives = settings.lives; currentLevel = 0;
    lastHitter = null; pendingBricks = [];
    netFx = []; lastFxSeq = 0;
    if (isHost) fxSeq = 0;
    pendingStartCmd = false;
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    roster.forEach(p => { p.score = 0; p.finished = false; p.lives = settings.lives; });
    if (gameMode === 'shared') {
      turnId = roster[0] ? roster[0].id : myNetId;
      initSharedPaddles(false);
    }
    hideOverlays();
    updateModeLabels();
    resizeCanvas(); startLevel(0);
    isRunning = true; isPaused = false; lastTs = 0;
    if (!animationId) animationId = requestAnimationFrame(loop);
  }

  function levelComplete() {
    isRunning = false;
    hideOverlays('level-up');
    if (currentLevel >= gameData.levels.length - 1) playerFinished();
    else {
      levelMessage.textContent = `Level ${currentLevel+1} selesai! Score: ${score}`;
      levelUpOverlay.classList.remove('hidden');
      if (isMultiplayer && isHost && fbReady && fbDb && roomCode) {
        fbDb.ref(fbRoomPath() + '/cmd').set({
          start: true, levelClear: true, level: currentLevel, t: Date.now()
        }).catch(() => {});
      }
    }
  }
  function nextLevel() {
    levelUpOverlay.classList.add('hidden');
    startLevel(currentLevel + 1);
    isRunning = true;
    if (isMultiplayer && isHost && fbReady && fbDb && roomCode) {
      fbDb.ref(fbRoomPath() + '/cmd').set({
        start: true, nextLevel: true, level: currentLevel, t: Date.now()
      }).catch(() => {});
    }
  }
  function playerFinished() {
    isRunning = false;
    if (isMultiplayer) {
      const me = roster.find(p => p.id === myNetId);
      if (me) { me.finished = true; me.score = score; }
      writeMyPlayer({ score, lives, finished: true });
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
  function shareResultText(list) {
    const top = list[0] || { name: myName, score };
    return `${top.name} juara Monmon Shatter — ${top.score || 0} poin!\nMain bareng di ${SITE_URL}`;
  }
  function endMatch() {
    isRunning = false;
    readyUntil = 0;
    hideOverlays('game-over');
    const list = (roster.length ? roster : [{name: myName, score, lives}]).slice().sort((a,b)=>(b.score||0)-(a.score||0));
    const top = list[0] || { name: myName, score };
    goTitle.textContent = (top.name || 'Pemain') + ' JUARA';
    gameOverOverlay.classList.add('final-shot');
    const cele = document.getElementById('celebration');
    const podium = document.getElementById('podium');
    if (cele) { cele.classList.remove('hidden'); cele.textContent = '🏆🎉🔥'; }
    const medals = ['🥇','🥈','🥉'];
    const cls = ['gold','silver','bronze'];
    if (podium) podium.innerHTML = list.map((p,i) =>
      `<div class="podium-row ${cls[i]||''}"><span><span class="rank">${medals[i]||(i+1)+'.'}</span>${escapeHtml(p.name)}</span><strong>${p.score||0} poin · ${'♥'.repeat(Math.max(0, p.lives||0)) || 'habis'}</strong></div>`
    ).join('');
    finalResults.innerHTML = `<div class="winner">${escapeHtml(top.name)} · ${top.score||0} POIN</div>
      <p>Level ${currentLevel+1} · ${list.length} pemain</p>`;
    window._lastShareText = shareResultText(list);
    try {
      [392,523,659,784,1046,1318].forEach((f,i)=>setTimeout(()=>playTone(f,0.22,'triangle',0.1), i*110));
      setTimeout(() => playTone(1568, 0.45, 'square', 0.09), 780);
      setTimeout(() => playTone(1976, 0.35, 'triangle', 0.07), 980);
    } catch(e) {}
    gameOverOverlay.classList.remove('hidden');
  }

  function leaveAll() {
    stopHeartbeat();
    cancelPresence();
    if (fbReady && fbDb && roomCode) {
      try {
        if (isHost) {
          fbDb.ref('lobby/' + roomCode).remove();
          fbDb.ref(fbRoomPath()).remove();
        } else {
          fbDb.ref(fbRoomPath() + '/players/' + myNetId).remove();
          fbDb.ref(fbRoomPath() + '/pads/' + myNetId).remove();
        }
      } catch (e) {}
    }
    isRunning = false;
    matchStarted = false;
    fbStop();
    paddles = []; lastHitter = null;
    roomCode = '';
    roster = [];
    if (animationId) cancelAnimationFrame(animationId);
    animationId = null;
    showScreen('lobby');
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
      roomStatusEl.textContent = roster.length < 2
        ? 'Tunggu nama lawan muncul di daftar dulu.'
        : 'Hanya host yang bisa Mulai (atau aktifkan opsi guest).';
      return;
    }
    roomStatusEl.textContent = 'Memulai pertandingan...';
    btnStartMatch.disabled = true;
    matchStarted = true;
    const kick = () => {
      if (isRunning) return;
      try { startMultiplayerMatch(); }
      catch (e) {
        matchStarted = false;
        roomStatusEl.textContent = 'Gagal mulai: ' + (e.message || e);
        btnStartMatch.disabled = !canClickStart();
      }
    };
    if (fbReady && fbDb && roomCode) {
      fbDb.ref(fbRoomPath() + '/cmd').set({ start: true, t: Date.now() }).catch(() => {}).then(kick);
      setTimeout(() => { if (!isRunning && matchStarted) kick(); }, 400);
    } else kick();
  };
  btnLeave.onclick = leaveAll;
  nextLevelBtn.onclick = nextLevel;
  restartBtn.onclick = () => {
    gameOverOverlay.classList.add('hidden');
    if (isMultiplayer) {
      if (isHost || allowGuestStart) {
        if (fbReady && fbDb && roomCode) {
          fbDb.ref(fbRoomPath() + '/cmd').set({ start: true, restart: true, t: Date.now() }).catch(() => {});
        }
        startMultiplayerMatch();
      } else {
        goTitle.textContent = 'Menunggu host...';
        gameOverOverlay.classList.remove('hidden');
      }
    } else startSolo();
  };
  backLobbyBtn.onclick = leaveAll;
  const pauseOverlay = document.getElementById('pause-overlay');
  const btnQuitGame = document.getElementById('btn-quit-game');
  const btnResume = document.getElementById('btn-resume');
  const btnPauseLobby = document.getElementById('btn-pause-lobby');
  const btnLevelLobby = document.getElementById('btn-level-lobby');
  function openPause() {
    if (gameScreenEl.classList.contains('hidden')) return;
    if (!gameOverOverlay.classList.contains('hidden')) return;
    if (!levelUpOverlay.classList.contains('hidden')) return;
    isPaused = true;
    hideLifeSplash();
    if (pauseOverlay) pauseOverlay.classList.remove('hidden');
  }
  if (btnQuitGame) btnQuitGame.onclick = openPause;
  if (btnResume) btnResume.onclick = () => {
    if (pauseOverlay) pauseOverlay.classList.add('hidden');
    isPaused = false;
  };
  if (btnPauseLobby) btnPauseLobby.onclick = () => {
    if (pauseOverlay) pauseOverlay.classList.add('hidden');
    leaveAll();
  };
  if (btnLevelLobby) btnLevelLobby.onclick = leaveAll;
  const btnShare = document.getElementById('btn-share');
  if (btnShare) btnShare.onclick = async () => {
    const text = window._lastShareText || ('Main Monmon Shatter di ' + SITE_URL);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Monmon Shatter', text, url: SITE_URL });
        return;
      }
    } catch (e) {}
    try {
      await navigator.clipboard.writeText(text);
      btnShare.textContent = 'Tersalin';
      setTimeout(() => { btnShare.textContent = 'Bagikan'; }, 1400);
    } catch (e) {
      window.prompt('Salin tautan ini:', SITE_URL);
    }
  };
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
      playerNameInput.placeholder = 'Nama baru...';
    };
    document.querySelectorAll('input[name="roomPlayMode"]').forEach((el) => {
      el.addEventListener('change', updateModeLabels);
    });
    updateModeLabels();
    if (!fbEnabled()) {
      apiWarnEl.textContent = 'Isi window.MONMON_FIREBASE di config.js (lihat FIREBASE.md). Solo tetap bisa.';
      apiWarnEl.classList.remove('hidden');
      return;
    }
    if (!fbReady) {
      apiWarnEl.textContent = 'Gagal login Firebase. Nyalakan Anonymous Auth + publish rules.';
      apiWarnEl.classList.remove('hidden');
      return;
    }
    apiWarnEl.classList.add('hidden');
    startLobbyWatch();
    if (!sessionStorage.getItem('monmon_visited')) {
      sessionStorage.setItem('monmon_visited', '1');
      bumpStat('visits');
    }
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (gameScreenEl.classList.contains('hidden')) return;
    if (!gameOverOverlay.classList.contains('hidden')) return;
    if (pauseOverlay && !pauseOverlay.classList.contains('hidden')) {
      pauseOverlay.classList.add('hidden');
      isPaused = false;
    } else {
      openPause();
    }
  });

  init();
})();

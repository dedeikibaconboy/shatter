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
  let ball = { x: 0, y: 0, radius: 8, dx: 0, dy: 0, speed: 5.2, spin: 0, rot: 0 };
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
  let matchEnded = false;

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
      let keepLocal = false;
      if (isRunning && mine) {
        if (gameMode === 'shared' && isHost) keepLocal = true;
        else if (id === myNetId) keepLocal = true;
      }
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
    refreshEndMatchBtn();
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
        matchEnded = false;
        startMultiplayerMatch();
      }
      if (v.gameOver && !matchEnded) {
        if (Array.isArray(v.results)) {
          v.results.forEach((row) => {
            const r = roster.find((p) => p.id === row.id);
            if (r) { r.score = row.score; r.lives = row.lives; r.finished = true; }
          });
        }
        endMatch();
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
    ['pause-overlay', 'level-up', 'game-over', 'life-splash', ].forEach((id) => {
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
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
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
  function leftoverPlayers() {
    if (isMultiplayer && roster.length) return alivePlayers();
    return alivePlayers();
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
    refreshEndMatchBtn();
    if (isMultiplayer) writeMyPlayer({ score, lives, finished: lives <= 0 });
  }
  function refreshEndMatchBtn() {
    const btn = document.getElementById('btn-end-match');
    if (!btn) return;
    const alive = alivePlayers();
    const leftover = leftoverPlayers();
    const last = leftover[0];
    const show = !matchEnded && isRunning && leftover.length === 1 && last &&
      (last.id === myNetId || last.id === 'cpu');
    btn.classList.toggle('hidden', !show);
    const banner = document.getElementById('turnBanner');
    if (banner && gameMode !== 'shared') {
      banner.textContent = show ? 'PEMAIN TERAKHIR · tekan Akhiri' : '';
      banner.classList.toggle('mine', !!show);
    }
  }

  function spawnParticles(x, y, color) {
    // Samakan animasi hancur bata dengan mode online (lebih hidup, sama di solo & multi)
    const n = IS_MOBILE ? 8 : 14;
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1.5 + Math.random() * 4.5;
      particles.push({
        x, y,
        dx: Math.cos(ang) * spd,
        dy: Math.sin(ang) * spd - Math.random() * 1.5,
        life: 22 + Math.random() * 14,
        maxLife: 36,
        color,
        size: 1.5 + Math.random() * 2.5
      });
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
    // CPU tetap hidup & bergerak meski pemain sudah kehabisan nyawa
    if (cpu.dead) {
      const r = roster.find(p => p.id === 'cpu');
      if (r && (r.lives == null || r.lives > 0) && !r.finished) cpu.dead = false;
      else return;
    }
    const aliveNow = alivePlayers();
    const onlyCpu = aliveNow.length === 1 && aliveNow[0].id === 'cpu';
    const playerDead = !aliveNow.some(p => p.id === myNetId);
    if (onlyCpu || playerDead) {
      turnId = 'cpu';
      cpu.dead = false;
    }
    const myTurn = turnId === 'cpu' || onlyCpu || playerDead;
    // Saat hanya CPU / pemain sudah mati: raket selalu mengejar bola (tidak diam)
    const target = myTurn
      ? (ball.x - cpu.width / 2)
      : (ball.x < VW / 2 ? VW - cpu.width - 10 : 10);
    const spd = fairPaddleSpeed() * (onlyCpu || playerDead ? 1.35 : (myTurn ? 0.95 : 0.55));
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
      ball.rot = (ball.rot || 0) + (ball.spin || 0);
      if (ball.x - ball.radius < 0) { ball.x = ball.radius; ball.dx = Math.abs(ball.dx); sfxWall(); emitNetFx('wall'); }
      else if (ball.x + ball.radius > VW) { ball.x = VW - ball.radius; ball.dx = -Math.abs(ball.dx); sfxWall(); emitNetFx('wall'); }
      if (ball.y - ball.radius < 0) { ball.y = ball.radius; ball.dy = Math.abs(ball.dy); sfxWall(); emitNetFx('wall'); }

      if (ball.y - ball.radius > VH) {
        if (shared) {
          applyLifeLoss(turnId || myNetId, 'Bola jatuh · giliran ' + currentTurnName());
          const still = alivePlayers();
          if (!still.length) { endMatch(); return; }
          setTurn(still.length === 1 ? still[0].id : nextTurnAfter(turnId));
          refreshEndMatchBtn();
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
            refreshEndMatchBtn();
            return;
          }
          const hitPos = (ball.x - (pad.x + pad.width/2)) / (pad.width/2);
          const angle = -Math.PI/2 + hitPos * (Math.PI/3);
          ball.speed = fairBallSpeed();
          ball.spin = hitPos * 0.25;
          ball.dx = Math.cos(angle) * ball.speed + ball.spin * 1.1;
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
      pt.x += pt.dx; pt.y += pt.dy; pt.dy += 0.12; pt.life--;
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
    try {
      const br = sw(ball.radius || 8), bx = sx(ball.x || 0), by = sy(ball.y || 0);
      if (br > 0 && isFinite(br) && isFinite(bx) && isFinite(by)) {
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(ball.rot || 0);
        ctx.fillStyle = '#0a2e2a';
        ctx.fillRect(-br, -br * 0.16, br * 2, br * 0.32);
        ctx.restore();
      }
    } catch (e) {}
    // Animasi partikel hancur bata (sama di solo & multiplayer)
    particles.forEach(pt => {
      const a = Math.max(0, pt.life / (pt.maxLife || 20));
      ctx.globalAlpha = a;
      ctx.fillStyle = pt.color || '#e63946';
      const sz = (pt.size || 2) * a;
      ctx.beginPath();
      ctx.arc(sx(pt.x), sy(pt.y), Math.max(0.5, sw(sz)), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
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
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    myName = getPlayerName();
    localStorage.setItem('monmon_name', myName);
    gameMode = selectedMode();
    isMultiplayer = false;
    lastHitter = null; turnId = myNetId || 'local'; pendingBricks = [];
    lives = settings.lives;
    if (!resumeLevel) { score = 0; currentLevel = 0; }
    if (gameMode === 'shared') {
      const pid = myNetId || 'local';
      roster = [
        { id: pid, name: myName, score: 0, finished: false, host: true, lives: settings.lives },
        { id: 'cpu', name: 'CPU', score: 0, finished: false, host: false, lives: settings.lives }
      ];
      myNetId = pid;
      turnId = pid;
      myNameHud.textContent = myName + ' vs CPU';
    } else {
      roster = [];
      myNameHud.textContent = myName;
    }
    matchEnded = false;
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
    matchEnded = false;
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
    if (roster.every(p => p.finished)) { endMatch(); return; }
    const left = alivePlayers();
    if (left.length === 1 && left[0].id === myNetId && isRunning) {
      refreshEndMatchBtn();
      return;
    }
    goTitle.textContent = 'Menunggu pemain lain...';
    gameOverOverlay.classList.remove('hidden');
    refreshWaitBoard();
  }
  function shareResultText(list) {
    const top = list[0] || { name: myName, score };
    return `${top.name} juara Monmon Shatter — ${top.score || 0} poin!\nMain bareng di ${SITE_URL}`;
  }
  function endMatch() {
    if (matchEnded) return;
    matchEnded = true;
    isRunning = false;
    readyUntil = 0;
    hideOverlays('game-over');
    const list = (roster.length ? roster : [{id: myNetId, name: myName, score, lives}]).slice().sort((a,b)=>(b.score||0)-(a.score||0));
    const top = list[0] || { name: myName, score };
    const myIndex = Math.max(0, list.findIndex((p) => p.id === myNetId));
    const myRank = list.length ? myIndex + 1 : 1;
    const iWon = myRank === 1;
    const kicker = document.getElementById('champ-kicker');
    const cheer = document.getElementById('cheer-msg');
    if (kicker) kicker.textContent = iWon ? 'KAMU JUARA' : 'HASIL PERTANDINGAN';
    goTitle.textContent = iWon ? 'JUARA 1' : ('Juara: ' + (top.name || 'Pemain'));
    gameOverOverlay.classList.add('final-shot');
    const cele = document.getElementById('celebration');
    const podium = document.getElementById('podium');
    if (cele) { cele.classList.remove('hidden'); cele.textContent = '🏆🎉🔥'; }
    if (cheer) {
      cheer.textContent = iWon
        ? ('Selamat ' + myName + '!')
        : ('Kamu urutan ke-' + myRank + ' dari ' + list.length + '. Tetap semangat, main lagi!');
    }
    const medals = ['🥇','🥈','🥉'];
    const cls = ['gold','silver','bronze'];
    if (podium) podium.innerHTML = list.map((p,i) =>
      `<div class="podium-row ${cls[i]||''}${p.id===myNetId?' you':''}"><span><span class="rank">${medals[i]||(i+1)+'.'}</span>${escapeHtml(p.name)}${p.id===myNetId?' (Kamu)':''}</span><strong>${p.score||0} poin</strong></div>`
    ).join('');
    if (finalResults) finalResults.innerHTML = `<div class="winner">${escapeHtml(top.name)} · ${top.score||0} POIN</div>
      <p>Level ${currentLevel+1} · ${list.length} pemain</p>`;
    window._lastShareText = shareResultText(list);
    const endBtn = document.getElementById('btn-end-match');
    if (endBtn) endBtn.classList.add('hidden');
    if (isMultiplayer && fbReady && fbDb && roomCode) {
      fbDb.ref(fbRoomPath() + '/cmd').set({
        gameOver: true, t: Date.now(),
        results: list.map((p) => ({ id:p.id, name:p.name, score:p.score||0, lives:p.lives||0, finished:true, host:!!p.host }))
      }).catch(()=>{});
    }
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
  document.addEventListener('click', function (ev) {
    const t = ev.target && ev.target.closest ? ev.target.closest('button') : null;
    if (!t) return;
    if (t.id === 'btn-end-match') {
      const left = alivePlayers();
      if (!matchEnded && left.length === 1 && (left[0].id === myNetId || left[0].id === 'cpu')) endMatch();
    }
  });
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

  /* ========== CHAT & PRESENCE (ringan, auto-hapus 24 jam) ========== */
  const DAY_MS = 24 * 60 * 60 * 1000;
  const MAX_MSGS = 40;
  let myCountry = '—';
  let presenceUnsub = null, chatsListUnsub = null, activeChatUnsub = null;
  let presenceMap = {};
  let chatRoomsMap = {};
  let activeChatId = null;
  let activeChatMeta = null;
  let unreadCount = 0;
  let knownDmIds = new Set(JSON.parse(localStorage.getItem('monmon_dms') || '[]'));

  function getPlayerNameSafe() {
    const n = (playerNameInput && playerNameInput.value || '').trim();
    return n || myName || 'Player';
  }

  async function detectCountry() {
    try {
      const r = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(4000) });
      const j = await r.json();
      if (j && j.country_name) return j.country_name + (j.country_code ? ' (' + j.country_code + ')' : '');
    } catch (e) {}
    try {
      const r2 = await fetch('https://ip-api.com/json/?fields=country,countryCode', { signal: AbortSignal.timeout(4000) });
      const j2 = await r2.json();
      if (j2 && j2.country) return j2.country + (j2.countryCode ? ' (' + j2.countryCode + ')' : '');
    } catch (e) {}
    return (navigator.language || 'ID').toUpperCase();
  }

  function showChatFab(show) {
    const fab = document.getElementById('chatFab');
    if (fab) fab.classList.toggle('hidden', !show);
  }

  function openChatPanel(open) {
    const panel = document.getElementById('chatPanel');
    if (!panel) return;
    panel.classList.toggle('open', !!open);
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  function setChatTab(tab) {
    document.querySelectorAll('.chat-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    ['online', 'rooms', 'dm'].forEach(id => {
      const el = document.getElementById('chat' + id.charAt(0).toUpperCase() + id.slice(1) + 'View');
      if (el) el.classList.toggle('hidden', id !== tab);
    });
    const thread = document.getElementById('chatThreadView');
    if (thread) thread.classList.add('hidden');
    activeChatId = null;
    if (activeChatUnsub) { try { activeChatUnsub(); } catch (e) {} activeChatUnsub = null; }
  }

  function renderOnlineList() {
    const el = document.getElementById('onlineList');
    if (!el) return;
    const list = Object.keys(presenceMap).map(uid => Object.assign({ uid }, presenceMap[uid]))
      .filter(p => p.name && p.uid !== myNetId)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (!list.length) {
      el.innerHTML = '<p class="muted">Belum ada pemain online lain.</p>';
      return;
    }
    el.innerHTML = list.map(p =>
      `<div class="online-row" data-uid="${escapeHtml(p.uid)}" data-name="${escapeHtml(p.name)}">
        <span class="online-dot"></span>
        <div class="online-info"><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(p.country || '—')}</span></div>
      </div>`
    ).join('');
    el.querySelectorAll('.online-row').forEach(row => {
      row.onclick = () => openDmWith(row.dataset.uid, row.dataset.name);
    });
  }

  function renderRoomsList() {
    const el = document.getElementById('chatRoomsList');
    if (!el) return;
    const now = Date.now();
    const list = Object.keys(chatRoomsMap).map(id => Object.assign({ id }, chatRoomsMap[id]))
      .filter(r => r.type === 'room' && (now - (r.lastActivity || 0) < DAY_MS))
      .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
    if (!list.length) {
      el.innerHTML = '<p class="muted">Belum ada ruang chat aktif (hapus otomatis setelah 24 jam idle).</p>';
      return;
    }
    el.innerHTML = list.map(r => {
      const lock = r.locked ? '🔒 ' : '';
      const pass = r.hasPass ? '🔑 ' : '';
      const n = Object.keys(r.members || {}).length;
      return `<div class="room-row" data-id="${escapeHtml(r.id)}">
        <div class="online-info"><strong>${lock}${pass}${escapeHtml(r.name || 'Ruang')}</strong>
        <span>${n} anggota · ${escapeHtml(r.ownerName || '')}</span></div>
      </div>`;
    }).join('');
    el.querySelectorAll('.room-row').forEach(row => {
      row.onclick = () => openChatRoom(row.dataset.id);
    });
  }

  function renderDmList() {
    const el = document.getElementById('dmThreadList');
    if (!el) return;
    const now = Date.now();
    const list = Object.keys(chatRoomsMap).map(id => Object.assign({ id }, chatRoomsMap[id]))
      .filter(r => r.type === 'dm' && knownDmIds.has(r.id) && (now - (r.lastActivity || 0) < DAY_MS))
      .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
    if (!list.length) {
      el.innerHTML = '<p class="muted">Belum ada DM. Klik nama di tab Online.</p>';
      return;
    }
    el.innerHTML = list.map(r => {
      const other = Object.keys(r.members || {}).find(u => u !== myNetId);
      const nm = (r.members && other && r.members[other] && r.members[other].name) || r.name || 'DM';
      return `<div class="dm-row" data-id="${escapeHtml(r.id)}">
        <div class="online-info"><strong>${escapeHtml(nm)}</strong><span>DM privat</span></div>
      </div>`;
    }).join('');
    el.querySelectorAll('.dm-row').forEach(row => {
      row.onclick = () => openChatRoom(row.dataset.id);
    });
  }

  function dmIdFor(uidA, uidB) {
    return 'dm_' + [uidA, uidB].sort().join('_');
  }

  async function openDmWith(otherUid, otherName) {
    if (!fbReady || !fbDb || !myNetId) return;
    const cid = dmIdFor(myNetId, otherUid);
    knownDmIds.add(cid);
    localStorage.setItem('monmon_dms', JSON.stringify([...knownDmIds]));
    const ref = fbDb.ref('chats/' + cid);
    const snap = await ref.once('value');
    if (!snap.exists()) {
      await ref.set({
        type: 'dm',
        name: otherName || 'DM',
        ownerId: myNetId,
        ownerName: getPlayerNameSafe(),
        locked: false,
        hasPass: false,
        password: null,
        question: null,
        lastActivity: Date.now(),
        members: {
          [myNetId]: { name: getPlayerNameSafe(), joinedAt: Date.now() },
          [otherUid]: { name: otherName || 'Player', joinedAt: Date.now() }
        }
      });
    } else {
      await ref.child('members/' + myNetId).set({ name: getPlayerNameSafe(), joinedAt: Date.now() });
      await ref.update({ lastActivity: Date.now() });
    }
    openChatRoom(cid);
  }

  async function openChatRoom(chatId) {
    if (!fbReady || !fbDb) return;
    activeChatId = chatId;
    document.querySelectorAll('.chat-view').forEach(v => v.classList.add('hidden'));
    const thread = document.getElementById('chatThreadView');
    if (thread) thread.classList.remove('hidden');
    if (activeChatUnsub) { try { activeChatUnsub(); } catch (e) {} }

    const metaRef = fbDb.ref('chats/' + chatId);
    const msgRef = metaRef.child('messages');
    const reqRef = metaRef.child('requests');

    const onMeta = metaRef.on('value', (snap) => {
      const m = snap.val() || {};
      activeChatMeta = m;
      const title = document.getElementById('chatThreadName');
      const metaEl = document.getElementById('chatThreadMeta');
      if (title) title.textContent = m.name || (m.type === 'dm' ? 'DM' : 'Ruang');
      const nMem = Object.keys(m.members || {}).length;
      if (metaEl) metaEl.textContent = (m.type === 'dm' ? 'Privat' : nMem + ' anggota') + (m.locked ? ' · 🔒 terkunci' : '');
      const lockBtn = document.getElementById('chatLockBtn');
      const isMember = !!(m.members && m.members[myNetId]);
      const isOwner = m.ownerId === myNetId;
      if (lockBtn) {
        lockBtn.classList.toggle('hidden', m.type === 'dm' || !isMember);
        lockBtn.textContent = m.locked ? '🔓' : '🔒';
        lockBtn.title = m.locked ? 'Buka kunci' : 'Kunci ruang';
      }
      const gate = document.getElementById('chatJoinGate');
      const compose = document.querySelector('.chat-compose');
      if (!isMember && m.type === 'room') {
        if (gate) {
          gate.classList.remove('hidden');
          const q = document.getElementById('chatJoinQuestion');
          if (q) q.textContent = m.question
            ? ('Pertanyaan: ' + m.question)
            : (m.locked ? 'Ruang terkunci — minta izin bergabung' : 'Masuk ke ruang ini');
          const passIn = document.getElementById('chatJoinPass');
          if (passIn) passIn.classList.toggle('hidden', !m.hasPass);
        }
        if (compose) compose.classList.add('hidden');
      } else {
        if (gate) gate.classList.add('hidden');
        if (compose) compose.classList.remove('hidden');
      }
      // requests for members
      const box = document.getElementById('chatRequestsBox');
      if (box && isMember && m.type === 'room') {
        // handled by requests listener
      } else if (box) box.classList.add('hidden');
    });

    const onMsg = msgRef.limitToLast(MAX_MSGS).on('value', (snap) => {
      const box = document.getElementById('chatMessages');
      if (!box) return;
      const data = snap.val() || {};
      const arr = Object.keys(data).map(k => Object.assign({ id: k }, data[k])).sort((a, b) => (a.t || 0) - (b.t || 0));
      box.innerHTML = arr.map(msg => {
        const mine = msg.uid === myNetId;
        const time = msg.t ? new Date(msg.t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '';
        return `<div class="chat-msg ${mine ? 'mine' : 'other'}">
          ${mine ? '' : `<div class="msg-name">${escapeHtml(msg.name || '?')}</div>`}
          <div>${escapeHtml(msg.text || '')}</div>
          <div class="msg-time">${time}</div>
        </div>`;
      }).join('');
      box.scrollTop = box.scrollHeight;
      // prune old messages beyond MAX if owner
      if (activeChatMeta && activeChatMeta.ownerId === myNetId && arr.length > MAX_MSGS + 5) {
        const toDel = arr.slice(0, arr.length - MAX_MSGS);
        toDel.forEach(m => msgRef.child(m.id).remove().catch(() => {}));
      }
    });

    const onReq = reqRef.on('value', (snap) => {
      const box = document.getElementById('chatRequestsBox');
      if (!box || !activeChatMeta || !activeChatMeta.members || !activeChatMeta.members[myNetId]) {
        if (box) box.classList.add('hidden');
        return;
      }
      const data = snap.val() || {};
      const keys = Object.keys(data);
      if (!keys.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
      box.classList.remove('hidden');
      box.innerHTML = '<p style="font-size:12px;color:#ffd166;margin:0 0 6px">Permintaan bergabung:</p>' + keys.map(uid => {
        const r = data[uid];
        return `<div class="req-row" data-uid="${escapeHtml(uid)}">
          <span><strong>${escapeHtml(r.name || uid)}</strong>${r.answer ? ' · ' + escapeHtml(r.answer) : ''}</span>
          <button type="button" class="btn primary small req-ok">Izinkan</button>
          <button type="button" class="btn secondary small req-no">Tolak</button>
        </div>`;
      }).join('');
      box.querySelectorAll('.req-ok').forEach(btn => {
        btn.onclick = async () => {
          const uid = btn.closest('.req-row').dataset.uid;
          const r = data[uid];
          await metaRef.child('members/' + uid).set({ name: (r && r.name) || 'Player', joinedAt: Date.now() });
          await reqRef.child(uid).remove();
          await metaRef.update({ lastActivity: Date.now() });
        };
      });
      box.querySelectorAll('.req-no').forEach(btn => {
        btn.onclick = async () => {
          const uid = btn.closest('.req-row').dataset.uid;
          await reqRef.child(uid).remove();
        };
      });
    });

    activeChatUnsub = () => {
      metaRef.off('value', onMeta);
      msgRef.off('value', onMsg);
      reqRef.off('value', onReq);
    };
  }

  async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    if (!input || !activeChatId || !fbDb || !myNetId) return;
    const text = (input.value || '').trim();
    if (!text) return;
    input.value = '';
    const ref = fbDb.ref('chats/' + activeChatId);
    await ref.child('messages').push({
      uid: myNetId,
      name: getPlayerNameSafe(),
      text: text.slice(0, 280),
      t: Date.now()
    });
    await ref.update({ lastActivity: Date.now() });
  }

  async function requestJoinChat() {
    if (!activeChatId || !fbDb || !myNetId || !activeChatMeta) return;
    const ans = (document.getElementById('chatJoinAnswer') || {}).value || '';
    const pass = (document.getElementById('chatJoinPass') || {}).value || '';
    if (activeChatMeta.hasPass && activeChatMeta.password && pass !== activeChatMeta.password) {
      alert('Password salah.');
      return;
    }
    if (!activeChatMeta.locked && (!activeChatMeta.hasPass || pass === activeChatMeta.password)) {
      // langsung join
      await fbDb.ref('chats/' + activeChatId + '/members/' + myNetId).set({
        name: getPlayerNameSafe(), joinedAt: Date.now()
      });
      await fbDb.ref('chats/' + activeChatId).update({ lastActivity: Date.now() });
      return;
    }
    await fbDb.ref('chats/' + activeChatId + '/requests/' + myNetId).set({
      name: getPlayerNameSafe(),
      answer: ans.slice(0, 80),
      t: Date.now()
    });
    alert('Permintaan dikirim. Tunggu izin anggota yang sudah di dalam.');
  }

  async function createChatRoom() {
    if (!fbReady || !fbDb || !myNetId) return;
    const name = ((document.getElementById('newRoomName') || {}).value || '').trim() || 'Ruang Chat';
    const passOn = !!(document.getElementById('newRoomPassOn') || {}).checked;
    const pass = passOn ? ((document.getElementById('newRoomPass') || {}).value || '').trim() : '';
    const question = ((document.getElementById('newRoomQuestion') || {}).value || '').trim() || null;
    const id = 'room_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await fbDb.ref('chats/' + id).set({
      type: 'room',
      name: name.slice(0, 24),
      ownerId: myNetId,
      ownerName: getPlayerNameSafe(),
      locked: false,
      hasPass: !!pass,
      password: pass || null,
      question,
      lastActivity: Date.now(),
      members: { [myNetId]: { name: getPlayerNameSafe(), joinedAt: Date.now() } }
    });
    document.getElementById('chatCreateModal').classList.add('hidden');
    openChatRoom(id);
  }

  async function toggleLockChat() {
    if (!activeChatId || !activeChatMeta || activeChatMeta.ownerId !== myNetId) {
      // any member can lock for simplicity as requested
      if (!activeChatId || !activeChatMeta || !activeChatMeta.members || !activeChatMeta.members[myNetId]) return;
    }
    const next = !activeChatMeta.locked;
    await fbDb.ref('chats/' + activeChatId).update({ locked: next, lastActivity: Date.now() });
  }

  async function startPresence() {
    if (!fbReady || !fbDb || !myNetId) return;
    myCountry = await detectCountry();
    const pref = fbDb.ref('presence/' + myNetId);
    const write = () => {
      const nm = getPlayerNameSafe();
      if (!nm || nm === 'Player') return;
      pref.set({
        name: nm,
        country: myCountry,
        lastSeen: Date.now(),
        online: true
      }).catch(() => {});
    };
    write();
    pref.onDisconnect().remove();
    setInterval(write, 25000);
    playerNameInput && playerNameInput.addEventListener('change', write);

    presenceUnsub = fbDb.ref('presence').on('value', (snap) => {
      presenceMap = snap.val() || {};
      // prune stale (>2 min)
      const now = Date.now();
      Object.keys(presenceMap).forEach(uid => {
        if (now - (presenceMap[uid].lastSeen || 0) > 120000) {
          if (uid !== myNetId) delete presenceMap[uid];
        }
      });
      renderOnlineList();
    });

    chatsListUnsub = fbDb.ref('chats').on('value', (snap) => {
      const all = snap.val() || {};
      chatRoomsMap = {};
      const now = Date.now();
      Object.keys(all).forEach(id => {
        const c = all[id];
        if (!c) return;
        if (now - (c.lastActivity || 0) > DAY_MS) {
          // auto hapus ruang/DM idle > 1 hari (oleh client yang melihat)
          fbDb.ref('chats/' + id).remove().catch(() => {});
          return;
        }
        chatRoomsMap[id] = Object.assign({ id }, c);
      });
      renderRoomsList();
      renderDmList();
    });

    showChatFab(true);
  }

  // Wire UI
  (function wireChatUI() {
    const fab = document.getElementById('chatFab');
    const panel = document.getElementById('chatPanel');
    const closeBtn = document.getElementById('chatClose');
    if (fab) fab.onclick = () => openChatPanel(!(panel && panel.classList.contains('open')));
    if (closeBtn) closeBtn.onclick = () => openChatPanel(false);
    document.querySelectorAll('.chat-tab').forEach(t => {
      t.onclick = () => setChatTab(t.dataset.tab);
    });
    const back = document.getElementById('chatBack');
    if (back) back.onclick = () => setChatTab('online');
    const send = document.getElementById('chatSend');
    if (send) send.onclick = sendChatMessage;
    const input = document.getElementById('chatInput');
    if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChatMessage(); });
    const reqBtn = document.getElementById('btnRequestJoin');
    if (reqBtn) reqBtn.onclick = requestJoinChat;
    const lockBtn = document.getElementById('chatLockBtn');
    if (lockBtn) lockBtn.onclick = toggleLockChat;
    const createBtn = document.getElementById('btnCreateChatRoom');
    const modal = document.getElementById('chatCreateModal');
    if (createBtn && modal) createBtn.onclick = () => modal.classList.remove('hidden');
    const cancel = document.getElementById('btnCancelCreateRoom');
    if (cancel && modal) cancel.onclick = () => modal.classList.add('hidden');
    const confirm = document.getElementById('btnConfirmCreateRoom');
    if (confirm) confirm.onclick = createChatRoom;
    const passOn = document.getElementById('newRoomPassOn');
    const passIn = document.getElementById('newRoomPass');
    if (passOn && passIn) passOn.onchange = () => passIn.classList.toggle('hidden', !passOn.checked);
  })();


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
    startPresence();
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

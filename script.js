/**
 * Monmon Shatter Online
 * Created by Muhammad Rizki Azri Mulyana
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
  let heartbeatTimer = null, roomsPollTimer = null;

  if (requireCodeEl) {
    requireCodeEl.addEventListener('change', () => {
      customCodeWrap.classList.toggle('hidden', !requireCodeEl.checked);
    });
  }

  function apiBase() {
    return String(window.MONMON_API || '').trim().replace(/\/$/, '');
  }
  async function apiGet(action, extra) {
    const base = apiBase();
    if (!base) throw new Error('API kosong');
    const params = new URLSearchParams(Object.assign({ action }, extra || {}));
    const res = await fetch(base + '?' + params.toString(), { cache: 'no-store' });
    return res.json();
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
    return n || ('Player' + Math.floor(Math.random() * 900 + 100));
  }

  function startHeartbeat() {
    stopHeartbeat();
    const beat = () => {
      if (!roomCode || !apiBase()) return;
      apiGet('heartbeat', {
        roomId: roomCode,
        status: isRunning ? 'playing' : 'waiting',
        players: Math.max(1, roster.length)
      }).catch(() => {});
    };
    beat();
    heartbeatTimer = setInterval(beat, 4000);
  }
  function stopHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  function renderPublicRooms(list) {
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
      roomCodeInput.value = btn.dataset.id;
      roomCodeInput.focus();
    });
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
  const sfxBrick = () => playTone(480, 0.07, 'triangle', 0.08);
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
    if (!isPeerLive()) return false;
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
    if (!isPeerLive()) {
      roomStatusEl.textContent = isHost ? 'Menunggu pemain join...' : 'Menghubungkan ke host...';
    } else if (guests < 1) {
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
    liveScoresEl.innerHTML = roster.map(p => `${escapeHtml(p.name)}:${p.score}`).join(' · ');
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
      case 'score': {
        const p = roster.find(x => x.id === data.id);
        if (p) p.score = data.score;
        renderLiveScores();
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

    const p = makePeer();
    p.on('open', async (id) => {
      myPeerId = id;
      if (!apiBase()) {
        roomCode = custom || id.slice(-6).toUpperCase();
        displayRoomCode.textContent = roomCode;
        copyCodeInput.value = roomCode;
        roomHint.textContent = 'Server belum siap. Deploy Apps Script dulu.';
        return;
      }
      try {
        const created = await apiGet('create', {
          hostName: myName,
          peerId: id,
          requiresCode: roomRequiresCode ? '1' : '0',
          allowGuestStart: allowGuestStart ? '1' : '0',
          customCode: custom
        });
        if (!created.ok) throw new Error(created.error || 'gagal');
        roomCode = created.roomId;
        displayRoomCode.textContent = roomCode;
        copyCodeInput.value = roomCode;
        roomHint.textContent = roomRequiresCode
          ? 'Room privat. Copy kode lalu kirim ke teman.'
          : 'Room publik. Laptop lain akan melihat room ini.';
        startHeartbeat();
        refreshLobby();
      } catch (err) {
        roomStatusEl.textContent = 'Gagal daftar room: ' + err.message;
      }
    });
    p.on('connection', (c) => {
      if (roster.length >= MAX_PLAYERS) { c.close(); return; }
      bindConn(c, true);
    });
    p.on('error', (err) => { roomStatusEl.textContent = 'Error: ' + err.type; });
  }

  function joinRoom() {
    const code = (roomCodeInput.value || '').trim().toUpperCase();
    if (!code) { alert('Isi kode room.'); return; }
    joinByRoomId(code, code);
  }

  async function joinByRoomId(roomId, code) {
    myName = getPlayerName();
    isMultiplayer = true; isHost = false;
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
        roomHint.textContent = 'Menghubungkan ke ' + (info.hostName || 'host') + '...';
        roomStatusEl.textContent = 'Menghubungkan ke host. Jangan klik Mulai dulu.';
        btnStartMatch.disabled = true;
      } catch (e) {
        roomStatusEl.textContent = 'Gagal cek room. Deploy ulang script.';
        return;
      }
    }

    const p = makePeer();
    p.on('open', () => bindConn(p.connect(peerId, { reliable: true }), false));
    p.on('error', (err) => { roomStatusEl.textContent = 'Gagal join: ' + err.type; });
  }

  function resizeCanvas() {
    const box = document.getElementById('game-container');
    const hud = document.getElementById('hud');
    if (!box || !hud) return;
    const w = Math.min(box.clientWidth || 400, 520);
    const h = Math.max(260, (box.clientHeight || 600) - hud.offsetHeight - (IS_MOBILE ? 22 : 0));
    canvas.width = w;
    canvas.height = h;
    paddle.y = canvas.height - 28;
  }

  function createBricks(levelIndex) {
    bricks = [];
    const level = gameData.levels[levelIndex];
    const pattern = level.pattern;
    const rows = pattern.length, cols = pattern[0].length;
    const pad = settings.brickPadding;
    const avail = canvas.width - settings.brickOffsetLeft * 2;
    const bw = (avail - pad * (cols - 1)) / cols;
    const bh = IS_MOBILE ? 18 : 20;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const typeId = pattern[r][c];
        if (!typeId) continue;
        const type = gameData.brickTypes[String(typeId)];
        bricks.push({
          x: settings.brickOffsetLeft + c * (bw + pad),
          y: settings.brickOffsetTop + r * (bh + pad),
          width: bw, height: bh, color: type.color, points: type.points, hp: type.hp, maxHp: type.hp
        });
      }
    }
  }

  function resetBallAndPaddle() {
    const scale = canvas.width / 400;
    paddle.width = settings.paddleWidth * scale;
    paddle.height = settings.paddleHeight;
    paddle.speed = settings.paddleSpeed * (IS_MOBILE ? 1.15 : 1);
    paddle.x = canvas.width / 2 - paddle.width / 2;
    paddle.y = canvas.height - 28;
    ball.radius = settings.ballRadius;
    ball.x = canvas.width / 2;
    ball.y = paddle.y - ball.radius - 3;
    const level = gameData.levels[currentLevel];
    ball.speed = (level.ballSpeed || settings.ballSpeed) * scale;
    const angle = (Math.random() * 0.6 - 0.3) - Math.PI / 2;
    ball.dx = Math.cos(angle) * ball.speed;
    ball.dy = Math.sin(angle) * ball.speed;
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
    if (me) me.score = score;
    renderLiveScores();
    if (isMultiplayer) sendAll({ type: 'score', id: myNetId, score });
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

  function update(dt) {
    if (!isRunning || isPaused) return;
    const step = Math.min(dt, 32) / 16.67;
    if (rightPressed) paddle.x += paddle.speed * step;
    if (leftPressed) paddle.x -= paddle.speed * step;
    paddle.x = Math.max(0, Math.min(canvas.width - paddle.width, paddle.x));
    ball.x += ball.dx * step;
    ball.y += ball.dy * step;

    if (ball.x - ball.radius < 0) { ball.x = ball.radius; ball.dx = -ball.dx; sfxWall(); }
    else if (ball.x + ball.radius > canvas.width) { ball.x = canvas.width - ball.radius; ball.dx = -ball.dx; sfxWall(); }
    if (ball.y - ball.radius < 0) { ball.y = ball.radius; ball.dy = -ball.dy; sfxWall(); }

    if (ball.y - ball.radius > canvas.height) {
      lives--; updateHUD(); sfxLife();
      if (lives <= 0) { playerFinished(); return; }
      resetBallAndPaddle();
      isPaused = true; setTimeout(() => isPaused = false, 400);
      return;
    }

    if (ball.y + ball.radius >= paddle.y && ball.dy > 0 &&
        ball.x >= paddle.x && ball.x <= paddle.x + paddle.width) {
      const hitPos = (ball.x - (paddle.x + paddle.width/2)) / (paddle.width/2);
      const angle = -Math.PI/2 + hitPos * (Math.PI/3);
      ball.dx = Math.cos(angle) * ball.speed;
      ball.dy = Math.sin(angle) * ball.speed;
      ball.y = paddle.y - ball.radius - 1;
      sfxPaddle();
    }

    for (let i = bricks.length-1; i >= 0; i--) {
      const brick = bricks[i];
      if (collideBallBrick(ball, brick)) {
        const prevX = ball.x - ball.dx;
        if (prevX < brick.x || prevX > brick.x + brick.width) ball.dx = -ball.dx;
        else ball.dy = -ball.dy;
        brick.hp--; sfxBrick();
        if (!IS_MOBILE) spawnParticles(brick.x + brick.width/2, brick.y + brick.height/2, brick.color);
        if (brick.hp <= 0) { score += brick.points; bricks.splice(i,1); updateHUD(); }
        else brick.color = shadeColor(brick.color, -35);
        break;
      }
    }
    if (bricks.length === 0) { levelComplete(); return; }
    for (let i = particles.length-1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.dx; p.y += p.dy; p.life--;
      if (p.life <= 0) particles.splice(i,1);
    }
  }

  function draw() {
    ctx.fillStyle = '#0c0c0c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.shadowBlur = 0;
    bricks.forEach(brick => {
      ctx.fillStyle = brick.color;
      ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
    });
    ctx.fillStyle = '#e63946';
    ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
    ctx.fillStyle = '#2a9d8f';
    ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI*2); ctx.fill();
    if (!IS_MOBILE) {
      particles.forEach(p => {
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      });
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = 'rgba(42,157,143,.55)';
    ctx.font = '12px Rajdhani';
    ctx.fillText('LEVEL ' + (currentLevel+1), 8, 14);
  }

  function loop(ts) {
    const dt = lastTs ? (ts - lastTs) : 16;
    lastTs = ts;
    update(dt);
    draw();
    animationId = requestAnimationFrame(loop);
  }

  function startSolo() {
    myName = getPlayerName();
    isMultiplayer = false; roster = [];
    if (apiBase()) apiGet('play').then(setStats).catch(()=>{});
    showScreen('game');
    myNameHud.textContent = myName;
    score = 0; lives = settings.lives; currentLevel = 0;
    gameOverOverlay.classList.add('hidden');
    levelUpOverlay.classList.add('hidden');
    resizeCanvas(); startLevel(0);
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
    roster.forEach(p => { p.score = 0; p.finished = false; });
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
      finalResults.innerHTML = roster.map(p => `<p>${escapeHtml(p.name)}: <strong>${p.score}</strong> ${p.finished?'✓':''}</p>`).join('');
      gameOverOverlay.classList.remove('hidden');
    }
  }
  function endMatch() {
    isRunning = false;
    goTitle.textContent = 'HASIL AKHIR';
    if (isMultiplayer && roster.length) {
      const sorted = roster.slice().sort((a,b)=>b.score-a.score);
      const top = sorted[0];
      finalResults.innerHTML = `<div class="winner">${escapeHtml(top.name)} MENANG!</div>` +
        sorted.map(p => `<p>${escapeHtml(p.name)}: <strong>${p.score}</strong></p>`).join('');
    } else {
      finalResults.innerHTML = `<p>Score akhir: <strong>${score}</strong></p>`;
    }
    gameOverOverlay.classList.remove('hidden');
  }

  function leaveAll() {
    if (isHost && roomCode && apiBase()) apiGet('close', { roomId: roomCode }).catch(()=>{});
    stopHeartbeat();
    hostConns.forEach(c => { try { c.close(); } catch(e){} });
    if (guestConn) try { guestConn.close(); } catch(e){}
    if (peer) try { peer.destroy(); } catch(e){}
    peer = null; hostConns = []; guestConn = null;
    isRunning = false;
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
    paddle.x = (clientX - rect.left) * (canvas.width / rect.width) - paddle.width / 2;
    paddle.x = Math.max(0, Math.min(canvas.width - paddle.width, paddle.x));
  }
  canvas.addEventListener('mousemove', e => pointerMove(e.clientX));
  canvas.addEventListener('touchmove', e => { e.preventDefault(); if (e.touches[0]) pointerMove(e.touches[0].clientX); }, {passive:false});
  canvas.addEventListener('touchstart', e => { e.preventDefault(); if (e.touches[0]) pointerMove(e.touches[0].clientX); }, {passive:false});

  btnSolo.onclick = () => { if (audioCtx.state==='suspended') audioCtx.resume(); startSolo(); };
  btnCreate.onclick = () => { if (audioCtx.state==='suspended') audioCtx.resume(); createRoom(); };
  btnJoin.onclick = () => { if (audioCtx.state==='suspended') audioCtx.resume(); joinRoom(); };
  btnStartMatch.onclick = () => {
    if (!canClickStart()) {
      roomStatusEl.textContent = 'Tunggu sampai semua pemain tampil di daftar dulu.';
      return;
    }
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
    } else startSolo();
  };
  backLobbyBtn.onclick = leaveAll;
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
    const saved = localStorage.getItem('monmon_name');
    if (saved) playerNameInput.value = saved;
    playerNameInput.addEventListener('change', () => localStorage.setItem('monmon_name', playerNameInput.value.trim()));
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
  init();
})();

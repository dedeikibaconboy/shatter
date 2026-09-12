/**
 * Monmon Shatter Online
 * Multiplayer Brick Breaker
 * Created by Muhammad Rizki Azri Mulyana
 * Brand: Red • Green • Black
 *
 * Multiplayer: PeerJS (P2P) Race Mode
 * Both players play the same levels independently.
 * Scores sync live. Highest score wins.
 */

(() => {
  // ========== DOM ==========
  const lobbyEl = document.getElementById('lobby');
  const roomEl = document.getElementById('room');
  const gameScreenEl = document.getElementById('game-screen');
  const playerNameInput = document.getElementById('playerName');
  const roomCodeInput = document.getElementById('roomCode');
  const btnSolo = document.getElementById('btn-solo');
  const btnCreate = document.getElementById('btn-create');
  const btnJoin = document.getElementById('btn-join');
  const btnStartMatch = document.getElementById('btn-start-match');
  const btnLeave = document.getElementById('btn-leave');
  const displayRoomCode = document.getElementById('displayRoomCode');
  const playersListEl = document.getElementById('playersList');
  const roomStatusEl = document.getElementById('roomStatus');

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const livesEl = document.getElementById('lives');
  const myNameHud = document.getElementById('myNameHud');
  const oppNameHud = document.getElementById('oppNameHud');
  const myLiveScore = document.getElementById('myLiveScore');
  const oppLiveScore = document.getElementById('oppLiveScore');

  const overlay = document.getElementById('overlay');
  const levelUpOverlay = document.getElementById('level-up');
  const gameOverOverlay = document.getElementById('game-over');
  const nextLevelBtn = document.getElementById('next-level-btn');
  const restartBtn = document.getElementById('restart-btn');
  const backLobbyBtn = document.getElementById('back-lobby-btn');
  const goTitle = document.getElementById('go-title');
  const finalResults = document.getElementById('final-results');
  const levelMessage = document.getElementById('level-message');

  // ========== STATE ==========
  let gameData = null;
  let settings = null;
  let currentLevel = 0;
  let score = 0;
  let lives = 3;
  let bricks = [];
  let paddle = { x: 0, y: 0, width: 90, height: 14, speed: 8 };
  let ball = { x: 0, y: 0, radius: 8, dx: 0, dy: 0, speed: 5.2 };
  let rightPressed = false;
  let leftPressed = false;
  let isRunning = false;
  let isPaused = false;
  let animationId = null;
  let particles = [];

  // Multiplayer
  let myName = 'Player';
  let isHost = false;
  let isMultiplayer = false;
  let peer = null;
  let conn = null;
  let myPeerId = null;
  let opponent = { name: 'Lawan', score: 0, finished: false };
  let roomCode = '';
  let roomRequiresCode = false;
  let heartbeatTimer = null;
  let roomsPollTimer = null;
  const requireCodeEl = document.getElementById('requireCode');
  const publicRoomsEl = document.getElementById('publicRooms');
  const apiWarnEl = document.getElementById('apiWarn');
  const copyRow = document.getElementById('copyRow');
  const copyCodeInput = document.getElementById('copyCodeInput');
  const btnCopy = document.getElementById('btn-copy');
  const roomHint = document.getElementById('roomHint');

  function apiBase() {
    return (window.MONMON_API || '').replace(/\/$/, '');
  }

  async function apiGet(action, extra) {
    const base = apiBase();
    if (!base) throw new Error('API belum disetting');
    const params = new URLSearchParams(Object.assign({ action: action }, extra || {}));
    const res = await fetch(base + '?' + params.toString());
    return res.json();
  }

  function setStats(s) {
    if (!s) return;
    document.getElementById('statVisits').textContent = s.visits ?? '—';
    document.getElementById('statPlays').textContent = s.plays ?? '—';
    document.getElementById('statRooms').textContent = s.roomsOnline ?? '—';
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (!roomCode || !apiBase()) return;
      apiGet('heartbeat', {
        roomId: roomCode,
        status: isRunning ? 'playing' : 'waiting',
        players: (opponent.name && opponent.name !== 'Lawan') ? 2 : 1
      }).catch(() => {});
    }, 8000);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  function renderPublicRooms(list) {
    if (!publicRoomsEl) return;
    if (!list || !list.length) {
      publicRoomsEl.innerHTML = '<p class="muted">Belum ada room online. Buat room pertama!</p>';
      return;
    }
    publicRoomsEl.innerHTML = list.map(r => {
      const lock = r.requiresCode ? '🔒 Butuh kode' : '🌍 Publik';
      const canQuick = !r.requiresCode;
      return `<div class="room-item">
        <div class="meta">
          <div class="host-name">${escapeHtml(r.hostName)}</div>
          <div class="lock">${lock} · ${escapeHtml(r.status)}</div>
        </div>
        ${canQuick
          ? `<button class="btn primary js-quick-join" data-id="${escapeHtml(r.roomId)}">Join</button>`
          : `<button class="btn secondary js-need-code" data-id="${escapeHtml(r.roomId)}">Isi Kode</button>`}
      </div>`;
    }).join('');

    publicRoomsEl.querySelectorAll('.js-quick-join').forEach(btn => {
      btn.addEventListener('click', () => joinByRoomId(btn.dataset.id, ''));
    });
    publicRoomsEl.querySelectorAll('.js-need-code').forEach(btn => {
      document.getElementById('roomCode').value = btn.dataset.id;
      document.getElementById('roomCode').focus();
    });
  }

  async function refreshLobby() {
    if (!apiBase()) {
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
      publicRoomsEl.innerHTML = '<p class="muted">Gagal memuat room. Cek SETUP.md</p>';
    }
  }

  // ========== AUDIO ==========
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  function playTone(freq, duration, type = 'square', volume = 0.08) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
  }
  function sfxPaddle() { playTone(220, 0.08, 'square', 0.06); }
  function sfxBrick()  { playTone(440 + Math.random()*200, 0.1, 'triangle', 0.09); }
  function sfxWall()   { playTone(180, 0.07, 'sine', 0.05); }
  function sfxLife()   { playTone(120, 0.3, 'sawtooth', 0.1); }
  function sfxWin()    { [523,659,784].forEach((f,i)=>setTimeout(()=>playTone(f,0.2,'triangle',0.1), i*120)); }
  function sfxLose()   { playTone(90, 0.5, 'sawtooth', 0.12); }

  // ========== LOAD ==========
  async function loadData() {
    try {
      const res = await fetch('levels.json');
      gameData = await res.json();
      settings = gameData.settings;
    } catch (e) {
      gameData = {
        levels: [{ level: 1, name: "Fallback", ballSpeed: 5,
          pattern: [[1,1,1,1,1,1,1,1],[2,2,2,2,2,2,2,2],[3,3,3,3,3,3,3,3]] }],
        brickTypes: {
          "0": {color:null,points:0,hp:0},
          "1": {color:"#e63946",points:10,hp:1},
          "2": {color:"#2a9d8f",points:20,hp:1},
          "3": {color:"#ff9f1c",points:30,hp:2}
        }
      };
      settings = { paddleWidth:90, paddleHeight:14, ballRadius:8, ballSpeed:5.2, paddleSpeed:8, lives:3,
        brickRows:6, brickCols:8, brickPadding:4, brickOffsetTop:50, brickOffsetLeft:20 };
    }
  }

  // ========== SCREENS ==========
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

  function escapeHtml(t) {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
  }

  // ========== PEERJS ==========
  function setupConnection(connection, asHost) {
    conn = connection;
    isHost = asHost;

    conn.on('open', () => {
      roomStatusEl.textContent = 'Terhubung dengan lawan!';
      if (isHost) send({ type: 'hello', name: myName });
      updatePlayersList();
      btnStartMatch.disabled = !isHost ? true : false;
      if (!isHost) btnStartMatch.disabled = true; // only host can start
    });

    conn.on('data', (data) => handleNetworkMessage(data));

    conn.on('close', () => {
      roomStatusEl.textContent = 'Lawan terputus.';
      opponent = { name: 'Lawan', score: 0, finished: false };
      updatePlayersList();
      btnStartMatch.disabled = true;
      if (isRunning) endMatch('Lawan keluar dari permainan.');
    });
  }

  function send(data) {
    if (conn && conn.open) {
      try { conn.send(data); } catch (e) {}
    }
  }

  function handleNetworkMessage(data) {
    switch (data.type) {
      case 'hello':
        opponent.name = data.name || 'Lawan';
        if (!isHost) send({ type: 'hello', name: myName });
        updatePlayersList();
        roomStatusEl.textContent = 'Siap tanding! (Host yang mulai)';
        if (isHost) btnStartMatch.disabled = false;
        break;
      case 'start':
        if (!isHost) startMultiplayerMatch();
        break;
      case 'score':
        opponent.score = data.score || 0;
        oppLiveScore.textContent = opponent.score;
        break;
      case 'finished':
        opponent.finished = true;
        opponent.score = data.score || opponent.score;
        checkBothFinished();
        break;
    }
  }

  function updatePlayersList() {
    let html = `<div class="player-row host">
      <span class="name">${escapeHtml(myName)} (Kamu)</span>
      <span class="badge">${isHost ? 'HOST' : 'GUEST'}</span>
    </div>`;
    if (opponent.name && opponent.name !== 'Lawan') {
      html += `<div class="player-row">
        <span class="name">${escapeHtml(opponent.name)}</span>
        <span class="badge">JOINED</span>
      </div>`;
    } else {
      html += `<div class="player-row" style="opacity:0.5"><span class="name">Menunggu lawan...</span></div>`;
    }
    playersListEl.innerHTML = html;
  }

  function createRoom() {
    myName = getPlayerName();
    isMultiplayer = true;
    isHost = true;
    roomRequiresCode = !!(requireCodeEl && requireCodeEl.checked);
    opponent = { name: 'Lawan', score: 0, finished: false };

    showScreen('room');
    displayRoomCode.textContent = '....';
    roomStatusEl.textContent = 'Membuat room...';
    playersListEl.innerHTML = '';
    btnStartMatch.disabled = true;
    copyRow.classList.add('hidden');

    if (peer) try { peer.destroy(); } catch(e){}
    peer = new Peer({
      debug: 0,
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
    });

    peer.on('open', async (id) => {
      myPeerId = id;
      updatePlayersList();
      if (!apiBase()) {
        roomCode = id.slice(-6).toUpperCase();
        displayRoomCode.textContent = roomCode;
        roomHint.textContent = 'Server belum disetting. Teman harus join pakai Peer ID panjang.';
        copyRow.classList.remove('hidden');
        copyCodeInput.value = id;
        roomStatusEl.textContent = 'Room lokal saja. Isi config.js agar terlihat dunia.';
        return;
      }
      try {
        const created = await apiGet('create', {
          hostName: myName,
          peerId: id,
          requiresCode: roomRequiresCode ? '1' : '0'
        });
        if (!created.ok) throw new Error(created.error || 'gagal create');
        roomCode = created.roomId;
        displayRoomCode.textContent = roomCode;
        if (roomRequiresCode) {
          roomHint.textContent = 'Room privat. Bagikan kode ini ke teman.';
          copyRow.classList.remove('hidden');
          copyCodeInput.value = roomCode;
        } else {
          roomHint.textContent = 'Room publik. Pemain lain di dunia bisa lihat & join.';
          copyRow.classList.remove('hidden');
          copyCodeInput.value = roomCode;
        }
        roomStatusEl.textContent = 'Menunggu lawan...';
        startHeartbeat();
      } catch (err) {
        roomStatusEl.textContent = 'Gagal daftar room: ' + err.message;
      }
    });

    peer.on('connection', (connection) => {
      if (conn && conn.open) { connection.close(); return; }
      setupConnection(connection, true);
    });

    peer.on('error', (err) => {
      roomStatusEl.textContent = 'Error: ' + err.type;
    });
  }

  function joinRoom() {
    const code = (roomCodeInput.value || '').trim().toUpperCase();
    if (!code) {
      alert('Isi kode room dulu.');
      return;
    }
    joinByRoomId(code, code);
  }

  async function joinByRoomId(roomId, code) {
    myName = getPlayerName();
    isMultiplayer = true;
    isHost = false;
    opponent = { name: 'Lawan', score: 0, finished: false };
    roomCode = roomId;

    showScreen('room');
    displayRoomCode.textContent = roomId;
    copyRow.classList.add('hidden');
    roomHint.textContent = 'Menghubungkan ke host...';
    roomStatusEl.textContent = 'Menghubungkan...';
    updatePlayersList();
    btnStartMatch.disabled = true;

    let peerId = roomId;
    if (apiBase()) {
      try {
        const info = await apiGet('joininfo', { roomId: roomId, code: code || roomId });
        if (!info.ok) {
          roomStatusEl.textContent = info.error || 'Gagal join';
          return;
        }
        peerId = info.peerId;
        opponent.name = info.hostName || 'Lawan';
        updatePlayersList();
      } catch (e) {
        roomStatusEl.textContent = 'Gagal cek room. Cek koneksi / SETUP.md';
        return;
      }
    }

    if (peer) try { peer.destroy(); } catch(e){}
    peer = new Peer({
      debug: 0,
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
    });

    peer.on('open', () => {
      const connection = peer.connect(peerId, { reliable: true });
      setupConnection(connection, false);
    });

    peer.on('error', (err) => {
      roomStatusEl.textContent = 'Gagal join: ' + err.type + '. Pastikan host masih online.';
    });
  }

  // ========== GAME ENGINE ==========
  function resizeCanvas() {
    const container = document.getElementById('game-container');
    const hud = document.getElementById('hud');
    if (!container || !hud) return;
    const maxW = Math.min(container.clientWidth || 400, 480);
    const maxH = (container.clientHeight || 600) - hud.offsetHeight;
    canvas.width = maxW;
    canvas.height = Math.max(280, maxH);
    if (paddle) {
      paddle.y = canvas.height - 30;
      paddle.x = Math.min(paddle.x, canvas.width - paddle.width);
    }
  }

  function createBricks(levelIndex) {
    bricks = [];
    const level = gameData.levels[levelIndex];
    const pattern = level.pattern;
    const rows = pattern.length;
    const cols = pattern[0].length;
    const totalPadding = settings.brickPadding * (cols - 1);
    const availableWidth = canvas.width - settings.brickOffsetLeft * 2;
    const brickWidth = (availableWidth - totalPadding) / cols;
    const brickHeight = 20;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const typeId = pattern[r][c];
        if (typeId === 0) continue;
        const type = gameData.brickTypes[String(typeId)];
        bricks.push({
          x: settings.brickOffsetLeft + c * (brickWidth + settings.brickPadding),
          y: settings.brickOffsetTop + r * (brickHeight + settings.brickPadding),
          width: brickWidth, height: brickHeight,
          typeId, color: type.color, points: type.points, hp: type.hp, maxHp: type.hp
        });
      }
    }
  }

  function resetBallAndPaddle() {
    const scale = canvas.width / 400;
    paddle.width = settings.paddleWidth * scale;
    paddle.height = settings.paddleHeight;
    paddle.speed = settings.paddleSpeed;
    paddle.x = canvas.width / 2 - paddle.width / 2;
    paddle.y = canvas.height - 30;

    ball.radius = settings.ballRadius;
    ball.x = canvas.width / 2;
    ball.y = paddle.y - ball.radius - 4;

    const level = gameData.levels[currentLevel];
    ball.speed = (level.ballSpeed || settings.ballSpeed) * scale;
    const angle = (Math.random() * 0.7 - 0.35) - Math.PI / 2;
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
    myLiveScore.textContent = score;
    livesEl.textContent = '♥ '.repeat(Math.max(0, lives)).trim() || '—';
    if (isMultiplayer) send({ type: 'score', score });
  }

  function spawnParticles(x, y, color, count = 7) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x, y, dx: (Math.random()-0.5)*6, dy: (Math.random()-0.5)*6,
        life: 25+Math.random()*20, maxLife: 45, color, size: 2+Math.random()*3
      });
    }
  }

  function updateParticles() {
    for (let i = particles.length-1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.dx; p.y += p.dy; p.dy += 0.14; p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function collideBallBrick(b, brick) {
    const cx = Math.max(brick.x, Math.min(b.x, brick.x + brick.width));
    const cy = Math.max(brick.y, Math.min(b.y, brick.y + brick.height));
    return (b.x-cx)**2 + (b.y-cy)**2 < b.radius**2;
  }

  function update() {
    if (!isRunning || isPaused) return;

    if (rightPressed) paddle.x += paddle.speed;
    if (leftPressed) paddle.x -= paddle.speed;
    paddle.x = Math.max(0, Math.min(canvas.width - paddle.width, paddle.x));

    ball.x += ball.dx;
    ball.y += ball.dy;

    if (ball.x - ball.radius < 0) { ball.x = ball.radius; ball.dx = -ball.dx; sfxWall(); }
    else if (ball.x + ball.radius > canvas.width) { ball.x = canvas.width - ball.radius; ball.dx = -ball.dx; sfxWall(); }
    if (ball.y - ball.radius < 0) { ball.y = ball.radius; ball.dy = -ball.dy; sfxWall(); }

    if (ball.y - ball.radius > canvas.height) {
      lives--;
      updateHUD();
      sfxLife();
      if (lives <= 0) { playerFinished(); return; }
      resetBallAndPaddle();
      isPaused = true;
      setTimeout(() => isPaused = false, 550);
      return;
    }

    if (ball.y + ball.radius >= paddle.y && ball.y - ball.radius <= paddle.y + paddle.height &&
        ball.x >= paddle.x && ball.x <= paddle.x + paddle.width && ball.dy > 0) {
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
        brick.hp--;
        sfxBrick();
        spawnParticles(brick.x + brick.width/2, brick.y + brick.height/2, brick.color);
        if (brick.hp <= 0) {
          score += brick.points;
          bricks.splice(i, 1);
          updateHUD();
        } else {
          brick.color = shadeColor(brick.color, -40);
        }
        break;
      }
    }

    if (bricks.length === 0) { levelComplete(); return; }
    updateParticles();
  }

  function shadeColor(color, percent) {
    const num = parseInt(color.replace('#',''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, Math.min(255, (num >> 16) + amt));
    const G = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amt));
    const B = Math.max(0, Math.min(255, (num & 0xff) + amt));
    return `#${(0x1000000 + R*0x10000 + G*0x100 + B).toString(16).slice(1)}`;
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    bricks.forEach(brick => {
      ctx.shadowColor = brick.color; ctx.shadowBlur = 8;
      ctx.fillStyle = brick.color;
      roundRect(ctx, brick.x, brick.y, brick.width, brick.height, 4);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      roundRect(ctx, brick.x+2, brick.y+2, brick.width-4, brick.height/3, 2);
      ctx.fill();
      if (brick.maxHp > 1 && brick.hp < brick.maxHp) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        roundRect(ctx, brick.x, brick.y, brick.width, brick.height, 4);
        ctx.fill();
      }
    });

    ctx.shadowColor = '#e63946'; ctx.shadowBlur = 12;
    const grad = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.height);
    grad.addColorStop(0, '#ff6b6b'); grad.addColorStop(0.5, '#e63946'); grad.addColorStop(1, '#b71c1c');
    ctx.fillStyle = grad;
    roundRect(ctx, paddle.x, paddle.y, paddle.width, paddle.height, 7);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    roundRect(ctx, paddle.x+4, paddle.y+2, paddle.width-8, 4, 3);
    ctx.fill();

    ctx.shadowColor = '#00e676'; ctx.shadowBlur = 14;
    const bg = ctx.createRadialGradient(ball.x-2, ball.y-2, 1, ball.x, ball.y, ball.radius);
    bg.addColorStop(0, '#a7ffeb'); bg.addColorStop(0.6, '#2a9d8f'); bg.addColorStop(1, '#1a7a6d');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;

    particles.forEach(p => {
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (p.life/p.maxLife), 0, Math.PI*2); ctx.fill();
    });
    ctx.globalAlpha = 1;

    if (isRunning) {
      ctx.fillStyle = 'rgba(42,157,143,0.5)';
      ctx.font = '12px Rajdhani';
      ctx.textAlign = 'left';
      ctx.fillText('LEVEL ' + (currentLevel+1), 10, 16);
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.lineTo(x+w-r, y);
    ctx.quadraticCurveTo(x+w, y, x+w, y+r);
    ctx.lineTo(x+w, y+h-r);
    ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    ctx.lineTo(x+r, y+h);
    ctx.quadraticCurveTo(x, y+h, x, y+h-r);
    ctx.lineTo(x, y+r);
    ctx.quadraticCurveTo(x, y, x+r, y);
    ctx.closePath();
  }

  function loop() {
    update();
    draw();
    animationId = requestAnimationFrame(loop);
  }

  // ========== FLOW ==========
  function startSolo() {
    myName = getPlayerName();
    isMultiplayer = false;
    if (apiBase()) apiGet('play').then(setStats).catch(() => {});
    showScreen('game');
    myNameHud.textContent = myName;
    oppNameHud.textContent = '—';
    oppLiveScore.textContent = '—';
    score = 0; lives = settings.lives; currentLevel = 0;
    gameOverOverlay.classList.add('hidden');
    levelUpOverlay.classList.add('hidden');
    resizeCanvas();
    startLevel(0);
    isRunning = true; isPaused = false;
    if (!animationId) loop();
  }

  function startMultiplayerMatch() {
    if (apiBase()) apiGet('play').then(setStats).catch(() => {});
    showScreen('game');
    myNameHud.textContent = myName;
    oppNameHud.textContent = opponent.name;
    myLiveScore.textContent = '0';
    oppLiveScore.textContent = '0';
    score = 0; lives = settings.lives; currentLevel = 0;
    opponent.score = 0; opponent.finished = false;
    gameOverOverlay.classList.add('hidden');
    levelUpOverlay.classList.add('hidden');
    resizeCanvas();
    startLevel(0);
    isRunning = true; isPaused = false;
    if (!animationId) loop();
  }

  function levelComplete() {
    isRunning = false;
    sfxWin();
    if (currentLevel >= gameData.levels.length - 1) {
      playerFinished();
    } else {
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
      send({ type: 'finished', score });
      if (opponent.finished) {
        endMatch();
      } else {
        goTitle.textContent = 'Menunggu lawan selesai...';
        finalResults.innerHTML = `<p>Score kamu: <strong>${score}</strong></p><p>Menunggu ${escapeHtml(opponent.name)}...</p>`;
        gameOverOverlay.classList.remove('hidden');
      }
    } else {
      endMatch();
    }
  }

  function checkBothFinished() {
    if (opponent.finished) endMatch();
  }

  function endMatch(msg) {
    isRunning = false;
    sfxLose();
    goTitle.textContent = 'HASIL AKHIR';
    let html = '';
    if (isMultiplayer) {
      const myWin = score > opponent.score;
      const draw = score === opponent.score;
      html = `<div class="winner">${draw ? 'SERI!' : (myWin ? 'KAMU MENANG!' : escapeHtml(opponent.name) + ' MENANG!')}</div>
        <p>${escapeHtml(myName)}: <strong>${score}</strong></p>
        <p>${escapeHtml(opponent.name)}: <strong>${opponent.score}</strong></p>`;
    } else {
      html = `<p>Score akhir: <strong>${score}</strong></p>`;
    }
    if (msg) html = `<p>${msg}</p>` + html;
    finalResults.innerHTML = html;
    gameOverOverlay.classList.remove('hidden');
  }

  // ========== INPUT ==========
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
    const scaleX = canvas.width / rect.width;
    paddle.x = (clientX - rect.left) * scaleX - paddle.width / 2;
    paddle.x = Math.max(0, Math.min(canvas.width - paddle.width, paddle.x));
  }
  canvas.addEventListener('mousemove', e => pointerMove(e.clientX));
  canvas.addEventListener('touchmove', e => { e.preventDefault(); if (e.touches[0]) pointerMove(e.touches[0].clientX); }, {passive:false});
  canvas.addEventListener('touchstart', e => { e.preventDefault(); if (e.touches[0]) pointerMove(e.touches[0].clientX); }, {passive:false});

  // ========== BUTTONS ==========
  btnSolo.addEventListener('click', () => { if (audioCtx.state==='suspended') audioCtx.resume(); startSolo(); });
  btnCreate.addEventListener('click', () => { if (audioCtx.state==='suspended') audioCtx.resume(); createRoom(); });
  btnJoin.addEventListener('click', () => { if (audioCtx.state==='suspended') audioCtx.resume(); joinRoom(); });

  btnStartMatch.addEventListener('click', () => {
    if (!isHost) return;
    send({ type: 'start' });
    startMultiplayerMatch();
  });

  btnLeave.addEventListener('click', () => {
    if (isHost && roomCode && apiBase()) apiGet('close', { roomId: roomCode }).catch(() => {});
    stopHeartbeat();
    if (conn) try { conn.close(); } catch(e){}
    if (peer) try { peer.destroy(); } catch(e){}
    conn = null; peer = null;
    showScreen('lobby');
    refreshLobby();
  });

  nextLevelBtn.addEventListener('click', nextLevel);

  restartBtn.addEventListener('click', () => {
    gameOverOverlay.classList.add('hidden');
    if (isMultiplayer) {
      opponent.finished = false; opponent.score = 0;
      if (isHost) {
        send({ type: 'start' });
        startMultiplayerMatch();
      } else {
        goTitle.textContent = 'Menunggu host...';
        finalResults.innerHTML = '<p>Host akan memulai ulang.</p>';
        gameOverOverlay.classList.remove('hidden');
      }
    } else {
      startSolo();
    }
  });

  backLobbyBtn.addEventListener('click', () => {
    if (isHost && roomCode && apiBase()) apiGet('close', { roomId: roomCode }).catch(() => {});
    stopHeartbeat();
    if (conn) try { conn.close(); } catch(e){}
    if (peer) try { peer.destroy(); } catch(e){}
    conn = null; peer = null;
    isRunning = false;
    if (animationId) cancelAnimationFrame(animationId);
    animationId = null;
    showScreen('lobby');
    refreshLobby();
  });

  if (btnCopy) {
    btnCopy.addEventListener('click', async () => {
      const val = copyCodeInput.value;
      try {
        await navigator.clipboard.writeText(val);
      } catch (e) {
        copyCodeInput.select();
        document.execCommand('copy');
      }
      btnCopy.textContent = 'Tersalin!';
      btnCopy.classList.add('copied');
      setTimeout(() => {
        btnCopy.textContent = 'Copy Kode';
        btnCopy.classList.remove('copied');
      }, 1500);
    });
  }

  window.addEventListener('resize', () => {
    if (!gameScreenEl.classList.contains('hidden')) resizeCanvas();
  });

  // ========== INIT ==========
  async function init() {
    await loadData();
    const saved = localStorage.getItem('monmon_name');
    if (saved) playerNameInput.value = saved;
    playerNameInput.addEventListener('change', () => {
      localStorage.setItem('monmon_name', playerNameInput.value.trim());
    });

    if (apiBase()) {
      if (!sessionStorage.getItem('monmon_visited')) {
        sessionStorage.setItem('monmon_visited', '1');
        apiGet('visit').then(setStats).catch(() => {});
      }
      refreshLobby();
      roomsPollTimer = setInterval(refreshLobby, 7000);
    } else {
      apiWarnEl.classList.remove('hidden');
      publicRoomsEl.innerHTML = '<p class="muted">Isi config.js supaya room terlihat dunia.</p>';
    }
  }
  init();
})();

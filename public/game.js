/* Pixel Run — a small side-scrolling platformer. No dependencies, no asset files. */
(function () {
  'use strict';

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var W = canvas.width;
  var H = canvas.height;

  var scoreEl = document.getElementById('score');
  var livesEl = document.getElementById('lives');
  var tagEl = document.getElementById('player-tag');
  var banner = document.getElementById('banner');
  var bannerText = document.getElementById('banner-text');
  var bannerBtn = document.getElementById('banner-btn');
  var soundBtn = document.getElementById('sound');
  var themeBtn = document.getElementById('theme');
  var nameRow = document.getElementById('name-row');
  var nameInput = document.getElementById('player-name');
  var nameError = document.getElementById('name-error');
  var boardWrap = document.getElementById('board-wrap');
  var boardList = document.getElementById('board-list');

  // ---- tuning -------------------------------------------------------------
  var GRAVITY = 2300;
  var MOVE = 280;
  var AIR_MOVE = 240;
  var JUMP = 800;
  var MAX_FALL = 1000;
  var FRICTION = 0.82;
  var COYOTE = 0.10;
  var BUFFER = 0.12;

  // ---- sound --------------------------------------------------------------
  var AudioCtor = window.AudioContext || window.webkitAudioContext;
  var actx = null;
  var master = null;
  var muted = false;
  var VOLUME = 3.2; // multiplier applied to every sound below

  function wakeAudio() {
    if (!AudioCtor) return;
    if (!actx) {
      try { actx = new AudioCtor(); } catch (e) { actx = null; return; }
      master = actx.createGain();
      master.gain.value = 0.9;
      master.connect(actx.destination);
    }
    if (actx.state === 'suspended') actx.resume();
  }

  // Browsers only allow audio after a real interaction, so unlock on the first
  // click, tap or keypress anywhere on the page.
  document.addEventListener('pointerdown', wakeAudio);
  document.addEventListener('touchstart', wakeAudio, { passive: true });
  document.addEventListener('keydown', wakeAudio);

  function tone(opts) {
    if (!actx || muted) return;
    var now = actx.currentTime + (opts.delay || 0);
    var osc = actx.createOscillator();
    var gain = actx.createGain();
    osc.type = opts.type || 'square';
    osc.frequency.setValueAtTime(opts.from, now);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, now + opts.dur);
    gain.gain.setValueAtTime(Math.min(0.9, (opts.vol || 0.06) * VOLUME), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + opts.dur);
    osc.connect(gain);
    gain.connect(master || actx.destination);
    osc.start(now);
    osc.stop(now + opts.dur + 0.02);
  }

  var sfx = {
    jump: function () { tone({ from: 320, to: 620, dur: 0.11, vol: 0.05 }); },
    coin: function () {
      tone({ from: 988, dur: 0.07, vol: 0.05 });
      tone({ from: 1319, dur: 0.12, vol: 0.05, delay: 0.06 });
    },
    stomp: function () { tone({ from: 220, to: 70, dur: 0.16, type: 'triangle', vol: 0.09 }); },
    hurt: function () { tone({ from: 300, to: 60, dur: 0.45, type: 'sawtooth', vol: 0.07 }); },
    win: function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone({ from: f, dur: 0.18, vol: 0.06, delay: i * 0.11 });
      });
    },
    over: function () {
      [392, 330, 262, 196].forEach(function (f, i) {
        tone({ from: f, dur: 0.22, type: 'triangle', vol: 0.06, delay: i * 0.14 });
      });
    }
  };

  function setMuted(v) {
    muted = v;
    if (!v) wakeAudio();
    soundBtn.textContent = muted ? 'Sound off' : 'Sound on';
    soundBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
  }

  // ---- theme --------------------------------------------------------------
  var theme = 'world';

  function setTheme(t) {
    theme = t;
    themeBtn.textContent = theme === 'world' ? 'Mode: world' : 'Mode: space';
  }

  // ---- high scores --------------------------------------------------------
  // Scores are kept by the server in scores.json. If that call fails (opening
  // the file straight off disk, say) the game keeps a local list instead.
  var playerName = '';
  var localBoard = [];

  function rank(list) {
    return list.slice().sort(function (a, b) {
      return (b.score - a.score) || (a.time - b.time);
    }).slice(0, 10);
  }

  function paintBoard(list) {
    boardList.innerHTML = '';
    if (!list || !list.length) {
      boardWrap.hidden = true;
      return;
    }
    list.forEach(function (row, i) {
      var li = document.createElement('li');
      var pos = document.createElement('span');
      pos.textContent = (i + 1) + '.';
      var who = document.createElement('b');
      who.textContent = row.name;
      var pts = document.createElement('span');
      pts.textContent = row.score + ' coins';
      li.appendChild(pos);
      li.appendChild(who);
      li.appendChild(pts);
      boardList.appendChild(li);
    });
    boardWrap.hidden = false;
  }

  function loadBoard() {
    fetch('/api/scores')
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(paintBoard)
      .catch(function () { paintBoard(rank(localBoard)); });
  }

  function submitScore(won) {
    var entry = { name: playerName, score: score, time: Math.round(timeAlive * 10) / 10, won: !!won };
    localBoard.push(entry);
    fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(paintBoard)
      .catch(function () { paintBoard(rank(localBoard)); });
  }

  // ---- level --------------------------------------------------------------
  var LEVEL_W = 4300;
  var GROUND_Y = 470;

  function block(x, y, w, h, kind) {
    return { x: x, y: y, w: w, h: h, kind: kind || 'earth' };
  }

  var platforms = [
    block(0, GROUND_Y, 900, 90),
    block(1030, GROUND_Y, 760, 90),
    block(1930, GROUND_Y, 980, 90),
    block(3060, GROUND_Y, 1240, 90),
    block(360, 360, 140, 24, 'stone'),
    block(620, 280, 120, 24, 'stone'),
    block(900, 350, 110, 24, 'stone'),
    block(1240, 340, 160, 24, 'stone'),
    block(1520, 250, 140, 24, 'stone'),
    block(1800, 330, 120, 24, 'stone'),
    block(2180, 360, 180, 24, 'stone'),
    block(2460, 270, 140, 24, 'stone'),
    block(2760, 350, 120, 24, 'stone'),
    block(2980, 240, 140, 24, 'stone'),
    block(3320, 340, 160, 24, 'stone'),
    block(3620, 260, 140, 24, 'stone'),
    block(3860, 410, 60, 60),
    block(3920, 350, 60, 120)
  ];

  var coinSpots = [
    [400, 310], [440, 310], [660, 230], [700, 230], [930, 300],
    [1280, 290], [1320, 290], [1560, 200], [1600, 200], [1840, 280],
    [2220, 310], [2260, 310], [2300, 310], [2500, 220], [2540, 220],
    [2800, 300], [3020, 190], [3060, 190], [3360, 290], [3400, 290],
    [3660, 210], [3700, 210], [1100, 435], [2000, 435], [3150, 435]
  ];

  var enemySpots = [
    { x: 620, min: 520, max: 860 },
    { x: 1200, min: 1060, max: 1420 },
    { x: 1600, min: 1480, max: 1760 },
    { x: 2100, min: 1960, max: 2320 },
    { x: 2600, min: 2420, max: 2860 },
    { x: 3300, min: 3120, max: 3520 },
    { x: 3700, min: 3560, max: 3820 }
  ];

  var goal = { x: 4120, y: 320, w: 14, h: 150 };

  // ---- state --------------------------------------------------------------
  var player, coins, enemies, cam, score, lives, state, timeAlive;

  function resetPlayer() {
    player = {
      x: 60, y: GROUND_Y - 46, w: 30, h: 46,
      vx: 0, vy: 0,
      onGround: false, face: 1,
      coyote: 0, buffer: 0, hurt: 0
    };
    cam = 0;
  }

  function resetLevel(full) {
    coins = coinSpots.map(function (c) {
      return { x: c[0], y: c[1], r: 9, taken: false };
    });
    enemies = enemySpots.map(function (e) {
      return { x: e.x, y: GROUND_Y - 34, w: 34, h: 34, vx: 70, min: e.min, max: e.max, dead: false, squash: 0 };
    });
    if (full) {
      score = 0;
      lives = 3;
    }
    timeAlive = 0;
    state = 'play';
    hideBanner();
    resetPlayer();
    updateHud();
  }

  // Show and hide the overlay from JS as well as via the hidden attribute, so
  // it works even if the stylesheet is stale or missing.
  function hideBanner() {
    banner.hidden = true;
    banner.style.display = 'none';
  }

  function openBanner() {
    banner.hidden = false;
    banner.style.display = 'flex';
  }

  function updateHud() {
    scoreEl.textContent = score;
    livesEl.textContent = lives;
  }

  function endRun(text, label, won) {
    state = won ? 'won' : 'over';
    bannerText.textContent = text;
    bannerBtn.textContent = label;
    nameRow.hidden = true;
    nameRow.style.display = 'none';
    nameError.hidden = true;
    nameError.style.display = 'none';
    openBanner();
    submitScore(won);
  }

  // ---- input --------------------------------------------------------------
  var keys = { left: false, right: false, jump: false };

  function setKey(name, down) {
    if (down) wakeAudio();
    if (name === 'jump' && down && !keys.jump) player.buffer = BUFFER;
    keys[name] = down;
  }

  var keyMap = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    Space: 'jump', ArrowUp: 'jump', KeyW: 'jump'
  };

  window.addEventListener('keydown', function (e) {
    if (document.activeElement === nameInput) {
      if (e.code === 'Enter') startRun();
      return;
    }
    if (e.code === 'KeyR') { wakeAudio(); if (playerName) resetLevel(true); return; }
    if (e.code === 'KeyM') { setMuted(!muted); return; }
    if (e.code === 'KeyT') { setTheme(theme === 'world' ? 'space' : 'world'); return; }
    var k = keyMap[e.code];
    if (!k) return;
    e.preventDefault();
    setKey(k, true);
  });

  window.addEventListener('keyup', function (e) {
    if (document.activeElement === nameInput) return;
    var k = keyMap[e.code];
    if (!k) return;
    e.preventDefault();
    setKey(k, false);
  });

  Array.prototype.forEach.call(document.querySelectorAll('.pad'), function (btn) {
    var k = btn.dataset.key;
    var press = function (e) { e.preventDefault(); setKey(k, true); };
    var release = function (e) { e.preventDefault(); setKey(k, false); };
    btn.addEventListener('touchstart', press, { passive: false });
    btn.addEventListener('touchend', release);
    btn.addEventListener('touchcancel', release);
    btn.addEventListener('mousedown', press);
    btn.addEventListener('mouseup', release);
    btn.addEventListener('mouseleave', release);
  });

  function startRun() {
    wakeAudio();
    if (!playerName) {
      var typed = (nameInput.value || '').replace(/[<>]/g, '').trim();
      if (!typed) {
        nameError.hidden = false;
        nameError.style.display = 'block';
        nameInput.focus();
        return;
      }
      playerName = typed.slice(0, 12);
      tagEl.textContent = playerName;
      nameRow.hidden = true;
      nameRow.style.display = 'none';
      nameError.hidden = true;
      nameError.style.display = 'none';
    }
    resetLevel(true);
  }

  bannerBtn.addEventListener('click', startRun);
  nameInput.addEventListener('input', function () {
    nameError.hidden = true;
    nameError.style.display = 'none';
  });
  soundBtn.addEventListener('click', function () { wakeAudio(); setMuted(!muted); });
  themeBtn.addEventListener('click', function () { setTheme(theme === 'world' ? 'space' : 'world'); });

  // ---- physics ------------------------------------------------------------
  function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function moveAndCollide(dt) {
    player.x += player.vx * dt;
    platforms.forEach(function (p) {
      if (!overlaps(player, p)) return;
      if (player.vx > 0) player.x = p.x - player.w;
      else if (player.vx < 0) player.x = p.x + p.w;
      player.vx = 0;
    });
    if (player.x < 0) { player.x = 0; player.vx = 0; }

    player.y += player.vy * dt;
    player.onGround = false;
    platforms.forEach(function (p) {
      if (!overlaps(player, p)) return;
      if (player.vy > 0) {
        player.y = p.y - player.h;
        player.onGround = true;
      } else if (player.vy < 0) {
        player.y = p.y + p.h;
      }
      player.vy = 0;
    });
  }

  function loseLife() {
    lives -= 1;
    updateHud();
    if (lives <= 0) {
      sfx.over();
      endRun('Out of lives. ' + playerName + ' collected ' + score + ' coins.', 'Play again', false);
    } else {
      sfx.hurt();
      resetPlayer();
    }
  }

  function update(dt) {
    if (state !== 'play') return;
    timeAlive += dt;

    var accel = player.onGround ? MOVE : AIR_MOVE;
    if (keys.left && !keys.right) { player.vx = -accel; player.face = -1; }
    else if (keys.right && !keys.left) { player.vx = accel; player.face = 1; }
    else if (player.onGround) { player.vx *= FRICTION; }

    player.coyote = player.onGround ? COYOTE : Math.max(0, player.coyote - dt);
    player.buffer = Math.max(0, player.buffer - dt);

    if (player.buffer > 0 && player.coyote > 0) {
      player.vy = -JUMP;
      player.coyote = 0;
      player.buffer = 0;
      player.onGround = false;
      sfx.jump();
    }
    if (!keys.jump && player.vy < -JUMP * 0.35) player.vy = -JUMP * 0.35;

    player.vy = Math.min(player.vy + GRAVITY * dt, MAX_FALL);
    moveAndCollide(dt);

    if (player.hurt > 0) player.hurt -= dt;
    if (player.y > H + 80) { loseLife(); return; }

    coins.forEach(function (c) {
      if (c.taken) return;
      if (c.x + c.r > player.x && c.x - c.r < player.x + player.w &&
          c.y + c.r > player.y && c.y - c.r < player.y + player.h) {
        c.taken = true;
        score += 1;
        sfx.coin();
        updateHud();
      }
    });

    enemies.forEach(function (e) {
      if (e.dead) { e.squash = Math.max(0, e.squash - dt); return; }
      e.x += e.vx * dt;
      if (e.x < e.min) { e.x = e.min; e.vx *= -1; }
      if (e.x + e.w > e.max) { e.x = e.max - e.w; e.vx *= -1; }

      if (!overlaps(player, e)) return;
      var stomping = player.vy > 0 && (player.y + player.h) - e.y < 22;
      if (stomping) {
        e.dead = true;
        e.squash = 0.3;
        player.vy = -JUMP * 0.6;
        score += 2;
        sfx.stomp();
        updateHud();
      } else if (player.hurt <= 0) {
        player.hurt = 1;
        loseLife();
      }
    });

    if (overlaps(player, goal)) {
      sfx.win();
      endRun('Flag reached in ' + timeAlive.toFixed(1) + 's with ' + score + ' coins.', 'Play again', true);
    }

    cam = Math.max(0, Math.min(player.x - W * 0.4, LEVEL_W - W));
  }

  // ---- backgrounds --------------------------------------------------------
  var DAY = {
    skyTop: [110, 190, 232], skyBottom: [206, 232, 240],
    farHill: [95, 150, 122], nearHill: [63, 116, 90]
  };
  var NIGHT = {
    skyTop: [36, 26, 69], skyBottom: [74, 50, 113],
    farHill: [47, 34, 88], nearHill: [58, 42, 104]
  };

  function mix(a, b, t) {
    return 'rgb(' +
      Math.round(a[0] + (b[0] - a[0]) * t) + ',' +
      Math.round(a[1] + (b[1] - a[1]) * t) + ',' +
      Math.round(a[2] + (b[2] - a[2]) * t) + ')';
  }

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  var stars = [];
  for (var i = 0; i < 70; i++) {
    stars.push({ x: Math.random() * W, y: Math.random() * 280, s: Math.random() * 2 + 1 });
  }

  var deepStars = [];
  for (var d = 0; d < 150; d++) {
    deepStars.push({ x: Math.random() * W, y: Math.random() * 470, s: Math.random() * 2 + 0.6, tw: Math.random() * 6 });
  }

  var clouds = [];
  for (var j = 0; j < 6; j++) {
    clouds.push({ x: j * 780 + 120, y: 70 + (j % 3) * 55, w: 90 + (j % 4) * 30 });
  }

  // Planets drift past at their own parallax rate; the ringed one is the
  // furthest away, so it moves slowest.
  var planets = [
    { x: 300, y: 150, r: 46, color: '#c86f5a', band: '#a1543f', par: 0.10 },
    { x: 1500, y: 110, r: 30, color: '#6fe3b0', band: '#3fae82', par: 0.16 },
    { x: 2600, y: 190, r: 62, color: '#a89ad8', band: '#7c6dbb', par: 0.08, ring: true },
    { x: 3700, y: 130, r: 24, color: '#ffd166', band: '#d9a838', par: 0.20 }
  ];

  function drawWorld() {
    var night = clamp01(cam / (LEVEL_W - W));

    var sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, mix(DAY.skyTop, NIGHT.skyTop, night));
    sky.addColorStop(1, mix(DAY.skyBottom, NIGHT.skyBottom, night));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    var sunAlpha = clamp01(1 - night * 1.7);
    if (sunAlpha > 0) {
      ctx.globalAlpha = sunAlpha;
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(760 - night * 220, 90 + night * 300, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    var moonAlpha = clamp01((night - 0.42) * 2.4);
    if (moonAlpha > 0) {
      ctx.globalAlpha = moonAlpha;
      ctx.fillStyle = '#f3ecff';
      ctx.beginPath();
      ctx.arc(200 + night * 180, 250 - night * 170, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    var starAlpha = clamp01((night - 0.35) * 1.9);
    if (starAlpha > 0) {
      ctx.fillStyle = 'rgba(243,236,255,' + (starAlpha * 0.75).toFixed(2) + ')';
      stars.forEach(function (s) {
        var sx = (s.x - cam * 0.1) % W;
        if (sx < 0) sx += W;
        ctx.fillRect(sx, s.y, s.s, s.s);
      });
    }

    var cloudAlpha = clamp01(1 - night * 1.5);
    if (cloudAlpha > 0) {
      ctx.globalAlpha = cloudAlpha * 0.85;
      ctx.fillStyle = '#ffffff';
      clouds.forEach(function (c) {
        var cx = c.x - cam * 0.15;
        cx = ((cx % 4680) + 4680) % 4680;
        if (cx > W + 200) return;
        ctx.fillRect(cx, c.y, c.w, 18);
        ctx.fillRect(cx + 20, c.y - 14, c.w - 40, 18);
      });
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = mix(DAY.farHill, NIGHT.farHill, night);
    for (var h = -1; h < 8; h++) {
      var hx = h * 620 - (cam * 0.25) % 620;
      ctx.beginPath();
      ctx.moveTo(hx, 470);
      ctx.lineTo(hx + 200, 250);
      ctx.lineTo(hx + 420, 470);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = mix(DAY.nearHill, NIGHT.nearHill, night);
    for (var n = -1; n < 10; n++) {
      var nx = n * 460 - (cam * 0.5) % 460;
      ctx.beginPath();
      ctx.moveTo(nx, 480);
      ctx.lineTo(nx + 150, 330);
      ctx.lineTo(nx + 320, 480);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawSpace(t) {
    var sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#05030f');
    sky.addColorStop(1, '#1b0f3a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    deepStars.forEach(function (s) {
      var sx = (s.x - cam * 0.05) % W;
      if (sx < 0) sx += W;
      var a = 0.35 + 0.45 * Math.abs(Math.sin(t * 1.4 + s.tw));
      ctx.fillStyle = 'rgba(243,236,255,' + a.toFixed(2) + ')';
      ctx.fillRect(sx, s.y, s.s, s.s);
    });

    // the system's sun, low on the right and always in view
    var sunX = 820 - cam * 0.03;
    sunX = ((sunX % 1600) + 1600) % 1600;
    for (var g = 5; g >= 1; g--) {
      ctx.fillStyle = 'rgba(255,209,102,' + (0.05 * g).toFixed(2) + ')';
      ctx.beginPath();
      ctx.arc(sunX, 120, 44 + g * 13, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(sunX, 120, 44, 0, Math.PI * 2);
    ctx.fill();

    planets.forEach(function (pl) {
      var px = pl.x - cam * pl.par;
      var span = LEVEL_W * pl.par + W + 400;
      px = ((px % span) + span) % span;
      if (px < -120 || px > W + 120) return;

      if (pl.ring) {
        ctx.strokeStyle = pl.band;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.ellipse(px, pl.y, pl.r * 1.9, pl.r * 0.45, -0.35, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = pl.color;
      ctx.beginPath();
      ctx.arc(px, pl.y, pl.r, 0, Math.PI * 2);
      ctx.fill();

      // a couple of surface bands, clipped to the planet
      ctx.save();
      ctx.beginPath();
      ctx.arc(px, pl.y, pl.r, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = pl.band;
      ctx.fillRect(px - pl.r, pl.y - pl.r * 0.45, pl.r * 2, pl.r * 0.22);
      ctx.fillRect(px - pl.r, pl.y + pl.r * 0.25, pl.r * 2, pl.r * 0.3);
      ctx.restore();

      if (pl.ring) {
        ctx.strokeStyle = pl.band;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.ellipse(px, pl.y, pl.r * 1.9, pl.r * 0.45, -0.35, 0.35, Math.PI - 0.35);
        ctx.stroke();
      }
    });

    // distant asteroid ridges standing in for the hills
    ctx.fillStyle = '#20143f';
    for (var n = -1; n < 10; n++) {
      var nx = n * 460 - (cam * 0.5) % 460;
      ctx.beginPath();
      ctx.moveTo(nx, 480);
      ctx.lineTo(nx + 150, 350);
      ctx.lineTo(nx + 320, 480);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ---- drawing ------------------------------------------------------------
  function drawPlatforms() {
    var top = theme === 'space' ? '#8f7ff0' : '#6fe3b0';
    var body = theme === 'space' ? '#2b1e4f' : '#5b3a2e';
    platforms.forEach(function (p) {
      var x = p.x - cam;
      if (x > W || x + p.w < 0) return;
      if (p.kind === 'stone') {
        ctx.fillStyle = '#8d84ad';
        ctx.fillRect(x, p.y, p.w, p.h);
        ctx.fillStyle = '#b7aed4';
        ctx.fillRect(x, p.y, p.w, 5);
      } else {
        ctx.fillStyle = body;
        ctx.fillRect(x, p.y, p.w, p.h);
        ctx.fillStyle = top;
        ctx.fillRect(x, p.y, p.w, 12);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        for (var bx = 0; bx < p.w; bx += 40) {
          ctx.fillRect(x + bx, p.y + 12, 2, p.h - 12);
        }
      }
    });
  }

  function drawCoins(t) {
    coins.forEach(function (c) {
      if (c.taken) return;
      var x = c.x - cam;
      if (x < -20 || x > W + 20) return;
      var squish = Math.abs(Math.cos(t * 3 + c.x));
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.ellipse(x, c.y, Math.max(2, c.r * squish), c.r, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawEnemies() {
    enemies.forEach(function (e) {
      if (e.dead && e.squash <= 0) return;
      var x = e.x - cam;
      if (x < -60 || x > W + 60) return;
      var squashed = e.dead;
      var h = squashed ? 10 : e.h;
      var y = e.y + (e.h - h);
      ctx.fillStyle = squashed ? '#7a4a55' : '#ff7a5c';
      ctx.fillRect(x, y, e.w, h);
      if (!squashed) {
        ctx.fillStyle = '#17102e';
        ctx.fillRect(x + 7, y + 10, 6, 6);
        ctx.fillRect(x + 21, y + 10, 6, 6);
        ctx.fillRect(x + 6, y + 24, 22, 4);
      }
    });
  }

  function drawGoal() {
    var x = goal.x - cam;
    if (x < -80 || x > W + 80) return;
    ctx.fillStyle = '#b7aed4';
    ctx.fillRect(x, goal.y, goal.w, goal.h);
    ctx.fillStyle = theme === 'space' ? '#8f7ff0' : '#6fe3b0';
    ctx.beginPath();
    ctx.moveTo(x + goal.w, goal.y + 6);
    ctx.lineTo(x + goal.w + 70, goal.y + 28);
    ctx.lineTo(x + goal.w, goal.y + 50);
    ctx.closePath();
    ctx.fill();
  }

  function drawPlayer(t) {
    var x = Math.round(player.x - cam);
    var y = Math.round(player.y);
    if (player.hurt > 0 && Math.floor(t * 20) % 2 === 0) return;

    ctx.fillStyle = '#f3ecff';
    ctx.fillRect(x, y, player.w, player.h);
    ctx.fillStyle = '#ff7a5c';
    ctx.fillRect(x, y, player.w, 14);
    ctx.fillRect(x, y + 30, player.w, 16);
    ctx.fillStyle = '#17102e';
    var ex = player.face > 0 ? x + 17 : x + 7;
    ctx.fillRect(ex, y + 19, 6, 6);
  }

  function render(t) {
    if (theme === 'space') drawSpace(t); else drawWorld();
    drawPlatforms();
    drawCoins(t);
    drawGoal();
    drawEnemies();
    drawPlayer(t);
  }

  // ---- loop ---------------------------------------------------------------
  var last = performance.now();

  function frame(now) {
    var dt = Math.max(0, Math.min((now - last) / 1000, 1 / 30));
    last = now;
    update(dt);
    render(now / 1000);
    requestAnimationFrame(frame);
  }

  setMuted(false);
  setTheme('world');
  resetLevel(true);
  state = 'ready';
  openBanner();
  loadBoard();
  if (nameInput.focus) nameInput.focus();
  requestAnimationFrame(frame);
})();

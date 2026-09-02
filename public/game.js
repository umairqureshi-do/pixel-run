/* Pixel Run — a small side-scrolling platformer. No dependencies. */
(function () {
  'use strict';

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var W = canvas.width;
  var H = canvas.height;

  var scoreEl = document.getElementById('score');
  var livesEl = document.getElementById('lives');
  var banner = document.getElementById('banner');
  var bannerText = document.getElementById('banner-text');
  var bannerBtn = document.getElementById('banner-btn');

  // ---- tuning -------------------------------------------------------------
  var GRAVITY = 2300;
  var MOVE = 280;
  var AIR_MOVE = 240;
  var JUMP = 800;
  var MAX_FALL = 1000;
  var FRICTION = 0.82;
  var COYOTE = 0.10;   // seconds of forgiveness after leaving a ledge
  var BUFFER = 0.12;   // jump pressed slightly before landing still counts

  // ---- level --------------------------------------------------------------
  var LEVEL_W = 4300;
  var GROUND_Y = 470;

  function block(x, y, w, h, kind) {
    return { x: x, y: y, w: w, h: h, kind: kind || 'earth' };
  }

  var platforms = [
    // ground segments, with gaps between them
    block(0, GROUND_Y, 900, 90),
    block(1030, GROUND_Y, 760, 90),
    block(1930, GROUND_Y, 980, 90),
    block(3060, GROUND_Y, 1240, 90),
    // floating ledges
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
    // a couple of solid steps near the end
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
    banner.hidden = true;
    resetPlayer();
    updateHud();
  }

  function updateHud() {
    scoreEl.textContent = score;
    livesEl.textContent = lives;
  }

  function showBanner(text, label) {
    bannerText.textContent = text;
    bannerBtn.textContent = label;
    banner.hidden = false;
  }

  // ---- input --------------------------------------------------------------
  var keys = { left: false, right: false, jump: false };

  function setKey(name, down) {
    if (name === 'jump' && down && !keys.jump) player.buffer = BUFFER;
    keys[name] = down;
  }

  var keyMap = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    Space: 'jump', ArrowUp: 'jump', KeyW: 'jump'
  };

  window.addEventListener('keydown', function (e) {
    if (e.code === 'KeyR') { resetLevel(true); return; }
    var k = keyMap[e.code];
    if (!k) return;
    e.preventDefault();
    setKey(k, true);
  });

  window.addEventListener('keyup', function (e) {
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

  bannerBtn.addEventListener('click', function () { resetLevel(true); });

  // ---- physics helpers ----------------------------------------------------
  function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function moveAndCollide(dt) {
    // horizontal
    player.x += player.vx * dt;
    platforms.forEach(function (p) {
      if (!overlaps(player, p)) return;
      if (player.vx > 0) player.x = p.x - player.w;
      else if (player.vx < 0) player.x = p.x + p.w;
      player.vx = 0;
    });
    if (player.x < 0) { player.x = 0; player.vx = 0; }

    // vertical
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
      state = 'over';
      showBanner('Out of lives. You collected ' + score + ' coins.', 'Try again');
    } else {
      resetPlayer();
    }
  }

  // ---- update -------------------------------------------------------------
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
    }
    // short hop when the jump key is released early
    if (!keys.jump && player.vy < -JUMP * 0.35) player.vy = -JUMP * 0.35;

    player.vy = Math.min(player.vy + GRAVITY * dt, MAX_FALL);
    moveAndCollide(dt);

    if (player.hurt > 0) player.hurt -= dt;

    // fell into a pit
    if (player.y > H + 80) { loseLife(); return; }

    // coins
    coins.forEach(function (c) {
      if (c.taken) return;
      if (c.x + c.r > player.x && c.x - c.r < player.x + player.w &&
          c.y + c.r > player.y && c.y - c.r < player.y + player.h) {
        c.taken = true;
        score += 1;
        updateHud();
      }
    });

    // enemies
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
        updateHud();
      } else if (player.hurt <= 0) {
        player.hurt = 1;
        loseLife();
      }
    });

    // goal
    if (overlaps(player, goal)) {
      state = 'won';
      showBanner('Flag reached in ' + timeAlive.toFixed(1) + 's with ' + score + ' coins.', 'Play again');
    }

    // camera
    var target = player.x - W * 0.4;
    cam = Math.max(0, Math.min(target, LEVEL_W - W));
  }

  // ---- drawing ------------------------------------------------------------
  var stars = [];
  for (var i = 0; i < 70; i++) {
    stars.push({ x: Math.random() * W, y: Math.random() * 280, s: Math.random() * 2 + 1 });
  }

  function drawBackground() {
    var sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#241a45');
    sky.addColorStop(1, '#4a3271');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(243,236,255,0.55)';
    stars.forEach(function (s) {
      var sx = (s.x - cam * 0.1) % W;
      if (sx < 0) sx += W;
      ctx.fillRect(sx, s.y, s.s, s.s);
    });

    // far hills
    ctx.fillStyle = '#2f2258';
    for (var h = -1; h < 8; h++) {
      var hx = h * 620 - (cam * 0.25) % 620;
      ctx.beginPath();
      ctx.moveTo(hx, 470);
      ctx.lineTo(hx + 200, 250);
      ctx.lineTo(hx + 420, 470);
      ctx.closePath();
      ctx.fill();
    }
    // near hills
    ctx.fillStyle = '#3a2a68';
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

  function drawPlatforms() {
    platforms.forEach(function (p) {
      var x = p.x - cam;
      if (x > W || x + p.w < 0) return;
      if (p.kind === 'stone') {
        ctx.fillStyle = '#8d84ad';
        ctx.fillRect(x, p.y, p.w, p.h);
        ctx.fillStyle = '#b7aed4';
        ctx.fillRect(x, p.y, p.w, 5);
      } else {
        ctx.fillStyle = '#5b3a2e';
        ctx.fillRect(x, p.y, p.w, p.h);
        ctx.fillStyle = '#6fe3b0';
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
    ctx.fillStyle = '#6fe3b0';
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
    ctx.fillRect(x, y, player.w, 14);           // cap
    ctx.fillRect(x, y + 30, player.w, 16);      // boots
    ctx.fillStyle = '#17102e';
    var ex = player.face > 0 ? x + 17 : x + 7;
    ctx.fillRect(ex, y + 19, 6, 6);             // eye
  }

  function render(t) {
    drawBackground();
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

  resetLevel(true);
  requestAnimationFrame(frame);
})();

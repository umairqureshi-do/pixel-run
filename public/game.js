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
  var boardTitle = document.getElementById('board-title');
  var levelEl = document.getElementById('level');

  // ---- tuning -------------------------------------------------------------
  var GRAVITY = 2300;
  var GRAVITY_SPACE = 1450;   // level 1 in space mode: floatier jumps
  var MAX_FALL_SPACE = 720;
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
    skyWarn: function () {
      tone({ from: 500, to: 180, dur: 0.5, type: 'sawtooth', vol: 0.05 });
      tone({ from: 380, to: 140, dur: 0.6, type: 'triangle', vol: 0.04, delay: 0.12 });
    },
    throwHazard: function () { tone({ from: 180, to: 420, dur: 0.09, type: 'sawtooth', vol: 0.03 }); },
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
    }).slice(0, 100);
  }

  function paintBoard(list) {
    boardList.innerHTML = '';
    if (!list || !list.length) {
      boardWrap.hidden = true;
      boardWrap.style.display = 'none';
      return;
    }
    boardTitle.textContent = list.length < 100
      ? 'Top runs (' + list.length + ')'
      : 'Top 100 runs';
    list.forEach(function (row, i) {
      var li = document.createElement('li');
      if (playerName && row.name === playerName) li.className = 'me';
      var pos = document.createElement('span');
      pos.className = 'pos';
      pos.textContent = (i + 1) + '.';
      var who = document.createElement('b');
      who.textContent = row.name;
      var pts = document.createElement('span');
      pts.textContent = row.score + ' coins' + (row.level ? ' \u00b7 lv' + row.level : '');
      li.appendChild(pos);
      li.appendChild(who);
      li.appendChild(pts);
      boardList.appendChild(li);
    });
    boardWrap.hidden = false;
    boardWrap.style.display = 'block';
  }

  function loadBoard() {
    fetch('/api/scores')
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(paintBoard)
      .catch(function () { paintBoard(rank(localBoard)); });
  }

  function submitScore(won) {
    var entry = {
      name: playerName,
      score: score,
      time: Math.round(timeAlive * 10) / 10,
      level: levelIndex + 1,
      won: !!won
    };
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

  // ---- levels -------------------------------------------------------------
  var GROUND_Y = 470;

  function block(x, y, w, h, kind) {
    return { x: x, y: y, w: w, h: h, kind: kind || 'earth' };
  }

  function ground(x, w) { return block(x, GROUND_Y, w, 90); }
  function ledge(x, y, w) { return block(x, y, w, 24, 'stone'); }

  // Throwers stand still and lob a hazard at the player: fire in world mode,
  // shards of hot blue glass in space mode. Same object, two skins.
  function thrower(x, y, opts) {
    opts = opts || {};
    return {
      x: x, y: y,
      dir: opts.dir || -1,
      every: opts.every || 2.0,
      speed: opts.speed || 210,
      arc: !!opts.arc,
      phase: opts.phase || 0
    };
  }

  var LEVELS = [
    {
      name: 'Level 1 — The long walk',
      blurb: 'Coins, a few patrolling squares, and the flag at the end.',
      w: 4300,
      goalX: 4120,
      lowGravityInSpace: true,  // space mode plays floaty here
      skyFire: true,            // world mode starts dropping fire once you are ahead
      platforms: [
        ground(0, 900), ground(1030, 760), ground(1930, 980), ground(3060, 1240),
        ledge(360, 360, 140), ledge(620, 280, 120), ledge(900, 350, 110),
        ledge(1240, 340, 160), ledge(1520, 250, 140), ledge(1800, 330, 120),
        ledge(2180, 360, 180), ledge(2460, 270, 140), ledge(2760, 350, 120),
        ledge(2980, 240, 140), ledge(3320, 340, 160), ledge(3620, 260, 140),
        block(3860, 410, 60, 60), block(3920, 350, 60, 120)
      ],
      coins: [
        [400, 310], [440, 310], [660, 230], [700, 230], [930, 300],
        [1280, 290], [1320, 290], [1560, 200], [1600, 200], [1840, 280],
        [2220, 310], [2260, 310], [2300, 310], [2500, 220], [2540, 220],
        [2800, 300], [3020, 190], [3060, 190], [3360, 290], [3400, 290],
        [3660, 210], [3700, 210], [1100, 435], [2000, 435], [3150, 435]
      ],
      enemies: [
        { x: 620, min: 520, max: 860 },
        { x: 1200, min: 1060, max: 1420 },
        { x: 1600, min: 1480, max: 1760 },
        { x: 2100, min: 1960, max: 2320 },
        { x: 2600, min: 2420, max: 2860 },
        { x: 3300, min: 3120, max: 3520 },
        { x: 3700, min: 3560, max: 3820 }
      ],
      throwers: []
    },

    {
      name: 'Level 2 — Something is throwing',
      blurb: 'Braziers spit fire down the track. In space they throw hot blue glass instead.',
      w: 4600,
      goalX: 4420,
      platforms: [
        ground(0, 760), ground(900, 700), ground(1740, 900), ground(2780, 820), ground(3740, 860),
        ledge(300, 370, 120), ledge(520, 300, 110),
        ledge(980, 350, 130), ledge(1200, 270, 120), ledge(1420, 340, 110),
        ledge(1820, 340, 140), ledge(2080, 260, 120), ledge(2320, 340, 130),
        ledge(2860, 300, 140), ledge(3100, 230, 120), ledge(3340, 340, 140),
        ledge(3800, 340, 140), ledge(4040, 270, 120),
        block(4280, 410, 60, 60), block(4340, 350, 60, 120)
      ],
      coins: [
        [340, 320], [380, 320], [560, 250], [600, 250],
        [1020, 300], [1060, 300], [1240, 220], [1280, 220], [1460, 290],
        [1860, 290], [1900, 290], [2120, 210], [2160, 210], [2360, 290],
        [2900, 250], [2940, 250], [3140, 180], [3180, 180], [3380, 290],
        [3840, 290], [3880, 290], [4080, 220], [4120, 220],
        [700, 435], [1600, 435], [2600, 435], [3500, 435]
      ],
      enemies: [
        { x: 500, min: 380, max: 700 },
        { x: 1100, min: 960, max: 1380 },
        { x: 1900, min: 1800, max: 2180 },
        { x: 2300, min: 2200, max: 2600 },
        { x: 2950, min: 2840, max: 3240 },
        { x: 3350, min: 3260, max: 3560 },
        { x: 3950, min: 3800, max: 4240 }
      ],
      throwers: [
        thrower(1300, GROUND_Y - 34, { every: 2.2, speed: 200 }),
        thrower(2140, 260 - 34, { every: 2.6, speed: 190, phase: 0.8 }),
        thrower(2500, GROUND_Y - 34, { every: 2.0, speed: 215, arc: true, phase: 0.4 }),
        thrower(3160, 230 - 34, { every: 2.4, speed: 200, phase: 1.2 }),
        thrower(3560, GROUND_Y - 34, { every: 1.9, speed: 225 }),
        thrower(4200, GROUND_Y - 34, { every: 2.1, speed: 210, arc: true, phase: 0.6 })
      ]
    },

    {
      name: 'Level 3 — Up and over',
      blurb: 'Less ground, more climbing, and the throwers have got quicker.',
      w: 4400,
      goalX: 4220,
      platforms: [
        ground(0, 700), ground(860, 560), ground(1560, 640), ground(2320, 600),
        ground(3060, 540), ground(3740, 660),
        ledge(280, 360, 120), ledge(500, 280, 110), ledge(760, 200, 110),
        ledge(1120, 350, 130), ledge(1360, 270, 120), ledge(1600, 190, 120),
        ledge(1980, 340, 140), ledge(2220, 260, 120), ledge(2460, 180, 120),
        ledge(2860, 330, 130), ledge(3100, 250, 120), ledge(3340, 340, 140),
        ledge(3580, 260, 120),
        block(4060, 410, 60, 60), block(4120, 350, 60, 120)
      ],
      coins: [
        [320, 310], [360, 310], [540, 230], [580, 230], [800, 150], [840, 150],
        [1160, 300], [1200, 300], [1400, 220], [1440, 220], [1640, 140], [1680, 140],
        [2020, 290], [2060, 290], [2260, 210], [2300, 210], [2500, 130], [2540, 130],
        [2900, 280], [2940, 280], [3140, 200], [3180, 200], [3380, 290], [3620, 210],
        [400, 435], [1800, 435], [2600, 435], [3300, 435], [3900, 435], [4000, 435]
      ],
      enemies: [
        { x: 400, min: 260, max: 640 },
        { x: 1000, min: 880, max: 1380 },
        { x: 1700, min: 1580, max: 2160 },
        { x: 2450, min: 2340, max: 2880 },
        { x: 3150, min: 3080, max: 3580 },
        { x: 3850, min: 3760, max: 4360 },
        { x: 4100, min: 3900, max: 4380 }
      ],
      throwers: [
        thrower(640, 200 - 34, { dir: 1, every: 1.8, speed: 230 }),
        thrower(1240, GROUND_Y - 34, { every: 1.7, speed: 240, phase: 0.5 }),
        thrower(1720, 190 - 34, { every: 2.0, speed: 220, phase: 1.0 }),
        thrower(2200, GROUND_Y - 34, { every: 1.6, speed: 245, arc: true }),
        thrower(2580, 180 - 34, { every: 1.9, speed: 230, phase: 0.7 }),
        thrower(3220, 250 - 34, { every: 1.7, speed: 235, phase: 0.3 }),
        thrower(3700, GROUND_Y - 34, { every: 1.5, speed: 250, arc: true, phase: 0.9 })
      ]
    }
  ];

  // ---- state --------------------------------------------------------------
  var player, coins, enemies, throwers, shots, cam, score, lives, state, timeAlive;
  var skyThreshold = 0;   // coins needed before the sky turns hostile, rolled per run
  var skyCool = 0;
  var skyWarned = 0;      // countdown for the on-screen warning
  var skyDrift = 0;
  var levelIndex = 0;
  var level = LEVELS[0];
  var platforms = LEVELS[0].platforms;
  var goal = { x: 0, y: 320, w: 14, h: 150 };

  function resetPlayer() {
    player = {
      x: 60, y: GROUND_Y - 46, w: 30, h: 46,
      vx: 0, vy: 0,
      onGround: false, face: 1,
      coyote: 0, buffer: 0, hurt: 0
    };
    cam = 0;
  }

  // full: 'run' starts a whole new game, 'level' reloads the current level only.
  function loadLevel(index, full) {
    levelIndex = index;
    level = LEVELS[index];
    platforms = level.platforms;
    goal.x = level.goalX;

    coins = level.coins.map(function (c) {
      return { x: c[0], y: c[1], r: 9, taken: false };
    });
    enemies = level.enemies.map(function (e) {
      return { x: e.x, y: GROUND_Y - 34, w: 34, h: 34, vx: 70, min: e.min, max: e.max, dead: false, squash: 0 };
    });
    throwers = level.throwers.map(function (t) {
      return { x: t.x, y: t.y, dir: t.dir, every: t.every, speed: t.speed, arc: t.arc, cool: t.phase, fired: 0 };
    });
    shots = [];

    // Varies run to run so you can never learn the exact moment it starts.
    skyThreshold = 15 + Math.floor(Math.random() * 6);   // 15 to 20
    skyCool = 1.2 + Math.random() * 1.4;
    skyWarned = 0;
    skyDrift = 0;

    if (full) {
      score = 0;
      lives = 3;
      timeAlive = 0;
    }
    state = 'play';
    hideBanner();
    resetPlayer();
    updateHud();
  }

  function resetLevel(full) {
    loadLevel(full ? 0 : levelIndex, full);
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

  function coinWord(n) { return n + (n === 1 ? ' coin' : ' coins'); }

  function updateHud() {
    scoreEl.textContent = score;
    livesEl.textContent = lives;
    if (levelEl) levelEl.textContent = (levelIndex + 1) + '/' + LEVELS.length;
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
    if (e.code === 'KeyR') {
      wakeAudio();
      if (playerName && state === 'play') loadLevel(levelIndex, false);
      return;
    }
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
    if (state === 'between') {
      loadLevel(levelIndex + 1, false);
      return;
    }
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
      endRun('Out of lives on level ' + (levelIndex + 1) + '. ' + playerName +
        ' collected ' + coinWord(score) + '.', 'Play again', false);
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

    var lowG = level.lowGravityInSpace && theme === 'space';
    player.vy = Math.min(player.vy + (lowG ? GRAVITY_SPACE : GRAVITY) * dt,
      lowG ? MAX_FALL_SPACE : MAX_FALL);
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

    updateHazards(dt);

    if (overlaps(player, goal)) {
      if (levelIndex < LEVELS.length - 1) {
        sfx.win();
        state = 'between';
        openBanner();
        bannerText.textContent = 'Level ' + (levelIndex + 1) + ' cleared with ' + coinWord(score) +
          '. Next: ' + LEVELS[levelIndex + 1].blurb;
        bannerBtn.textContent = 'Level ' + (levelIndex + 2);
      } else {
        sfx.win();
        endRun('All ' + LEVELS.length + ' levels cleared in ' + timeAlive.toFixed(1) +
          's with ' + coinWord(score) + '.', 'Play again', true);
      }
    }

    cam = Math.max(0, Math.min(player.x - W * 0.4, level.w - W));
  }

  // ---- hazards ------------------------------------------------------------
  function skyActive() {
    return level.skyFire && theme === 'world' && score >= skyThreshold;
  }

  function updateSkyFire(dt) {
    skyDrift += dt;
    if (skyWarned > 0) skyWarned -= dt;
    if (!skyActive()) return;

    // first time it triggers, put a warning on screen
    if (skyWarned === 0) {
      skyWarned = 2.6;
      sfx.skyWarn();
    }

    skyCool -= dt;
    if (skyCool > 0) return;

    // every part of this varies: how long until the next one, where it lands,
    // how fast it comes down, and occasionally two at once.
    skyCool = 1.3 + Math.random() * 1.9;
    var drops = Math.random() < 0.22 ? 2 : 1;

    for (var n = 0; n < drops; n++) {
      var target = player.x + (Math.random() * 420 - 210);
      target = Math.max(20, Math.min(level.w - 40, target));
      shots.push({
        x: target,
        y: -30,
        w: 16, h: 16,
        vx: (Math.random() * 60 - 30),
        vy: 120 + Math.random() * 130,
        arc: true,
        sky: true,
        warn: 0.55 + Math.random() * 0.35,
        spin: Math.random() * 6
      });
    }
  }

  function updateHazards(dt) {
    updateSkyFire(dt);

    throwers.forEach(function (t) {
      // only fire when the thrower is near enough to matter
      if (t.x < cam - 200 || t.x > cam + W + 200) return;
      t.cool -= dt;
      if (t.cool > 0) return;
      t.cool = t.every;
      t.fired = 0.12;
      shots.push({
        x: t.x + (t.dir > 0 ? 26 : -12),
        y: t.y + 6,
        w: 16, h: 16,
        vx: t.speed * t.dir,
        vy: t.arc ? -260 : 0,
        arc: t.arc,
        spin: Math.random() * 6
      });
      sfx.throwHazard();
    });

    throwers.forEach(function (t) { if (t.fired > 0) t.fired -= dt; });

    for (var i = shots.length - 1; i >= 0; i--) {
      var s = shots[i];
      if (s.warn > 0) { s.warn -= dt; s.spin += dt * 5; continue; }
      if (s.arc) s.vy += 900 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.spin += dt * 7;

      var gone = s.x < cam - 300 || s.x > cam + W + 300 || s.y > H + 60;
      if (!gone) {
        for (var p = 0; p < platforms.length; p++) {
          if (overlaps(s, platforms[p])) { gone = true; break; }
        }
      }
      if (gone) { shots.splice(i, 1); continue; }

      if (player.hurt <= 0 && overlaps(s, player)) {
        shots.splice(i, 1);
        player.hurt = 1;
        loseLife();
        return;
      }
    }
  }

  function drawSkySource(t) {
    if (!skyActive()) return;
    var x = (W * 0.5) + Math.sin(skyDrift * 0.4) * (W * 0.32);
    ctx.fillStyle = 'rgba(43,30,79,0.9)';
    ctx.fillRect(x - 46, 18, 92, 18);
    ctx.fillRect(x - 30, 6, 60, 18);
    var glow = 0.4 + 0.35 * Math.abs(Math.sin(t * 5));
    ctx.fillStyle = 'rgba(255,122,92,' + glow.toFixed(2) + ')';
    ctx.fillRect(x - 34, 34, 68, 5);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(x - 8, 36, 16, 3);
  }

  function drawThrowers(t) {
    throwers.forEach(function (th) {
      var x = th.x - cam;
      if (x < -80 || x > W + 80) return;
      var lit = th.fired > 0;

      if (theme === 'space') {
        // a crystal emitter
        ctx.fillStyle = '#3b2d68';
        ctx.fillRect(x, th.y + 14, 28, 20);
        ctx.fillStyle = lit ? '#bff2ff' : '#6fe6ff';
        ctx.beginPath();
        ctx.moveTo(x + 14, th.y - 6);
        ctx.lineTo(x + 28, th.y + 16);
        ctx.lineTo(x + 14, th.y + 26);
        ctx.lineTo(x, th.y + 16);
        ctx.closePath();
        ctx.fill();
      } else {
        // a stone brazier
        ctx.fillStyle = '#4a3a33';
        ctx.fillRect(x, th.y + 16, 28, 18);
        ctx.fillStyle = '#6b5349';
        ctx.fillRect(x - 3, th.y + 12, 34, 6);
        var flick = 6 + Math.abs(Math.sin(t * 9 + th.x)) * (lit ? 12 : 6);
        ctx.fillStyle = '#ff7a5c';
        ctx.beginPath();
        ctx.ellipse(x + 14, th.y + 8, 9, flick, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.ellipse(x + 14, th.y + 10, 4, flick * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  function drawShots(t) {
    shots.forEach(function (s) {
      var x = s.x - cam;
      if (x < -40 || x > W + 40) return;

      // a shadow on the ground marks where an incoming drop will land
      if (s.warn > 0) {
        var pulse = 0.35 + 0.4 * Math.abs(Math.sin(t * 12));
        ctx.fillStyle = 'rgba(255,122,92,' + pulse.toFixed(2) + ')';
        ctx.beginPath();
        ctx.ellipse(x + 8, GROUND_Y - 4, 16, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x + 5, 6, 6, 14);
        return;
      }

      var cx = x + s.w / 2;
      var cy = s.y + s.h / 2;

      if (theme === 'space') {
        // a shard of hot blue glass
        ctx.fillStyle = 'rgba(111,230,255,0.22)';
        ctx.beginPath();
        ctx.arc(cx, cy, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(s.spin);
        ctx.fillStyle = '#bff2ff';
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(6, 0);
        ctx.lineTo(0, 10);
        ctx.lineTo(-6, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#2ea8d6';
        ctx.fillRect(-2, -5, 4, 10);
        ctx.restore();
      } else {
        // a ball of fire
        var f = 1 + Math.abs(Math.sin(t * 14 + s.spin)) * 0.35;
        ctx.fillStyle = 'rgba(255,122,92,0.25)';
        ctx.beginPath();
        ctx.arc(cx, cy, 14 * f, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff7a5c';
        ctx.beginPath();
        ctx.arc(cx, cy, 8 * f, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.arc(cx, cy, 4 * f, 0, Math.PI * 2);
        ctx.fill();
      }
    });
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
    var night = clamp01(cam / (level.w - W));

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
      var span = level.w * pl.par + W + 400;
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

  function drawNotice(t) {
    if (skyWarned <= 0 || state !== 'play') return;
    var a = Math.min(1, skyWarned / 0.6);
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(13,8,32,0.75)';
    ctx.fillRect(W / 2 - 200, 40, 400, 44);
    ctx.fillStyle = '#ff7a5c';
    ctx.font = '20px Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Something up there is throwing fire', W / 2, 69);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  function render(t) {
    if (theme === 'space') drawSpace(t); else drawWorld();
    drawPlatforms();
    drawCoins(t);
    drawGoal();
    drawSkySource(t);
    drawThrowers(t);
    drawEnemies();
    drawShots(t);
    drawPlayer(t);
    drawNotice(t);
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
  loadLevel(0, true);
  state = 'ready';
  openBanner();
  loadBoard();
  if (nameInput.focus) nameInput.focus();
  requestAnimationFrame(frame);
})();

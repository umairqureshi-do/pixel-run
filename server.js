const fs = require('fs');
const path = require('path');
const express = require('express');

const app = express();

// Cloudways (and most Node hosts) inject the port to bind to.
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// High scores live in a plain JSON file next to the app. No database needed.
const SCORES_FILE = path.join(__dirname, 'scores.json');
const MAX_KEPT = 50;

function readScores() {
  try {
    const raw = fs.readFileSync(SCORES_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function writeScores(list) {
  try {
    fs.writeFileSync(SCORES_FILE, JSON.stringify(list, null, 2));
    return true;
  } catch (err) {
    console.error('Could not write scores.json:', err.message);
    return false;
  }
}

function rank(list) {
  return list
    .slice()
    .sort((a, b) => (b.score - a.score) || (a.time - b.time))
    .slice(0, 10);
}

app.use(express.json({ limit: '4kb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0 }));

app.get('/api/scores', (req, res) => {
  res.json(rank(readScores()));
});

app.post('/api/scores', (req, res) => {
  const body = req.body || {};
  const name = String(body.name || '').replace(/[<>]/g, '').trim().slice(0, 12);
  const score = Number(body.score);
  const time = Number(body.time);

  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (!Number.isFinite(score) || score < 0 || score > 999) {
    return res.status(400).json({ error: 'Score out of range' });
  }
  if (!Number.isFinite(time) || time < 0) {
    return res.status(400).json({ error: 'Time out of range' });
  }

  const list = readScores();
  list.push({
    name,
    score: Math.round(score),
    time: Math.round(time * 10) / 10,
    won: !!body.won,
    at: new Date().toISOString()
  });

  const kept = rank(list).concat(
    list.slice().sort((a, b) => (b.score - a.score) || (a.time - b.time)).slice(10, MAX_KEPT)
  );
  writeScores(kept.slice(0, MAX_KEPT));

  res.json(rank(readScores()));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: Math.round(process.uptime()), scores: readScores().length });
});

// Anything else falls back to the game.
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
    if (err) {
      res.status(404).send('Game files not found. Check that public/ sits next to server.js.');
    }
  });
});

app.listen(PORT, HOST, () => {
  console.log(`Pixel Run running on http://${HOST}:${PORT}`);
});

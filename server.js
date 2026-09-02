const path = require('path');
const express = require('express');

const app = express();

// Cloudways (and most Node hosts) inject the port to bind to.
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

// Simple endpoint you can hit to confirm the app is alive.
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
});

// Anything else falls back to the game.
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Pixel Run running on http://${HOST}:${PORT}`);
});

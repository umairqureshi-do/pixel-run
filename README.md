# Pixel Run

A small side-scrolling platformer (run, jump, stomp, collect coins, reach the flag) served by an Express app. No build step, no database, one dependency.

```
pixel-run/
├── server.js          # Express server, binds to process.env.PORT
├── package.json
├── README.md
├── LICENSE
├── .gitignore
├── .nvmrc
└── public/
    ├── index.html
    ├── styles.css
    └── game.js        # the whole game, plain canvas + JS
```

## Run locally

```bash
npm install
npm start
# http://localhost:3000
```

## Put it on GitHub

Two ways, pick whichever you prefer.

**A. Command line** (repo is already initialised with a first commit):

```bash
# create an empty repo on github.com first — no README, no .gitignore
git remote add origin https://github.com/YOUR-USERNAME/pixel-run.git
git branch -M main
git push -u origin main
```

**B. Browser upload:** on github.com, *New repository* → create it empty → *uploading an existing file* → drag in `server.js`, `package.json`, `README.md`, `LICENSE`, `.gitignore` and the whole `public/` folder. Skip `node_modules/` if it exists locally.

Then update the `repository.url` in `package.json` and the clone URL below to your actual username.

## Deploy to Cloudways from GitHub

1. In the Cloudways console, launch a Node.js application.
2. **Deployment via Git** → paste the repo URL (`https://github.com/YOUR-USERNAME/pixel-run.git`), branch `main`. For a private repo, add the SSH key Cloudways shows you as a deploy key in the repo's *Settings → Deploy keys*.
3. Deploy, then SSH in and run `npm install` in the app folder.
4. **Application Settings → Node.js**: entry point `server.js`, Node 18+.
5. Restart, open the app URL.

## Deploy on Cloudways (SFTP upload)

1. Launch a Node.js application from the Cloudways console.
2. Upload the folder contents to `applications/<app>/public_html` over SFTP, or point the app at a Git repo and deploy.
3. In **Application Settings → Node.js**, set:
   - Entry point / start file: `server.js`
   - Node version: 18 or newer
4. Run `npm install` (via SSH in the app folder, or let the deploy step handle it).
5. Restart the app and open the application URL.

Notes:
- The server reads `process.env.PORT` and binds to `0.0.0.0`, which is what the platform's reverse proxy expects. Don't hardcode a port.
- `GET /health` returns `{"status":"ok"}` — handy for a quick check that Node is up before you debug anything else.

## Controls

Arrow keys or A/D to move, Space/W/Up to jump, R to restart. Touch buttons appear on mobile.

## Making it yours

Everything gameplay-related lives at the top of `public/game.js`:
- `GRAVITY`, `MOVE`, `JUMP` — feel and difficulty
- `platforms` — ground segments (gaps between them are pits) and floating ledges
- `coinSpots`, `enemySpots`, `goal` — level contents
- `LEVEL_W` — level length; the camera clamps to it

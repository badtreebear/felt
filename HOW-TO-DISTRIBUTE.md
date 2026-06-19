# Felt Poker Trainer — deploy & use

## What this is
A self-contained Texas Hold'em training web app. **No server, no database, no install
for users** — it runs entirely in the browser. The `dist/` folder *is* the whole app as
plain static files (HTML/CSS/JS + card images).

## Put it online (easiest for a friend)
`dist/` is a static site. Drop it on any free static host:

- **Netlify Drop** — go to https://app.netlify.com/drop and drag the `dist` folder onto
  the page. You get a public URL in seconds.
- **Cloudflare Pages**, **Vercel**, or **GitHub Pages** — upload or point them at `dist`.

It was built with **relative asset paths**, so it works served from a domain root
(`https://yoursite.app/`) *or* a subfolder (`https://you.github.io/felt/`). Send your
friend the link — it opens in any desktop or phone browser, nothing to install.

## Or run it locally (no hosting)
You can't just double-click `index.html` — browsers block JavaScript modules and the
equity Web Worker on `file://`. You need to *serve* the folder (still no real server, just
a static file server):

- `npx serve dist -l 127.0.0.1:3000`  (needs Node.js), then open http://127.0.0.1:3000, **or**
- inside the `dist` folder: `python -m http.server 8000 --bind 127.0.0.1`, then open
  http://127.0.0.1:8000

Binding to **`127.0.0.1`** keeps the server reachable only from your own machine. Without it,
both tools listen on `0.0.0.0` — meaning anyone on your local network could open it.

## Using the trainer
- **Deal new hand** to start; act with Fold / Check / Call / Raise.
- **Settings (cog)**: players, pace, reveal villain cards/profiles, $ vs bb display, and
  **Live grading** — off by default; turn it on to score each decision against the engine
  and show a session scoreboard (matched %, net EV).
- **Bet tip** button: the engine's recommended line for the spot, plus an optional AI
  coach overview (see below).
- **Maths** toggle: equity, pot odds, EV for the current spot.
- **Tracker**: your leaks and good plays over time. Each leak has **Drill this** (replays
  hands you actually misplayed) and, for preflop leaks, **Generate** (fresh random spots
  for unlimited practice).

## Your data stays in your browser
Heroes, tracked hands, and known players are stored **locally in each browser** and do
**not** sync between people or devices. Your friend starts with an empty tracker. To move
a hero or roster between browsers, use the **Export / Import** buttons (in the Tracker and
the Known-players panel).

## Optional AI coach
The coach is **off until you set it up**, and the whole trainer works fine without it.
To enable: **Settings → Coach**, and point it at any OpenAI-compatible chat endpoint —
a cloud API (with your key) or a local LLM (LM Studio, Ollama, etc.).

Caveat: if the app is hosted on **https** but your coach is at **http://localhost**,
browsers block that "mixed content." For a local LLM, run the app locally too (see
"run it locally" above) so both are on `http://localhost`.

## Rebuilding from source
`npm install`, then `npm run build` → produces a fresh `dist/`. `npm test` runs the
test suite. (If you ever host on a subfolder and links break, rebuild with
`npx vite build --base=./`, which this `dist/` already uses.)

## Standalone desktop app (Tauri, unsigned)
The project is also set up as a **Tauri** desktop app — a small native binary that wraps
the web app using the OS's built-in webview (no Chromium bloat). It's configured for
**unsigned** builds, so there's no certificate cost. The tradeoff is a one-time OS warning
the first time someone runs it (details below).

**Build it on your own machine** (produces an installer for *that* OS only):
1. One-time prerequisites:
   - **Rust**: install from https://rustup.rs
   - **Windows**: "Microsoft C++ Build Tools" + the WebView2 runtime (preinstalled on
     Windows 10/11).
   - **macOS**: `xcode-select --install`.
2. `npm install`
3. `npm run tauri build`
4. Find the installer under `src-tauri/target/release/bundle/` —
   Windows: `.msi` and `.exe` (NSIS); macOS: `.dmg` and `.app`.

**Build both Windows + macOS for free via GitHub Actions** (no Mac needed):
A workflow lives at `.github/workflows/desktop.yml`. Commit the new files
(`src-tauri/`, the updated `package.json` + `package-lock.json`, and the workflow), then
either push a tag like `v0.1.0` or run **Actions → Build desktop apps → Run workflow**.
It builds unsigned Windows and macOS (universal) installers and attaches them to a **draft
GitHub Release** you can download and share.

**The first-run warning (because it's unsigned):**
- **Windows**: SmartScreen says "Windows protected your PC" → *More info* → *Run anyway*.
- **macOS**: "can't be opened because Apple cannot check it" → right-click the app →
  *Open* → *Open*. (Only needed the first time.)

To remove those warnings later you'd add code signing — an Apple Developer membership
($99/yr) and/or a Windows code-signing certificate (~$200+/yr). Not required to use or
share the app.

To brand the window/installer icon, drop a 1024×1024 PNG somewhere and run
`npm run tauri icon path/to/icon.png` (regenerates all the icon sizes).

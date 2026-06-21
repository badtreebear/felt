# Felt

An interactive Texas Hold'em training table. Practice preflop and postflop decisions
against modelled opponents, check your line against solver-style charts and the maths,
and track your leaks over time — all running **locally**, with no server, account, or
database.

> Felt runs entirely in the browser/webview. Your hands, heroes, and settings stay on
> your machine.

## Features

- **Play and practise** — deal hands or set up specific spots; act with fold / check /
  call / bet / raise from any seat count (2–9 players).
- **Charts for the actual spot** — RFI opening ranges, defend-vs-open, and vs-3-bet
  continuation ranges, surfaced for the real situation at the table.
- **The maths, on demand** — equity, pot odds, and EV for the current decision, plus a
  bet tip that explains the recommended line.
- **Tracker, leak finder, and drills** — your decisions are graded against the engine;
  recurring leaks get replayable drills and generated practice spots.
- **Player roster and profiles** — name your regular opponents, assign tendencies
  (nit, station, LAG, …), and seat them for a "pub game".
- **Optional AI coach** — point it at any OpenAI-compatible endpoint (a local LLM like
  Ollama/LM Studio, or a cloud API with your own key). Off by default; the trainer is
  fully functional without it.

## Run from source

Requires [Node.js](https://nodejs.org).

```bash
npm install
npm run dev      # http://127.0.0.1:5173
npm test         # run the test suite
npm run build    # production build into dist/
```

## Desktop app

Felt is also packaged as an unsigned [Tauri](https://tauri.app) desktop app (Windows
`.msi`/`.exe`, macOS `.dmg`). Build it yourself or via the bundled GitHub Actions
workflow — see **[HOW-TO-DISTRIBUTE.md](./HOW-TO-DISTRIBUTE.md)** for prerequisites, the
build commands, and the one-time "unsigned app" first-run steps.

## Privacy & security

- All data (heroes, tracker history, known players) is stored locally and never leaves
  your machine.
- The AI coach is opt-in. Outbound connections are restricted to localhost by default.
- Your API key is never written into a backup file. (In the desktop build it is kept in
  the OS keychain; in the browser build it stays in local storage.)

## Tech

Vanilla JavaScript + [Vite](https://vitejs.dev), [Tauri](https://tauri.app) for the
desktop shell, and [Vitest](https://vitest.dev) for tests.

## License

[MIT](./LICENSE)

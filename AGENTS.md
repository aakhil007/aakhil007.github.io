# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this is

A personal site published via GitHub Pages at **aakhil.in** (`CNAME`). Static HTML/CSS/JS — **no build step, no dependencies, no frameworks, no CDNs**. Anything pushed to `master` goes live immediately; keep that in mind before pushing.

## Structure

- `index.html` — homepage; fake terminal with typewriter animations (`runTerminalAnimation`, sections keyed by name)
- `assets/css/style.css` — shared terminal theme (palette variables, `.terminal`, `.prompt`, `.comment`, `.folder-link`, `.cd-link`)
- `games/` — the arcade: `index.html`, `games.css`, `js/` (native ES modules: `main.js` boot, `arcade.js`, `store.js`, `helpers.js`, one file per game)
- `CNAME` — custom domain; don't touch

## Conventions

### Theme
- Terminal aesthetic throughout. Colors come from CSS variables in `style.css`: `--bg`, `--panel`, `--text` (green), `--comment`, `--accent` (blue), `--folder` (gold). macOS traffic-light reds/greens are `#ff5f56`, `#ffbd2e`, `#27c93f`.
- Monospace everywhere ('Fira Mono', Consolas, Menlo).
- Copy speaks shell: `#`-prefixed comments, `./game` to launch, `cd ~` / `cd ..` to navigate.

### Games architecture (`games/js/` — native ES modules, no build step)
`main.js` boots the arcade, `arcade.js` is the hub (`Games`), `store.js` owns `Store`/`KEYS`, `helpers.js` holds shared utilities, and each game is its own file. Follow the existing games — `Sudoku`, `TicTacToe`, `Snake`, `G2048`. When adding a game:
1. Create `js/<game>.js` exporting a plain-object module (`export const <Name> = { ... }`) and import it in `arcade.js`.
2. Add a `KEYS` entry (`aakhil.<game>.stats`) and persist via the `Store` helper — never call `localStorage` directly.
3. Add a tile in `Games.renderArcade()` and a `launch<Name>()` method.
4. Game modules are plain objects: `mount(container, onExit)`, their own `backToArcade()`, optional setup/win screens.
5. Standard scaffold: `<span class="prompt">aakhil@universe:~/games$</span> ./<game>` header, a `# comment` status line, a `.sudoku-bar` with `.btn` buttons (always a "New" button), then the board, then `← back to games`.
6. Update stats exactly once per completed game; celebrate wins with the shared `throwConfetti()`.
7. **Teardown**: stop timers/animation loops and remove any `document`-level listeners when the player exits. Element-bound listeners die with `root.innerHTML = ''` and don't need explicit cleanup.
8. Render user-entered text (e.g. the stored player name) through `escapeHtml()`.

### CSS
- Per-game rules live in `games.css` under a `/* ---- Game name ---- */` banner; shared widgets (`.btn`, `.game-tile`, `.sudoku-bar`, `.num-pad`) are already defined — reuse them.
- Prefer classes over inline styles (see the `.sudoku-bar .timer` pattern). Keep mobile working: the site is read at ~360px.
- Boards max out at ~338px to match `.sudoku-board`.

## Testing

There is no test suite. Before proposing changes:
- Syntax-check every module: `for f in games/js/*.js; do node --input-type=module --check < "$f"; done`
- `python3 -m http.server 8000` from the repo root and play the game you touched (absolute paths like `/assets/...` and ES-module CORS rules both require serving over `http://` from the repo root — not `file://`, not the `games/` dir).
- For engine logic, a stubbed-DOM smoke test that installs `globalThis.document`/`window`/`localStorage` stubs and `await import()`s the module directly works well.

## Commits & PRs

- One-line imperative commit messages, e.g. `Add Tic Tac Toe game with unbeatable minimax computer`. Multi-line bodies for anything non-obvious.
- PRs target `master`.

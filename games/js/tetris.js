import { Store, KEYS } from './store.js';
import { throwConfetti, isTouchDevice } from './helpers.js';

/* ---------------- Tetris ---------------- */

const COLS = 10;
const ROWS = 20;

// Site palette + traffic lights; I gets the one off-palette cyan so all
// seven pieces read distinctly on the dark board.
const PIECES = {
    I: { color: '#89ddff', m: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]] },
    O: { color: '#ffbd2e', m: [[1, 1], [1, 1]] },
    T: { color: '#c3e88d', m: [[0, 1, 0], [1, 1, 1], [0, 0, 0]] },
    S: { color: '#27c93f', m: [[0, 1, 1], [1, 1, 0], [0, 0, 0]] },
    Z: { color: '#ff5f56', m: [[1, 1, 0], [0, 1, 1], [0, 0, 0]] },
    J: { color: '#82aaff', m: [[1, 0, 0], [1, 1, 1], [0, 0, 0]] },
    L: { color: '#ffd700', m: [[0, 0, 1], [1, 1, 1], [0, 0, 0]] }
};
const TYPES = Object.keys(PIECES);

function rotCW(m) {
    const n = m.length;
    return m.map((row, y) => row.map((_, x) => m[n - 1 - x][y]));
}

// Precompute the four rotation states of every piece.
const SHAPES = {};
for (const t of TYPES) {
    const states = [PIECES[t].m];
    for (let i = 1; i < 4; i++) states.push(rotCW(states[i - 1]));
    SHAPES[t] = states;
}

// Simple kick table: center, nudge left/right, up (floor), wide left/right.
const KICKS = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0]];
const LINE_SCORE = [0, 100, 300, 500, 800];

function dropMs(level) {
    return Math.max(60, Math.round(800 * Math.pow(0.85, level - 1)));
}

// Key groups shared by keydown/keyup handling.
const KEY_LEFT = ['ArrowLeft', 'a', 'A'];
const KEY_RIGHT = ['ArrowRight', 'd', 'D'];
const KEY_SOFT = ['ArrowDown', 's', 'S'];
const KEY_ROT_CW = ['ArrowUp', 'w', 'W', 'x', 'X'];
const KEY_ROT_CCW = ['z', 'Z'];
const KEY_HARD = [' '];

export const Tetris = {
    root: null,
    onExit: null,
    state: 'idle',          // idle | running | paused | clearing | over
    grid: null,
    piece: null,
    next: null,
    bag: [],
    score: 0,
    lines: 0,
    level: 1,
    gravMs: 0,
    gravAcc: 0,
    lastTs: null,
    raf: null,
    keyHandler: null,
    keyUpHandler: null,
    visHandler: null,
    canvas: null,
    ctx: null,
    cell: 0,
    cssCell: 0,
    nextCanvas: null,
    nextCtx: null,
    nextCell: 0,
    dasDir: 0,
    dasTimer: 0,
    heldL: false,
    heldR: false,
    softHeld: false,
    lockTimer: 0,
    lockResets: 0,
    clearingRows: null,
    clearTimer: 0,
    wasRecord: false,

    DAS_MS: 170,
    ARR_MS: 50,
    SOFT_MS: 40,
    LOCK_MS: 500,
    MAX_RESETS: 15,
    CLEAR_MS: 160,

    mount(container, onExit) {
        this.root = container;
        this.onExit = onExit;
        // Document-level listeners need explicit teardown on exit.
        this.keyHandler = (e) => this.onKey(e);
        this.keyUpHandler = (e) => this.onKeyUp(e);
        // keyup can be lost when the tab hides mid-press — drop all held
        // keys or soft-drop/DAS would be stuck on after resuming.
        this.visHandler = () => {
            if (document.hidden) {
                this.heldL = false;
                this.heldR = false;
                this.softHeld = false;
                this.dasDir = 0;
                this.pause();
            }
        };
        document.addEventListener('keydown', this.keyHandler);
        document.addEventListener('keyup', this.keyUpHandler);
        document.addEventListener('visibilitychange', this.visHandler);
        this.newGame();
    },

    unmount() {
        this.stopLoop();
        if (this.keyHandler) document.removeEventListener('keydown', this.keyHandler);
        if (this.keyUpHandler) document.removeEventListener('keyup', this.keyUpHandler);
        if (this.visHandler) document.removeEventListener('visibilitychange', this.visHandler);
        this.keyHandler = null;
        this.keyUpHandler = null;
        this.visHandler = null;
    },

    newGame() {
        this.stopLoop();
        this.state = 'idle';
        this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
        this.piece = null;
        this.bag = [];
        this.next = this.drawFromBag();
        this.score = 0;
        this.lines = 0;
        this.level = 1;
        this.gravMs = dropMs(1);
        this.gravAcc = 0;
        this.dasDir = 0;
        this.heldL = false;
        this.heldR = false;
        this.softHeld = false;
        this.lockTimer = 0;
        this.lockResets = 0;
        this.clearingRows = null;
        this.wasRecord = false;
        this.render();
    },

    render() {
        this.root.innerHTML = '';
        const h = document.createElement('div');
        h.innerHTML = `<span class="prompt">aakhil@universe:~/games$</span> ./tetris`;

        const status = document.createElement('div');
        status.className = 'comment';
        status.id = 'tetris-status';
        status.textContent = isTouchDevice()
            ? '# swipe to move · tap to rotate'
            : '# press ← → to move · ↑ rotates · space drops';

        const bar = document.createElement('div');
        bar.className = 'sudoku-bar';
        const stats = Store.get(KEYS.tetris, { best: 0, played: 0, lines: 0 });
        bar.innerHTML = `<span class="comment">score <span class="tetris-score" id="tetris-score">0</span>` +
            ` · best ${stats.best || 0}</span>`;
        const newBtn = document.createElement('button');
        newBtn.className = 'btn';
        newBtn.textContent = 'New';
        newBtn.onclick = () => this.newGame();
        const pauseBtn = document.createElement('button');
        pauseBtn.className = 'btn';
        pauseBtn.id = 'tetris-pause-btn';
        pauseBtn.textContent = 'Pause';
        pauseBtn.onclick = () => this.togglePause();
        bar.append(newBtn, pauseBtn);

        // Board + side panel (next piece, lines, level) side by side.
        const wrap = document.createElement('div');
        wrap.className = 'tetris-wrap';
        const canvas = document.createElement('canvas');
        canvas.className = 'tetris-board';
        canvas.setAttribute('aria-label', 'tetris game board');
        this.canvas = canvas;
        this.attachTouch(canvas);

        const side = document.createElement('div');
        side.className = 'tetris-side';
        const label = document.createElement('div');
        label.className = 'comment';
        label.textContent = '# next';
        const nextCanvas = document.createElement('canvas');
        nextCanvas.className = 'tetris-next';
        nextCanvas.setAttribute('aria-label', 'next piece preview');
        this.nextCanvas = nextCanvas;
        const info = document.createElement('div');
        info.className = 'tetris-info';
        info.innerHTML = `# lines <span class="tetris-num" id="tetris-lines">0</span><br>` +
            `# level <span class="tetris-num" id="tetris-level">1</span>`;
        side.append(label, nextCanvas, info);
        wrap.append(canvas, side);

        this.root.append(h, status, bar, wrap, this.makePad(), this.backToArcade());

        // Size the backing stores now that the canvases are in the DOM (crisp on HiDPI).
        const dpr = window.devicePixelRatio || 1;
        const px = Math.max(1, Math.round(canvas.clientWidth * dpr));
        canvas.width = px;
        canvas.height = px * 2;
        this.cell = px / COLS;
        this.cssCell = canvas.clientWidth / COLS;
        this.ctx = canvas.getContext('2d');

        const npx = Math.max(1, Math.round(nextCanvas.clientWidth * dpr));
        nextCanvas.width = npx;
        nextCanvas.height = Math.round(npx * 0.75);
        this.nextCell = npx / 4;
        this.nextCtx = nextCanvas.getContext('2d');

        this.drawNext();
        this.draw();
    },

    backToArcade() {
        const wrap = document.createElement('div');
        const link = document.createElement('span');
        link.className = 'cd-link';
        link.textContent = '← back to games';
        link.onclick = () => { this.unmount(); this.onExit(); };
        wrap.appendChild(link);
        return wrap;
    },

    // On-screen buttons — CSS shows them only on touch devices.
    makePad() {
        const pad = document.createElement('div');
        pad.className = 'tetris-pad';
        // Starts the game on first press, then forwards to the action.
        const act = (fn) => () => {
            if (this.state === 'idle') this.start();
            if (this.state === 'running') fn();
        };
        const mk = (label, aria, fn) => {
            const b = document.createElement('button');
            b.className = 'btn';
            b.textContent = label;
            b.setAttribute('aria-label', aria);
            b.onclick = fn;
            return b;
        };
        pad.append(
            mk('◀', 'move left', act(() => this.move(-1))),
            mk('▶', 'move right', act(() => this.move(1))),
            mk('⟳', 'rotate', act(() => this.rotate(true))),
            mk('⇓', 'hard drop', act(() => this.hardDrop())),
            mk('❚❚', 'pause', () => this.togglePause())
        );
        return pad;
    },

    start() {
        if (this.state !== 'idle') return;
        this.state = 'running';
        this.spawn();
        if (this.state !== 'running') return;     // topped out instantly
        this.setStatus('# go!');
        this.setPauseLabel('Pause');
        this.startLoop();
        this.draw();
    },

    pause() {
        if (this.state !== 'running' && this.state !== 'clearing') return;
        if (this.state === 'clearing') this.finishClear(); // collapse now, then hold
        if (this.state !== 'running') return;     // forced clear may have ended the game
        this.state = 'paused';
        this.stopLoop();
        this.setStatus(isTouchDevice() ? '# paused — tap ❚❚ to resume' : '# paused — press P to resume');
        this.setPauseLabel('Resume');
        this.draw();
    },

    resume() {
        if (this.state !== 'paused') return;
        this.state = 'running';
        this.setStatus('# go!');
        this.setPauseLabel('Pause');
        this.startLoop();
        this.draw();
    },

    togglePause() {
        if (this.state === 'running' || this.state === 'clearing') this.pause();
        else if (this.state === 'paused') this.resume();
    },

    setStatus(text) {
        const el = document.getElementById('tetris-status');
        if (el) el.textContent = text;
    },

    setPauseLabel(text) {
        const b = document.getElementById('tetris-pause-btn');
        if (b) b.textContent = text;
    },

    updateHud() {
        const s = document.getElementById('tetris-score');
        if (s) s.textContent = this.score;
        const l = document.getElementById('tetris-lines');
        if (l) l.textContent = this.lines;
        const v = document.getElementById('tetris-level');
        if (v) v.textContent = this.level;
    },

    onKey(e) {
        if (e.repeat) return;                       // we run our own DAS repeat
        const k = e.key;
        if (this.state === 'over') {
            if (k === 'Enter') { e.preventDefault(); this.newGame(); }
            return;
        }
        if (k === 'p' || k === 'P') { this.togglePause(); return; }
        const gameKey = KEY_LEFT.includes(k) || KEY_RIGHT.includes(k) || KEY_SOFT.includes(k) ||
            KEY_ROT_CW.includes(k) || KEY_ROT_CCW.includes(k) || KEY_HARD.includes(k);
        if (!gameKey) return;
        e.preventDefault();                         // also stops Space re-clicking focused .btns
        if (this.state === 'idle') this.start();
        if (this.state !== 'running') return;
        if (KEY_LEFT.includes(k)) {
            this.heldL = true;
            this.dasDir = -1;
            this.dasTimer = this.DAS_MS;
            this.move(-1);
        } else if (KEY_RIGHT.includes(k)) {
            this.heldR = true;
            this.dasDir = 1;
            this.dasTimer = this.DAS_MS;
            this.move(1);
        } else if (KEY_SOFT.includes(k)) {
            this.softHeld = true;
            this.gravAcc = this.softInterval();     // drop immediately
        } else if (KEY_ROT_CW.includes(k)) {
            this.rotate(true);
        } else if (KEY_ROT_CCW.includes(k)) {
            this.rotate(false);
        } else if (KEY_HARD.includes(k)) {
            this.hardDrop();
        }
    },

    onKeyUp(e) {
        const k = e.key;
        if (KEY_LEFT.includes(k)) {
            this.heldL = false;
            if (this.dasDir === -1) {
                this.dasDir = this.heldR ? 1 : 0;
                this.dasTimer = this.DAS_MS;
            }
        } else if (KEY_RIGHT.includes(k)) {
            this.heldR = false;
            if (this.dasDir === 1) {
                this.dasDir = this.heldL ? -1 : 0;
                this.dasTimer = this.DAS_MS;
            }
        } else if (KEY_SOFT.includes(k)) {
            this.softHeld = false;
        }
    },

    softInterval() {
        return Math.min(this.SOFT_MS, this.gravMs);
    },

    move(dx) {
        if (this.state !== 'running' || !this.piece) return false;
        const p = this.piece;
        if (this.collides(SHAPES[p.t][p.rot], p.x + dx, p.y)) return false;
        p.x += dx;
        this.onShift();
        this.draw();
        return true;
    },

    rotate(cw) {
        if (this.state !== 'running' || !this.piece) return false;
        const p = this.piece;
        const nr = (p.rot + (cw ? 1 : 3)) % 4;
        const shape = SHAPES[p.t][nr];
        for (const [kx, ky] of KICKS) {
            if (!this.collides(shape, p.x + kx, p.y + ky)) {
                p.rot = nr;
                p.x += kx;
                p.y += ky;
                this.onShift();
                this.draw();
                return true;
            }
        }
        return false;
    },

    // A successful shift while grounded resets the lock timer, capped so a
    // piece can't be kept alive forever.
    onShift() {
        if (this.grounded() && this.lockResets < this.MAX_RESETS) {
            this.lockTimer = 0;
            this.lockResets++;
        }
    },

    grounded() {
        const p = this.piece;
        if (!p) return false;
        return this.collides(SHAPES[p.t][p.rot], p.x, p.y + 1);
    },

    fall(bySoft) {
        const p = this.piece;
        if (!p || this.collides(SHAPES[p.t][p.rot], p.x, p.y + 1)) return false;
        p.y++;
        this.lockTimer = 0;
        this.lockResets = 0;
        if (bySoft) {
            this.score++;
            this.updateHud();
        }
        return true;
    },

    hardDrop() {
        if (this.state !== 'running' || !this.piece) return;
        let d = 0;
        while (this.fall(false)) d++;
        this.score += d * 2;
        this.updateHud();
        this.lockPiece();
        this.draw();
    },

    ghostY() {
        const p = this.piece;
        if (!p) return 0;
        let gy = p.y;
        while (!this.collides(SHAPES[p.t][p.rot], p.x, gy + 1)) gy++;
        return gy;
    },

    collides(m, px, py) {
        for (let cy = 0; cy < m.length; cy++) {
            for (let cx = 0; cx < m[cy].length; cx++) {
                if (!m[cy][cx]) continue;
                const bx = px + cx;
                const by = py + cy;
                if (bx < 0 || bx >= COLS || by >= ROWS) return true;
                if (by >= 0 && this.grid[by][bx]) return true;
            }
        }
        return false;
    },

    // 7-bag randomizer: every run of seven pieces contains all seven types.
    drawFromBag() {
        if (!this.bag.length) {
            this.bag = TYPES.slice();
            for (let i = this.bag.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
            }
        }
        return this.bag.pop();
    },

    spawn() {
        const t = this.next;
        this.next = this.drawFromBag();
        const m = SHAPES[t][0];
        const topPad = m.findIndex((row) => row.some((c) => c));
        this.piece = { t, rot: 0, x: Math.floor((COLS - m.length) / 2), y: -topPad };
        this.lockTimer = 0;
        this.lockResets = 0;
        this.gravAcc = 0;
        this.drawNext();
        if (this.collides(m, this.piece.x, this.piece.y)) this.gameOver();
    },

    lockPiece() {
        const p = this.piece;
        if (!p) return;
        const m = SHAPES[p.t][p.rot];
        let lockOut = false;
        for (let cy = 0; cy < m.length; cy++) {
            for (let cx = 0; cx < m[cy].length; cx++) {
                if (!m[cy][cx]) continue;
                const by = p.y + cy;
                if (by < 0) { lockOut = true; continue; }
                this.grid[by][p.x + cx] = p.t;
            }
        }
        this.piece = null;
        if (lockOut) { this.gameOver(); return; }

        const rows = [];
        for (let r = 0; r < ROWS; r++) {
            if (this.grid[r].every((c) => c)) rows.push(r);
        }
        if (rows.length) {
            this.state = 'clearing';
            this.clearingRows = rows;
            this.clearTimer = this.CLEAR_MS;
            this.score += LINE_SCORE[rows.length] * this.level;
            this.lines += rows.length;
            const lvl = Math.floor(this.lines / 10) + 1;
            if (lvl > this.level) {
                this.level = lvl;
                this.gravMs = dropMs(lvl);
                this.setStatus(`# level ${lvl} — faster!`);
            }
            this.updateHud();
        } else {
            this.spawn();
        }
    },

    finishClear() {
        if (!this.clearingRows) return;
        const rows = new Set(this.clearingRows);
        this.grid = this.grid.filter((_, r) => !rows.has(r));
        for (let i = 0; i < this.clearingRows.length; i++) this.grid.unshift(Array(COLS).fill(null));
        this.clearingRows = null;
        if (this.state !== 'over') this.state = 'running';
        this.spawn();
    },

    startLoop() {
        this.stopLoop();
        this.lastTs = null;
        const step = (ts) => {
            if (this.lastTs == null) this.lastTs = ts;
            let dt = ts - this.lastTs;
            this.lastTs = ts;
            if (dt > 250) dt = 250;                // clamp jumps after tab switches
            if (this.state === 'running') {
                this.updateDAS(dt);
                const interval = this.softHeld ? this.softInterval() : this.gravMs;
                this.gravAcc += dt;
                while (this.gravAcc >= interval && this.state === 'running') {
                    this.gravAcc -= interval;
                    this.fall(this.softHeld);
                }
                if (this.state === 'running' && this.grounded()) {
                    this.lockTimer += dt;
                    if (this.lockTimer >= this.LOCK_MS) this.lockPiece();
                } else {
                    this.lockTimer = 0;
                }
            } else if (this.state === 'clearing') {
                this.clearTimer -= dt;
                if (this.clearTimer <= 0) this.finishClear();
            } else {
                return;                            // paused/over — loop stops here
            }
            this.draw();
            this.raf = requestAnimationFrame(step);
        };
        this.raf = requestAnimationFrame(step);
    },

    stopLoop() {
        if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
    },

    // Held left/right: pause DAS_MS, then auto-repeat every ARR_MS.
    updateDAS(dt) {
        if (!this.dasDir || this.state !== 'running') return;
        this.dasTimer -= dt;
        let guard = 0;
        while (this.dasTimer <= 0 && guard++ < 20) {
            this.move(this.dasDir);
            this.dasTimer += this.ARR_MS;
        }
    },

    gameOver() {
        this.stopLoop();
        this.state = 'over';
        this.clearingRows = null;
        const stats = Store.get(KEYS.tetris, { best: 0, played: 0, lines: 0 });
        stats.played = (stats.played || 0) + 1;
        stats.lines = (stats.lines || 0) + this.lines;
        this.wasRecord = this.score > (stats.best || 0) && this.score > 0;
        if (this.wasRecord) stats.best = this.score;
        Store.set(KEYS.tetris, stats);
        if (this.wasRecord) {
            this.setStatus(`# new best: ${this.score}! 🎉`);
            throwConfetti();
        } else {
            this.setStatus(`# game over — score ${this.score} · best ${stats.best}`);
        }
        this.draw();
    },

    // ---- rendering ----

    draw() {
        const ctx = this.ctx;
        if (!ctx) return;
        const c = this.cell;

        ctx.fillStyle = '#181c20';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // faint dot grid for terminal texture
        ctx.fillStyle = 'rgba(195, 232, 141, 0.08)';
        for (let x = 0; x < COLS; x++) {
            for (let y = 0; y < ROWS; y++) {
                ctx.fillRect(x * c + c / 2 - 1, y * c + c / 2 - 1, 2, 2);
            }
        }

        // landed blocks
        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                const t = this.grid[y][x];
                if (t) this.drawCell(ctx, x * c, y * c, c, PIECES[t].color);
            }
        }

        // ghost + active piece
        if (this.piece && (this.state === 'running' || this.state === 'paused')) {
            const p = this.piece;
            const m = SHAPES[p.t][p.rot];
            const color = PIECES[p.t].color;
            const gy = this.ghostY();
            if (gy > p.y) {
                ctx.globalAlpha = 0.3;
                ctx.strokeStyle = color;
                ctx.lineWidth = Math.max(1.5, c * 0.08);
                for (let cy = 0; cy < m.length; cy++) {
                    for (let cx = 0; cx < m[cy].length; cx++) {
                        if (!m[cy][cx]) continue;
                        const pad = Math.max(1, c * 0.08);
                        ctx.strokeRect((p.x + cx) * c + pad, (gy + cy) * c + pad, c - pad * 2, c - pad * 2);
                    }
                }
                ctx.globalAlpha = 1;
            }
            for (let cy = 0; cy < m.length; cy++) {
                for (let cx = 0; cx < m[cy].length; cx++) {
                    if (!m[cy][cx]) continue;
                    this.drawCell(ctx, (p.x + cx) * c, (p.y + cy) * c, c, color);
                }
            }
        }

        // line-clear flash
        if (this.state === 'clearing' && this.clearingRows) {
            ctx.fillStyle = '#c3e88d';
            for (const r of this.clearingRows) {
                ctx.fillRect(0, r * c, COLS * c, c);
            }
        }

        if (this.state !== 'running' && this.state !== 'clearing') this.drawOverlay(ctx, c);
    },

    drawCell(ctx, px, py, size, color) {
        const pad = Math.max(1, size * 0.08);
        ctx.fillStyle = color;
        ctx.fillRect(px + pad, py + pad, size - pad * 2, size - pad * 2);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + pad + 0.5, py + pad + 0.5, size - pad * 2 - 1, size - pad * 2 - 1);
    },

    drawNext() {
        const ctx = this.nextCtx;
        if (!ctx || !this.next) return;
        const c = this.nextCell;
        ctx.fillStyle = '#181c20';
        ctx.fillRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
        const m = SHAPES[this.next][0];
        // center the piece's filled bounding box in the 4x3 preview
        let minX = 4, maxX = -1, minY = 4, maxY = -1;
        for (let y = 0; y < m.length; y++) {
            for (let x = 0; x < m[y].length; x++) {
                if (!m[y][x]) continue;
                minX = Math.min(minX, x); maxX = Math.max(maxX, x);
                minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            }
        }
        const ox = (4 - (maxX - minX + 1)) / 2 - minX;
        const oy = (3 - (maxY - minY + 1)) / 2 - minY;
        for (let y = 0; y < m.length; y++) {
            for (let x = 0; x < m[y].length; x++) {
                if (!m[y][x]) continue;
                this.drawCell(ctx, (ox + x) * c, (oy + y) * c, c, PIECES[this.next].color);
            }
        }
    },

    drawOverlay(ctx, c) {
        const w = COLS * c, hgt = ROWS * c;
        const cx = w / 2, cy = hgt / 2;
        ctx.fillStyle = 'rgba(24, 28, 32, 0.78)';
        ctx.fillRect(0, 0, w, hgt);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const mono = "'Fira Mono', Consolas, monospace";
        const line = (text, y, color, scale) => {
            ctx.fillStyle = color;
            ctx.font = `bold ${Math.round(c * scale)}px ${mono}`;
            ctx.fillText(text, cx, y);
        };
        const touch = isTouchDevice();
        if (this.state === 'idle') {
            line('# tetris', cy - c * 1.6, '#5c6370', 0.75);
            if (touch) {
                line('swipe to move', cy, '#c3e88d', 0.7);
                line('tap to rotate', cy + c * 1.4, '#c3e88d', 0.7);
                line('drag down to drop', cy + c * 2.8, '#5c6370', 0.6);
            } else {
                line('← → move · ↑ rotate', cy, '#c3e88d', 0.65);
                line('space hard-drops', cy + c * 1.4, '#5c6370', 0.6);
                line('P pauses', cy + c * 2.8, '#5c6370', 0.6);
            }
        } else if (this.state === 'paused') {
            line('# paused', cy - c * 0.7, '#c3e88d', 0.9);
            line(touch ? 'tap ❚❚ to resume' : 'press P to resume', cy + c * 1.1, '#5c6370', 0.6);
        } else if (this.state === 'over') {
            const stats = Store.get(KEYS.tetris, { best: 0, played: 0, lines: 0 });
            line('# game over', cy - c * 2.2, '#5c6370', 0.7);
            line(`${this.score}`, cy - c * 0.6, '#ffd700', 1.3);
            if (this.wasRecord) line('new best!', cy + c * 0.9, '#c3e88d', 0.7);
            else line(`best ${stats.best}`, cy + c * 0.9, '#5c6370', 0.6);
            line(touch ? 'tap ↻ or New to restart' : 'Enter or New to restart', cy + c * 2.4, '#82aaff', 0.6);
        }
    },

    // ---- touch input on the board ----
    // Horizontal drag moves one column per cell-width, downward drag
    // soft-drops a row per cell-width, a quick tap rotates.

    attachTouch(canvas) {
        let sx = 0, sy = 0, ax = 0, ay = 0, moved = false, t0 = 0;
        canvas.addEventListener('touchstart', (e) => {
            const t = e.changedTouches[0];
            sx = ax = t.clientX;
            sy = ay = t.clientY;
            moved = false;
            t0 = Date.now();
            if (this.state === 'idle') this.start();
        }, { passive: true });
        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (this.state !== 'running') return;
            const t = e.changedTouches[0];
            if (Math.abs(t.clientX - sx) > 12 || Math.abs(t.clientY - sy) > 12) moved = true;
            let dx = t.clientX - ax;
            let dy = t.clientY - ay;
            let guard = 0;
            while (Math.abs(dx) >= this.cssCell && guard++ < 30) {
                const d = dx > 0 ? 1 : -1;
                this.move(d);
                ax += d * this.cssCell;
                dx = t.clientX - ax;
            }
            guard = 0;
            while (dy >= this.cssCell && guard++ < 30) {
                if (!this.fall(true)) break;        // resting on the stack
                ay += this.cssCell;
                dy = t.clientY - ay;
            }
            this.draw();
        }, { passive: false });
        canvas.addEventListener('touchend', (e) => {
            const t = e.changedTouches[0];
            const dx = t.clientX - sx, dy = t.clientY - sy;
            const dt = Date.now() - t0;
            if (!moved && dt < 300) {
                if (this.state === 'idle') this.start();
                else if (this.state === 'running') this.rotate(true);
            } else if (dy > 80 && dt < 220 && Math.abs(dy) > Math.abs(dx) * 2) {
                this.hardDrop();                    // fast downward flick
            }
        }, { passive: true });
    }
};

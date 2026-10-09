import { Store, KEYS } from './store.js';
import { throwConfetti, isTouchDevice, escapeHtml } from './helpers.js';

/* ---------------- 2048 ---------------- */
export const G2048 = {
    root: null,
    onExit: null,
    grid: null,           // 4x4 array of {id, value} | null
    tileEls: null,        // Map: tile id -> its DOM element
    bgEls: null,
    board: null,
    tileId: 0,
    gen: 0,               // bumps on reset/exit; stale animation callbacks abort
    cell: 0,
    score: 0,
    over: false,
    won: false,
    keepPlaying: false,
    animLock: false,
    stats: null,
    keyHandler: null,
    resizeHandler: null,
    winOverlay: null,

    SIZE: 4,
    GAP: 10,
    SLIDE_MS: 110,
    TARGET: 2048,

    mount(container, onExit) {
        this.root = container;
        this.onExit = onExit;
        // Document/window-level listeners need explicit teardown on exit.
        this.keyHandler = (e) => this.onKey(e);
        this.resizeHandler = () => this.layout();
        document.addEventListener('keydown', this.keyHandler);
        window.addEventListener('resize', this.resizeHandler);
        const saved = Store.get(KEYS.g2048Save, null);
        if (saved && saved.grid) { this.restore(saved); } else { this.newGame(); }
    },

    unmount() {
        this.gen++; // cancel any in-flight animation callback
        if (this.keyHandler) document.removeEventListener('keydown', this.keyHandler);
        if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);
        this.keyHandler = null;
        this.resizeHandler = null;
        if (this.winOverlay) { this.winOverlay.remove(); this.winOverlay = null; }
    },

    newGame() {
        this.grid = Array.from({ length: this.SIZE }, () => Array(this.SIZE).fill(null));
        this.tileEls = new Map();
        this.tileId = 0;
        this.score = 0;
        this.over = false;
        this.won = false;
        this.keepPlaying = false;
        this.stats = Store.get(KEYS.g2048, { best: 0, played: 0, wins: 0 });
        this.render();
        this.spawn();
        this.spawn();
        this.save();
    },

    restore(saved) {
        this.stats = Store.get(KEYS.g2048, { best: 0, played: 0, wins: 0 });
        this.tileEls = new Map();
        this.tileId = 0;
        this.score = saved.score || 0;
        this.over = false;
        this.won = !!saved.won;
        // resuming a won game means the player already chose to keep going
        this.keepPlaying = this.won;
        this.grid = saved.grid.map((row) => row.map((v) => (v ? { id: ++this.tileId, value: v } : null)));
        this.render();
        for (let r = 0; r < this.SIZE; r++) {
            for (let c = 0; c < this.SIZE; c++) {
                const t = this.grid[r][c];
                if (t) this.tileEls.set(t.id, this.makeTile(t.value, r, c, null));
            }
        }
    },

    render() {
        this.gen++;
        this.animLock = false;
        this.root.innerHTML = '';
        const h = document.createElement('div');
        h.innerHTML = `<span class="prompt">aakhil@universe:~/games$</span> ./2048`;

        const status = document.createElement('div');
        status.className = 'comment';
        status.id = 'g2048-status';
        status.textContent = this.hintText();

        const bar = document.createElement('div');
        bar.className = 'sudoku-bar';
        bar.innerHTML = `<span class="comment">score <span class="g2048-score" id="g2048-score">0</span>` +
            ` · best <span id="g2048-best">${this.stats.best || 0}</span></span>`;
        const newBtn = document.createElement('button');
        newBtn.className = 'btn';
        newBtn.textContent = 'New';
        newBtn.onclick = () => this.newGame();
        bar.append(newBtn);

        const board = document.createElement('div');
        board.className = 'g2048-board';
        board.setAttribute('aria-label', '2048 board — arrow keys or swipe to move tiles');
        this.board = board;
        this.attachSwipe(board);
        this.bgEls = [];
        for (let r = 0; r < this.SIZE; r++) {
            for (let c = 0; c < this.SIZE; c++) {
                const bg = document.createElement('div');
                bg.className = 'g2048-bg';
                board.appendChild(bg);
                this.bgEls.push(bg);
            }
        }

        this.root.append(h, status, bar, board, this.backToArcade());
        this.layout();
        this.updateScore();
    },

    // Compute the cell size from the live board width, then position every
    // background cell and tile to match (re-run on window resize).
    layout() {
        if (!this.board) return;
        const w = this.board.clientWidth;
        if (!w) return;
        this.cell = (w - this.GAP * (this.SIZE + 1)) / this.SIZE;
        this.bgEls.forEach((bg, i) => this.place(bg, Math.floor(i / this.SIZE), i % this.SIZE));
        for (let r = 0; r < this.SIZE; r++) {
            for (let c = 0; c < this.SIZE; c++) {
                const t = this.grid && this.grid[r][c];
                if (t && this.tileEls.has(t.id)) {
                    const el = this.tileEls.get(t.id);
                    this.place(el, r, c);
                    this.sizeText(el, t.value);
                }
            }
        }
    },

    place(el, r, c) {
        const step = this.cell + this.GAP;
        el.style.width = this.cell + 'px';
        el.style.height = this.cell + 'px';
        el.style.transform = `translate(${this.GAP + c * step}px, ${this.GAP + r * step}px)`;
    },

    sizeText(el, value) {
        const scale = value < 100 ? 0.45 : value < 1000 ? 0.38 : 0.3;
        el.firstChild.style.fontSize = Math.round(this.cell * scale) + 'px';
    },

    tileClass(value) {
        return value > this.TARGET ? 'tile-super' : 'tile-v' + value;
    },

    // kind: 'new' (spawn pop), 'merged' (merge pop), or null (no animation)
    makeTile(value, r, c, kind) {
        const el = document.createElement('div');
        el.className = 'g2048-tile ' + this.tileClass(value);
        const inner = document.createElement('span');
        inner.className = 'g2048-tile-inner' + (kind ? ' ' + kind : '');
        inner.textContent = value;
        el.appendChild(inner);
        this.sizeText(el, value);
        this.place(el, r, c);
        this.board.appendChild(el);
        return el;
    },

    attachSwipe(el) {
        let sx = 0, sy = 0;
        el.addEventListener('touchstart', (e) => {
            const t = e.changedTouches[0];
            sx = t.clientX; sy = t.clientY;
        }, { passive: true });
        el.addEventListener('touchend', (e) => {
            const t = e.changedTouches[0];
            const dx = t.clientX - sx, dy = t.clientY - sy;
            if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return; // ignore taps
            const dir = Math.abs(dx) > Math.abs(dy)
                ? (dx > 0 ? 'right' : 'left')
                : (dy > 0 ? 'down' : 'up');
            this.move(dir);
        }, { passive: true });
    },

    hintText() {
        return isTouchDevice()
            ? '# swipe to move — merge equal tiles'
            : '# press ↑ ↓ ← → or WASD — merge equal tiles';
    },

    setStatus(text) {
        const el = document.getElementById('g2048-status');
        if (el) el.textContent = text;
    },

    updateScore() {
        const el = document.getElementById('g2048-score');
        if (el) el.textContent = this.score;
    },

    onKey(e) {
        if (this.over) {
            if (e.key === 'Enter') { e.preventDefault(); this.newGame(); }
            return;
        }
        const map = {
            ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
            w: 'up', s: 'down', a: 'left', d: 'right',
            W: 'up', S: 'down', A: 'left', D: 'right'
        };
        const dir = map[e.key];
        if (!dir) return;
        e.preventDefault();
        this.move(dir);
    },

    move(dir) {
        if (this.over || this.animLock) return;
        if (this.won && !this.keepPlaying) return; // waiting on the win modal

        const vec = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }[dir];
        const rows = [0, 1, 2, 3], cols = [0, 1, 2, 3];
        // traverse toward the movement direction so tiles settle in order
        if (vec[0] === 1) rows.reverse();
        if (vec[1] === 1) cols.reverse();

        let moved = false;
        const merges = [];
        const mergedIds = new Set(); // merge results can't merge again this move

        for (const r of rows) {
            for (const c of cols) {
                const tile = this.grid[r][c];
                if (!tile) continue;
                // farthest empty cell along the direction
                let nr = r, nc = c;
                while (true) {
                    const fr = nr + vec[0], fc = nc + vec[1];
                    if (fr < 0 || fr >= this.SIZE || fc < 0 || fc >= this.SIZE || this.grid[fr][fc]) break;
                    nr = fr; nc = fc;
                }
                const fr = nr + vec[0], fc = nc + vec[1];
                const next = (fr >= 0 && fr < this.SIZE && fc >= 0 && fc < this.SIZE) ? this.grid[fr][fc] : null;
                if (next && next.value === tile.value && !mergedIds.has(next.id)) {
                    this.grid[r][c] = null;
                    const merged = { id: ++this.tileId, value: tile.value * 2 };
                    this.grid[fr][fc] = merged;
                    mergedIds.add(merged.id);
                    merges.push({ tile: merged, r: fr, c: fc, sources: [tile, next] });
                    moved = true;
                } else if (nr !== r || nc !== c) {
                    this.grid[r][c] = null;
                    this.grid[nr][nc] = tile;
                    moved = true;
                }
            }
        }

        if (!moved) return;

        this.animLock = true;
        this.addScore(merges.reduce((sum, m) => sum + m.tile.value, 0));

        // slide survivors and both merge sources into place
        for (let r = 0; r < this.SIZE; r++) {
            for (let c = 0; c < this.SIZE; c++) {
                const t = this.grid[r][c];
                if (t && this.tileEls.has(t.id)) this.place(this.tileEls.get(t.id), r, c);
            }
        }
        merges.forEach((m) => {
            m.sources.forEach((s) => {
                const el = this.tileEls.get(s.id);
                if (el) this.place(el, m.r, m.c);
            });
        });

        const gen = this.gen;
        setTimeout(() => {
            if (gen !== this.gen) return; // a new game started mid-animation
            merges.forEach((m) => {
                m.sources.forEach((s) => {
                    const el = this.tileEls.get(s.id);
                    if (el) el.remove();
                    this.tileEls.delete(s.id);
                });
                this.tileEls.set(m.tile.id, this.makeTile(m.tile.value, m.r, m.c, 'merged'));
            });
            this.spawn();
            this.save();
            this.animLock = false;
            this.checkEnd(merges);
        }, this.SLIDE_MS);
    },

    spawn() {
        const empty = [];
        for (let r = 0; r < this.SIZE; r++) {
            for (let c = 0; c < this.SIZE; c++) {
                if (!this.grid[r][c]) empty.push([r, c]);
            }
        }
        if (!empty.length) return null;
        const [r, c] = empty[Math.floor(Math.random() * empty.length)];
        const tile = { id: ++this.tileId, value: Math.random() < 0.9 ? 2 : 4 };
        this.grid[r][c] = tile;
        this.tileEls.set(tile.id, this.makeTile(tile.value, r, c, 'new'));
        return tile;
    },

    addScore(n) {
        this.score += n;
        this.updateScore();
        // best is a high-water mark, so it survives abandoned games
        if (n > 0 && this.score > (this.stats.best || 0)) {
            this.stats.best = this.score;
            Store.set(KEYS.g2048, this.stats);
            const el = document.getElementById('g2048-best');
            if (el) el.textContent = this.stats.best;
        }
    },

    movesAvailable() {
        for (let r = 0; r < this.SIZE; r++) {
            for (let c = 0; c < this.SIZE; c++) {
                const t = this.grid[r][c];
                if (!t) return true;
                if (c < this.SIZE - 1 && this.grid[r][c + 1] && this.grid[r][c + 1].value === t.value) return true;
                if (r < this.SIZE - 1 && this.grid[r + 1][c] && this.grid[r + 1][c].value === t.value) return true;
            }
        }
        return false;
    },

    checkEnd(merges) {
        if (!this.won && merges.some((m) => m.tile.value >= this.TARGET)) {
            this.won = true;
            this.stats.wins = (this.stats.wins || 0) + 1;
            Store.set(KEYS.g2048, this.stats);
            this.save();
            throwConfetti();
            this.showWinModal();
            return;
        }
        if (!this.movesAvailable()) this.gameOver();
    },

    gameOver() {
        this.over = true;
        Store.remove(KEYS.g2048Save);
        this.stats.played = (this.stats.played || 0) + 1;
        Store.set(KEYS.g2048, this.stats);
        this.setStatus(`# game over — score ${this.score} · best ${this.stats.best}`);
        this.showOverOverlay();
    },

    showOverOverlay() {
        const ov = document.createElement('div');
        ov.className = 'g2048-overlay';
        const title = document.createElement('div');
        title.className = 'comment';
        title.textContent = '# game over';
        const final = document.createElement('div');
        final.className = 'final';
        final.textContent = `score ${this.score}`;
        const hint = document.createElement('div');
        hint.className = 'comment';
        hint.textContent = isTouchDevice() ? 'tap New to restart' : 'Enter or New to restart';
        const newBtn = document.createElement('button');
        newBtn.className = 'btn primary';
        newBtn.textContent = 'New';
        newBtn.onclick = () => this.newGame();
        ov.append(title, final, hint, newBtn);
        this.board.appendChild(ov);
    },

    showWinModal() {
        const overlay = document.createElement('div');
        overlay.className = 'win-modal';
        this.winOverlay = overlay;
        const card = document.createElement('div');
        card.className = 'card';
        const name = Store.get(KEYS.user, 'Player');
        card.innerHTML = `<h3>🎉 2048!</h3>` +
            `<div class="sub">Nice work, ${escapeHtml(name)} — you hit 2048 with ${this.score} points.<br>` +
            `<span class="comment">keep going for a higher score</span></div>`;
        const row = document.createElement('div');
        row.className = 'difficulty-row';
        const keep = document.createElement('button');
        keep.className = 'btn primary';
        keep.textContent = 'Keep going';
        keep.onclick = () => this.continueAfterWin();
        const fresh = document.createElement('button');
        fresh.className = 'btn';
        fresh.textContent = 'New game';
        fresh.onclick = () => { overlay.remove(); this.winOverlay = null; this.newGame(); };
        row.append(keep, fresh);
        card.appendChild(row);
        overlay.appendChild(card);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) this.continueAfterWin(); });
        document.body.appendChild(overlay);
    },

    continueAfterWin() {
        if (this.winOverlay) { this.winOverlay.remove(); this.winOverlay = null; }
        this.keepPlaying = true;
        this.save();
        this.setStatus('# keep going!');
        if (!this.movesAvailable()) this.gameOver();
    },

    save() {
        if (this.over) return;
        Store.set(KEYS.g2048Save, {
            grid: this.grid.map((row) => row.map((t) => (t ? t.value : 0))),
            score: this.score,
            won: this.won
        });
    },

    backToArcade() {
        const wrap = document.createElement('div');
        const link = document.createElement('span');
        link.className = 'cd-link';
        link.textContent = '← back to games';
        link.onclick = () => { this.unmount(); this.onExit(); };
        wrap.appendChild(link);
        return wrap;
    }
};


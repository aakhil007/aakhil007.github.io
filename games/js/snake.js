import { Store, KEYS } from './store.js';
import { throwConfetti, isTouchDevice } from './helpers.js';

/* ---------------- Snake ---------------- */
export const Snake = {
    root: null,
    onExit: null,
    state: 'idle',          // idle | running | paused | over
    snake: null,
    dir: null,
    queue: null,
    food: null,
    score: 0,
    stepMs: 150,
    acc: 0,
    lastTs: null,
    raf: null,
    keyHandler: null,
    visHandler: null,
    canvas: null,
    ctx: null,
    cell: 0,
    wasRecord: false,

    COLS: 20,
    ROWS: 20,
    START_MS: 150,
    MIN_MS: 70,
    SPEEDUP: 2.5,

    mount(container, onExit) {
        this.root = container;
        this.onExit = onExit;
        // Document-level listeners need explicit teardown on exit.
        this.keyHandler = (e) => this.onKey(e);
        this.visHandler = () => { if (document.hidden) this.pause(); };
        document.addEventListener('keydown', this.keyHandler);
        document.addEventListener('visibilitychange', this.visHandler);
        this.newGame();
    },

    unmount() {
        this.stopLoop();
        if (this.keyHandler) document.removeEventListener('keydown', this.keyHandler);
        if (this.visHandler) document.removeEventListener('visibilitychange', this.visHandler);
        this.keyHandler = null;
        this.visHandler = null;
    },

    newGame() {
        this.stopLoop();
        this.state = 'idle';
        const mid = Math.floor(this.ROWS / 2);
        this.snake = [{ x: mid, y: mid }, { x: mid - 1, y: mid }, { x: mid - 2, y: mid }];
        this.dir = { x: 1, y: 0 };
        this.queue = [];
        this.score = 0;
        this.stepMs = this.START_MS;
        this.wasRecord = false;
        this.spawnFood();
        this.render();
        this.draw();
    },

    render() {
        this.root.innerHTML = '';
        const h = document.createElement('div');
        h.innerHTML = `<span class="prompt">aakhil@universe:~/games$</span> ./snake`;

        const status = document.createElement('div');
        status.className = 'comment';
        status.id = 'snake-status';
        status.textContent = isTouchDevice()
            ? '# swipe or tap ▶ to start'
            : '# press ↑ ↓ ← → or WASD to start';

        const bar = document.createElement('div');
        bar.className = 'sudoku-bar';
        const stats = Store.get(KEYS.snake, { best: 0, played: 0 });
        bar.innerHTML = `<span class="comment">score <span class="snake-score" id="snake-score">0</span>` +
            ` · best ${stats.best || 0}</span>`;
        const newBtn = document.createElement('button');
        newBtn.className = 'btn';
        newBtn.textContent = 'New';
        newBtn.onclick = () => this.newGame();
        const pauseBtn = document.createElement('button');
        pauseBtn.className = 'btn';
        pauseBtn.id = 'snake-pause-btn';
        pauseBtn.textContent = 'Pause';
        pauseBtn.onclick = () => this.togglePause();
        bar.append(newBtn, pauseBtn);

        const canvas = document.createElement('canvas');
        canvas.className = 'snake-board';
        canvas.setAttribute('aria-label', 'snake game board');
        this.canvas = canvas;
        this.attachTouch(canvas);

        this.root.append(h, status, bar, canvas, this.makePad(), this.backToArcade());

        // Size the backing store now that the canvas is in the DOM (crisp on HiDPI).
        const dpr = window.devicePixelRatio || 1;
        const px = Math.max(1, Math.round(canvas.clientWidth * dpr));
        canvas.width = px;
        canvas.height = px;
        this.cell = px / this.COLS;
        this.ctx = canvas.getContext('2d');
        this.syncCenter();
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

    // On-screen d-pad — CSS shows it only on touch devices.
    makePad() {
        const pad = document.createElement('div');
        pad.className = 'snake-pad';
        const mk = (label, d) => {
            const b = document.createElement('button');
            b.className = 'btn';
            b.textContent = label;
            if (d) {
                b.setAttribute('aria-label', `move ${label}`);
                b.onclick = () => {
                    if (this.state === 'idle') this.start(d);
                    else if (this.state === 'running') this.pushDir(d);
                };
            } else {
                b.disabled = true;
                b.style.visibility = 'hidden';
            }
            return b;
        };
        const up = mk('▲', { x: 0, y: -1 });
        const down = mk('▼', { x: 0, y: 1 });
        const left = mk('◀', { x: -1, y: 0 });
        const right = mk('▶', { x: 1, y: 0 });

        // Center: play / pause / resume / restart depending on state.
        const center = document.createElement('button');
        center.className = 'btn primary';
        center.id = 'snake-center-btn';
        center.onclick = () => this.centerAction();

        [null, up, null, left, center, right, null, down, null].forEach((b) => {
            pad.appendChild(b || mk(''));
        });
        return pad;
    },

    centerAction() {
        if (this.state === 'idle') this.start();
        else if (this.state === 'running') this.pause();
        else if (this.state === 'paused') this.resume();
        else if (this.state === 'over') this.newGame();
    },

    // Label the d-pad center button for the current state.
    syncCenter() {
        const b = document.getElementById('snake-center-btn');
        if (!b) return;
        const map = {
            idle: ['▶', 'play'],
            running: ['❚❚', 'pause'],
            paused: ['▶', 'resume'],
            over: ['↻', 'restart']
        };
        const [label, aria] = map[this.state] || ['▶', 'play'];
        b.textContent = label;
        b.setAttribute('aria-label', aria);
    },

    // Swipes on the board steer the snake (canvas has touch-action: none).
    attachTouch(canvas) {
        let sx = 0, sy = 0;
        canvas.addEventListener('touchstart', (e) => {
            const t = e.changedTouches[0];
            sx = t.clientX; sy = t.clientY;
        }, { passive: true });
        canvas.addEventListener('touchend', (e) => {
            const t = e.changedTouches[0];
            const dx = t.clientX - sx, dy = t.clientY - sy;
            if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return; // ignore taps
            const d = Math.abs(dx) > Math.abs(dy)
                ? { x: dx > 0 ? 1 : -1, y: 0 }
                : { x: 0, y: dy > 0 ? 1 : -1 };
            if (this.state === 'idle') this.start(d);
            else if (this.state === 'running') this.pushDir(d);
        }, { passive: true });
    },

    start(d) {
        if (d) this.pushDir(d);
        this.state = 'running';
        this.setStatus('# go!');
        this.setPauseLabel('Pause');
        this.syncCenter();
        this.startLoop();
        this.draw();
    },

    pause() {
        if (this.state !== 'running') return;
        this.state = 'paused';
        this.stopLoop();
        this.setStatus(isTouchDevice() ? '# paused — tap ▶ to resume' : '# paused — press P to resume');
        this.setPauseLabel('Resume');
        this.syncCenter();
        this.draw();
    },

    resume() {
        if (this.state !== 'paused') return;
        this.state = 'running';
        this.setStatus('# go!');
        this.setPauseLabel('Pause');
        this.syncCenter();
        this.startLoop();
        this.draw();
    },

    togglePause() {
        if (this.state === 'running') this.pause();
        else if (this.state === 'paused') this.resume();
    },

    setStatus(text) {
        const el = document.getElementById('snake-status');
        if (el) el.textContent = text;
    },

    setPauseLabel(text) {
        const b = document.getElementById('snake-pause-btn');
        if (b) b.textContent = text;
    },

    updateScore() {
        const el = document.getElementById('snake-score');
        if (el) el.textContent = this.score;
    },

    onKey(e) {
        if (this.state === 'over' && e.key === 'Enter') {
            e.preventDefault();
            this.newGame();
            return;
        }
        if (e.key === 'p' || e.key === 'P') {
            this.togglePause();
            return;
        }
        const map = {
            ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
            w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
            W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0]
        };
        const m = map[e.key];
        if (!m) return;
        e.preventDefault();
        const d = { x: m[0], y: m[1] };
        if (this.state === 'idle') this.start(d);
        else if (this.state === 'running') this.pushDir(d);
    },

    // Queue up to two turns so quick double-presses within one tick
    // can't be lost or turned into an accidental 180°.
    pushDir(d) {
        const last = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
        if (d.x === last.x && d.y === last.y) return;    // same direction
        if (d.x === -last.x && d.y === -last.y) return;  // reversal
        if (this.queue.length >= 2) return;
        this.queue.push(d);
    },

    spawnFood() {
        const free = [];
        for (let x = 0; x < this.COLS; x++) {
            for (let y = 0; y < this.ROWS; y++) {
                if (!this.snake.some((s) => s.x === x && s.y === y)) free.push({ x, y });
            }
        }
        this.food = free.length ? free[Math.floor(Math.random() * free.length)] : null;
    },

    step() {
        if (this.queue.length) this.dir = this.queue.shift();
        const head = { x: this.snake[0].x + this.dir.x, y: this.snake[0].y + this.dir.y };

        // walls are deadly
        if (head.x < 0 || head.x >= this.COLS || head.y < 0 || head.y >= this.ROWS) {
            this.gameOver();
            return;
        }
        const ate = this.food && head.x === this.food.x && head.y === this.food.y;
        // the tail cell vacates this tick unless we grow, so exclude it when not eating
        const body = ate ? this.snake : this.snake.slice(0, -1);
        if (body.some((s) => s.x === head.x && s.y === head.y)) {
            this.gameOver();
            return;
        }

        this.snake.unshift(head);
        if (ate) {
            this.score++;
            this.stepMs = Math.max(this.MIN_MS, this.stepMs - this.SPEEDUP);
            this.spawnFood();
            this.updateScore();
        } else {
            this.snake.pop();
        }
        this.draw();
    },

    startLoop() {
        this.stopLoop();
        this.acc = 0;
        this.lastTs = null;
        const tick = (ts) => {
            if (this.lastTs == null) this.lastTs = ts;
            this.acc += ts - this.lastTs;
            this.lastTs = ts;
            while (this.acc >= this.stepMs && this.state === 'running') {
                this.acc -= this.stepMs;
                this.step();
            }
            if (this.state !== 'running') return;
            this.raf = requestAnimationFrame(tick);
        };
        this.raf = requestAnimationFrame(tick);
    },

    stopLoop() {
        if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
    },

    gameOver() {
        this.stopLoop();
        this.state = 'over';
        const stats = Store.get(KEYS.snake, { best: 0, played: 0 });
        stats.played = (stats.played || 0) + 1;
        this.wasRecord = this.score > (stats.best || 0) && this.score > 0;
        if (this.wasRecord) stats.best = this.score;
        Store.set(KEYS.snake, stats);
        if (this.wasRecord) {
            this.setStatus(`# new best: ${this.score}! 🎉`);
            throwConfetti();
        } else {
            this.setStatus(`# game over — score ${this.score} · best ${stats.best}`);
        }
        this.syncCenter();
        this.draw();
    },

    draw() {
        const ctx = this.ctx;
        if (!ctx) return;
        const c = this.cell;

        ctx.fillStyle = '#181c20';
        ctx.fillRect(0, 0, this.COLS * c, this.ROWS * c);

        // faint dot grid for terminal texture
        ctx.fillStyle = 'rgba(195, 232, 141, 0.08)';
        for (let x = 0; x < this.COLS; x++) {
            for (let y = 0; y < this.ROWS; y++) {
                ctx.fillRect(x * c + c / 2 - 1, y * c + c / 2 - 1, 2, 2);
            }
        }

        // food — the red traffic-light dot
        if (this.food) {
            ctx.fillStyle = '#ff5f56';
            ctx.beginPath();
            ctx.arc(this.food.x * c + c / 2, this.food.y * c + c / 2, c * 0.3, 0, Math.PI * 2);
            ctx.fill();
        }

        // snake — green blocks, brighter head
        this.snake.forEach((seg, i) => {
            ctx.fillStyle = i === 0 ? '#27c93f' : '#c3e88d';
            const pad = Math.max(1, c * 0.08);
            ctx.fillRect(seg.x * c + pad, seg.y * c + pad, c - pad * 2, c - pad * 2);
        });

        if (this.state !== 'running') this.drawOverlay(ctx, c);
    },

    drawOverlay(ctx, c) {
        const w = this.COLS * c, hgt = this.ROWS * c;
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
            line('# snake', cy - c * 1.4, '#5c6370', 0.75);
            if (touch) {
                line('swipe or tap ▶ to start', cy, '#c3e88d', 0.8);
            } else {
                line('press ↑ ↓ ← →', cy, '#c3e88d', 0.8);
                line('or WASD to start', cy + c * 1.4, '#5c6370', 0.7);
            }
        } else if (this.state === 'paused') {
            line('# paused', cy - c * 0.7, '#c3e88d', 0.9);
            line(touch ? 'tap ▶ to resume' : 'press P to resume', cy + c * 1.1, '#5c6370', 0.7);
        } else if (this.state === 'over') {
            const stats = Store.get(KEYS.snake, { best: 0, played: 0 });
            line('# game over', cy - c * 2.2, '#5c6370', 0.75);
            line(`score ${this.score}`, cy - c * 0.6, '#ffd700', 1.3);
            if (this.wasRecord) line('new best!', cy + c * 0.9, '#c3e88d', 0.8);
            else line(`best ${stats.best}`, cy + c * 0.9, '#5c6370', 0.7);
            line(touch ? 'tap ↻ to restart' : 'Enter or New to restart', cy + c * 2.4, '#82aaff', 0.65);
        }
    }
};


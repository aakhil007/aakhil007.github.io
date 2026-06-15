/* =========================================================
   Games arcade — pure client-side, state saved in localStorage
========================================================= */
const Store = {
    get(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw === null ? fallback : JSON.parse(raw);
        } catch (e) { return fallback; }
    },
    set(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
    },
    remove(key) {
        try { localStorage.removeItem(key); } catch (e) {}
    }
};

const KEYS = {
    user: 'aakhil.games.user',
    pref: 'aakhil.sudoku.difficulty',
    stats: 'aakhil.sudoku.stats',
    save: 'aakhil.sudoku.save'
};

const DIFFICULTIES = { easy: 45, medium: 36, hard: 30 }; // number of given clues

// On the standalone page, leaving the arcade returns home.
function goHome() {
    window.location.href = '/';
}

const Games = {
    root: null,

    showArcade(container) {
        this.root = container;
        const name = Store.get(KEYS.user, null);
        if (!name) { this.renderNamePrompt(); return; }
        this.renderArcade(name);
    },

    renderNamePrompt() {
        this.root.innerHTML = '';
        const c = document.createElement('div');
        c.className = 'comment';
        c.textContent = "# first time here — what should I call you?";
        const form = document.createElement('form');
        form.className = 'name-form';
        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 24;
        input.placeholder = 'your name';
        input.setAttribute('aria-label', 'your name');
        const btn = document.createElement('button');
        btn.type = 'submit';
        btn.className = 'btn primary';
        btn.textContent = 'save';
        form.append(input, btn);
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const val = input.value.trim() || 'Player';
            Store.set(KEYS.user, val);
            this.renderArcade(val);
        });
        this.root.append(c, form);
        input.focus();
    },

    renderArcade(name) {
        this.root.innerHTML = '';
        const greet = document.createElement('div');
        greet.innerHTML = `<span class="comment" style="display:inline"># welcome back, </span><span style="color:var(--folder)">${escapeHtml(name)}</span> ` +
            `<span class="comment" style="display:inline">(</span><span class="cd-link" style="margin:0;font-size:0.85em;">not you?</span><span class="comment" style="display:inline">)</span>`;
        greet.querySelector('.cd-link').onclick = () => {
            Store.remove(KEYS.user);
            this.renderNamePrompt();
        };

        const grid = document.createElement('div');
        grid.className = 'games-grid';

        const stats = Store.get(KEYS.stats, { played: 0, won: 0, best: {} });
        const sudokuTile = document.createElement('div');
        sudokuTile.className = 'game-tile';
        sudokuTile.innerHTML = `<span class="icon">🔢</span><span class="name">Sudoku</span>` +
            `<span class="meta">${stats.won || 0} solved</span>`;
        sudokuTile.onclick = () => this.launchSudoku();

        const soon = document.createElement('div');
        soon.className = 'game-tile soon';
        soon.innerHTML = `<span class="icon">🕹️</span><span class="name">More</span><span class="meta">coming soon</span>`;

        grid.append(sudokuTile, soon);

        const statsLine = document.createElement('div');
        statsLine.className = 'stats-line';
        const best = stats.best || {};
        const bestParts = ['easy', 'medium', 'hard']
            .filter((d) => best[d] != null)
            .map((d) => `${d} ${formatTime(best[d])}`);
        statsLine.textContent = '# best times: ' + (bestParts.length ? bestParts.join('  ·  ') : 'none yet');

        const back = document.createElement('div');
        const cd = document.createElement('span');
        cd.className = 'cd-link';
        cd.textContent = 'cd ~';
        cd.onclick = () => goHome();
        back.appendChild(cd);

        this.root.append(greet, grid, statsLine, back);
    },

    launchSudoku() {
        Sudoku.mount(this.root, () => this.showArcade(this.root));
    }
};

/* ---------------- Sudoku engine ---------------- */
const Sudoku = {
    root: null,
    onExit: null,
    state: null,
    timer: null,

    mount(container, onExit) {
        this.root = container;
        this.onExit = onExit;
        const saved = Store.get(KEYS.save, null);
        if (saved) { this.renderResumePrompt(saved); }
        else { this.renderSetup(); }
    },

    renderResumePrompt(saved) {
        this.stopTimer();
        this.root.innerHTML = '';
        const h = document.createElement('h2');
        h.textContent = 'Sudoku';
        const note = document.createElement('div');
        note.className = 'comment';
        note.textContent = `# you have a ${saved.difficulty} game in progress (${formatTime(saved.elapsed)})`;
        const row = document.createElement('div');
        row.className = 'difficulty-row';
        const resume = document.createElement('button');
        resume.className = 'btn primary';
        resume.textContent = 'Resume';
        resume.onclick = () => this.startFromSave(saved);
        const fresh = document.createElement('button');
        fresh.className = 'btn';
        fresh.textContent = 'New game';
        fresh.onclick = () => { Store.remove(KEYS.save); this.renderSetup(); };
        row.append(resume, fresh);
        this.root.append(h, note, row, this.backToArcade());
    },

    renderSetup() {
        this.stopTimer();
        this.root.innerHTML = '';
        const h = document.createElement('h2');
        h.textContent = 'Sudoku';
        const note = document.createElement('div');
        note.className = 'comment';
        note.textContent = '# pick a difficulty';
        const row = document.createElement('div');
        row.className = 'difficulty-row';
        const pref = Store.get(KEYS.pref, 'easy');
        Object.keys(DIFFICULTIES).forEach((diff) => {
            const b = document.createElement('button');
            b.className = 'btn' + (diff === pref ? ' active' : '');
            b.textContent = diff;
            b.onclick = () => { Store.set(KEYS.pref, diff); this.newGame(diff); };
            row.appendChild(b);
        });
        this.root.append(h, note, row, this.backToArcade());
    },

    backToArcade() {
        const wrap = document.createElement('div');
        const link = document.createElement('span');
        link.className = 'cd-link';
        link.textContent = '← back to games';
        link.onclick = () => { this.stopTimer(); this.onExit(); };
        wrap.appendChild(link);
        return wrap;
    },

    newGame(difficulty) {
        const solution = generateSolved();
        const puzzle = makePuzzle(solution, DIFFICULTIES[difficulty]);
        this.state = {
            difficulty,
            solution,
            puzzle,
            current: puzzle.map((r) => r.slice()),
            elapsed: 0,
            startTs: Date.now(),
            solved: false,
            hintsUsed: 0
        };
        this.save();
        this.renderGame();
        this.startTimer();
    },

    startFromSave(saved) {
        this.state = {
            difficulty: saved.difficulty,
            solution: saved.solution,
            puzzle: saved.puzzle,
            current: saved.current,
            elapsed: saved.elapsed,
            startTs: Date.now(),
            solved: false,
            hintsUsed: saved.hintsUsed || 0
        };
        this.renderGame();
        this.startTimer();
    },

    renderGame() {
        this.stopTimer();
        this.root.innerHTML = '';
        const s = this.state;

        const h = document.createElement('h2');
        h.textContent = 'Sudoku';

        const bar = document.createElement('div');
        bar.className = 'sudoku-bar';
        bar.innerHTML = `<span class="comment">${s.difficulty}</span>` +
            `<span class="timer" id="sudoku-timer">${formatTime(s.elapsed)}</span>`;
        const newBtn = document.createElement('button');
        newBtn.className = 'btn';
        newBtn.textContent = 'New';
        newBtn.onclick = () => this.renderSetup();
        const checkBtn = document.createElement('button');
        checkBtn.className = 'btn';
        checkBtn.textContent = 'Check';
        checkBtn.onclick = () => this.highlightConflicts(true);
        const hintBtn = document.createElement('button');
        hintBtn.className = 'btn';
        hintBtn.textContent = 'Hint';
        hintBtn.onclick = () => this.giveHint();
        bar.append(newBtn, checkBtn, hintBtn);

        const board = document.createElement('div');
        board.className = 'sudoku-board';
        this.cells = [];
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const cell = document.createElement('input');
                cell.type = 'text';
                cell.inputMode = 'numeric';
                cell.maxLength = 1;
                cell.className = 'sudoku-cell';
                if ((c + 1) % 3 === 0 && c !== 8) cell.classList.add('box-edge-right');
                if ((r + 1) % 3 === 0 && r !== 8) cell.classList.add('box-edge-bottom');
                cell.dataset.r = r;
                cell.dataset.c = c;
                const given = s.puzzle[r][c] !== 0;
                if (given) {
                    cell.value = s.puzzle[r][c];
                    cell.readOnly = true;
                    cell.classList.add('given');
                } else if (s.current[r][c] !== 0) {
                    cell.value = s.current[r][c];
                }
                cell.addEventListener('input', (e) => this.onInput(e, r, c));
                cell.addEventListener('keydown', (e) => this.onKey(e, r, c));
                board.appendChild(cell);
                this.cells.push(cell);
            }
        }

        const pad = document.createElement('div');
        pad.className = 'num-pad';
        for (let n = 1; n <= 9; n++) {
            const b = document.createElement('button');
            b.className = 'btn';
            b.textContent = n;
            b.onclick = () => this.padInput(String(n));
            pad.appendChild(b);
        }
        const erase = document.createElement('button');
        erase.className = 'btn';
        erase.textContent = '⌫';
        erase.onclick = () => this.padInput('');
        pad.appendChild(erase);

        const banner = document.createElement('div');
        banner.id = 'sudoku-banner';

        this.root.append(h, bar, board, pad, banner, this.backToArcade());
        this.highlightConflicts(false);
    },

    onInput(e, r, c) {
        const v = e.target.value.replace(/[^1-9]/g, '');
        e.target.value = v;
        this.state.current[r][c] = v === '' ? 0 : parseInt(v, 10);
        this.save();
        this.highlightConflicts(false);
        if (v !== '') this.checkLineComplete(r, c);
        this.checkWin();
    },

    // Splash green across a row/column the moment it's completed correctly.
    checkLineComplete(r, c) {
        const s = this.state;
        let rowDone = true;
        for (let i = 0; i < 9; i++) {
            if (s.current[r][i] !== s.solution[r][i]) { rowDone = false; break; }
        }
        if (rowDone) this.flashLine(Array.from({ length: 9 }, (_, i) => this.cells[r * 9 + i]));

        let colDone = true;
        for (let i = 0; i < 9; i++) {
            if (s.current[i][c] !== s.solution[i][c]) { colDone = false; break; }
        }
        if (colDone) this.flashLine(Array.from({ length: 9 }, (_, i) => this.cells[i * 9 + c]));

        const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
        let boxDone = true;
        for (let i = 0; i < 3 && boxDone; i++) {
            for (let j = 0; j < 3; j++) {
                if (s.current[br + i][bc + j] !== s.solution[br + i][bc + j]) { boxDone = false; break; }
            }
        }
        if (boxDone) {
            const boxCells = [];
            for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
                boxCells.push(this.cells[(br + i) * 9 + (bc + j)]);
            }
            this.flashLine(boxCells);
        }
    },

    flashLine(cells) {
        cells.forEach((cell) => {
            cell.classList.remove('flash-complete');
            void cell.offsetWidth; // force reflow so the animation can replay
            cell.classList.add('flash-complete');
            cell.addEventListener('animationend', function handler() {
                cell.classList.remove('flash-complete');
                cell.removeEventListener('animationend', handler);
            });
        });
    },

    // Reveal one correct cell. Prefers the focused cell if it's blank/wrong,
    // otherwise picks a random unsolved cell.
    giveHint() {
        const s = this.state;
        if (!s || s.solved) return;

        let target = null;
        const active = document.activeElement;
        if (active && active.classList && active.classList.contains('sudoku-cell') && !active.readOnly) {
            const ar = +active.dataset.r, ac = +active.dataset.c;
            if (s.current[ar][ac] !== s.solution[ar][ac]) target = [ar, ac];
        }
        if (!target) {
            const candidates = [];
            for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
                if (s.puzzle[r][c] === 0 && s.current[r][c] !== s.solution[r][c]) candidates.push([r, c]);
            }
            if (!candidates.length) return;
            target = candidates[Math.floor(Math.random() * candidates.length)];
        }

        const [r, c] = target;
        const val = s.solution[r][c];
        s.current[r][c] = val;
        s.hintsUsed = (s.hintsUsed || 0) + 1;

        const cell = this.cells[r * 9 + c];
        cell.value = val;
        cell.readOnly = true;
        cell.classList.remove('conflict');
        cell.classList.add('hint');

        this.save();
        this.highlightConflicts(false);
        this.flashLine([cell]);
        this.checkLineComplete(r, c);
        this.checkWin();
    },

    onKey(e, r, c) {
        const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
        if (moves[e.key]) {
            e.preventDefault();
            const nr = (r + moves[e.key][0] + 9) % 9;
            const nc = (c + moves[e.key][1] + 9) % 9;
            const next = this.cells[nr * 9 + nc];
            if (next) next.focus();
        }
    },

    padInput(val) {
        const active = document.activeElement;
        if (!active || !active.classList.contains('sudoku-cell') || active.readOnly) return;
        active.value = val;
        active.dispatchEvent(new Event('input'));
    },

    highlightConflicts(showWrong) {
        const s = this.state;
        this.cells.forEach((cell) => cell.classList.remove('conflict'));
        const mark = (r, c) => this.cells[r * 9 + c].classList.add('conflict');
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const v = s.current[r][c];
                if (v === 0) continue;
                // duplicate in row/col/box
                for (let i = 0; i < 9; i++) {
                    if (i !== c && s.current[r][i] === v) { mark(r, c); }
                    if (i !== r && s.current[i][c] === v) { mark(r, c); }
                }
                const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
                for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
                    const rr = br + i, cc = bc + j;
                    if ((rr !== r || cc !== c) && s.current[rr][cc] === v) { mark(r, c); }
                }
                if (showWrong && v !== s.solution[r][c]) { mark(r, c); }
            }
        }
    },

    checkWin() {
        const s = this.state;
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (s.current[r][c] !== s.solution[r][c]) return;
            }
        }
        // Won!
        s.solved = true;
        this.stopTimer();
        Store.remove(KEYS.save);
        const stats = Store.get(KEYS.stats, { played: 0, won: 0, best: {} });
        stats.played = (stats.played || 0) + 1;
        stats.won = (stats.won || 0) + 1;
        stats.best = stats.best || {};
        const prevBest = stats.best[s.difficulty];
        const usedHints = (s.hintsUsed || 0) > 0;
        let isRecord = false;
        if (!usedHints && (prevBest == null || s.elapsed < prevBest)) { stats.best[s.difficulty] = s.elapsed; isRecord = true; }
        Store.set(KEYS.stats, stats);

        const hintNote = usedHints
            ? `${s.hintsUsed} hint${s.hintsUsed > 1 ? 's' : ''} used — time not recorded`
            : '';

        const banner = document.getElementById('sudoku-banner');
        const name = Store.get(KEYS.user, 'Player');
        if (banner) {
            banner.className = 'win-banner';
            let tail;
            if (usedHints) tail = `<span class="comment">${hintNote}</span>`;
            else if (isRecord) tail = `<span style="color:var(--accent)">New best for ${s.difficulty}!</span>`;
            else tail = `<span class="comment">best: ${formatTime(stats.best[s.difficulty])}</span>`;
            banner.innerHTML = `✔ Solved in ${formatTime(s.elapsed)}, ${escapeHtml(name)}! ` + tail;
        }
        this.cells.forEach((cell) => { cell.readOnly = true; });

        this.celebrate();
        let recordText;
        if (usedHints) recordText = hintNote;
        else if (isRecord) recordText = `New best for ${s.difficulty}!`;
        else recordText = `Best ${s.difficulty}: ${formatTime(stats.best[s.difficulty])}`;
        this.showWinModal(name, formatTime(s.elapsed), recordText);
    },

    celebrate() {
        const colors = ['#82aaff', '#ffd700', '#c3e88d', '#ff5f56', '#27c93f', '#ffbd2e'];
        const layer = document.createElement('div');
        layer.className = 'confetti-layer';
        for (let i = 0; i < 130; i++) {
            const piece = document.createElement('span');
            piece.className = 'confetti';
            piece.style.left = (Math.random() * 100) + 'vw';
            piece.style.background = colors[i % colors.length];
            piece.style.animationDelay = (Math.random() * 0.6) + 's';
            piece.style.animationDuration = (2 + Math.random() * 1.6) + 's';
            layer.appendChild(piece);
        }
        document.body.appendChild(layer);
        setTimeout(() => layer.remove(), 4500);
    },

    showWinModal(name, time, recordText) {
        const overlay = document.createElement('div');
        overlay.className = 'win-modal';
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `<h3>🎉 Solved!</h3>` +
            `<div class="sub">Nice work, ${escapeHtml(name)} — done in ${time}.<br>` +
            `<span class="comment">${recordText}</span></div>`;
        const row = document.createElement('div');
        row.className = 'difficulty-row';
        const again = document.createElement('button');
        again.className = 'btn primary';
        again.textContent = 'New game';
        again.onclick = () => { overlay.remove(); this.renderSetup(); };
        const close = document.createElement('button');
        close.className = 'btn';
        close.textContent = 'Close';
        close.onclick = () => overlay.remove();
        row.append(again, close);
        card.appendChild(row);
        overlay.appendChild(card);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    },

    startTimer() {
        this.stopTimer();
        this.state.startTs = Date.now() - this.state.elapsed * 1000;
        this.timer = setInterval(() => {
            if (!this.state || this.state.solved) return;
            this.state.elapsed = Math.floor((Date.now() - this.state.startTs) / 1000);
            const t = document.getElementById('sudoku-timer');
            if (t) t.textContent = formatTime(this.state.elapsed);
            this.save();
        }, 1000);
    },

    stopTimer() {
        if (this.timer) { clearInterval(this.timer); this.timer = null; }
    },

    save() {
        if (!this.state || this.state.solved) return;
        Store.set(KEYS.save, {
            difficulty: this.state.difficulty,
            solution: this.state.solution,
            puzzle: this.state.puzzle,
            current: this.state.current,
            elapsed: this.state.elapsed,
            hintsUsed: this.state.hintsUsed || 0
        });
    }
};

/* ---------------- Sudoku helpers ---------------- */
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function isSafe(board, r, c, n) {
    for (let i = 0; i < 9; i++) {
        if (board[r][i] === n || board[i][c] === n) return false;
    }
    const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        if (board[br + i][bc + j] === n) return false;
    }
    return true;
}

function fillBoard(board) {
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (board[r][c] === 0) {
                for (const n of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
                    if (isSafe(board, r, c, n)) {
                        board[r][c] = n;
                        if (fillBoard(board)) return true;
                        board[r][c] = 0;
                    }
                }
                return false;
            }
        }
    }
    return true;
}

function generateSolved() {
    const board = Array.from({ length: 9 }, () => Array(9).fill(0));
    fillBoard(board);
    return board;
}

function countSolutions(board, limit) {
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (board[r][c] === 0) {
                let count = 0;
                for (let n = 1; n <= 9; n++) {
                    if (isSafe(board, r, c, n)) {
                        board[r][c] = n;
                        count += countSolutions(board, limit);
                        board[r][c] = 0;
                        if (count >= limit) return count;
                    }
                }
                return count;
            }
        }
    }
    return 1;
}

function makePuzzle(solution, clues) {
    const puzzle = solution.map((r) => r.slice());
    const cells = shuffle([...Array(81).keys()]);
    let filled = 81;
    for (const idx of cells) {
        if (filled <= clues) break;
        const r = Math.floor(idx / 9), c = idx % 9;
        if (puzzle[r][c] === 0) continue;
        const backup = puzzle[r][c];
        puzzle[r][c] = 0;
        const copy = puzzle.map((row) => row.slice());
        if (countSolutions(copy, 2) !== 1) {
            puzzle[r][c] = backup; // removing broke uniqueness — keep it
        } else {
            filled--;
        }
    }
    return puzzle;
}

function formatTime(totalSeconds) {
    const s = Math.max(0, totalSeconds | 0);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

/* ---------------- Boot ---------------- */
document.addEventListener('DOMContentLoaded', () => {
    const mount = document.getElementById('games-root');
    if (mount) Games.showArcade(mount);
});

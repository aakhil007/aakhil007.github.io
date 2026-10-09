import { Store, KEYS } from './store.js';
import { formatTime, escapeHtml } from './helpers.js';
import { Sudoku } from './sudoku.js';
import { TicTacToe } from './tictactoe.js';
import { Snake } from './snake.js';
import { G2048 } from './g2048.js';

// On the standalone page, leaving the arcade returns home.
function goHome() {
    window.location.href = '/';
}

export const Games = {
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

        const tttStats = Store.get(KEYS.ttt, { win: 0, loss: 0, draw: 0 });
        const tttTile = document.createElement('div');
        tttTile.className = 'game-tile';
        tttTile.innerHTML = `<span class="icon">⭕</span><span class="name">Tic Tac Toe</span>` +
            `<span class="meta">${tttStats.win || 0} won</span>`;
        tttTile.onclick = () => this.launchTicTacToe();

        const snakeStats = Store.get(KEYS.snake, { best: 0, played: 0 });
        const snakeTile = document.createElement('div');
        snakeTile.className = 'game-tile';
        snakeTile.innerHTML = `<span class="icon">🐍</span><span class="name">Snake</span>` +
            `<span class="meta">best ${snakeStats.best || 0} · ${snakeStats.played || 0} games</span>`;
        snakeTile.onclick = () => this.launchSnake();

        const g2048Stats = Store.get(KEYS.g2048, { best: 0, played: 0, wins: 0 });
        const g2048Tile = document.createElement('div');
        g2048Tile.className = 'game-tile';
        g2048Tile.innerHTML = `<span class="icon">🧩</span><span class="name">2048</span>` +
            `<span class="meta">best ${g2048Stats.best || 0} · ${g2048Stats.played || 0} games</span>`;
        g2048Tile.onclick = () => this.launch2048();

        const soon = document.createElement('div');
        soon.className = 'game-tile soon';
        soon.innerHTML = `<span class="icon">🕹️</span><span class="name">More</span><span class="meta">coming soon</span>`;

        grid.append(sudokuTile, tttTile, snakeTile, g2048Tile, soon);

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
    },

    launchTicTacToe() {
        TicTacToe.mount(this.root, () => this.showArcade(this.root));
    },

    launchSnake() {
        Snake.mount(this.root, () => this.showArcade(this.root));
    },

    launch2048() {
        G2048.mount(this.root, () => this.showArcade(this.root));
    }
};


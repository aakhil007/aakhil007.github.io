import { Store, KEYS } from './store.js';
import { throwConfetti } from './helpers.js';

/* ---------------- Tic Tac Toe (vs unbeatable computer) ---------------- */
export const TicTacToe = {
    root: null,
    onExit: null,
    board: null,
    over: false,
    locked: false,
    cells: null,

    HUMAN: 'X',
    CPU: 'O',
    LINES: [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ],

    mount(container, onExit) {
        this.root = container;
        this.onExit = onExit;
        this.newGame();
    },

    newGame() {
        this.board = Array(9).fill('');
        this.over = false;
        this.locked = false;
        this.render();
    },

    render() {
        this.root.innerHTML = '';
        const h = document.createElement('div');
        h.innerHTML = `<span class="prompt">aakhil@universe:~/games$</span> ./tictactoe`;

        const status = document.createElement('div');
        status.className = 'comment';
        status.id = 'ttt-status';
        status.textContent = '# your move — you are X';

        const bar = document.createElement('div');
        bar.className = 'sudoku-bar';
        const stats = Store.get(KEYS.ttt, { win: 0, loss: 0, draw: 0 });
        bar.innerHTML = `<span class="comment">won ${stats.win || 0} · lost ${stats.loss || 0} · drawn ${stats.draw || 0}</span>`;
        const newBtn = document.createElement('button');
        newBtn.className = 'btn';
        newBtn.textContent = 'New';
        newBtn.onclick = () => this.newGame();
        bar.append(newBtn);

        const board = document.createElement('div');
        board.className = 'ttt-board';
        this.cells = [];
        for (let i = 0; i < 9; i++) {
            const cell = document.createElement('button');
            cell.className = 'ttt-cell';
            cell.textContent = this.board[i];
            cell.onclick = () => this.playerMove(i);
            board.appendChild(cell);
            this.cells.push(cell);
        }

        this.root.append(h, status, bar, board, this.backToArcade());
    },

    backToArcade() {
        const wrap = document.createElement('div');
        const link = document.createElement('span');
        link.className = 'cd-link';
        link.textContent = '← back to games';
        link.onclick = () => this.onExit();
        wrap.appendChild(link);
        return wrap;
    },

    setStatus(text) {
        const el = document.getElementById('ttt-status');
        if (el) el.textContent = text;
    },

    playerMove(i) {
        if (this.over || this.locked || this.board[i] !== '') return;
        this.place(i, this.HUMAN);
        if (this.finishIfOver()) return;

        // Computer responds after a short beat.
        this.locked = true;
        this.setStatus('# thinking…');
        setTimeout(() => {
            const move = this.bestMove();
            if (move != null) this.place(move, this.CPU);
            this.locked = false;
            if (!this.finishIfOver()) this.setStatus('# your move');
        }, 280);
    },

    place(i, player) {
        this.board[i] = player;
        const cell = this.cells[i];
        cell.textContent = player;
        cell.classList.add(player === this.HUMAN ? 'x' : 'o');
    },

    finishIfOver() {
        const win = this.winner(this.board);
        if (win) {
            this.over = true;
            win.line.forEach((i) => this.cells[i].classList.add('ttt-win'));
            const stats = Store.get(KEYS.ttt, { win: 0, loss: 0, draw: 0 });
            if (win.player === this.HUMAN) {
                stats.win = (stats.win || 0) + 1;
                this.setStatus('# you win! 🎉');
                throwConfetti();
            } else {
                stats.loss = (stats.loss || 0) + 1;
                this.setStatus('# computer wins — try again');
            }
            Store.set(KEYS.ttt, stats);
            return true;
        }
        if (this.board.every((c) => c !== '')) {
            this.over = true;
            const stats = Store.get(KEYS.ttt, { win: 0, loss: 0, draw: 0 });
            stats.draw = (stats.draw || 0) + 1;
            Store.set(KEYS.ttt, stats);
            this.setStatus('# draw — well played');
            return true;
        }
        return false;
    },

    winner(b) {
        for (const line of this.LINES) {
            const [a, c, d] = line;
            if (b[a] && b[a] === b[c] && b[a] === b[d]) return { player: b[a], line };
        }
        return null;
    },

    // Minimax: computer (O) maximises, human (X) minimises.
    bestMove() {
        let bestScore = -Infinity, move = null;
        for (let i = 0; i < 9; i++) {
            if (this.board[i] === '') {
                this.board[i] = this.CPU;
                const score = this.minimax(this.board, 0, false);
                this.board[i] = '';
                if (score > bestScore) { bestScore = score; move = i; }
            }
        }
        return move;
    },

    minimax(b, depth, isMax) {
        const win = this.winner(b);
        if (win) return win.player === this.CPU ? 10 - depth : depth - 10;
        if (b.every((c) => c !== '')) return 0;

        if (isMax) {
            let best = -Infinity;
            for (let i = 0; i < 9; i++) {
                if (b[i] === '') {
                    b[i] = this.CPU;
                    best = Math.max(best, this.minimax(b, depth + 1, false));
                    b[i] = '';
                }
            }
            return best;
        }
        let best = Infinity;
        for (let i = 0; i < 9; i++) {
            if (b[i] === '') {
                b[i] = this.HUMAN;
                best = Math.min(best, this.minimax(b, depth + 1, true));
                b[i] = '';
            }
        }
        return best;
    }
};


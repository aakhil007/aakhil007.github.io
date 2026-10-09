/* =========================================================
   Persistence — the only gateway to localStorage
========================================================= */

export const Store = {
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

export const KEYS = {
    user: 'aakhil.games.user',
    pref: 'aakhil.sudoku.difficulty',
    stats: 'aakhil.sudoku.stats',
    save: 'aakhil.sudoku.save',
    ttt: 'aakhil.tictactoe.stats',
    snake: 'aakhil.snake.stats',
    g2048: 'aakhil.2048.stats',
    g2048Save: 'aakhil.2048.save'
};


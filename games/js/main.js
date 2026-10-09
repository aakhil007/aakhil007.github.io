/* ---------------- Boot ---------------- */
import { Games } from './arcade.js';

document.addEventListener('DOMContentLoaded', () => {
    const mount = document.getElementById('games-root');
    if (mount) Games.showArcade(mount);
});

/* =========================================================
   Shared helpers — touch detection, time formatting,
   HTML escaping, win celebration
========================================================= */

// Same query the CSS uses to show touch-only widgets, so hints always
// match which controls are actually visible.
export function isTouchDevice() {
    return window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
}

export function formatTime(totalSeconds) {
    const s = Math.max(0, totalSeconds | 0);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

// Shared win celebration — rains confetti across the viewport.
export function throwConfetti() {
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
}


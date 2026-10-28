import { Game } from './game/game.js';

const game = new Game(document.getElementById('game'), document.getElementById('ui'));
window.__nobu = game; // handy for debugging in the console
if (import.meta.env.DEV) import('./dev.js').then((m) => m.installDevTools(game));
game.boot();

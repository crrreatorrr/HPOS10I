// Dev-only playtest helpers (loaded by main.js when running `npm run dev`).
// In the console: await T.go(1) starts level 1; T.warp(120) jumps to distance 120; T.boss() skips to the boss.
export function installDevTools(game) {
  const T = {
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    down(code) { window.dispatchEvent(new KeyboardEvent('keydown', { code })); },
    up(code) { window.dispatchEvent(new KeyboardEvent('keyup', { code })); },
    async hold(code, ms) { T.down(code); await T.sleep(ms); T.up(code); },
    async tap(code) { T.down(code); await T.sleep(50); T.up(code); await T.sleep(30); },
    async skipTalk() { for (let i = 0; i < 12 && game.ui.talking; i++) { await T.tap('Enter'); await T.sleep(250); } },
    async go(level) {
      const done = game.startLevel(level);
      for (let i = 0; i < 40 && !game.ui.talking; i++) await T.sleep(100);
      await T.skipTalk();
      await done;
      return T.info();
    },
    warp(d, x = 0) { const p = game.player; p.pos.set(x, 0.5, -d); p.vel.set(0, 0, 0); game.camera.snap(p); return T.info(); },
    async boss() {
      game.session.reachBossGate();
      for (let i = 0; i < 60 && !game.ui.talking; i++) await T.sleep(100);
      await T.skipTalk();
      await T.sleep(500);
      return T.info();
    },
    // render a frame and save it to tools/_raw/shots/<name>.jpg
    async shot(name = 'shot') {
      game.render();
      const url = game.renderer.domElement.toDataURL('image/jpeg', 0.72);
      await fetch('/__shot?n=' + name, { method: 'POST', body: url });
      return name;
    },
    // place Nobu at track distance d (lateral x), facing forward
    at(d, x = 0) {
      const tr = game.stage.track, p = game.player;
      const g = tr.groundAt(d, x);
      const w = tr.toWorld(d, x, 0);
      p.pos.set(w.x, (g ? g.y : tr.heightAt(d)) + 0.05, w.z);
      p.vel.set(0, 0, 0);
      p.facing = p.targetFacing = tr.yaw(d);
      p.idleTime = 0;
      p.body.s = d; p.body.u = x;
      game.camera.snap(p);
      return T.info();
    },
    info() {
      const p = game.player, s = game.session;
      return { state: game.state, pos: p.pos.toArray().map((v) => +v.toFixed(2)), mode: p.mode, grounded: p.body.grounded, dead: p.dead,
        lives: game.ui && (s ? undefined : undefined), mask: s?.mask, boss: s?.boss ? { hp: s.boss.hp, phase: s.boss.phase, state: s.boss.state } : null };
    },
  };
  window.T = T;
  // Browsers pause requestAnimationFrame in hidden tabs; keep the game ticking for automated playtests.
  setInterval(() => { if (document.hidden && game.ui) game.loop(performance.now(), true); }, 16);
  import('./art/assets.js').then((m) => { window.__assets = m.Assets; });
}

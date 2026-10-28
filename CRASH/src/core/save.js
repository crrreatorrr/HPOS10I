// Progress persistence in localStorage (every access wrapped; the game runs fine without it).

const KEY = 'nobu-saviour-dog-save-v1';

export const START_LIVES = 4;

function fresh() {
  return {
    unlocked: 1,             // highest level the player may enter (1..3)
    beaten: [false, false, false],
    bones: [false, false, false],   // Golden Bone rewards (all breakables + all dogs)
    bestDogs: [0, 0, 0],
    lives: START_LIVES,
    tickets: 0,
    seenIntro: false,
    finished: false,
    lastLevel: 1,
    tutorials: {},
    nobuModel: 'glb',        // 'glb' (Higgsfield 3D) or 'classic' (primitives)
    pixelated: false,
    godMode: false,          // title-screen cheat: no damage + 4 jumps in a row
    v: 2,
    musicVol: 0.6,
    sfxVol: 0.8,
  };
}

let data = fresh();

export const save = {
  get data() { return data; },
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const old = JSON.parse(raw);
        data = { ...fresh(), ...old };
        if (!(old.v >= 2)) { data.pixelated = false; data.v = 2; } // crisp rendering by default now
      }
    } catch (e) {
      data = fresh();
    }
    return data;
  },
  write() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
  },
  reset() {
    const keep = { nobuModel: data.nobuModel, pixelated: data.pixelated, godMode: data.godMode, musicVol: data.musicVol, sfxVol: data.sfxVol };
    data = { ...fresh(), ...keep };
    this.write();
  },
  hasProgress() { return data.seenIntro || data.unlocked > 1 || data.beaten.some(Boolean); },
};

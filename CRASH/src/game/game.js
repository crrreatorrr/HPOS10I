// Game: renderer, main loop, and the state machine (title, cutscenes, map, play, complete, game over, ending).
import * as THREE from 'three';
import { Assets } from '../art/assets.js';
import { input } from '../core/input.js';
import { audio } from '../audio/audio.js';
import { save, START_LIVES } from '../core/save.js';
import { UI } from '../ui/ui.js';
import { GameCamera } from '../camera/camera.js';
import { Player, createNobuModel } from '../player/player.js';
import { NobuAnimator } from '../player/nobuAnim.js';
import { SprotoMask, maskMesh } from '../entities/mask.js';
import { Session, LEVEL_NAMES } from './session.js';
import { INTRO, RESCUE, ENDING, BETWEEN } from '../story/script.js';
import { damp } from '../core/util.js';

const MAP_NODES = { 1: { x: 24, y: 70 }, 2: { x: 50, y: 50 }, 3: { x: 77, y: 27 } };

export class Game {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    this.uiRoot = uiRoot;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new GameCamera(innerWidth / innerHeight);
    this.state = 'loading';
    this.session = null;
    this.stage = null;
    this.fx = null;
    this.flyingMasks = [];
    this.last = performance.now();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('beforeunload', (e) => {
      if (this.state === 'play') { e.preventDefault(); e.returnValue = ''; }
    });
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    const pix = save.data.pixelated;
    const ratio = pix ? Math.min(1, 900 / w) : Math.min(devicePixelRatio, 1.5);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.canvas.style.imageRendering = pix ? 'pixelated' : 'auto';
    this.camera.cam.aspect = w / h;
    this.camera.cam.updateProjectionMatrix();
    if (this.titleCam) { this.titleCam.aspect = w / h; this.titleCam.updateProjectionMatrix(); }
  }

  async boot() {
    save.load();
    audio.setVolumes(save.data.musicVol, save.data.sfxVol);
    this.uiRoot.innerHTML = '<div class="loading"><div class="big-title" style="font-size:52px">NOBU</div><div class="bar"><div class="fill"></div></div><div class="hint">Loading Higgsfield art...</div></div>';
    const fill = this.uiRoot.querySelector('.fill');
    await Assets.init((p) => { fill.style.width = `${Math.round(p * 100)}%`; });
    this.uiRoot.innerHTML = '';
    this.ui = new UI(this.uiRoot);
    this.ui.godBadge(save.data.godMode);
    this.player = new Player(this);
    this.mask = new SprotoMask(this);
    this.resize();
    this._buildTitleScene();
    this.toTitle();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ---------------- main loop ----------------
  loop(now, manual = false) {
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    input.poll();
    if (input.anyPressed()) audio.unlock();
    try {
      this.update(dt);
    } catch (e) {
      console.error(e);
    }
    this.ui.update(dt);
    this.render();
    if (!manual) requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    switch (this.state) {
      case 'title': this.updateTitle(dt); break;
      case 'cutscene': this.updateCutscene(dt); break;
      case 'map': this.updateMap(dt); break;
      case 'play': this.updatePlay(dt); break;
      case 'pause': this.updatePause(dt); break;
      case 'complete': this.updateComplete(dt); break;
      case 'gameover': this.updateGameOver(dt); break;
      case 'credits': this.updateCredits(dt); break;
      default: break;
    }
  }

  render() {
    if (this.state === 'title' || this.state === 'credits') {
      this.renderer.render(this.titleScene, this.titleCam);
    } else if ((this.state === 'play' || this.state === 'pause') && this.session?.stage) {
      this.renderer.render(this.session.stage.scene, this.camera.cam);
    } else {
      this.renderer.setClearColor(0x12051f);
      this.renderer.clear();
    }
  }

  // ---------------- title ----------------
  _buildTitleScene() {
    const s = new THREE.Scene();
    s.background = Assets.tex('bg_title');
    s.add(new THREE.HemisphereLight(0xfff0e0, 0x705040, 1.4));
    const sun = new THREE.DirectionalLight(0xffe0c0, 1.6);
    sun.position.set(-2, 4, 5);
    s.add(sun);
    this.titleNobu = createNobuModel(save.data.nobuModel);
    this.titleNobuKind = save.data.nobuModel;
    this.titleAnim = new NobuAnimator();
    this.titleNobu.root.position.set(1.1, -0.2, 0);
    this.titleNobu.root.rotation.y = -0.35;
    s.add(this.titleNobu.root);
    const mound = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.6, 0.4, 20), new THREE.MeshLambertMaterial({ map: Assets.tiled('tex_l1_ground') }));
    mound.position.set(1.1, -0.4, 0);
    s.add(mound);
    this.titleMask = maskMesh(0.5);
    this.titleMask.position.set(1.85, 1.55, 0.2);
    s.add(this.titleMask);
    this.titleScene = s;
    this.titleCam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
    this.titleCam.position.set(0, 1.0, 6.2);
    this.titleCam.lookAt(0.2, 1.0, 0);
    this.titleIdle = 0;
  }

  _refreshTitleNobu() {
    if (this.titleNobuKind === save.data.nobuModel) return;
    this.titleScene.remove(this.titleNobu.root);
    this.titleNobu = createNobuModel(save.data.nobuModel);
    this.titleNobuKind = save.data.nobuModel;
    this.titleNobu.root.position.set(1.1, -0.2, 0);
    this.titleNobu.root.rotation.y = -0.35;
    this.titleScene.add(this.titleNobu.root);
  }

  toTitle() {
    this.state = 'title';
    this.session = null;
    this._refreshTitleNobu();
    this.titleScene.background = Assets.tex('bg_title');
    this.titleMenu = null;
    this.ui.hideHud();
    this.ui.bossHide();
    this.ui.setScreen(`
      <img class="title-logo" src="${Assets.url('logo')}">
      <div class="press-start">PRESS START</div>
      <div class="title-footer">Arrows/WASD move · Space jump · J/Shift bite · K/Ctrl slide &amp; belly flop · Esc pause · Gamepad supported</div>`);
    this.ui.fade(0);
    audio.playMusic('title');
  }

  _titleItems() {
    const items = [];
    if (save.hasProgress()) items.push({ id: 'continue', label: 'CONTINUE' });
    items.push({ id: 'new', label: 'NEW GAME' });
    items.push({ id: 'model', label: `NOBU: ${save.data.nobuModel === 'glb' ? '3D SCAN' : 'CLASSIC'}` });
    items.push({ id: 'pixel', label: `PS1 PIXELS: ${save.data.pixelated ? 'ON' : 'OFF'}` });
    items.push({ id: 'god', label: `GOD MODE: ${save.data.godMode ? 'ON' : 'OFF'}` });
    return items;
  }

  _drawTitleMenu() {
    const items = this._titleItems();
    this.titleSel = Math.min(this.titleSel, items.length - 1);
    const html = items.map((it, i) => `<div class="menu-item ${i === this.titleSel ? 'sel' : ''}">${it.label}</div>`).join('');
    this.ui.setScreen(`<img class="title-logo" src="${Assets.url('logo')}"><div class="title-menu"><div class="menu">${html}</div></div>`);
  }

  updateTitle(dt) {
    // Nobu idles on the title screen: the animator cycles through his silly idles
    this.titleIdle += dt;
    const pose = this.titleAnim.update(dt, { mode: 'normal', speed: 0, vy: 0, grounded: true, biteT: -1, flipT: -1, landT: 1, jumpT: 1, idleTime: this.titleIdle, flopPhase: null });
    this.titleNobu.apply(pose);
    this.titleMask.position.y = 1.55 + Math.sin(this.titleIdle * 2) * 0.1;
    this.titleMask.rotation.y = Math.sin(this.titleIdle * 1.3) * 0.3;
    if (!this.titleMenu) {
      if (input.anyPressed()) {
        audio.unlock();
        audio.play('select');
        this.titleMenu = true;
        this.titleSel = 0;
        this._drawTitleMenu();
      }
      return;
    }
    const items = this._titleItems();
    if (input.pressed('up')) { this.titleSel = (this.titleSel + items.length - 1) % items.length; audio.play('menu'); this._drawTitleMenu(); }
    if (input.pressed('down')) { this.titleSel = (this.titleSel + 1) % items.length; audio.play('menu'); this._drawTitleMenu(); }
    if (input.confirmPressed() || input.pressed('bite')) {
      const it = items[this.titleSel];
      audio.play('select');
      if (it.id === 'new') {
        save.reset();
        this.playCutscene(INTRO, () => { save.data.seenIntro = true; save.write(); this.toMap(1); });
      } else if (it.id === 'continue') {
        if (save.data.lives < 0) save.data.lives = START_LIVES;
        this.toMap(Math.min(save.data.unlocked, 3));
      } else if (it.id === 'model') {
        save.data.nobuModel = save.data.nobuModel === 'glb' ? 'classic' : 'glb';
        save.write();
        this._refreshTitleNobu();
        this.player.rebuildModel(save.data.nobuModel);
        this._drawTitleMenu();
      } else if (it.id === 'god') {
        save.data.godMode = !save.data.godMode;
        save.write();
        this.ui.godBadge(save.data.godMode);
        this._drawTitleMenu();
      } else if (it.id === 'pixel') {
        save.data.pixelated = !save.data.pixelated;
        save.write();
        this.resize();
        this._drawTitleMenu();
      }
    }
    if (input.pressed('pause') || input.pressed('back')) { this.titleMenu = null; this.toTitle(); }
  }

  // ---------------- cutscenes (comic panels) ----------------
  playCutscene(panels, onDone, music = 'cutscene') {
    this.state = 'cutscene';
    this.cut = { panels, i: -1, onDone, t: 0 };
    this.ui.hideHud();
    audio.playMusic(music);
    this.ui.fade(0);
    this._nextPanel();
  }

  _nextPanel() {
    const c = this.cut;
    c.i++;
    c.t = 0;
    if (c.i >= c.panels.length) { const done = c.onDone; this.cut = null; this.ui.clearScreen(); done(); return; }
    const p = c.panels[c.i];
    const prev = c.i > 0 ? c.panels[c.i - 1].img : null;
    const caption = `${p.speaker ? `<span class="speaker">${p.speaker}</span>` : ''}${p.text}`;
    if (prev !== p.img || !this.ui.screen.querySelector('.cut-panel')) {
      this.ui.setScreen(`<div class="cut-panel" style="background-image:url('${Assets.url(p.img)}')"></div><div class="cut-caption">${caption}</div><div class="cut-skip">Any key: next · Esc: skip</div>`, 'dim');
      requestAnimationFrame(() => this.ui.screen.querySelector('.cut-panel')?.classList.add('show'));
      audio.play('whoosh');
    } else {
      this.ui.screen.querySelector('.cut-caption').innerHTML = caption;
    }
    // typewriter-lite: reveal caption
    const capEl = this.ui.screen.querySelector('.cut-caption');
    capEl.style.opacity = 0;
    requestAnimationFrame(() => { capEl.style.transition = 'opacity 0.3s'; capEl.style.opacity = 1; });
    if (p.speaker) audio.play(p.speaker.includes('CONE') ? 'blipLow' : 'blip');
  }

  updateCutscene(dt) {
    if (!this.cut) return;
    this.cut.t += dt;
    if (input.pressed('pause') && this.cut.t > 0.2) {
      const done = this.cut.onDone; this.cut = null; this.ui.clearScreen(); done(); return;
    }
    if (this.cut.t > 0.45 && input.anyPressed()) { audio.play('menu'); this._nextPanel(); }
  }

  // ---------------- level select map ----------------
  toMap(sel = 1) {
    this.state = 'map';
    this.session = null;
    this.mapSel = Math.max(1, Math.min(sel, save.data.unlocked));
    this.ui.hideHud();
    this.ui.bossHide();
    audio.playMusic('map');
    this._drawMap();
    this.ui.fade(0);
  }

  _drawMap() {
    const d = save.data;
    let nodes = '';
    for (const n of [1, 2, 3]) {
      const p = MAP_NODES[n];
      const locked = n > d.unlocked;
      const beaten = d.beaten[n - 1];
      nodes += `<div class="map-node ${locked ? 'locked' : ''} ${beaten ? 'beaten' : ''} ${n === this.mapSel ? 'sel' : ''}" style="left:${p.x}%;top:${p.y}%">
        ${!beaten ? '<div class="cone-cloud"></div>' : ''}
        ${d.bones[n - 1] ? `<img class="bone" src="${Assets.url('golden_bone')}">` : ''}
        ${n === this.mapSel ? `<img class="nobu-marker" src="${Assets.url('nobu_head')}">` : ''}
        <div class="dot">${locked ? '🔒' : n}</div>
        <div class="label">${LEVEL_NAMES[n]}</div></div>`;
    }
    const lv = this.mapSel;
    const info = `<div class="map-panel"><div class="sub-title">LEVEL ${lv}: ${LEVEL_NAMES[lv].toUpperCase()}</div>
      <div class="hint">${d.beaten[lv - 1] ? `Cleared! Dogs best: ${d.bestDogs[lv - 1]} · ${d.bones[lv - 1] ? 'Golden Bone earned' : 'Golden Bone: break everything + free every dog'}` : 'The cone smog still hangs over this place...'}</div>
      <div class="hint" style="margin-top:6px">◀ ▶ choose · SPACE / ENTER play · ESC title &nbsp;&nbsp; Lives ${d.lives} · Tickets ${d.tickets}</div></div>`;
    this.ui.setScreen(`<div class="map-bg" style="background-image:url('${Assets.url('level_map')}')"></div>${nodes}${info}`);
  }

  updateMap() {
    const d = save.data;
    if (input.pressed('right') || input.pressed('up')) { if (this.mapSel < d.unlocked) { this.mapSel++; audio.play('menu'); this._drawMap(); } }
    if (input.pressed('left') || input.pressed('down')) { if (this.mapSel > 1) { this.mapSel--; audio.play('menu'); this._drawMap(); } }
    if (input.confirmPressed() || input.pressed('bite')) { audio.play('select'); this.startLevel(this.mapSel); }
    if (input.pressed('pause') || input.pressed('back')) { audio.play('menu'); this.toTitle(); }
  }

  // ---------------- play ----------------
  async startLevel(n) {
    await this.ui.fade(1);
    this.ui.clearScreen();
    save.data.lastLevel = n;
    if (save.data.lives < 0) save.data.lives = START_LIVES;
    save.write();
    this.state = 'play';
    this.session = new Session(this, n);
    this.flyingMasks.length = 0;
    await this.session.startLevel();
  }

  updatePlay(dt) {
    const s = this.session;
    if (!s) return;
    if (input.pressed('pause') && !this.ui.talking && !s.dying) { this.openPause(); return; }
    s.update(dt);
    this._updateFlyingMasks(dt);
  }

  // Blue Sphere -> mask flies to Nobu, then the mask level goes up.
  maskPickup(x, y, z) {
    const m = maskMesh(0.5);
    m.position.set(x, y, z);
    this.stage.scene.add(m);
    this.flyingMasks.push({ m, t: 0, from: new THREE.Vector3(x, y, z), stage: this.stage });
    this.ui.tutorial('sphere');
  }

  _updateFlyingMasks(dt) {
    for (let i = this.flyingMasks.length - 1; i >= 0; i--) {
      const f = this.flyingMasks[i];
      if (f.stage !== this.stage) { this.flyingMasks.splice(i, 1); continue; }
      f.t += dt;
      const k = Math.min(1, f.t / 0.6);
      const target = this.player.pos.clone().add(new THREE.Vector3(0.7, 1.5, 0));
      f.m.position.lerpVectors(f.from, target, k * k);
      f.m.position.y += Math.sin(k * Math.PI) * 1.5;
      f.m.rotation.y += dt * 14;
      if (k >= 1) {
        f.stage.scene.remove(f.m);
        this.flyingMasks.splice(i, 1);
        audio.play('mask');
        if (!this.player.dead) this.session.setMask(this.session.mask + 1);
      }
    }
  }

  onFlop(pos) { this.session?.onFlop(pos); }
  onPlayerDeath(type) { this.session?.onPlayerDeath(type); }

  // ---------------- pause ----------------
  openPause() {
    this.state = 'pause';
    this.pauseSel = 0;
    this.ui.pinHud(true);
    audio.play('menu');
    this._drawPause();
  }

  _pauseItems() {
    return [
      { id: 'resume', label: 'RESUME' },
      { id: 'model', label: `NOBU MODEL: ${save.data.nobuModel === 'glb' ? '3D SCAN' : 'CLASSIC'}` },
      { id: 'pixel', label: `PS1 PIXELS: ${save.data.pixelated ? 'ON' : 'OFF'}` },
      { id: 'music', label: `MUSIC: ${Math.round(save.data.musicVol * 10)}` },
      { id: 'sfx', label: `SFX: ${Math.round(save.data.sfxVol * 10)}` },
      { id: 'quit', label: 'QUIT TO MAP' },
    ];
  }

  _drawPause() {
    const items = this._pauseItems();
    const s = this.session;
    const stats = s?.phase === 'level' && s.stage
      ? `<div class="hint">Dogs freed ${s.stage.entities.filter((e) => e.freed).length}/${s.dogsTotal} · Breakables ${s.stage.entities.filter((e) => e.countable && e.broken).length}/${s.breakablesTotal}</div>` : '';
    this.ui.setScreen(`<div class="big-title">PAUSED</div>${stats}<div class="menu">${items.map((it, i) => `<div class="menu-item ${i === this.pauseSel ? 'sel' : ''}">${it.label}</div>`).join('')}</div>
      <div class="hint" style="margin-top:20px">◀ ▶ adjust · ESC resume</div>`, 'dim');
  }

  updatePause() {
    const items = this._pauseItems();
    const it = items[this.pauseSel];
    if (input.pressed('up')) { this.pauseSel = (this.pauseSel + items.length - 1) % items.length; audio.play('menu'); this._drawPause(); }
    if (input.pressed('down')) { this.pauseSel = (this.pauseSel + 1) % items.length; audio.play('menu'); this._drawPause(); }
    const adj = input.pressed('right') ? 1 : input.pressed('left') ? -1 : 0;
    if (adj && (it.id === 'music' || it.id === 'sfx')) {
      const key = it.id === 'music' ? 'musicVol' : 'sfxVol';
      save.data[key] = Math.max(0, Math.min(1, Math.round((save.data[key] + adj * 0.1) * 10) / 10));
      audio.setVolumes(save.data.musicVol, save.data.sfxVol);
      audio.play('menu');
      save.write();
      this._drawPause();
    }
    if (input.pressed('pause')) { this.closePause(); return; }
    if (input.confirmPressed() || input.pressed('bite')) {
      if (it.id === 'resume') this.closePause();
      else if (it.id === 'model') {
        save.data.nobuModel = save.data.nobuModel === 'glb' ? 'classic' : 'glb';
        save.write();
        this.player.rebuildModel(save.data.nobuModel);
        this._drawPause();
      } else if (it.id === 'pixel') { save.data.pixelated = !save.data.pixelated; save.write(); this.resize(); this._drawPause(); }
      else if (it.id === 'quit') { this.ui.pinHud(false); save.write(); this.ui.fade(1).then(() => this.toMap(this.session.level)); }
    }
  }

  closePause() {
    this.state = 'play';
    this.ui.pinHud(false);
    this.ui.clearScreen();
    audio.play('menu');
  }

  // ---------------- level complete ----------------
  levelCleared(session) {
    const n = session.level;
    const st = session.stats || { tickets: session.levelTickets, broken: 0, breakables: 0, dogs: 0, dogsTotal: 0 };
    const d = save.data;
    const bone = st.breakables > 0 && st.broken >= st.breakables && st.dogs >= st.dogsTotal;
    d.beaten[n - 1] = true;
    d.unlocked = Math.max(d.unlocked, Math.min(3, n + 1));
    d.bestDogs[n - 1] = Math.max(d.bestDogs[n - 1], st.dogs);
    if (bone) d.bones[n - 1] = true;
    save.write();
    // rescue scene first, then the results screen
    this.playCutscene(RESCUE[n], () => this._showComplete(n, st, bone), 'victory');
  }

  _showComplete(n, st, bone) {
    this.state = 'complete';
    this.completeT = 0;
    this.completeNext = { n };
    audio.playMusic('complete');
    const row = (img, label, val, cls = '') => `<div class="stat-row ${cls}"><img src="${Assets.url(img)}"><span>${label}</span><span class="val">${val}</span></div>`;
    this.ui.setScreen(`
      <div class="big-title" style="margin-bottom:2vh">LEVEL ${n} COMPLETE!</div>
      <div class="complete-wrap">
        <img class="complete-nobu" src="${Assets.url('nobu_complete')}">
        <div class="stats">
          ${row('ticket', 'TICKETS', st.tickets)}
          ${row(Assets.has('backpack_icon') ? 'backpack_icon' : 'backpack', 'BREAKABLES', `${st.broken}/${st.breakables}`, st.broken >= st.breakables ? '' : 'miss')}
          ${row('dog_corgi_free', 'DOGS FREED', `${st.dogs}/${st.dogsTotal}`, st.dogs >= st.dogsTotal ? '' : 'miss')}
          ${row('golden_bone', 'GOLDEN BONE', bone ? 'EARNED!' : 'not yet', bone ? 'reward' : 'miss')}
        </div>
      </div>
      <div class="hint" style="margin-top:3vh">Press any key</div>`, 'dim');
    this.ui.screen.style.background = 'radial-gradient(circle at 50% 40%, #5a2399, #1a0530)';
    const rows = [...this.ui.screen.querySelectorAll('.stat-row')];
    rows.forEach((r, i) => setTimeout(() => { r.classList.add('show'); audio.play(i === 3 && bone ? 'oneUp' : 'ticket'); }, 500 + i * 450));
    this.ui.fade(0);
  }

  async updateComplete(dt) {
    this.completeT += dt;
    if (this.completeT > 2.3 && input.anyPressed() && this.completeNext) {
      const { n } = this.completeNext;
      this.completeNext = null;
      audio.play('select');
      this.ui.screen.style.background = '';
      this.ui.setScreen(`<div class="map-bg" style="background-image:url('${Assets.url('level_map')}');filter:brightness(0.5)"></div>`);
      await this.ui.say(BETWEEN[n]);
      if (n === 3) this.playCutscene(ENDING, () => this.toCredits(), 'victory');
      else this.toMap(n + 1);
    }
  }

  // ---------------- game over ----------------
  gameOver(session) {
    this.state = 'gameover';
    this.goSel = 0;
    this.goT = 0;
    this.ui.hideHud();
    this.ui.bossHide();
    audio.playMusic('gameOver');
    this._drawGameOver();
    this.ui.fade(0);
  }
  _drawGameOver() {
    const items = ['CONTINUE', 'QUIT'];
    this.ui.setScreen(`<div class="death-card show"><img src="${Assets.url('death_cone')}"></div>
      <div class="big-title">GAME OVER</div><div class="sub-title">The cone... it fits so well...</div>
      <div class="menu">${items.map((t, i) => `<div class="menu-item ${i === this.goSel ? 'sel' : ''}">${t}</div>`).join('')}</div>`, 'dim');
  }
  updateGameOver(dt) {
    this.goT += dt;
    if (input.pressed('up') || input.pressed('down')) { this.goSel = 1 - this.goSel; audio.play('menu'); this._drawGameOver(); }
    if (this.goT > 0.8 && (input.confirmPressed() || input.pressed('bite'))) {
      audio.play('select');
      const lvl = this.session?.level || save.data.lastLevel || 1;
      save.data.lives = START_LIVES;
      save.write();
      if (this.goSel === 0) this.startLevel(lvl);
      else this.toTitle();
    }
  }

  // ---------------- ending credits ----------------
  toCredits() {
    this.state = 'credits';
    save.data.finished = true;
    save.write();
    this._refreshTitleNobu();
    this.titleScene.background = Assets.tex('story_ending');
    this.creditsT = 0;
    audio.playMusic('victory');
    this.ui.setScreen(`<div style="position:absolute;top:6vh;width:100%;text-align:center"><div class="big-title">THE END</div>
      <div class="credits" style="margin:2vh auto 0">Nobu saved every dog on the island.<br>
      Art generated with Higgsfield · Code in Three.js · All sound synthesized live<br>
      Thanks for playing! Golden Bones: ${save.data.bones.filter(Boolean).length}/3</div></div>
      <div class="press-start" style="bottom:6vh">PRESS ANY KEY</div>`);
    this.ui.fade(0);
  }

  updateCredits(dt) {
    this.creditsT += dt;
    const pose = this.titleAnim.update(dt, { mode: 'victory' });
    this.titleNobu.apply(pose);
    this.titleMask.position.y = 1.55 + Math.sin(this.creditsT * 3) * 0.15;
    this.titleMask.rotation.y += dt * 2;
    if (this.creditsT > 2 && input.anyPressed()) this.toTitle();
  }
}

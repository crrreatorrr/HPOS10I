// Procedural canvas art used when a generated asset is missing.
// The Sproto Mask is drawn here in full, matching the reference face (red, spiky hair, yellow eyes, toothy grin).

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

export function drawSprotoMask(size = 512) {
  const [c, g] = canvas(size, size);
  const s = size / 512;
  g.scale(s, s);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const ink = '#140808';
  const red = '#e3201b';
  const redDark = '#b3120f';

  // spiky hair (behind head)
  g.fillStyle = red; g.strokeStyle = ink; g.lineWidth = 10;
  g.beginPath();
  g.moveTo(130, 190);
  g.lineTo(70, 120); g.lineTo(150, 130);
  g.lineTo(120, 40); g.lineTo(215, 105);
  g.lineTo(240, 18); g.lineTo(290, 100);
  g.lineTo(370, 40); g.lineTo(360, 125);
  g.lineTo(430, 105); g.lineTo(385, 190);
  g.closePath(); g.fill(); g.stroke();

  // ears
  for (const dir of [-1, 1]) {
    g.beginPath();
    const ex = 256 + dir * 170;
    g.moveTo(256 + dir * 120, 250);
    g.quadraticCurveTo(ex + dir * 40, 230, ex + dir * 10, 300);
    g.quadraticCurveTo(ex - dir * 10, 345, 256 + dir * 128, 330);
    g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.lineWidth = 6;
    g.arc(ex - dir * 4, 292, 16, 0, Math.PI * 2); g.stroke(); g.lineWidth = 10;
  }

  // head
  g.beginPath();
  g.moveTo(130, 170);
  g.bezierCurveTo(140, 90, 372, 90, 382, 170);
  g.bezierCurveTo(400, 300, 380, 420, 256, 470);
  g.bezierCurveTo(132, 420, 112, 300, 130, 170);
  g.closePath(); g.fill(); g.stroke();

  // brow wrinkles
  g.strokeStyle = redDark; g.lineWidth = 7;
  for (const y of [150, 172]) { g.beginPath(); g.moveTo(190, y + 6); g.quadraticCurveTo(256, y - 14, 322, y + 6); g.stroke(); }
  g.strokeStyle = ink;

  // eyes
  for (const dir of [-1, 1]) {
    const ex = 256 + dir * 62, ey = 245;
    g.lineWidth = 10;
    g.fillStyle = '#ffe23a';
    g.beginPath(); g.ellipse(ex, ey, 56, 60, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = ink;
    g.beginPath(); g.arc(ex + dir * 6, ey + 8, 17, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(ex + dir * 6 - 5, ey + 2, 5, 0, Math.PI * 2); g.fill();
    // brow arc above each eye
    g.strokeStyle = redDark; g.lineWidth = 8;
    g.beginPath(); g.arc(ex, ey - 6, 74, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    g.strokeStyle = ink;
  }

  // nose
  g.lineWidth = 8;
  g.beginPath(); g.moveTo(236, 318); g.quadraticCurveTo(256, 300, 276, 318); g.quadraticCurveTo(256, 336, 236, 318); g.stroke();

  // big toothy grin
  g.lineWidth = 10;
  g.fillStyle = '#fffbe9';
  g.beginPath();
  g.moveTo(160, 352);
  g.quadraticCurveTo(256, 330, 352, 352);
  g.quadraticCurveTo(330, 440, 256, 446);
  g.quadraticCurveTo(182, 440, 160, 352);
  g.closePath(); g.fill(); g.stroke();
  g.lineWidth = 5;
  g.beginPath(); g.moveTo(170, 392); g.quadraticCurveTo(256, 384, 342, 392); g.stroke();
  for (let i = 0; i < 7; i++) {
    const x = 192 + i * 22;
    g.beginPath(); g.moveTo(x, 346); g.lineTo(x + 2, 438 - Math.abs(i - 3) * 6); g.stroke();
  }
  // cheek lines
  g.lineWidth = 8;
  for (const dir of [-1, 1]) {
    g.beginPath(); g.moveTo(256 + dir * 100, 330); g.quadraticCurveTo(256 + dir * 118, 352, 256 + dir * 108, 370); g.stroke();
  }
  return c;
}

const TEXTURE_COLORS = {
  tex_l1_ground: ['#4fae3b', '#3c8f2c'], tex_l1_wall: ['#7c8a72', '#5e6b56'], tex_l1_platform: ['#a86b38', '#87522a'],
  tex_l2_ground: ['#f0b25a', '#d9953f'], tex_l2_wall: ['#c9633a', '#a14a2a'], tex_l2_platform: ['#c9a26b', '#a98552'],
  tex_l3_ground: ['#6a3fa0', '#4f2c7c'], tex_l3_wall: ['#3d2160', '#2c1748'], tex_l3_platform: ['#f2c21b', '#2a2a2a'],
};

const BG_COLORS = {
  bg_level1: ['#5ec8ff', '#cdf3ff', '#3d9a4a'], bg_boss1: ['#5a2d7a', '#ff9a4a', '#2d3b2a'],
  bg_level2: ['#ff8a5a', '#ffd38a', '#b4562a'], bg_boss2: ['#1a1446', '#5a3a9a', '#2a1630'],
  bg_level3: ['#1c0b2e', '#4a2270', '#1a0a26'], bg_boss3: ['#140622', '#6a1a6a', '#1a0a20'],
  bg_title: ['#ff8a4a', '#ffd38a', '#2a7aa0'], level_map: ['#2aa0d0', '#5ad0f0', '#3aa04a'],
};

export function drawFallback(id) {
  if (id === 'sproto_mask' || id === 'portrait_mask') return drawSprotoMask(512);

  if (TEXTURE_COLORS[id]) {
    const [c, g] = canvas(256, 256);
    const [a, b] = TEXTURE_COLORS[id];
    g.fillStyle = a; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = Math.random() < 0.5 ? b : a;
      g.globalAlpha = 0.5;
      const s = 2 + Math.random() * 10;
      g.fillRect(Math.random() * 256, Math.random() * 256, s, s);
    }
    g.globalAlpha = 1;
    if (id.endsWith('platform') || id.endsWith('wall')) {
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 4;
      for (let y = 0; y <= 256; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
    }
    return c;
  }

  if (BG_COLORS[id]) {
    const [c, g] = canvas(1024, 440);
    const [top, mid, ground] = BG_COLORS[id];
    const grad = g.createLinearGradient(0, 0, 0, 440);
    grad.addColorStop(0, top); grad.addColorStop(0.65, mid); grad.addColorStop(0.66, ground); grad.addColorStop(1, ground);
    g.fillStyle = grad; g.fillRect(0, 0, 1024, 440);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 12; i++) { g.beginPath(); g.ellipse(Math.random() * 1024, 40 + Math.random() * 160, 60, 18, 0, 0, Math.PI * 2); g.fill(); }
    return c;
  }

  // Generic badge
  const [c, g] = canvas(256, 256);
  let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  g.fillStyle = `hsl(${h},70%,55%)`;
  g.strokeStyle = '#1a0a24'; g.lineWidth = 10;
  g.beginPath(); g.arc(128, 128, 110, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = '#fff'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center';
  g.fillText(id.replace(/_/g, ' ').slice(0, 14), 128, 138);
  return c;
}

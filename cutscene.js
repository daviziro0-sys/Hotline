'use strict';
/* 7 SHADOWS — cutscene de abertura em PIXEL ART: a lua acorda, desce sobre a vila e o relógio não para.
   Desenho 100% original (lua com rosto, vila, torre do relógio e as 7 sombras), num canvas de 320x180 ampliado sem suavização.
   Uso:  playCutscene({ volume: 0.8 }).then(r => ...)   // r = 'done' | 'skipped'
   Chame DENTRO de um toque/tecla do jogador (o áudio do navegador só liga assim, igual ao boot.js).
   Pular: Esc / Enter / Espaço / clique / toque (depois de 0,8 s). Respeita prefers-reduced-motion (sem tremor). */
(() => {
  const W = 320, H = 180, BAR = 22, GY = 138, T_END = 26;
  let running = null;

  /* ------------------------------------------------------------ utilidades */
  const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
  const sm = (t, a, b) => { const x = clamp((t - a) / (b - a)); return x * x * (3 - 2 * x); };
  const mix = (a, b, k) => a + (b - a) * k;
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const css = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  const tint = (c, k, to = [150, 20, 35]) => [mix(c[0], to[0], k), mix(c[1], to[1], k), mix(c[2], to[2], k)];
  const pack = c => ((255 << 24) | ((c[2] | 0) << 16) | ((c[1] | 0) << 8) | (c[0] | 0)) >>> 0;   // ABGR (little-endian)
  const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);   // pontilhado 4x4
  const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

  /* ------------------------------------------------------------ fonte bitmap 5x7 (sem depender de fonte web) */
  const FONT_SRC = `A 01110 10001 10001 11111 10001 10001 10001
B 11110 10001 10001 11110 10001 10001 11110
C 01110 10001 10000 10000 10000 10001 01110
D 11110 10001 10001 10001 10001 10001 11110
E 11111 10000 10000 11110 10000 10000 11111
F 11111 10000 10000 11110 10000 10000 10000
G 01110 10001 10000 10111 10001 10001 01111
H 10001 10001 10001 11111 10001 10001 10001
I 01110 00100 00100 00100 00100 00100 01110
J 00111 00010 00010 00010 00010 10010 01100
K 10001 10010 10100 11000 10100 10010 10001
L 10000 10000 10000 10000 10000 10000 11111
M 10001 11011 10101 10101 10001 10001 10001
N 10001 11001 10101 10011 10001 10001 10001
O 01110 10001 10001 10001 10001 10001 01110
P 11110 10001 10001 11110 10000 10000 10000
Q 01110 10001 10001 10001 10101 10010 01101
R 11110 10001 10001 11110 10100 10010 10001
S 01111 10000 10000 01110 00001 00001 11110
T 11111 00100 00100 00100 00100 00100 00100
U 10001 10001 10001 10001 10001 10001 01110
V 10001 10001 10001 10001 10001 01010 00100
W 10001 10001 10001 10101 10101 11011 10001
X 10001 10001 01010 00100 01010 10001 10001
Y 10001 10001 01010 00100 00100 00100 00100
Z 11111 00001 00010 00100 01000 10000 11111
0 01110 10001 10011 10101 11001 10001 01110
1 00100 01100 00100 00100 00100 00100 01110
2 01110 10001 00001 00010 00100 01000 11111
3 11110 00001 00001 01110 00001 00001 11110
4 00010 00110 01010 10010 11111 00010 00010
5 11111 10000 11110 00001 00001 10001 01110
6 00110 01000 10000 11110 10001 10001 01110
7 11111 00001 00010 00100 01000 01000 01000
8 01110 10001 10001 01110 10001 10001 01110
9 01110 10001 10001 01111 00001 00010 01100
. 00000 00000 00000 00000 00000 01100 01100
, 00000 00000 00000 00000 01100 00100 01000
: 00000 01100 01100 00000 01100 01100 00000
! 00100 00100 00100 00100 00100 00000 00100
? 01110 10001 00001 00010 00100 00000 00100
- 00000 00000 00000 11111 00000 00000 00000`;
  const FONT = {};
  for (const ln of FONT_SRC.split('\n')) { const p = ln.split(' '); FONT[p[0]] = p.slice(1); }
  const ACC = { '\u00c1': ['A', 'a'], '\u00c0': ['A', 'g'], '\u00c2': ['A', 'c'], '\u00c3': ['A', 't'], '\u00c9': ['E', 'a'], '\u00ca': ['E', 'c'], '\u00cd': ['I', 'a'], '\u00d3': ['O', 'a'], '\u00d4': ['O', 'c'], '\u00d5': ['O', 't'], '\u00da': ['U', 'a'], '\u00c7': ['C', 'z'] };
  const ACC_PX = { a: [[3, -2], [2, -1]], g: [[1, -2], [2, -1]], c: [[2, -2], [1, -1], [3, -1]], t: [[0, -1], [1, -2], [2, -1], [3, -2]], z: [[2, 7], [1, 8]] };
  const textW = s => s.length * 6 - 1;
  function drawText(c, str, x, y, col, shadow = '#000') {
    str = str.toUpperCase();
    for (const pass of shadow ? [1, 0] : [0]) {
      c.fillStyle = pass ? shadow : col;
      const o = pass ? 1 : 0;
      for (let i = 0; i < str.length; i++) {
        let ch = str[i], extra = null;
        if (ACC[ch]) { extra = ACC[ch][1]; ch = ACC[ch][0]; }
        const g = FONT[ch], gx = x + i * 6 + o, gy = y + o;
        if (g) for (let r = 0; r < 7; r++) for (let q = 0; q < 5; q++) if (g[r][q] === '1') c.fillRect(gx + q, gy + r, 1, 1);
        if (extra) for (const [ax, ay] of ACC_PX[extra]) c.fillRect(gx + ax, gy + ay, 1, 1);
      }
    }
  }

  /* ------------------------------------------------------------ cenário (gerado uma vez, sempre igual) */
  const SKY = [[0, '#04061a'], [26, '#070c2a'], [52, '#0b1538'], [78, '#11214f'], [102, '#183066'], [120, '#22427d']].map(([y, h]) => [y, hex(h)]);
  const R1 = rng(7);
  const STARS = Array.from({ length: 85 }, () => ({ x: R1() * W | 0, y: R1() * 118 | 0, p: R1() * 6.28, s: 1 + R1() * 2.2, big: R1() < 0.14 }));
  const R2 = rng(11);
  const BLDS = [];
  for (let bx = -6; bx < W;) {
    const w = 14 + (R2() * 14 | 0), h = 14 + (R2() * 22 | 0), roof = R2() < 0.4, wins = [];
    for (let r = 0; r < Math.floor((h - 4) / 7); r++) for (let q = 0; q < Math.floor((w - 4) / 5); q++) wins.push({ x: bx + 3 + q * 5, y: GY - h + 4 + r * 7, th: R2() });
    BLDS.push({ x: bx, w, h, roof, wins });
    bx += w + (R2() * 3 | 0);
  }
  const GRASS = Array.from({ length: 46 }, () => [R2() * W | 0, GY + 1 + (R2() * 18 | 0)]);
  const SHADOW_X = [46, 84, 122, 160, 198, 236, 274];
  const FIG = ['..XXX..', '.XXXXX.', '.XEXEX.', '.XXXXX.', '..XXX..', '.XXXXX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '.XX.XX.', '.XX.XX.'];
  const CRATERS = [[-0.45, -0.5, 0.17], [0.5, 0.25, 0.2], [-0.2, 0.55, 0.13], [0.22, -0.62, 0.11], [-0.68, 0.18, 0.12], [0.62, -0.28, 0.09], [0.05, 0.78, 0.1]];
  const R3 = rng(23);
  const CRACKS = Array.from({ length: 6 }, (_, i) => {
    let a = -2.6 + i * 1.05 + (R3() - 0.5) * 0.4, rr = 0.16; const pts = [[Math.cos(a) * rr, Math.sin(a) * rr]];
    while (rr < 1.02) { rr += 0.11 + R3() * 0.07; a += (R3() - 0.5) * 0.55; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
    return pts;
  });
  const CAPTIONS = [[1.2, 4.7, 'A vila dormia sob a lua.'], [5.6, 9.2, 'Sete sombras esperavam.'], [10.4, 14.0, 'Algo acordou l\u00e1 em cima.'], [14.8, 18.4, 'E a lua come\u00e7ou a descer.'], [19.2, 23.6, 'O rel\u00f3gio n\u00e3o para.']];
  const BELLS = [[0.8, 0.45], [9.0, 0.8], [14.6, 0.8], [19.0, 0.9], [21.2, 1], [23.0, 1]];

  /* ------------------------------------------------------------ lua (pixel a pixel, 4 tons + pontilhado) */
  const mc = document.createElement('canvas'); mc.width = W; mc.height = H;
  const mctx = mc.getContext('2d'), mi = mctx.createImageData(W, H), m32 = new Uint32Array(mi.data.buffer);
  const TONES = [[52, 58, 98], [104, 112, 160], [178, 186, 220], [238, 240, 255]];

  function line(x0, y0, x1, y1, col, cx, cy, r) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) | 0;
    for (let i = 0; i <= n; i++) {
      const x = Math.round(mix(x0, x1, i / n)), y = Math.round(mix(y0, y1, i / n));
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const dx = x - cx, dy = y - cy; if (dx * dx + dy * dy < r * r) m32[y * W + x] = col;
    }
  }
  function moonGeom(t) { const p = clamp((t - 4) / 20); return { r: 26 + 144 * Math.pow(p, 2.2), cx: 160, cy: 52 + 58 * p * p }; }
  function drawMoon(c, t, k) {
    const { r, cx, cy } = moonGeom(t);
    m32.fill(0);
    const x0 = Math.max(0, Math.floor(cx - r * 1.25)), x1 = Math.min(W - 1, Math.ceil(cx + r * 1.25));
    const y0 = Math.max(0, Math.floor(cy - r * 1.25)), y1 = Math.min(H - 1, Math.ceil(cy + r * 1.25));
    const tones = TONES.map(q => pack(tint(q, k * 0.85, [200, 50, 45]))), halo = pack(tint([60, 80, 170], k, [170, 25, 45]));
    const open = sm(t, 8.8, 10.4), mouth = sm(t, 11, 13.5), crack = sm(t, 17, 22), pulse = (Math.sin(t * 5) + 1) / 2;
    const dark = pack([22, 6, 16]), redA = pack([255, 62, 48]), redB = pack([255, 150, 90]), tooth = pack([236, 230, 208]);
    const m1 = 0.3 + 0.22 * mouth + (mouth > 0.02 ? 0.02 : 0);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d2 = dx * dx + dy * dy, b = B4[(y & 3) * 4 + (x & 3)];
      if (d2 > r * r) {
        const dd = Math.sqrt(d2);
        if (dd < r * 1.2 && b < (1 - (dd - r) / (r * 0.2)) * 0.55) m32[y * W + x] = halo;
        continue;
      }
      const nx = dx / r, ny = dy / r, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      let idx = clamp(Math.floor((-0.52 * nx - 0.52 * ny + 0.73 * nz) * 3.3 + (b - 0.5) * 1.1), 0, 3), col = null;
      for (const q of CRATERS) { const ax = nx - q[0], ay = ny - q[1]; if (ax * ax + ay * ay < q[2] * q[2]) { idx = Math.max(0, idx - 1 - (ay > 0 ? 0 : 1)); break; } }
      // olhos (raiva: a borda de cima desce para o meio) — fechados viram uma linha de 1 px
      for (const ex of [-0.34, 0.34]) {
        const a = (nx - ex) * (ex < 0 ? 1 : -1);
        if (a < -0.21 || a > 0.21) continue;
        const top = -0.19 + 0.45 * a, bot = 0.02, h = (bot - top) * open;
        if (open > 0.04 && ny > top && ny < top + h) {
          col = dark;
          if (Math.abs(a) < 0.075 && ny > top + h * 0.3 && ny < top + h * 0.85) col = pulse > 0.5 ? redB : redA;
        } else if (open < 0.6 && Math.abs(dy - -0.08 * r) < 0.6) col = dark;
      }
      // boca
      if (!col && mouth > 0.02 && ny >= 0.3 && ny <= m1 && Math.abs(nx) < 0.46 - 0.35 * (ny - 0.3)) {
        col = dark;
        const tt = (nx + 0.5) * 9, f = tt - Math.floor(tt), h = 0.12 * (1 - Math.abs(f * 2 - 1));
        if (ny < 0.3 + h || ny > m1 - h * 0.9) col = tooth;
      }
      m32[y * W + x] = col != null ? col : tones[idx];
    }
    // rachaduras (crescem do centro para fora)
    if (crack > 0.01) for (const pts of CRACKS) {
      const n = (pts.length - 1) * crack;
      for (let i = 0; i < pts.length - 1 && i < n; i++) {
        const f = Math.min(1, n - i), a = pts[i], b = pts[i + 1];
        const ex = mix(a[0], b[0], f), ey = mix(a[1], b[1], f);
        line(cx + a[0] * r + 1, cy + a[1] * r + 1, cx + ex * r + 1, cy + ey * r + 1, pack([255, 80, 60]), cx, cy, r);
        line(cx + a[0] * r, cy + a[1] * r, cx + ex * r, cy + ey * r, pack([14, 3, 9]), cx, cy, r);
      }
    }
    mctx.putImageData(mi, 0, 0); c.drawImage(mc, 0, 0);
  }

  /* ------------------------------------------------------------ vila, torre, sombras */
  function disc(c, x, y, rad, col) { c.fillStyle = col; for (let j = -rad; j <= rad; j++) for (let i = -rad; i <= rad; i++) if (i * i + j * j <= rad * rad + 1) c.fillRect(x + i, y + j, 1, 1); }
  function drawTown(c, t, k) {
    const lit = 0.8 * (1 - sm(t, 10, 21)), body = '#070a1e', edge = '#0f1740';
    let wi = 0;
    for (const b of BLDS) {
      c.fillStyle = body; c.fillRect(b.x, GY - b.h, b.w, b.h);
      c.fillStyle = edge; c.fillRect(b.x, GY - b.h, b.w, 1);
      if (b.roof) { const rh = Math.min(5, Math.floor(b.w / 2) - 1); for (let i = 0; i < rh; i++) { const inset = rh - i; c.fillStyle = body; c.fillRect(b.x + inset, GY - b.h - rh + i, b.w - 2 * inset, 1); } }
      for (const w of b.wins) {
        wi++;
        const flick = t > 14 && t < 21 && (Math.floor(t * 6) + wi) % 7 === 0;
        c.fillStyle = (w.th < lit && !flick) ? '#ffd36b' : '#0c1334';
        c.fillRect(w.x, w.y, 2, 3);
      }
    }
    // torre do relógio
    const tx = 160, top = 74;
    c.fillStyle = body; c.fillRect(tx - 12, top, 24, GY - top);
    c.fillStyle = edge; c.fillRect(tx - 12, top, 24, 1); c.fillRect(tx - 12, top, 1, GY - top);
    for (let i = 0; i < 14; i++) { const half = Math.ceil(i * 13 / 13); c.fillStyle = body; c.fillRect(tx - half, top - 14 + i, half * 2 + 1, 1); }
    c.fillStyle = body; c.fillRect(tx - 14, top - 1, 28, 3); c.fillRect(tx - 14, GY - 4, 28, 4);
    const warm = sm(t, 18.5, 22);
    disc(c, tx, 90, 8, '#2a2a3a');
    disc(c, tx, 90, 7, css(tint([232, 226, 200], warm, [255, 90, 70])));
    const spin = t * 0.9 + (t > 19 ? Math.pow(t - 19, 2) * 6 : 0);
    const hand = (ang, len, col) => { c.fillStyle = col; const n = len * 2; for (let i = 0; i <= n; i++) c.fillRect(Math.round(tx + Math.sin(ang) * i / 2), Math.round(90 - Math.cos(ang) * i / 2), 1, 1); };
    hand(spin / 12, 3.5, '#10121e'); hand(spin, 6, '#10121e');
    // chão
    c.fillStyle = '#090e2b'; c.fillRect(-4, GY, W + 8, H - GY);
    c.fillStyle = '#131c4a'; for (const [gx, gy] of GRASS) c.fillRect(gx, gy, 1, 1);
    // as 7 sombras (olhos brancos; vermelhos quando a lua acorda)
    SHADOW_X.forEach((sx, i) => {
      const ta = 4.6 + i * 0.55;
      if (t < ta) return;
      const rise = Math.min(1, (t - ta) / 0.35), fy = GY + 16 - FIG.length, hh = Math.round(FIG.length * rise);
      for (let r = 0; r < hh; r++) for (let q = 0; q < 7; q++) {
        const ch = FIG[r][q]; if (ch === '.') continue;
        c.fillStyle = ch === 'E' ? (t > 9 ? '#ff4a3a' : '#e6ecff') : '#02030a';
        c.fillRect(sx - 3 + q, fy + (FIG.length - hh) + r, 1, 1);
      }
    });
  }

  /* ------------------------------------------------------------ quadro completo */
  function drawFrame(c, t, o = {}) {
    const k = 0.55 * sm(t, 12, 24);
    const amp = (o.noShake || reduced()) ? 0 : (t < 9 ? 0 : 0.5 + 3 * sm(t, 12, 23));
    const st = Math.floor(t * 20), r1 = rng(st * 7919 + 3);
    const sx = amp ? Math.round((r1() - 0.5) * 2 * amp) : 0, sy = amp ? Math.round((r1() - 0.5) * 2 * amp) : 0;
    c.imageSmoothingEnabled = false;
    c.save(); c.translate(sx, sy);
    for (let i = 0; i < SKY.length; i++) { c.fillStyle = css(tint(SKY[i][1], k)); c.fillRect(-4, SKY[i][0], W + 8, (i + 1 < SKY.length ? SKY[i + 1][0] : GY + 1) - SKY[i][0]); }
    c.globalAlpha = 1 - 0.7 * sm(t, 14, 22);
    for (const s of STARS) {
      if (Math.sin(t * s.s + s.p) < -0.5) continue;
      c.fillStyle = s.big ? '#ffffff' : '#9db9ee'; c.fillRect(s.x, s.y, 1, 1);
      if (s.big) { c.fillStyle = '#6f86c8'; c.fillRect(s.x - 1, s.y, 1, 1); c.fillRect(s.x + 1, s.y, 1, 1); c.fillRect(s.x, s.y - 1, 1, 1); c.fillRect(s.x, s.y + 1, 1, 1); }
    }
    c.globalAlpha = 1;
    drawMoon(c, t, k);
    drawTown(c, t, k);
    c.restore();
    // barras de cinema + legendas
    c.fillStyle = '#000'; c.fillRect(0, 0, W, BAR); c.fillRect(0, H - BAR, W, BAR);
    for (const [a, b, s] of CAPTIONS) {
      if (t < a || t > b) continue;
      const n = Math.min(s.length, Math.floor((t - a) * 22)), shown = s.slice(0, n);
      c.globalAlpha = clamp((b - t) / 0.4);
      drawText(c, shown, Math.round((W - textW(s)) / 2), H - BAR + 9, '#e8ecff');
      c.globalAlpha = 1;
    }
    if (t > 19) {   // contagem regressiva 72:00:00 -> 00:00:00 (acelera)
      const p = clamp((t - 19) / 5.3), rem = Math.round(259200 * (1 - p * p * p));
      const pad = n => String(n).padStart(2, '0'), s = pad(rem / 3600 | 0) + ':' + pad(rem % 3600 / 60 | 0) + ':' + pad(rem % 60);
      c.globalAlpha = sm(t, 19, 19.8);
      drawText(c, s, Math.round((W - textW(s)) / 2), 8, rem < 43200 ? '#ff5a46' : '#ffe27a');
      c.globalAlpha = 1;
    }
    if (o.hint && t > 1) drawText(c, o.hint, 4, 8, '#5f6f9f');
    // abertura/fechamento: preto no começo, clarão e preto no fim
    if (t < 1.5) { c.fillStyle = `rgba(0,0,0,${1 - t / 1.5})`; c.fillRect(0, 0, W, H); }
    if (t > 24.2) {
      const up = sm(t, 24.2, 24.9), down = sm(t, 25.2, T_END);
      c.fillStyle = `rgba(255,255,255,${up * (1 - down)})`; c.fillRect(0, 0, W, H);
      c.fillStyle = `rgba(0,0,0,${down})`; c.fillRect(0, 0, W, H);
    }
  }

  /* ------------------------------------------------------------ áudio (Web Audio: bus mestre, sinos, ronco e baque final) */
  function startAudio(startAt, volume, shared) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      const ctx = shared || new AC(); if (ctx.resume) ctx.resume();
      const t0 = ctx.currentTime, dur = T_END - startAt, out = ctx.createGain(), nodes = [];
      out.gain.setValueAtTime(0.0001, t0); out.gain.linearRampToValueAtTime(volume, t0 + 1.2);   // sem clique na entrada
      out.gain.setValueAtTime(volume, t0 + Math.max(1.2, dur - 1.0)); out.gain.linearRampToValueAtTime(0.0001, t0 + dur);
      out.connect(ctx.destination);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(110, t0); lp.frequency.linearRampToValueAtTime(520, t0 + dur);
      const drone = ctx.createGain(); drone.gain.setValueAtTime(0.05, t0); drone.gain.linearRampToValueAtTime(0.22, t0 + dur);
      lp.connect(drone); drone.connect(out);
      for (const f of [55, 55.8, 82.4]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(t0); nodes.push(o); }
      const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource(); noise.buffer = nb; noise.loop = true;
      const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 90;
      const ng = ctx.createGain(); ng.gain.setValueAtTime(0, t0); ng.gain.linearRampToValueAtTime(0.5, t0 + dur);
      noise.connect(nf); nf.connect(ng); ng.connect(out); noise.start(t0); nodes.push(noise);
      const bell = (when, v) => {
        for (const [ratio, g] of [[1, 0.5], [2, 0.3], [2.76, 0.2], [5.4, 0.1]]) {
          const o = ctx.createOscillator(), e = ctx.createGain(); o.type = 'sine'; o.frequency.value = 110 * ratio;
          e.gain.setValueAtTime(0.0001, when); e.gain.linearRampToValueAtTime(g * v * 0.6, when + 0.01); e.gain.exponentialRampToValueAtTime(0.0001, when + 3.2);
          o.connect(e); e.connect(out); o.start(when); o.stop(when + 3.3); nodes.push(o);
        }
      };
      for (const [bt, v] of BELLS) if (bt >= startAt) bell(t0 + (bt - startAt), v);
      if (24.3 >= startAt) {   // baque final
        const w = t0 + (24.3 - startAt), o = ctx.createOscillator(), e = ctx.createGain(); o.type = 'sine';
        o.frequency.setValueAtTime(70, w); o.frequency.exponentialRampToValueAtTime(28, w + 0.8);
        e.gain.setValueAtTime(0.0001, w); e.gain.linearRampToValueAtTime(0.9, w + 0.02); e.gain.exponentialRampToValueAtTime(0.0001, w + 1.2);
        o.connect(e); e.connect(out); o.start(w); o.stop(w + 1.3); nodes.push(o);
      }
      return {
        stop(fade = 0.25) {
          try {
            const n = ctx.currentTime; out.gain.cancelScheduledValues(n); out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), n); out.gain.linearRampToValueAtTime(0.0001, n + fade);
            setTimeout(() => { for (const o of nodes) { try { o.stop(); } catch { } } try { out.disconnect(); } catch { } if (!shared) { try { ctx.close(); } catch { } } }, fade * 1000 + 80);
          } catch { }
        }
      };
    } catch { return null; }
  }

  /* ------------------------------------------------------------ player */
  function play(opts = {}) {
    if (running) return running;
    const startAt = clamp(+opts.startAt || 0, 0, T_END - 1), touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const ov = document.createElement('div');
    ov.id = 'cutscene'; ov.setAttribute('role', 'img'); ov.setAttribute('aria-label', 'Cena de abertura: a lua desce sobre a vila.');
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#000;display:grid;place-items:center;touch-action:none;cursor:none;transition:opacity .3s';
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    cv.style.cssText = 'display:block;image-rendering:crisp-edges;image-rendering:pixelated';
    ov.appendChild(cv); document.body.appendChild(ov);
    const c = cv.getContext('2d', { alpha: false });
    const fit = () => { let s = Math.min(innerWidth / W, innerHeight / H); if (s >= 2) s = Math.floor(s); cv.style.width = Math.round(W * s) + 'px'; cv.style.height = Math.round(H * s) + 'px'; };
    fit(); addEventListener('resize', fit);
    const audio = opts.mute ? null : startAudio(startAt, opts.volume == null ? 0.8 : clamp(+opts.volume), opts.audio);
    const hint = touch ? 'TOQUE PARA PULAR' : 'ESC PARA PULAR';
    let t = startAt, last = performance.now(), raf = 0, done = false, resolve;
    const promise = new Promise(r => { resolve = r; });
    const t0 = last;
    function finish(why) {
      if (done) return; done = true;
      cancelAnimationFrame(raf);
      removeEventListener('keydown', onKey, true); removeEventListener('pointerdown', onPtr, true); removeEventListener('resize', fit);
      if (audio) audio.stop(why === 'skipped' ? 0.25 : 0.6);
      ov.style.opacity = '0'; ov.style.pointerEvents = 'none';
      setTimeout(() => ov.remove(), 320);
      running = null;
      try { opts.onDone && opts.onDone(why); } catch (e) { console.error(e); }
      resolve(why);
    }
    const canSkip = () => opts.skippable !== false && performance.now() - t0 > 800;
    function onKey(e) {
      e.stopImmediatePropagation();   // enquanto toca, o jogo não recebe teclas
      if (e.ctrlKey || e.metaKey || e.altKey || ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(e.key)) return;
      if (e.key === ' ' || e.key === 'Enter' || e.key.startsWith('Arrow')) e.preventDefault();
      if ((e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') && canSkip()) finish('skipped');
    }
    function onPtr(e) { e.stopImmediatePropagation(); if (canSkip()) finish('skipped'); }
    addEventListener('keydown', onKey, true); addEventListener('pointerdown', onPtr, true);
    function frame(now) {
      raf = requestAnimationFrame(frame);
      t += Math.min(0.1, (now - last) / 1000); last = now;
      if (t >= T_END) { drawFrame(c, T_END - 0.001, { hint: '' }); finish('done'); return; }
      drawFrame(c, t, { hint: opts.skippable === false ? '' : hint });
    }
    raf = requestAnimationFrame(frame);
    running = promise;
    return promise;
  }

  window.playCutscene = play;
  window.__cutscene = { play, drawFrame, W, H, T_END };   // __cutscene.drawFrame(ctx, t): usado nos testes
})();

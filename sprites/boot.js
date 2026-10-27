/* 7 SHADOWS — tela de carregamento (cubo 3D estilo N64).
   Roda INLINE no index.html, antes de qualquer outro script: o cubo aparece na hora e só depois o jogo (shared/p2p/game/touch/menu)
   é carregado por trás. Barra = progresso real: fontes + scripts executados + as duas músicas (abertura e menu).
   O game.js se liga aqui por window.__boot: __boot.audio(introBgm, menuBgm) e __boot.onFinish (roda DENTRO do toque do jogador). */
(() => {
  const ov = document.getElementById('boot'); if (!ov) return;
  const cv = ov.firstElementChild, c = cv.getContext('2d', { alpha: false });
  const SCRIPTS = ['shared.js', 'p2p.js', 'game.js', 'touch.js', 'menu-dc.js'];
  const touchDev = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const B = window.__boot = { done: false, onFinish: null, audio: null };
  let W = 0, H = 0, D = 1;
  const fit = () => { D = Math.min(1.5, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = Math.round(W * D); cv.height = Math.round(H * D); };
  fit(); addEventListener('resize', fit);

  // ---- progresso real (cada item tem tempo máximo, para nunca travar)
  let real = 0, failed = false;
  const TOTAL = 4, T0 = performance.now(), MIN = 2.2;
  const once = () => { let d = false; return () => { if (!d) { d = true; real++; } }; };
  const tFonts = once(), tScripts = once(), tA1 = once(), tA2 = once();
  try { (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(tFonts, tFonts); } catch { tFonts(); }
  setTimeout(tFonts, 5000);
  B.audio = (a, b) => {
    for (const [el, t] of [[a, tA1], [b, tA2]]) {
      try {
        if (el.readyState >= 3) t();
        else { el.addEventListener('canplay', t, { once: true }); el.addEventListener('error', t, { once: true }); }
      } catch { t(); }
    }
  };
  setTimeout(() => { tScripts(); tA1(); tA2(); }, 10000);   // rede muito lenta: libera mesmo assim

  // ---- carrega o jogo só depois do cubo ser pintado (e com o HTML todo lido), em ordem
  function loadGame() {
    let n = 0;
    const next = () => {
      if (n >= SCRIPTS.length) return tScripts();
      const s = document.createElement('script'); s.src = SCRIPTS[n++]; s.async = false;
      s.onload = next; s.onerror = () => { failed = true; };
      document.body.appendChild(s);
    };
    next();
  }
  const go = () => requestAnimationFrame(() => setTimeout(loadGame, 40));
  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', go, { once: true }) : go();

  // ---- cubo 3D (cores do logo do console: vermelho, verde, azul, amarelo; topo e base em cinza)
  const COLS = ['#e53935', '#3fae49', '#2f7be8', '#f9c80e'];
  const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const RGB = COLS.map(rgb);
  const FACES = [
    { n: [0, 0, -1], v: [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1]], c: 0 },
    { n: [0, 0, 1], v: [[1, -1, 1], [-1, -1, 1], [-1, 1, 1], [1, 1, 1]], c: 2 },
    { n: [1, 0, 0], v: [[1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1]], c: 1 },
    { n: [-1, 0, 0], v: [[-1, -1, 1], [-1, -1, -1], [-1, 1, -1], [-1, 1, 1]], c: 3 },
    { n: [0, -1, 0], v: [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1]], c: -1 },
    { n: [0, 1, 0], v: [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]], c: -1 }
  ];
  function drawCube(cx, cy, s, ry, rx, line) {
    const cyA = Math.cos(ry), syA = Math.sin(ry), cxA = Math.cos(rx), sxA = Math.sin(rx), F = 6;
    const rot = (x, y, z) => { const x1 = x * cyA + z * syA, z1 = -x * syA + z * cyA; return [x1, y * cxA - z1 * sxA, y * sxA + z1 * cxA]; };
    const vis = [];
    for (const f of FACES) {
      const n = rot(...f.n); if (n[2] >= 0) continue;   // de costas para a câmera
      const pts = f.v.map(p => { const r = rot(...p), k = F / (F + r[2]); return [cx + r[0] * k * s, cy + r[1] * k * s, r[2]]; });
      vis.push({ f, n, pts, z: (pts[0][2] + pts[1][2] + pts[2][2] + pts[3][2]) / 4 });
    }
    vis.sort((a, b) => b.z - a.z);
    for (const q of vis) {
      const lam = Math.max(0, -q.n[0] * 0.45 - q.n[1] * 0.6 - q.n[2] * 0.66), br = 0.42 + 0.78 * lam;
      const base = q.f.c >= 0 ? RGB[q.f.c] : [150, 156, 170];
      c.fillStyle = `rgb(${Math.min(255, base[0] * br) | 0},${Math.min(255, base[1] * br) | 0},${Math.min(255, base[2] * br) | 0})`;
      c.beginPath(); c.moveTo(q.pts[0][0], q.pts[0][1]); for (let i = 1; i < 4; i++) c.lineTo(q.pts[i][0], q.pts[i][1]); c.closePath(); c.fill();
      if (!line) continue;   // o reflexo no chão não precisa de contorno
      c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = Math.max(1, s * 0.03); c.stroke();
      c.strokeStyle = `rgba(255,255,255,${0.1 + 0.3 * lam})`; c.lineWidth = Math.max(1, s * 0.02); c.beginPath(); c.moveTo(q.pts[0][0], q.pts[0][1]); c.lineTo(q.pts[1][0], q.pts[1][1]); c.stroke();
    }
  }

  let shown = 0, ready = false, finishing = false, flashT = 0, last = T0, raf = 0, glG = null, glKey = '';
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const el = (now - T0) / 1000, target = Math.min(real / TOTAL, el / MIN);
    shown += (target - shown) * Math.min(1, dt * 5); if (shown > 0.995 && target >= 1) shown = 1;
    if (!ready && !failed && shown >= 1 && el >= MIN) ready = true;

    const t = el, m = Math.min(W, H), s = m * (W < H ? 0.17 : 0.14);
    c.setTransform(D, 0, 0, D, 0, 0); c.globalAlpha = 1; c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H * 0.37 + Math.sin(t * 2.2) * s * 0.07;
    // brilho atrás do cubo (gradiente reaproveitado enquanto o tamanho não muda)
    const key = W + 'x' + H;
    if (key !== glKey) { glKey = key; glG = c.createRadialGradient(cx, H * 0.37, s * 0.3, cx, H * 0.37, s * 3.4); glG.addColorStop(0, 'rgba(120,150,255,.22)'); glG.addColorStop(1, 'rgba(0,0,0,0)'); }
    c.fillStyle = glG; c.fillRect(0, 0, W, H);
    const spin = t * (ready ? 2.4 : 1.5), tilt = 0.55 + Math.sin(t * 0.9) * 0.28, floorY = cy + s * 1.95;
    // reflexo no chão
    c.save(); c.beginPath(); c.rect(0, floorY, W, H); c.clip(); c.translate(0, floorY * 2); c.scale(1, -1); c.globalAlpha = 0.16; drawCube(cx, cy, s, spin, tilt, false); c.restore();
    const fg = c.createLinearGradient(0, floorY, 0, floorY + s * 1.6); fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, 'rgba(0,0,0,1)'); c.fillStyle = fg; c.fillRect(0, floorY, W, s * 1.7);
    drawCube(cx, cy, s, spin, tilt, true);

    // título
    const fs = Math.max(22, Math.min(W * 0.085, m * 0.1));
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `400 ${fs}px Bungee, Impact, sans-serif`;
    c.shadowColor = 'rgba(120,150,255,.7)'; c.shadowBlur = 18; c.fillStyle = '#fff'; c.fillText('7 SHADOWS', cx, H * 0.665); c.shadowBlur = 0;

    // barra + texto
    const bw = Math.min(W * 0.72, 440), bh = Math.max(10, m * 0.022), bx = cx - bw / 2, by = H * 0.8;
    if (!ready) {
      const dots = '.'.repeat(1 + ((t * 2.5) | 0) % 3);
      c.font = `400 ${Math.max(13, fs * 0.38)}px Bungee, Impact, sans-serif`; c.fillStyle = failed ? '#ff8a80' : '#cfd6ee'; c.textAlign = 'left';
      c.fillText(failed ? 'FALHA AO CARREGAR. RECARREGUE A PÁGINA' : 'CARREGANDO' + dots, bx, by - bh * 1.7);
      if (!failed) { c.textAlign = 'right'; c.fillText(Math.round(shown * 100) + '%', bx + bw, by - bh * 1.7); }
    }
    c.fillStyle = '#12141c'; c.strokeStyle = '#8b93ad'; c.lineWidth = 2; c.beginPath(); c.rect(bx, by, bw, bh); c.fill(); c.stroke();
    c.save(); c.beginPath(); c.rect(bx + 2, by + 2, Math.max(0, (bw - 4) * shown), bh - 4); c.clip();
    for (let i = 0; i < 4; i++) { c.fillStyle = COLS[i]; c.fillRect(bx + 2 + (bw - 4) * i / 4, by + 2, (bw - 4) / 4 + 1, bh - 4); }
    c.fillStyle = 'rgba(255,255,255,.28)'; c.fillRect(bx, by + 2, bw, (bh - 4) * 0.4); c.restore();
    if (ready) {
      const blink = 0.55 + 0.45 * Math.sin(t * 5);
      c.textAlign = 'center'; c.font = `400 ${Math.max(14, fs * 0.42)}px Bungee, Impact, sans-serif`; c.globalAlpha = finishing ? 1 : blink; c.fillStyle = '#ffe14f';
      c.fillText(touchDev ? 'TOQUE NA TELA' : 'PRESSIONE QUALQUER TECLA', cx, by + bh * 3.4); c.globalAlpha = 1;
    }
    if (flashT) { c.fillStyle = `rgba(255,255,255,${Math.min(1, (now - flashT) / 180)})`; c.fillRect(0, 0, W, H); }
  }
  raf = requestAnimationFrame(frame);

  function finish() {
    if (finishing) return; finishing = true; flashT = performance.now();
    removeEventListener('keydown', onKey, true); removeEventListener('pointerdown', onPtr, true); removeEventListener('touchstart', onPtr, true);
    B.done = true;
    try { B.onFinish && B.onFinish(); } catch (e) { console.error(e); }   // síncrono: o play() da música precisa sair DENTRO do toque (Safari)
    setTimeout(() => { ov.style.opacity = '0'; ov.style.pointerEvents = 'none'; }, 180);
    setTimeout(() => { cancelAnimationFrame(raf); ov.remove(); removeEventListener('resize', fit); }, 800);
  }
  const onKey = e => {
    e.stopImmediatePropagation();   // enquanto carrega, o jogo não recebe teclas
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(e.key) || /^F\d+$/.test(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ' ' || e.key === 'Enter' || e.key.startsWith('Arrow')) e.preventDefault();
    if (ready) finish();
  };
  const onPtr = e => { e.stopImmediatePropagation(); if (ready) finish(); };
  addEventListener('keydown', onKey, true); addEventListener('pointerdown', onPtr, true); addEventListener('touchstart', onPtr, { capture: true, passive: true });
})();

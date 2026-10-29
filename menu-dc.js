/* 7 SHADOWS — navegação do menu estilo console: ↑/↓ escolhem, Enter confirma, Esc volta, ←/→ trocam o Shadow / a aba */

/* ---------------------------------------------------------------------------
   SKINS (visuais extras). A chave é o id do PERSONAGEM (HERO, ROOSTER, TIGER, BEAR, MONKEY, WOLF,
   GORILLA, FISH). Passivas e vida continuam sendo do personagem; a skin é só o visual.
     id      identificador curto (é o que fica salvo em cfg.look[PERSONAGEM] e vai para a sala)
     name    nome mostrado no cartão
     desc    linhas de texto do cartão (opcional)
     face    imagem do retrato do cartão (opcional; sem ela usa o rosto do personagem)
   Para o jogo desenhar a skin, o id também precisa existir no código (game1.js / game2.js / shared.js / p2p.js).
   --------------------------------------------------------------------------- */
window.SKIN_LOOKS = window.SKIN_LOOKS || {
  TIGER: [{ id: 'preto', name: 'Sobretudo Preto', desc: ['Sobretudo e fedora pretos', 'Só muda o visual'], face: 'sprites/s7p_retrato.png' }],
  HERO: [{ id: 'subaru', name: 'Subaru', desc: ['Visual Subaru', 'Só muda o visual'], face: 'sprites/sub_retrato.png' }]
};

(() => {
  const $ = id => document.getElementById(id), menu = $('menu');
  if (!menu) return;
  const open = () => !menu.classList.contains('hidden');
  const tick = () => { try { if (typeof ac !== 'undefined' && ac) sfx('tick'); } catch { } };
  const shown = el => el.offsetParent !== null;
  const items = () => [...menu.querySelectorAll('#tabPlay:not(.hidden) .dc-btn:not(.dc-static), #tabMusic:not(.hidden) .track, #tabMusic:not(.hidden) .dc-back, #tabShadows:not(.hidden) .dc-sub, #tabShadows:not(.hidden) .shad, #tabShadows:not(.hidden) .dc-back')].filter(shown);
  addEventListener('keydown', e => {
    if (!open() || e.ctrlKey || e.metaKey || e.altKey) return;
    try { if ((typeof mode !== 'undefined' && mode) || (typeof introOn !== 'undefined' && introOn)) return; } catch { }
    const tg = e.target && e.target.tagName;
    if (tg === 'INPUT' || tg === 'SELECT' || tg === 'TEXTAREA') return;
    if (!$('botCfg').classList.contains('hidden') || !$('roomCfg').classList.contains('hidden') || !$('opts').classList.contains('hidden')) return;
    const k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowUp') {
      const l = items(); if (!l.length) return;
      e.preventDefault();
      const i = l.indexOf(document.activeElement);
      const n = i < 0 ? (k === 'ArrowDown' ? 0 : l.length - 1) : (i + (k === 'ArrowDown' ? 1 : -1) + l.length) % l.length;
      l[n].focus(); tick();
    } else if (k === 'ArrowLeft' || k === 'ArrowRight') {
      const a = document.activeElement;
      if (!a || !(a.classList.contains('shad') || a.classList.contains('dc-sub'))) return;
      const s = [...a.parentElement.children].filter(x => x.classList.contains(a.classList.contains('dc-sub') ? 'dc-sub' : 'shad')), i = s.indexOf(a);
      e.preventDefault(); s[(i + (k === 'ArrowRight' ? 1 : -1) + s.length) % s.length].focus(); tick();
    } else if (k === 'Escape' && !$('tabMusic').classList.contains('hidden')) {
      e.preventDefault(); $('btnMusicBack').click(); tick();
    } else if (k === 'Escape' && $('tabShadows') && !$('tabShadows').classList.contains('hidden')) {
      e.preventDefault(); $('btnShadowsBack').click(); tick();
    }
  });
})();

/* ---------------------------------------------------------------------------
   Aba "Skins" dentro da tela Shadows: [Personagens | Skins]
   A skin escolhida fica em cfg.look[ID_DO_PERSONAGEM] (salva junto com a config).
   --------------------------------------------------------------------------- */
(() => {
  const $ = id => document.getElementById(id);
  const panel = $('tabShadows'), list = $('shadowList');
  if (!panel || !list || $('skinList')) return;
  const C = () => { try { return cfg; } catch { return null; } };
  const CHARS = () => { try { return SKINS; } catch { return {}; } };
  const tick = () => { try { if (typeof ac !== 'undefined' && ac) sfx('tick'); } catch { } };
  const el = (tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt != null) x.textContent = txt; return x; };

  /* barra de abas */
  const bar = el('div', 'dc-subtabs'); bar.setAttribute('role', 'tablist');
  const tab = (id, txt) => { const b = el('button', 'dc-btn dc-sub'); b.type = 'button'; b.id = id; b.setAttribute('role', 'tab'); b.append(el('b', '', txt)); return b; };
  const bChars = tab('btnSubChars', 'Personagens'), bSkins = tab('btnSubSkins', 'Skins');
  bar.append(bChars, bSkins);

  /* painel das skins */
  const wrap = el('div', 'hidden'); wrap.id = 'skinWrap';
  const cap = el('p', 'skin-cap'), sl = el('div'), empty = el('p', 'skin-cap', 'Este personagem ainda não tem skins extras.');
  sl.id = 'skinList';
  wrap.append(cap, sl, empty);
  list.before(bar); list.after(wrap);

  const paintFace = (cv, id, k) => {
    if (k.face) {
      const im = new Image();
      im.onload = () => { const x = cv.getContext('2d'); x.imageSmoothingEnabled = false; x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, 0, cv.width, cv.height); x.drawImage(im, 0, 0, cv.width, cv.height); };
      im.src = k.face; return;
    }
    try { drawFace(cv, id, CHARS()[id].c); } catch { }
  };
  const curLook = id => { const c = C(); return (c && c.look && c.look[id]) || ''; };
  const markUsed = id => { const cur = curLook(id); for (const b of sl.children) b.setAttribute('aria-pressed', b.dataset.look === cur ? 'true' : 'false'); };

  const renderSkins = () => {
    const c = C(), S = CHARS(), id = c && c.skin, ch = S[id];
    cap.textContent = ch ? 'Skins de ' + ch.n : '';
    sl.textContent = '';
    const extra = ((window.SKIN_LOOKS || {})[id] || []).filter(k => k && k.id);
    for (const k of [{ id: '', name: 'Padrão', desc: ['Visual original'] }, ...extra]) {
      const b = el('button', 'shad skn'); b.type = 'button'; b.dataset.look = k.id;
      const cv = el('canvas', 'shad-face'); cv.width = cv.height = 112; paintFace(cv, id, k);
      const info = el('div', 'shad-info'), ul = el('ul');
      for (const d of (k.desc || [])) ul.append(el('li', '', d));
      info.append(el('b', '', k.name || k.id), ul);
      b.append(cv, info, el('em', 'shad-tag', 'EM USO'));
      b.onclick = () => {
        const cc = C(); if (!cc) return;
        cc.look = cc.look && typeof cc.look === 'object' ? cc.look : {};
        if (k.id) cc.look[id] = k.id; else delete cc.look[id];
        try { saveCfg(); } catch { }
        markUsed(id); tick();
      };
      sl.append(b);
    }
    empty.classList.toggle('hidden', extra.length > 0);
    markUsed(id);
  };

  const setSub = name => {
    const sk = name === 'skins';
    list.classList.toggle('hidden', sk); wrap.classList.toggle('hidden', !sk);
    bChars.setAttribute('aria-selected', sk ? 'false' : 'true'); bSkins.setAttribute('aria-selected', sk ? 'true' : 'false');
    if (sk) renderSkins();
  };
  bChars.onclick = () => { setSub('chars'); tick(); };
  bSkins.onclick = () => { setSub('skins'); tick(); };
  const bs = $('btnShadows'); if (bs) bs.addEventListener('click', () => setSub('chars'));
  setSub('chars');

  /* prefixo de sprites da skin em uso (para o desenho do jogo usar) */
  window.lookPrefixOf = id => {
    const k = ((window.SKIN_LOOKS || {})[id] || []).find(x => x && x.id === curLook(id));
    return k ? (k.prefix || '') : '';
  };
})();

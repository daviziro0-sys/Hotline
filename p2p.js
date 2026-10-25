'use strict';
/* ==========================================================================
   7 SHADOWS — online P2P (sem servidor próprio, funciona no GitHub Pages)
   Quem cria a sala vira o "servidor": a simulação (shared.js) roda no navegador
   dele e os amigos conectam direto (WebRTC) usando o PeerJS só para o primeiro
   aperto de mão. O jogo (game.js) fala com estes sockets como se fossem um WebSocket.
   ========================================================================== */
const P2P = (() => {
  const PREFIX = 'sh7x-';                                  // evita colisão de IDs no serviço público do PeerJS
  const OPTS = {
    debug: 0,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:global.stun.twilio.com:3478' }
      ]
    }
  };
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  // sem 0/O/1/I
  const SKINS = ['HERO', 'ROOSTER', 'TIGER', 'BEAR', 'MONKEY', 'WOLF', 'GORILLA', 'FISH'];
  const DT = 1 / 60;
  const MAX_CONNS = 12;
  let current = null;

  const txt = d => { if (typeof d === 'string') return d; try { return new TextDecoder().decode(d); } catch { return ''; } };

  // Timer num Worker: não é congelado quando a aba do anfitrião fica em segundo plano (como o setInterval da página).
  function startTimer(fn) {
    try {
      const url = URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},8)'], { type: 'text/javascript' }));
      const w = new Worker(url);
      w.onmessage = fn;
      return () => { try { w.terminate(); URL.revokeObjectURL(url); } catch { } };
    } catch {
      const id = setInterval(fn, 8);
      return () => clearInterval(id);
    }
  }

  /* ----------------------------------------------------------- ANFITRIÃO */
  class Host {
    constructor() {
      this.room = null; this.clients = new Map(); this.nextId = 1; this.peer = null;
      this.stopTimer = null; this.hk = 0; this.dead = false; this.opening = false;
      this.last = 0; this.acc = 0; this.tickN = 0; this.wake = null; this._vis = null;
    }

    addClient(send, local) {
      const c = { id: 'p' + this.nextId++, send, local: !!local, p: null, msgs: 0, seen: Date.now(), conn: null };
      this.clients.set(c.id, c);
      this.reply(c, { type: 'welcome', id: c.id });
      return c;
    }
    reply(c, data) { try { c.send(JSON.stringify(data)); } catch { } }

    handle(c, raw) {
      if (this.dead || typeof raw !== 'string' || raw.length > 2048) return;
      c.seen = Date.now();
      if (++c.msgs > 400) return;                         // limite de mensagens por segundo
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (!m || typeof m !== 'object') return;

      if (m.type === 'join') return this.join(c, m);
      if (!c.p || !this.room) { if (m.type === 'ping') this.reply(c, { type: 'pong', t: m.t }); return; }
      const game = this.room.game;

      if (m.type === 'input') {
        const seq = Number(m.seq), dt = Number(m.dt), a = Number(m.a);
        if (!Number.isFinite(seq) || !Number.isFinite(dt) || !Number.isFinite(a)) return;
        if (seq > c.p.ack) c.p.ack = seq;
        game.applyInput(c.p, {
          k: Number(m.k) | 0,
          a,
          ad: m.ad == null ? undefined : Math.max(0, Math.min(2000, Number(m.ad) || 0)),
          f: m.f ? 1 : 0, fp: m.fp ? 1 : 0, pk: m.pk ? 1 : 0, it: m.it ? 1 : 0, th: m.th ? 1 : 0,
          hl: m.hl ? 1 : 0, tc: m.tc ? 1 : 0, sw: m.sw ? 1 : 0, sl: m.sl ? 1 : 0, em: m.em ? 1 : 0, ct: m.ct ? 1 : 0,
          ss: Math.max(0, Math.min(2, Number(m.ss) | 0))
        }, Math.max(0, Math.min(0.05, dt)));
        return;
      }
      if (m.type === 'start') {
        if (!game.requestStart(c.id)) this.reply(c, { type: 'error', message: 'Só o anfitrião inicia, com 2 ou mais jogadores.' });
        return;
      }
      if (m.type === 'ping') this.reply(c, { type: 'pong', t: m.t });
    }

    join(c, m) {
      if (c.p) return;
      const skin = SKINS.includes(m.skin) ? m.skin : (m.skin === 'HIPPO' ? 'GORILLA' : 'HERO');
      const name = String(m.name || 'JOGADOR').replace(/[<>]/g, '').slice(0, 14);
      if (m.mode === 'create') {                          // só o próprio anfitrião (socket local) cria a sala
        if (!c.local || this.room || this.opening) return;
        this.opening = true;
        return this.openRoom(c, m, skin, name);
      }
      const code = String(m.room || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      if (!this.room || code !== this.room.code) return this.reply(c, { type: 'noroom' });
      this.seat(c, skin, name);
    }

    seat(c, skin, name) {
      const game = this.room.game;
      if (game.count >= game.maxPlayers) return this.reply(c, { type: 'full' });
      c.p = game.addPlayer(c.id, name, skin);
      if (!c.p) return this.reply(c, { type: 'full' });
      this.room.clients.add(c);
      this.reply(c, { type: 'joined', id: c.id, slot: c.p.slot, room: this.room.code });
    }

    // Registra um código de 4 letras como ID no serviço de encontro do PeerJS; se já estiver em uso, tenta outro.
    openRoom(c, m, skin, name) {
      let tries = 0;
      const attempt = () => {
        if (this.dead) return;
        let code = '';
        for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
        let peer;
        try { peer = new Peer(PREFIX + code, OPTS); } catch { return fail('lib'); }
        this.peer = peer;
        const to = setTimeout(() => fail('broker'), 15000);
        peer.on('open', () => {
          clearTimeout(to);
          if (this.dead) return;
          this.room = { code, game: new Shared.Game(Shared.sanitizeRoomCfg(Object.assign({ map: m.map }, m.cfg))), clients: new Set() };
          this.seat(c, skin, name);
          this.begin();
        });
        peer.on('error', err => {
          clearTimeout(to);
          if (this.room) return;                          // com a sala já aberta, erros do serviço de encontro não derrubam a partida
          if (err && err.type === 'unavailable-id' && ++tries < 8) { try { peer.destroy(); } catch { } return attempt(); }
          fail(err && err.type);
        });
        peer.on('disconnected', () => { if (!this.dead) { try { peer.reconnect(); } catch { } } });   // só o serviço de encontro caiu; quem já está conectado segue jogando
        peer.on('connection', conn => this.onConn(conn));
      };
      const fail = reason => { this.opening = false; this.reply(c, { type: 'p2perror', reason: String(reason || 'erro') }); };
      attempt();
    }

    onConn(conn) {
      let c = null;
      conn.on('open', () => {
        if (this.dead || this.clients.size >= MAX_CONNS) return conn.close();
        c = this.addClient((s, droppable) => {
          if (!conn.open) return;
          const dc = conn.dataChannel;
          if (droppable && dc && dc.bufferedAmount > 262144) return;   // conexão lenta: pula snapshot em vez de acumular atraso
          conn.send(s);
        }, false);
        c.conn = conn;
      });
      conn.on('data', d => { if (c) this.handle(c, txt(d)); });
      const gone = () => { if (c) this.drop(c); };
      conn.on('close', gone);
      conn.on('error', gone);
    }

    drop(c) {
      if (!this.clients.has(c.id)) return;
      this.clients.delete(c.id);
      if (c.p && this.room) { this.room.game.removePlayer(c.id); this.room.clients.delete(c); }
      if (c.conn) { try { c.conn.close(); } catch { } }
      if (c.local) this.shutdown();
    }

    begin() {
      this.last = Date.now(); this.acc = 0;
      this.stopTimer = startTimer(() => {
        if (this.dead || !this.room) return;
        const now = Date.now();
        this.acc += Math.min(0.25, (now - this.last) / 1000);
        this.last = now;
        while (this.acc >= DT) {
          const every = this.room.clients.size > 3 ? 2 : 1;   // com 4+ jogadores manda 30 snapshots/s para poupar o upload do anfitrião
          this.room.game.tick(DT);
          if (++this.tickN % every === 0) this.broadcast();
          this.acc -= DT;
        }
      });
      this.hk = setInterval(() => {
        const now = Date.now();
        for (const c of [...this.clients.values()]) {
          c.msgs = 0;
          if (!c.local && now - c.seen > 10000) this.drop(c);   // sumiu (fechou a aba / perdeu a rede)
        }
      }, 1000);
      const lock = () => { try { navigator.wakeLock.request('screen').then(l => { this.wake = l; }).catch(() => { }); } catch { } };
      lock();
      this._vis = () => { if (document.visibilityState === 'visible' && !this.dead) lock(); };
      try { document.addEventListener('visibilitychange', this._vis); } catch { }
    }

    broadcast() {
      const game = this.room.game;
      const snap = game.snapshot();
      game.events = [];
      const base = JSON.stringify(snap).slice(0, -1) + ',"room":"' + this.room.code + '"';
      for (const c of this.room.clients) if (c.p) c.send(base + ',"ack":' + (c.p.ack | 0) + '}', true);
    }

    shutdown() {
      if (this.dead) return;
      this.dead = true;
      if (this.stopTimer) this.stopTimer();
      clearInterval(this.hk);
      for (const c of this.clients.values()) if (c.conn) { try { c.conn.close(); } catch { } }
      try { if (this.peer) this.peer.destroy(); } catch { }
      try { if (this.wake) this.wake.release(); } catch { }
      try { document.removeEventListener('visibilitychange', this._vis); } catch { }
      this.clients.clear(); this.room = null;
      if (current === this) current = null;
    }
  }

  /* ---- socket do próprio anfitrião (ligação direta com o Host, sem rede) */
  class LoopSocket {
    constructor() {
      this.readyState = 0; this.onopen = this.onmessage = this.onclose = this.onerror = null;
      if (current) current.shutdown();
      this.host = current = new Host();
      setTimeout(() => {
        if (this.readyState === 3) return;
        this.readyState = 1;
        this.c = this.host.addClient(s => queueMicrotask(() => { if (this.readyState === 1 && this.onmessage) this.onmessage({ data: s }); }), true);
        if (this.onopen) this.onopen();
      }, 0);
    }
    send(s) { if (this.readyState !== 1) return; const c = this.c; queueMicrotask(() => this.host.handle(c, s)); }
    close() { if (this.readyState === 3) return; this.readyState = 3; this.host.shutdown(); }
  }

  /* ---- socket de quem entra: conecta no anfitrião pelo código da sala */
  class PeerSocket {
    constructor(code) {
      this.readyState = 0; this.onopen = this.onmessage = this.onclose = this.onerror = null;
      this.done = false; this.peer = null; this.conn = null;
      this.to = setTimeout(() => this.fail('timeout'), 15000);
      let peer;
      try { peer = this.peer = new Peer(OPTS); } catch { return void setTimeout(() => this.fail('lib'), 0); }
      peer.on('open', () => {
        if (this.done) return;
        const conn = this.conn = peer.connect(PREFIX + code, { reliable: false, serialization: 'none' });   // reliable:false = sem fila ordenada (menos atraso)
        conn.on('open', () => { if (this.done) return; clearTimeout(this.to); this.readyState = 1; if (this.onopen) this.onopen(); });
        conn.on('data', d => { if (this.onmessage && !this.done) this.onmessage({ data: txt(d) }); });
        conn.on('close', () => this.lost());
        conn.on('error', () => this.lost());
      });
      peer.on('error', err => {
        if (this.done) return;
        if (err && err.type === 'peer-unavailable') { this.emit({ type: 'noroom' }); return this.finish(false); }
        this.fail((err && err.type) || 'erro');
      });
    }
    emit(o) { if (this.onmessage) this.onmessage({ data: JSON.stringify(o) }); }
    fail(reason) { if (this.done) return; this.emit({ type: 'p2perror', reason }); this.finish(false); }
    lost() { if (this.done) return; this.finish(true); }
    finish(callClose) {
      this.done = true; this.readyState = 3; clearTimeout(this.to);
      try { if (this.peer) this.peer.destroy(); } catch { }
      if (callClose && this.onclose) this.onclose({});
    }
    send(s) { if (this.readyState === 1) { try { this.conn.send(s); } catch { } } }
    close() { if (this.done) return; this.finish(false); }
  }

  // PeerJS sob demanda: só baixa quando for jogar online (ou em segundo plano, depois da abertura). Tenta unpkg e depois jsDelivr.
  let libP = null;
  const loadLib = () => typeof Peer !== 'undefined' ? Promise.resolve(true) : libP || (libP = new Promise(res => {
    const urls = ['https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js', 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js'];
    const next = i => {
      if (i >= urls.length) { libP = null; return res(false); }
      const s = document.createElement('script'); s.src = urls[i]; s.async = true;
      s.onload = () => typeof Peer !== 'undefined' ? res(true) : next(i + 1);
      s.onerror = () => { s.remove(); next(i + 1); };
      document.head.appendChild(s);
    };
    next(0);
  }));
  return { newHostSocket: () => new LoopSocket(), newGuestSocket: code => new PeerSocket(code), Host, loadLib };
})();
if (typeof module === 'object' && module.exports) module.exports = P2P;

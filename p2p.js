"use strict";
/* ============================================================================
   P2P (WebRTC via PeerJS)  |  7 SHADOWS
   Camada de conexão portada do OUTCOME:
   - o anfitrião registra o ID "sh7x-XXXX" no broker gratuito do PeerJS e os
     outros jogadores se conectam a ele (sem servidor próprio);
   - sem lista de ICE própria: usa a configuração PADRÃO do PeerJS (STUN do
     Google + TURN do próprio PeerJS), igual ao OUTCOME;
   - canal de dados CONFIÁVEL (reliable), igual ao OUTCOME.
   A API pública não mudou (newHostSocket, newGuestSocket, Host, loadLib),
   então o game.js continua igual.
   ========================================================================== */
const P2P = (() => {
  const PFX = "sh7x-";                       // prefixo do ID da sala no broker
  // Opcional: seu próprio TURN. Vazio = servidores ICE padrão do PeerJS, exatamente como o index que funciona.
  const MY_TURN = [
    // { urls: ["turn:SEU_HOST:3478", "turns:SEU_HOST:443?transport=tcp"], username: "USUARIO", credential: "SENHA" },
  ];
  const OPTS = MY_TURN.length ? { debug: 0, config: { iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: ["turn:eu-0.turn.peerjs.com:3478", "turn:us-0.turn.peerjs.com:3478"], username: "peerjs", credential: "peerjsp" },
    ...MY_TURN,
  ] } } : { debug: 0 };
  const RELIABLE = false;                    // false = canal NÃO ORDENADO (sem bloqueio de cabeça de fila: um pacote perdido não trava os seguintes). O cliente descarta snapshots fora de ordem pelo campo "n". Ponha true para voltar ao canal ordenado.
  const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const SKINS = ["HERO", "ROOSTER", "TIGER", "BEAR", "MONKEY", "WOLF", "GORILLA", "FISH"];
  const STEP = 1 / 60;
  const MAX_CLIENTS = 12;
  const MAX_BUFFERED = 262144;               // se o canal do convidado acumular mais que isso, descarta snapshots
  let current = null;                        // anfitrião ativo (só existe um por aba)

  const asText = d => {
    if (typeof d === "string") return d;
    try { return new TextDecoder().decode(d); } catch { return ""; }
  };

  // timer de 8 ms em Worker (não é freado quando a aba fica em segundo plano)
  function ticker(fn) {
    try {
      const url = URL.createObjectURL(new Blob(["setInterval(function(){postMessage(0)},4)"], { type: "text/javascript" }));
      const w = new Worker(url);
      w.onmessage = fn;
      return () => { try { w.terminate(); URL.revokeObjectURL(url); } catch {} };
    } catch {
      const id = setInterval(fn, 4);
      return () => clearInterval(id);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* ANFITRIÃO: simula o jogo e atende todos os clientes (locais e remotos) */
  /* ---------------------------------------------------------------------- */
  class Host {
    constructor() {
      this.room = null; this.clients = new Map(); this.nextId = 1;
      this.peer = null; this.stopTimer = null; this.hk = 0;
      this.dead = false; this.opening = false;
      this.last = 0; this.acc = 0; this.tickN = 0; this.snapN = 0;
      this.wake = null; this._vis = null;
    }

    addClient(send, local) {
      const c = { id: "p" + this.nextId++, send, local: !!local, p: null, msgs: 0, seen: Date.now(), conn: null };
      this.clients.set(c.id, c);
      this.reply(c, { type: "welcome", id: c.id });
      return c;
    }

    reply(c, msg) { try { c.send(JSON.stringify(msg)); } catch {} }

    handle(c, text) {
      if (this.dead || typeof text !== "string" || text.length > 2048) return;
      c.seen = Date.now();
      if (++c.msgs > 400) return;            // limite de mensagens por segundo
      let m;
      try { m = JSON.parse(text); } catch { return; }
      if (!m || typeof m !== "object") return;
      if (m.type === "join") return this.join(c, m);
      if (!c.p || !this.room) {
        if (m.type === "ping") this.reply(c, { type: "pong", t: m.t });
        return;
      }
      const game = this.room.game;
      if (m.type === "input") {
        const seq = Number(m.seq), dt = Number(m.dt), a = Number(m.a);
        if (!Number.isFinite(seq) || !Number.isFinite(dt) || !Number.isFinite(a)) return;
        if (seq > c.p.ack) c.p.ack = seq;
        game.applyInput(c.p, {
          k: Number(m.k) | 0, a,
          ad: m.ad == null ? undefined : Math.max(0, Math.min(2000, Number(m.ad) || 0)),
          f: m.f ? 1 : 0, fp: m.fp ? 1 : 0, pk: m.pk ? 1 : 0, it: m.it ? 1 : 0, th: m.th ? 1 : 0,
          hl: m.hl ? 1 : 0, tc: m.tc ? 1 : 0, sw: m.sw ? 1 : 0, sl: m.sl ? 1 : 0, em: m.em ? 1 : 0,
          ct: m.ct ? 1 : 0, ss: Math.max(0, Math.min(2, Number(m.ss) | 0)),
        }, Math.max(0, Math.min(0.05, dt)));
        return;
      }
      if (m.type === "start") {
        if (!game.requestStart(c.id)) this.reply(c, { type: "error", message: "Só o anfitrião inicia, com 2 ou mais jogadores." });
        return;
      }
      if (m.type === "ping") this.reply(c, { type: "pong", t: m.t });
    }

    join(c, m) {
      if (c.p) return;
      const skin = SKINS.includes(m.skin) ? m.skin : m.skin === "HIPPO" ? "GORILLA" : "HERO";
      const name = String(m.name || "JOGADOR").replace(/[<>]/g, "").slice(0, 14);
      if (m.mode === "create") {
        if (!c.local || this.room || this.opening) return;
        this.opening = true;
        return this.openRoom(c, m, skin, name);
      }
      const code = String(m.room || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
      if (!this.room || code !== this.room.code) return this.reply(c, { type: "noroom" });
      this.seat(c, skin, name);
    }

    seat(c, skin, name) {
      const game = this.room.game;
      if (game.count >= game.maxPlayers) return this.reply(c, { type: "full" });
      c.p = game.addPlayer(c.id, name, skin);
      if (!c.p) return this.reply(c, { type: "full" });
      this.room.clients.add(c);
      this.reply(c, { type: "joined", id: c.id, slot: c.p.slot, room: this.room.code });
    }

    // registra "sh7x-XXXX" no broker do PeerJS (tenta outro código se já estiver em uso)
    openRoom(c, m, skin, name) {
      let tries = 0;
      const fail = why => {
        this.opening = false;
        this.reply(c, { type: "p2perror", reason: String(why || "erro") });
      };
      const attempt = () => {
        if (this.dead) return;
        let code = "";
        for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
        let peer;
        try { peer = new Peer(PFX + code, OPTS); } catch { return fail("lib"); }
        this.peer = peer;
        const brokerTimeout = setTimeout(() => fail("broker"), 15000);
        peer.on("open", () => {
          clearTimeout(brokerTimeout);
          if (this.dead) return;
          this.room = {
            code,
            game: new Shared.Game(Shared.sanitizeRoomCfg(Object.assign({ map: m.map }, m.cfg))),
            clients: new Set(),
          };
          this.seat(c, skin, name);
          this.begin();
        });
        peer.on("error", e => {
          clearTimeout(brokerTimeout);
          if (this.room) return;
          if (e && e.type === "unavailable-id" && ++tries < 8) {
            try { peer.destroy(); } catch {}
            return attempt();
          }
          fail(e && e.type);
        });
        peer.on("disconnected", () => {      // perdeu o broker: tenta reconectar (as conexões já abertas continuam)
          const retry = () => {
            if (this.dead || !peer.disconnected) return;
            try { peer.reconnect(); } catch {}
            setTimeout(retry, 5000);
          };
          setTimeout(retry, 500);
        });
        peer.on("connection", conn => this.onConn(conn));
      };
      attempt();
    }

    // um convidado abriu conexão com o anfitrião
    onConn(conn) {
      let c = null;
      conn.on("open", () => {
        if (this.dead || this.clients.size >= MAX_CLIENTS) return conn.close();
        c = this.addClient((msg, droppable) => {
          if (!conn.open) return;
          const dc = conn.dataChannel;
          if (droppable && dc && dc.bufferedAmount > MAX_BUFFERED) return;   // snapshots velhos não valem a pena
          conn.send(msg);
        }, false);
        c.conn = conn;
      });
      conn.on("data", d => { if (c) this.handle(c, asText(d)); });
      const gone = () => { if (c) this.drop(c); };
      conn.on("close", gone);
      conn.on("error", gone);
    }

    drop(c) {
      if (!this.clients.has(c.id)) return;
      this.clients.delete(c.id);
      if (c.p && this.room) { this.room.game.removePlayer(c.id); this.room.clients.delete(c); }
      if (c.conn) { try { c.conn.close(); } catch {} }
      if (c.local) this.shutdown();          // o anfitrião saiu: a sala fecha para todos
    }

    begin() {
      this.last = performance.now(); this.acc = 0;
      this.stopTimer = ticker(() => {
        if (this.dead || !this.room) return;
        const now = performance.now();
        this.acc += Math.min(0.25, (now - this.last) / 1000);
        this.last = now;
        while (this.acc >= STEP) {
          const every = this.room.clients.size > 3 ? 2 : 1;   // com mais de 3 jogadores envia 1 snapshot a cada 2 ticks
          this.room.game.tick(STEP);
          if (++this.tickN % every === 0) this.broadcast();
          this.acc -= STEP;
        }
      });
      this.hk = setInterval(() => {
        const now = Date.now();
        for (const c of [...this.clients.values()]) {
          c.msgs = 0;
          if (!c.local && now - c.seen > 25000) this.drop(c);   // sumiu há 25 s: remove
        }
      }, 1000);
      const lock = () => { try { navigator.wakeLock.request("screen").then(w => { this.wake = w; }).catch(() => {}); } catch {} };
      lock();
      this._vis = () => { if (document.visibilityState === "visible" && !this.dead) lock(); };
      try { document.addEventListener("visibilitychange", this._vis); } catch {}
    }

    broadcast() {
      const game = this.room.game, snap = game.snapshot();
      game.events = [];
      const base = JSON.stringify(snap).slice(0, -1) + ',"room":"' + this.room.code + '","n":' + (++this.snapN);
      for (const c of this.room.clients) if (c.p) c.send(base + ',"ack":' + (c.p.ack | 0) + "}", true);
    }

    shutdown() {
      if (this.dead) return;
      this.dead = true;
      this.stopTimer && this.stopTimer();
      clearInterval(this.hk);
      for (const c of this.clients.values()) if (c.conn) { try { c.conn.close(); } catch {} }
      try { this.peer && this.peer.destroy(); } catch {}
      try { this.wake && this.wake.release(); } catch {}
      try { document.removeEventListener("visibilitychange", this._vis); } catch {}
      this.clients.clear();
      this.room = null;
      if (current === this) current = null;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* SOCKET DO ANFITRIÃO: parece um WebSocket, mas fala direto com o Host    */
  /* ---------------------------------------------------------------------- */
  class HostSocket {
    constructor() {
      this.readyState = 0;
      this.onopen = this.onmessage = this.onclose = this.onerror = null;
      if (current) current.shutdown();
      this.host = current = new Host();
      setTimeout(() => {
        if (this.readyState === 3) return;
        this.readyState = 1;
        this.c = this.host.addClient(msg => queueMicrotask(() => {
          if (this.readyState === 1 && this.onmessage) this.onmessage({ data: msg });
        }), true);
        this.onopen && this.onopen();
      }, 0);
    }
    send(t) {
      if (this.readyState !== 1) return;
      const c = this.c;
      queueMicrotask(() => this.host.handle(c, t));
    }
    close() {
      if (this.readyState === 3) return;
      this.readyState = 3;
      this.host.shutdown();
    }
  }

  /* ---------------------------------------------------------------------- */
  /* SOCKET DO CONVIDADO: conecta em "sh7x-CODIGO" (igual ao joinRoom do OUTCOME) */
  /* ---------------------------------------------------------------------- */
  class GuestSocket {
    constructor(room) {
      this.readyState = 0;
      this.onopen = this.onmessage = this.onclose = this.onerror = null;
      this.done = false; this.opened = false;
      this.peer = null; this.conn = null;
      this.room = room; this.tries = 0; this.to = null;
      this.attempt();
    }

    attempt() {
      if (this.done) return;
      this.tries++;
      clearTimeout(this.to);
      try { this.peer && this.peer.destroy(); } catch {}
      this.peer = this.conn = null;
      let peer;
      try { peer = this.peer = new Peer(OPTS); } catch { return void setTimeout(() => this.fail("lib"), 0); }
      const retry = why => {
        if (this.done || this.opened || this.peer !== peer) return;
        this.tries < 3 ? this.attempt() : this.fail(why);
      };
      this.to = setTimeout(() => retry("timeout"), 10000);
      peer.on("open", () => {
        if (this.done || this.peer !== peer) return;
        const conn = this.conn = peer.connect(PFX + this.room, { reliable: RELIABLE });
        conn.on("open", () => {
          if (this.done || this.peer !== peer) return;
          clearTimeout(this.to);
          this.opened = true;
          this.readyState = 1;
          this.onopen && this.onopen();
        });
        conn.on("data", d => { this.onmessage && !this.done && this.onmessage({ data: asText(d) }); });
        conn.on("close", () => this.opened ? this.lost() : retry("close"));
        conn.on("error", () => this.opened ? this.lost() : retry("erro"));
      });
      peer.on("error", e => {
        if (this.done || this.peer !== peer) return;
        if (e && e.type === "peer-unavailable") {          // ninguém registrou esse código
          this.emit({ type: "noroom" });
          return this.finish(false);
        }
        this.opened || retry((e && e.type) || "erro");
      });
    }

    emit(m) { this.onmessage && this.onmessage({ data: JSON.stringify(m) }); }
    fail(why) {
      if (this.done) return;
      this.emit({ type: "p2perror", reason: why });
      this.finish(false);
    }
    lost() { if (!this.done) this.finish(true); }
    finish(notify) {
      this.done = true;
      this.readyState = 3;
      clearTimeout(this.to);
      try { this.peer && this.peer.destroy(); } catch {}
      notify && this.onclose && this.onclose({});
    }
    send(t) {
      if (this.readyState !== 1) return;
      try { this.conn.send(t); } catch {}
    }
    close() { if (!this.done) this.finish(false); }
  }

  /* carrega o PeerJS sob demanda (2 CDNs de reserva), caso a tag do HTML não tenha carregado */
  let libPromise = null;
  const loadLib = () => typeof Peer !== "undefined" ? Promise.resolve(true) : libPromise || (libPromise = new Promise(done => {
    const urls = [
      "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js",
      "https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js",
    ];
    const next = i => {
      if (i >= urls.length) { libPromise = null; return done(false); }
      const s = document.createElement("script");
      s.src = urls[i]; s.async = true;
      s.onload = () => typeof Peer !== "undefined" ? done(true) : next(i + 1);
      s.onerror = () => { s.remove(); next(i + 1); };
      document.head.appendChild(s);
    };
    next(0);
  }));

  return { newHostSocket: () => new HostSocket(), newGuestSocket: room => new GuestSocket(room), Host, loadLib };
})();
typeof module === "object" && module.exports && (module.exports = P2P);

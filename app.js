/* =========================================================
   백수톡 내기 · 미니게임  —  app.js
   순수 JS. 외부 라이브러리 없음.
   ========================================================= */
(function () {
  'use strict';

  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const pick = (n) => {
    const limit = Math.floor(4294967295 / n) * n;
    const buf = new Uint32Array(1);
    let v;
    do { crypto.getRandomValues(buf); v = buf[0]; } while (v >= limit);
    return v % n;
  };
  const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  function fitCanvas(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }
  function ellipsisText(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }

  const PALETTE = ['#00eaff', '#8b5cf6', '#ff2ea6', '#ffc24b', '#b6ff3c', '#3ec6ff',
                   '#ff7a45', '#a78bfa', '#3ddc97', '#ff5d8f', '#5eead4', '#f472b6'];
  const MAX_PLAYERS = 12;

  /* ---------- confetti ---------- */
  const fx = (() => {
    const canvas = $('#fx');
    const ctx = canvas.getContext('2d');
    let parts = [], raf = null, w = 0, h = 0, dpr = 1;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);
    function loop() {
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.vy += 0.16;
        p.x += p.vx; p.y += p.vy;
        p.rot += p.vr;
        p.life -= 1;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = clamp(p.life / 60, 0, 1);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
        ctx.restore();
      }
      parts = parts.filter(p => p.life > 0 && p.y < h + 60);
      if (parts.length) raf = requestAnimationFrame(loop);
      else { ctx.clearRect(0, 0, w, h); raf = null; }
    }
    function burst(n = 80, origin) {
      const ox = origin ? origin.x : w / 2;
      const oy = origin ? origin.y : h * 0.35;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 3 + Math.random() * 8;
        parts.push({
          x: ox, y: oy,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 3,
          s: 4 + Math.random() * 7,
          rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.35,
          color: PALETTE[pick(PALETTE.length)],
          life: 60 + Math.random() * 40
        });
      }
      if (!raf) raf = requestAnimationFrame(loop);
    }
    return { burst };
  })();

  /* ---------- tabs ---------- */
  const tabButtons = $$('#tabs .tab');
  const panels = { bet: $('#panel-bet'), react: $('#panel-react'), dice: $('#panel-dice') };
  let activeTab = 'bet';
  function activate(name, silent) {
    if (!panels[name]) name = 'bet';
    activeTab = name;
    tabButtons.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    Object.entries(panels).forEach(([k, el]) => el.classList.toggle('active', k === name));
    if (!silent) history.replaceState(null, '', '#' + name);
    requestAnimationFrame(() => {
      if (name === 'bet') { wheel.layout(); wheel.draw(); ladder.layout(); ladder.draw(); }
      if (name === 'dice') { menuWheel.layout(); menuWheel.draw(); }
    });
  }
  tabButtons.forEach(b => b.addEventListener('click', () => activate(b.dataset.tab)));

  /* ---------- player list ---------- */
  const playersEl = $('#players');
  function getPlayers() {
    return playersEl.value
      .split(/[,\n，、\/;]/)
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, MAX_PLAYERS);
  }
  function setPlayers(list) {
    playersEl.value = list.join(', ');
    store.set('bst.players', list);
    onPlayersChanged();
  }
  playersEl.value = (store.get('bst.players', ['안치롱', '친구1', '친구2', '친구3']) || []).join(', ');
  playersEl.addEventListener('input', () => {
    store.set('bst.players', getPlayers());
    onPlayersChanged();
  });

  $('#presets').addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    const p = btn.dataset.preset;
    if (p === 'clear') { setPlayers([]); return; }
    const n = parseInt(p, 10);
    const list = [];
    for (let i = 0; i < n; i++) list.push(i === 0 ? '안치롱' : '친구' + i);
    setPlayers(list);
  });

  /* ---------- bet mode (wheel / ladder) ---------- */
  const wheelStage = $('#wheelStage');
  const ladderStage = $('#ladderStage');
  const ladderOpts = $('#ladderOpts');
  const betResult = $('#betResult');
  const betList = $('#betList');
  let betMode = 'wheel';

  function setBetMode(mode) {
    betMode = mode;
    $$('#betMode .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    const isWheel = mode === 'wheel';
    wheelStage.classList.toggle('hidden', !isWheel);
    ladderStage.classList.toggle('hidden', isWheel);
    ladderOpts.classList.toggle('hidden', isWheel);
    betResult.classList.remove('win');
    betList.innerHTML = '';
    if (isWheel) {
      setBanner('참가자를 입력하고 시작!');
      requestAnimationFrame(() => { wheel.layout(); wheel.draw(); });
    } else {
      ensureOutcomes();
      setBanner('사다리를 타면 결과가 나와요');
      requestAnimationFrame(() => { ladder.layout(); ladder.draw(); });
    }
  }
  $('#betMode').addEventListener('click', e => {
    const b = e.target.closest('.seg-btn');
    if (b) setBetMode(b.dataset.mode);
  });

  function setBanner(text, win) {
    betResult.classList.toggle('win', !!win);
    $('.rb-text', betResult).textContent = text;
  }
  function setBetList(rows) {
    betList.innerHTML = '';
    rows.forEach(([name, res]) => {
      const s = document.createElement('span');
      s.innerHTML = `${escapeHtml(name)} → <b>${escapeHtml(res)}</b>`;
      betList.appendChild(s);
    });
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---------- outcome textarea ---------- */
  const outcomesEl = $('#outcomes');
  let outcomesAuto = true;
  function autoOutcomes() {
    const n = getPlayers().length || 1;
    const arr = new Array(n).fill('꽝');
    if (n > 1) arr[pick(n)] = '당첨';
    return arr;
  }
  function ensureOutcomes() {
    if (outcomesAuto || !outcomesEl.value.trim()) {
      outcomesEl.value = autoOutcomes().join(', ');
      outcomesAuto = true;
    }
  }
  outcomesEl.addEventListener('input', () => { outcomesAuto = false; });
  $('#btnAutoOutcome').addEventListener('click', () => {
    outcomesAuto = true;
    outcomesEl.value = autoOutcomes().join(', ');
    ladder.layout(); ladder.draw();
  });

  function onPlayersChanged() {
    const n = getPlayers().length;
    if (betMode === 'wheel') { wheel.setItems(getPlayers()); }
    if (outcomesAuto) outcomesEl.value = autoOutcomes().join(', ');
    if (betMode === 'ladder') { ladder.layout(); ladder.draw(); }
  }

  /* =========================================================
     NEON WHEEL
     ========================================================= */
  class NeonWheel {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.opts = opts;
      this.items = [];
      this.rot = -Math.PI / 2;
      this.spinning = false;
      this.winner = -1;
      this.w = 0; this.h = 0; this.ctx = null;
      this.flashUntil = 0;
      this.onResult = opts.onResult || null;
    }
    layout() {
      const fit = fitCanvas(this.canvas);
      this.ctx = fit.ctx; this.w = fit.w; this.h = fit.h;
    }
    setItems(items) {
      this.items = items.length ? items.slice() : [];
      this.winner = -1;
      this.draw();
    }
    size() { return Math.min(this.w, this.h); }
    draw() {
      const ctx = this.ctx;
      if (!ctx) return;
      const S = this.size();
      if (!S) return;
      const cx = this.w / 2, cy = this.h / 2;
      const R = S * 0.455;
      ctx.clearRect(0, 0, this.w, this.h);

      const n = this.items.length;
      // empty state
      if (n === 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(140,160,255,.28)';
        ctx.setLineDash([7, 9]);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = 'rgba(160,170,215,.75)';
        ctx.font = `800 ${Math.max(12, S * 0.045)}px Pretendard, system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('참가자를 입력해줘', cx, cy);
        this.drawPointer(cx, cy, R);
        return;
      }
      if (n === 1) {
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,234,255,.12)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,234,255,.5)';
        ctx.stroke();
        ctx.fillStyle = '#eaf9ff';
        ctx.font = `900 ${Math.max(13, S * 0.05)}px Pretendard, system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(this.items[0], cx, cy);
        this.drawPointer(cx, cy, R);
        return;
      }

      const step = (Math.PI * 2) / n;
      // outer glow ring
      const ring = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 1.16);
      ring.addColorStop(0, 'rgba(0,234,255,.0)');
      ring.addColorStop(0.55, 'rgba(0,234,255,.20)');
      ring.addColorStop(1, 'rgba(0,234,255,0)');
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.16, 0, Math.PI * 2);
      ctx.fillStyle = ring; ctx.fill();
      ctx.restore();

      for (let i = 0; i < n; i++) {
        const a0 = this.rot + i * step;
        const a1 = a0 + step;
        const color = PALETTE[i % PALETTE.length];
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, a0, a1);
        ctx.closePath();
        const g = ctx.createRadialGradient(cx, cy, R * 0.15, cx, cy, R);
        g.addColorStop(0, shade(color, -0.42));
        g.addColorStop(1, color);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(5,8,18,.55)';
        ctx.stroke();

        // winner highlight
        if (i === this.winner && !this.spinning) {
          ctx.save();
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a1); ctx.closePath();
          ctx.fillStyle = 'rgba(255,255,255,.28)';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          ctx.shadowColor = '#fff'; ctx.shadowBlur = 26;
          ctx.stroke();
          ctx.restore();
        }

        // label
        const mid = a0 + step / 2;
        const fs = clamp(S * 0.9 / Math.max(6, n) * 2.2, 10, S * 0.052);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(mid);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(4,8,16,.9)';
        ctx.font = `900 ${fs}px Pretendard, system-ui, sans-serif`;
        const maxW = R * 0.66;
        ctx.fillText(ellipsisText(ctx, this.items[i], maxW), R - 14, 0);
        ctx.restore();
      }

      // hub
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.185, 0, Math.PI * 2);
      const hg = ctx.createLinearGradient(cx - R * 0.2, cy - R * 0.2, cx + R * 0.2, cy + R * 0.2);
      hg.addColorStop(0, '#101528'); hg.addColorStop(1, '#05070f');
      ctx.fillStyle = hg; ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(0,234,255,.55)';
      ctx.stroke();
      ctx.fillStyle = this.spinning ? '#ff2ea6' : '#00eaff';
      ctx.font = `900 ${Math.max(11, R * 0.1)}px Pretendard, system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.spinning ? '•••' : 'GO', cx, cy + 0.5);

      this.drawPointer(cx, cy, R);
    }
    drawPointer(cx, cy, R) {
      const ctx = this.ctx;
      const wpx = Math.max(14, R * 0.11), hpx = Math.max(20, R * 0.16);
      ctx.save();
      ctx.translate(cx, cy - R - 3);
      ctx.beginPath();
      ctx.moveTo(0, hpx);
      ctx.lineTo(-wpx / 2, -hpx * 0.42);
      ctx.lineTo(wpx / 2, -hpx * 0.42);
      ctx.closePath();
      ctx.fillStyle = '#ff2ea6';
      ctx.shadowColor = 'rgba(255,46,166,.95)'; ctx.shadowBlur = 18;
      ctx.fill();
      ctx.restore();
    }
    async spin(duration) {
      const n = this.items.length;
      if (this.spinning) return null;
      if (n < 2) return null;
      this.spinning = true;
      this.winner = -1;
      this.draw();
      const winner = pick(n);
      const step = (Math.PI * 2) / n;
      const jitter = (Math.random() - 0.5) * step * 0.66;
      const targetLocal = -Math.PI / 2 - (winner * step + step / 2) + jitter;
      let to = targetLocal;
      const from = this.rot;
      while (to <= from + Math.PI * 2 * 5) to += Math.PI * 2;
      const dur = duration || 4200;
      const t0 = performance.now();
      await new Promise(res => {
        const tick = (now) => {
          const p = Math.min(1, (now - t0) / dur);
          const e = 1 - Math.pow(1 - p, 5);
          this.rot = from + (to - from) * e;
          this.draw();
          if (p < 1) requestAnimationFrame(tick); else res();
        };
        requestAnimationFrame(tick);
      });
      this.rot = to;
      this.winner = winner;
      this.spinning = false;
      this.draw();
      return { index: winner, label: this.items[winner] };
    }
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = clamp(Math.round(r * (1 + amt)), 0, 255);
    g = clamp(Math.round(g * (1 + amt)), 0, 255);
    b = clamp(Math.round(b * (1 + amt)), 0, 255);
    return `rgb(${r},${g},${b})`;
  }

  const wheel = new NeonWheel($('#wheelCanvas'));
  wheel.setItems(getPlayers());

  const btnSpin = $('#btnSpin');
  btnSpin.addEventListener('click', async () => {
    const players = getPlayers();
    if (players.length < 2) {
      setBanner('참가자를 2명 이상 입력해줘 🙂');
      playersEl.focus();
      return;
    }
    wheel.setItems(players);
    btnSpin.disabled = true;
    setBanner('두구두구…');
    setBetList([]);
    const res = await wheel.spin(4200);
    btnSpin.disabled = false;
    if (!res) return;
    setBanner(`🎉 ${res.label} 당첨!`, true);
    setBetList([[res.label, '당첨 🏆']]);
    betList.innerHTML = `<span>🎉 <b>${escapeHtml(res.label)}</b> 님이 오늘의 승자!</span>`;
    fx.burst(110, { x: window.innerWidth / 2, y: window.innerHeight * 0.36 });
    buzz([30, 40, 60]);
  });

  /* =========================================================
     LADDER
     ========================================================= */
  const ladder = {
    canvas: $('#ladderCanvas'),
    ctx: null, w: 0, h: 0,
    data: null,
    anim: null,
    running: false,
    layout() {
      const fit = fitCanvas(this.canvas);
      this.ctx = fit.ctx; this.w = fit.w; this.h = fit.h;
    },
    build() {
      const players = getPlayers();
      const n = players.length;
      if (n < 2) return null;
      const rows = clamp(n * 2 + 2, 7, 16);
      const rungs = new Set();
      for (let r = 0; r < rows; r++) {
        let c = 0;
        while (c < n - 1) {
          const place = Math.random() < (n <= 3 ? 0.62 : 0.46);
          if (place) { rungs.add(r + ',' + c); c += 2; }
          else c += 1;
        }
      }
      let outs = outcomesEl.value.split(/[,\n，、\/;]/).map(s => s.trim()).filter(Boolean);
      if (outs.length < n) { while (outs.length < n) outs.push('꽝'); }
      if (outs.length > n) outs = outs.slice(0, n);
      return { players, outcomes: outs, rows, rungs, n };
    },
    geom(d) {
      const padX = 26, topY = 38, botY = this.h - 40;
      const colW = (this.w - padX * 2) / (d.n - 1);
      const colX = i => padX + i * colW;
      const rowGap = (botY - topY) / (d.rows + 1);
      const rowY = r => topY + (r + 1) * rowGap;
      return { colX, rowY, topY, botY, colW };
    },
    pathPoints(d, g, startCol) {
      const { colX, rowY, topY, botY } = g;
      const pts = [[colX(startCol), topY]];
      let c = startCol;
      for (let r = 0; r < d.rows; r++) {
        if (c < d.n - 1 && d.rungs.has(r + ',' + c)) {
          pts.push([colX(c), rowY(r)], [colX(c + 1), rowY(r)]);
          c++;
        } else if (c > 0 && d.rungs.has(r + ',' + (c - 1))) {
          pts.push([colX(c), rowY(r)], [colX(c - 1), rowY(r)]);
          c--;
        }
      }
      pts.push([colX(c), botY]);
      return { pts, endCol: c };
    },
    draw(progressMap) {
      const ctx = this.ctx;
      if (!ctx) return;
      ctx.clearRect(0, 0, this.w, this.h);
      const d = this.data || this.build();
      if (!d) {
        ctx.fillStyle = 'rgba(160,170,215,.7)';
        ctx.font = '800 13px Pretendard, system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('참가자를 2명 이상 입력해줘', this.w / 2, this.h / 2);
        return;
      }
      const g = this.geom(d);
      const fs = clamp(g.colW * 0.34, 9.5, 13);

      // base lines
      ctx.save();
      ctx.strokeStyle = 'rgba(140,165,255,.30)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      for (let i = 0; i < d.n; i++) {
        ctx.beginPath();
        ctx.moveTo(g.colX(i), g.topY);
        ctx.lineTo(g.colX(i), g.botY);
        ctx.stroke();
      }
      d.rungs.forEach(key => {
        const [r, c] = key.split(',').map(Number);
        ctx.beginPath();
        ctx.moveTo(g.colX(c), g.rowY(r));
        ctx.lineTo(g.colX(c + 1), g.rowY(r));
        ctx.stroke();
      });
      ctx.restore();

      // names (top) / outcomes (bottom)
      ctx.textAlign = 'center';
      ctx.font = `900 ${fs}px Pretendard, system-ui, sans-serif`;
      for (let i = 0; i < d.n; i++) {
        ctx.fillStyle = '#dfe6ff';
        ctx.textBaseline = 'bottom';
        ctx.fillText(ellipsisText(ctx, d.players[i], Math.max(46, g.colW * 1.5)), g.colX(i), g.topY - 8);
        const oc = d.outcomes[i];
        ctx.fillStyle = (oc && oc !== '꽝') ? '#b6ff3c' : 'rgba(150,160,200,.9)';
        ctx.textBaseline = 'top';
        ctx.fillText(ellipsisText(ctx, oc, Math.max(46, g.colW * 1.5)), g.colX(i), g.botY + 8);
      }

      // traced paths
      const pm = progressMap || {};
      for (let i = 0; i < d.n; i++) {
        const prog = pm[i] === undefined ? (pm.all || 0) : pm[i];
        if (prog <= 0) continue;
        const { pts } = this.pathPoints(d, g, i);
        const color = PALETTE[i % PALETTE.length];
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        const head = this.strokePartial(pts, prog);
        ctx.restore();
        if (prog < 1 && head) {
          ctx.beginPath();
          ctx.arc(head[0], head[1], 4.2, 0, Math.PI * 2);
          ctx.fillStyle = '#fff';
          ctx.shadowColor = color; ctx.shadowBlur = 16;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    },
    strokePartial(pts, prog) {
      const ctx = this.ctx;
      let total = 0;
      const segs = [];
      for (let i = 1; i < pts.length; i++) {
        const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        segs.push({ a: pts[i - 1], b: pts[i], L });
        total += L;
      }
      let remain = total * clamp(prog, 0, 1);
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      let head = pts[0];
      for (const s of segs) {
        if (remain <= 0) break;
        if (remain >= s.L) {
          ctx.lineTo(s.b[0], s.b[1]);
          remain -= s.L;
          head = s.b;
        } else {
          const t = remain / s.L;
          const x = s.a[0] + (s.b[0] - s.a[0]) * t;
          const y = s.a[1] + (s.b[1] - s.a[1]) * t;
          ctx.lineTo(x, y);
          head = [x, y];
          remain = 0;
        }
      }
      ctx.stroke();
      return head;
    },
    async run() {
      if (this.running) return;
      const players = getPlayers();
      if (players.length < 2) {
        setBanner('참가자를 2명 이상 입력해줘 🙂');
        playersEl.focus();
        return;
      }
      this.running = true;
      const btn = $('#btnLadder');
      btn.disabled = true;
      this.data = this.build();
      setBanner('사다리 타는 중…');
      setBetList([]);
      this.layout();
      const d = this.data;
      const stagger = 110;
      const dur = 1200;
      const total = dur + stagger * (d.n - 1);
      const t0 = performance.now();
      await new Promise(res => {
        const tick = (now) => {
          const el = now - t0;
          const map = {};
          for (let i = 0; i < d.n; i++) {
            map[i] = clamp((el - i * stagger) / dur, 0, 1);
          }
          this.draw(map);
          if (el < total) requestAnimationFrame(tick); else res();
        };
        requestAnimationFrame(tick);
      });
      const g = this.geom(d);
      const rowsOut = [];
      d.players.forEach((name, i) => {
        const { endCol } = this.pathPoints(d, g, i);
        rowsOut.push([name, d.outcomes[endCol]]);
      });
      this.draw(Object.fromEntries(d.players.map((_, i) => [i, 1])));
      setBetList(rowsOut);
      const winRow = rowsOut.find(r => r[1] && r[1] !== '꽝');
      if (winRow) setBanner(`🎉 ${winRow[0]} → ${winRow[1]}`, true);
      else setBanner('🪜 사다리 완료!');
      if (winRow) {
        fx.burst(80, { x: window.innerWidth / 2, y: window.innerHeight * 0.4 });
        buzz([30, 40, 60]);
      }
      btn.disabled = false;
      this.running = false;
    }
  };
  $('#btnLadder').addEventListener('click', () => ladder.run());

  /* =========================================================
     REACTION TEST
     ========================================================= */
  const pad = $('#reactPad');
  const rLast = $('#rLast'), rBest = $('#rBest'), rAvg = $('#rAvg');
  const boardEl = $('#board');
  const nameEl = $('#rName');
  const btnSave = $('#btnSave');
  let rState = 'idle';
  let waitTimer = null, goAt = 0;
  let pending = null;            // {ms}
  const nickKey = 'bst.nick';
  nameEl.value = store.get(nickKey, '') || '';

  function setPad(state, main, sub, icon) {
    rState = state;
    pad.className = 'react-pad ' + state;
    pad.querySelector('.rp-main').textContent = main;
    pad.querySelector('.rp-sub').textContent = sub;
    if (icon) pad.querySelector('.rp-icon').textContent = icon;
  }
  function boardKey() { return 'bst.react.' + todayKey(); }
  function getBoard() {
    const arr = store.get(boardKey(), []);
    return Array.isArray(arr) ? arr.filter(r => r && typeof r.ms === 'number').sort((a, b) => a.ms - b.ms) : [];
  }
  function renderBoard() {
    const arr = getBoard().slice(0, 10);
    boardEl.innerHTML = '';
    if (!arr.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = '아직 기록이 없어요 — 첫 기록을 세워보자!';
      boardEl.appendChild(li);
      rBest.textContent = '-'; rAvg.textContent = '-';
      return;
    }
    arr.forEach((r, i) => {
      const li = document.createElement('li');
      const medal = ['🥇', '🥈', '🥉'][i] || (i + 1);
      li.innerHTML = `<span class="rank">${medal}</span><span class="nm">${escapeHtml(r.name || '이름없음')}</span><span class="ms">${r.ms}ms</span>`;
      boardEl.appendChild(li);
    });
    const all = getBoard();
    rBest.textContent = all[0].ms + 'ms';
    rAvg.textContent = Math.round(all.reduce((s, r) => s + r.ms, 0) / all.length) + 'ms';
  }
  function resetPad() { setPad('idle', '눌러서 시작', '초록색이 되는 순간 최대한 빨리!', '⚡'); }

  function startWait() {
    clearTimeout(waitTimer);
    pending = null;
    btnSave.classList.remove('pulse');
    setPad('wait', '기다려…', '초록색이 되면 바로!', '⏳');
    const delay = 1100 + Math.random() * 2600;
    waitTimer = setTimeout(() => {
      goAt = performance.now();
      setPad('go', '지금 클릭!', '초록!', '🟢');
      buzz(18);
    }, delay);
  }
  pad.addEventListener('click', () => {
    if (rState === 'idle' || rState === 'done' || rState === 'foul') { startWait(); return; }
    if (rState === 'wait') {
      clearTimeout(waitTimer);
      setPad('foul', '너무 빨랐어!', '초록이 되기 전에 눌렀어 😅 다시 눌러서 재시작', '⚠️');
      buzz([20, 60, 20]);
      return;
    }
    if (rState === 'go') {
      const ms = Math.round(performance.now() - goAt);
      rLast.textContent = ms + 'ms';
      pending = { ms };
      setPad('done', ms + 'ms', '기록 저장을 누르면 랭킹에 올라가요', '⏱️');
      btnSave.classList.add('pulse');
      buzz(25);
      if (!nameEl.value.trim()) nameEl.focus({ preventScroll: true });
    }
  });
  pad.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pad.click(); }
  });

  nameEl.addEventListener('input', () => store.set(nickKey, nameEl.value.trim()));
  btnSave.addEventListener('click', () => {
    if (!pending) {
      btnSave.classList.remove('pulse');
      if (rState === 'idle') startWait();
      return;
    }
    const name = (nameEl.value.trim() || '나').slice(0, 10);
    const arr = getBoard();
    arr.push({ name, ms: pending.ms, t: Date.now() });
    store.set(boardKey(), arr.slice(-200));
    pending = null;
    btnSave.classList.remove('pulse');
    renderBoard();
    setPad('done', rLast.textContent, '저장 완료! 눌러서 한 번 더', '✅');
    buzz(20);
  });
  $('#btnResetBoard').addEventListener('click', () => {
    store.set(boardKey(), []);
    renderBoard();
  });

  // pulse style
  const st = document.createElement('style');
  st.textContent = '.btn-ghost.pulse{border-color:rgba(182,255,60,.8);color:#dcff9a;box-shadow:0 0 0 0 rgba(182,255,60,.6);animation:pulseGlow 1.4s infinite}@keyframes pulseGlow{0%{box-shadow:0 0 0 0 rgba(182,255,60,.55)}70%{box-shadow:0 0 0 12px rgba(182,255,60,0)}100%{box-shadow:0 0 0 0 rgba(182,255,60,0)}}';
  document.head.appendChild(st);

  /* =========================================================
     DICE 1-100
     ========================================================= */
  const diceFace = $('#diceFace');
  const diceHist = $('#diceHist');
  let diceRolling = false;
  let diceLog = store.get('bst.dice', []) || [];
  function renderDiceHist() {
    diceHist.innerHTML = '';
    diceLog.slice(0, 8).forEach(v => {
      const s = document.createElement('span');
      s.textContent = v;
      diceHist.appendChild(s);
    });
  }
  $('#btnDice').addEventListener('click', () => {
    if (diceRolling) return;
    diceRolling = true;
    diceFace.classList.add('rolling');
    const t0 = performance.now();
    const dur = 850;
    const tick = (now) => {
      const p = (now - t0) / dur;
      diceFace.textContent = pick(100) + 1;
      if (p < 1) { requestAnimationFrame(tick); return; }
      const v = pick(100) + 1;
      diceFace.textContent = v;
      diceFace.classList.remove('rolling');
      diceLog.unshift(v);
      diceLog = diceLog.slice(0, 20);
      store.set('bst.dice', diceLog);
      renderDiceHist();
      diceRolling = false;
      if (v === 100) { fx.burst(120); buzz([25, 35, 45]); }
      else buzz(15);
    };
    requestAnimationFrame(tick);
  });
  renderDiceHist();

  /* =========================================================
     COIN
     ========================================================= */
  const coinEl = $('#coin');
  const coinHist = $('#coinHist');
  let coinTurns = 0, coinSide = 0, coinBusy = false;
  let coinLog = store.get('bst.coin', []) || [];
  function renderCoinHist() {
    coinHist.innerHTML = '';
    coinLog.slice(0, 8).forEach(v => {
      const s = document.createElement('span');
      s.textContent = v;
      coinHist.appendChild(s);
    });
  }
  coinEl.style.transform = 'rotateY(0deg)';
  $('#btnCoin').addEventListener('click', () => {
    if (coinBusy) return;
    coinBusy = true;
    const next = pick(2); // 0 = 앞, 1 = 뒤
    coinTurns += 6;
    const deg = coinTurns * 360 + (next ? 180 : 0);
    coinEl.style.transform = `rotateY(${deg}deg)`;
    buzz(12);
    setTimeout(() => {
      coinSide = next;
      const label = next ? '뒤' : '앞';
      coinLog.unshift(label);
      coinLog = coinLog.slice(0, 20);
      store.set('bst.coin', coinLog);
      renderCoinHist();
      coinBusy = false;
    }, 1550);
  });
  renderCoinHist();

  /* =========================================================
     MENU WHEEL
     ========================================================= */
  const DEFAULT_MENUS = ['치킨', '피자', '족발', '라면', '김밥', '떡볶이', '짜장면', '회', '삼겹살', '햄버거', '마라탕', '순대국'];
  const menuListEl = $('#menuList');
  let menus = store.get('bst.menus', DEFAULT_MENUS) || DEFAULT_MENUS;
  if (!Array.isArray(menus) || menus.length < 2) menus = DEFAULT_MENUS.slice();
  menuListEl.value = menus.join(', ');

  const menuResultEl = document.createElement('div');
  menuResultEl.className = 'result-banner';
  menuResultEl.style.marginTop = '12px';
  menuResultEl.innerHTML = '<span class="rb-label">오늘은</span><strong class="rb-text">메뉴를 뽑아봐!</strong>';
  $('#btnMenu').parentNode.insertBefore(menuResultEl, $('#btnMenu').nextSibling);
  const menuText = () => $('.rb-text', menuResultEl);

  const menuWheel = new NeonWheel($('#menuCanvas'));
  menuWheel.setItems(menus);

  $('#btnMenu').addEventListener('click', async () => {
    if (menuWheel.spinning) return;
    if (menus.length < 2) return;
    menuResultEl.classList.remove('win');
    menuText().textContent = '돌리는 중…';
    const res = await menuWheel.spin(3300);
    if (!res) return;
    menuResultEl.classList.add('win');
    menuText().textContent = `🍽️ ${res.label}!`;
    buzz([20, 30, 40]);
  });
  $('#btnMenuSave').addEventListener('click', () => {
    const arr = menuListEl.value.split(/[,\n，、\/;]/).map(s => s.trim()).filter(Boolean);
    if (arr.length < 2) {
      menuText().textContent = '메뉴는 2개 이상 넣어줘';
      menuResultEl.classList.remove('win');
      return;
    }
    menus = arr.slice(0, 14);
    menuListEl.value = menus.join(', ');
    store.set('bst.menus', menus);
    menuWheel.setItems(menus);
    menuText().textContent = '메뉴 목록 적용 완료!';
    menuResultEl.classList.remove('win');
  });

  /* =========================================================
     PENALTY
     ========================================================= */
  const PENALTIES = [
    '🍺 벌주 3잔 원샷',
    '💸 오늘 치킨 쏘기',
    '🎤 노래방에서 18번 애창곡 부르기',
    '📱 카톡 프로필 사진 1시간 이 사진으로',
    '🧊 얼음물 한 컵 원샷',
    '🕺 30초 랜덤 댄스',
    '🙇 다음 모임 3분 늦으면 3만원',
    '📸 단톡방에 셀카 올리기',
    '🍜 다음 모임 메뉴는 벌칙 당첨자가 결정',
    '🧹 오늘 뒷정리 담당',
    '☎️ 3년 만에 연락 안 한 친구에게 안부 문자',
    '🎯 에어컨 온도 1시간 조절권 양도',
    '😳 가장 부끄러운 일 30초 토크',
    '🍗 이번 판 음료수 전부 사기',
    '🎮 다음 게임에서 한 판 핸디캡 받기'
  ];
  const penaltyBox = $('#penaltyBox');
  let penaltyBusy = false;
  $('#btnPenalty').addEventListener('click', () => {
    if (penaltyBusy) return;
    penaltyBusy = true;
    penaltyBox.classList.remove('pop');
    let n = 0;
    const tick = () => {
      n++;
      penaltyBox.textContent = PENALTIES[pick(PENALTIES.length)];
      if (n < 14) {
        setTimeout(tick, 55 + n * 12);
      } else {
        const final = PENALTIES[pick(PENALTIES.length)];
        penaltyBox.textContent = final;
        void penaltyBox.offsetWidth;
        penaltyBox.classList.add('pop');
        buzz([20, 30, 40]);
        penaltyBusy = false;
      }
    };
    tick();
  });

  /* ---------- resize ---------- */
  let rt = null;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (activeTab === 'bet') {
        wheel.layout(); wheel.draw();
        ladder.layout(); ladder.draw();
      }
      if (activeTab === 'dice') { menuWheel.layout(); menuWheel.draw(); }
    }, 140);
  });

  /* ---------- init ---------- */
  renderBoard();
  resetPad();
  ensureOutcomes();
  activate((location.hash || '#bet').slice(1), true);
  requestAnimationFrame(() => {
    wheel.layout(); wheel.setItems(getPlayers()); wheel.draw();
    ladder.layout(); ladder.draw();
    menuWheel.layout(); menuWheel.draw();
  });
})();

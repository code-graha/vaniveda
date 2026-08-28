/* VaniVeda 3D — <vv-globe>, <vv-ladder>, <vv-podium>.
   Classic script, registers itself globally. three.js loaded lazily via dynamic import. */
(function () {
  var SRC = 'https://esm.sh/three@0.160.0';
  var pending = null;
  function loadThree() { return pending || (pending = import(SRC)); }

  var RED = 0xd62839, GOLD = 0xf5a623, GRAPHITE = 0x1f2933, INK = 0x181c22;
  var REDUCED = false;
  try { REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  function ease(t) { return 1 - Math.pow(1 - t, 3); }

  class VVBase extends HTMLElement {
    connectedCallback() {
      if (this._booted) return;
      this._booted = true;
      this.style.display = 'block';
      this.style.position = 'absolute';
      this.style.inset = '0';
      this.style.width = '100%';
      this.style.height = '100%';
      this.style.overflow = 'hidden';
      this.loader = document.createElement('div');
      this.loader.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:700 10px/1 Inter,sans-serif;letter-spacing:.22em;text-transform:uppercase;color:#5B6169';
      this.loader.textContent = 'Loading';
      this.appendChild(this.loader);
      loadThree().then(function (T) { this.boot(T); }.bind(this)).catch(function (err) {
        console.error('vv3d failed', err);
        this.renderFallback();
      }.bind(this));
    }

    renderFallback() {
      if (this.loader) { this.loader.remove(); this.loader = null; }
      this.style.background = 'radial-gradient(circle at 50% 40%, #2a333d, #16181d 70%)';
      this.style.display = 'flex';
      this.style.alignItems = 'center';
      this.style.justifyContent = 'center';
      if (this.fallback) this.fallback();
    }

    boot(T) {
      var w = this.clientWidth, h = this.clientHeight;
      if (!w || !h) { requestAnimationFrame(function () { this.boot(T); }.bind(this)); return; }
      if (this.loader) { this.loader.remove(); this.loader = null; }
      var ren = new T.WebGLRenderer({ alpha: true, antialias: true });
      ren.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      ren.setSize(w, h);
      ren.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y';
      this.appendChild(ren.domElement);
      this.overlay = document.createElement('div');
      this.overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
      this.appendChild(this.overlay);

      var scene = new T.Scene();
      var cam = new T.PerspectiveCamera(this.fov || 38, w / h, 0.1, 100);
      cam.position.set(0, 0, 5);
      this.T = T; this.ren = ren; this.scene = scene; this.cam = cam;
      this.root = new T.Group();
      scene.add(this.root);
      scene.add(new T.AmbientLight(0xffffff, 0.8));
      var d = new T.DirectionalLight(0xffffff, 1.5); d.position.set(3, 5, 4); scene.add(d);
      var d2 = new T.DirectionalLight(RED, 0.85); d2.position.set(-4, -1, 3); scene.add(d2);
      var d3 = new T.DirectionalLight(0x9fc0ff, 0.5); d3.position.set(-2, 3, -4); scene.add(d3);
      this.build(T, this.root, cam);

      this.spin = this.spin0 || 0;
      this.vel = 0; this.dx = 0; this.visible = true; this.intro = 0;
      try {
        this._io = new IntersectionObserver(function (es) { this.visible = es[0].isIntersecting; }.bind(this), { threshold: 0 });
        this._io.observe(this);
      } catch (e) { }
      try {
        this._ro = new ResizeObserver(function () {
          var W = this.clientWidth, H = this.clientHeight;
          if (!W || !H) return;
          cam.aspect = W / H; cam.updateProjectionMatrix(); ren.setSize(W, H);
        }.bind(this));
        this._ro.observe(this);
      } catch (e) { }
      this.bindDrag();

      var clock = new T.Clock();
      var loop = function () {
        this._raf = requestAnimationFrame(loop);
        if (!this.visible) return;
        var dt = clock.getDelta(), t = clock.getElapsedTime();
        this.intro = Math.min(1, this.intro + dt / 1.1);
        var k = ease(this.intro);
        if (this.down) { this.spin += this.dx; this.dx = 0; }
        else {
          var auto = REDUCED ? 0 : (this.auto === undefined ? 0.0024 : this.auto);
          this.spin += this.vel + auto * (0.35 + 0.65 * k);
          this.vel *= 0.93;
        }
        this.root.rotation.y = this.spin - (1 - k) * 0.9;
        if (this.tick) this.tick(t, T, k, dt);
        ren.render(scene, cam);
      }.bind(this);
      loop();
    }

    bindDrag() {
      var last = 0;
      this._onDown = function (e) { this.down = true; last = e.clientX; this.vel = 0; this.style.cursor = 'grabbing'; }.bind(this);
      this._onMove = function (e) {
        if (!this.down) return;
        var d = (e.clientX - last) * 0.006; last = e.clientX;
        this.dx = d; this.vel = d;
      }.bind(this);
      this._onUp = function () { if (!this.down) return; this.down = false; this.style.cursor = 'grab'; }.bind(this);
      this.addEventListener('pointerdown', this._onDown);
      window.addEventListener('pointermove', this._onMove);
      window.addEventListener('pointerup', this._onUp);
      this.style.cursor = 'grab';
    }

    label(text, color) {
      var el = document.createElement('span');
      el.textContent = text;
      el.style.cssText = 'position:absolute;transform:translate(-50%,-50%);white-space:nowrap;font:700 10px/1 Inter,system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:' + color + ';text-shadow:0 1px 6px rgba(0,0,0,.85);transition:opacity .25s';
      this.overlay.appendChild(el);
      return el;
    }

    place(el, v3, cam, w, h, show, pad, dy) {
      var p = v3.clone().project(cam);
      var m = pad || 0;
      var x = (p.x * 0.5 + 0.5) * w, y = (-p.y * 0.5 + 0.5) * h + (dy || 0);
      if (m) { x = Math.max(m, Math.min(w - m, x)); y = Math.max(12, Math.min(h - 12, y)); }
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.opacity = show ? '1' : '0';
    }

    disconnectedCallback() {
      cancelAnimationFrame(this._raf);
      if (this._ro) this._ro.disconnect();
      if (this._io) this._io.disconnect();
      window.removeEventListener('pointermove', this._onMove);
      window.removeEventListener('pointerup', this._onUp);
      if (this.ren) { this.ren.dispose(); if (this.ren.domElement) this.ren.domElement.remove(); }
      if (this.overlay) this.overlay.remove();
      this._booted = false;
    }
  }

  /* ---------- Globe: francophone world with flight arcs ---------- */
  var PLACES = [
    { n: 'France', lat: 46.6, lon: 2.3, hero: true, label: true, dy: -30 },
    { n: 'Canada', lat: 52.0, lon: -100.0, label: true },
    { n: 'Belgium', lat: 50.6, lon: 4.5, label: true, dy: -12 },
    { n: 'Switzerland', lat: 46.8, lon: 8.2, label: true, dy: 6 },
    { n: 'Luxembourg', lat: 49.8, lon: 6.1, label: true, dy: 24 },
    { n: 'Senegal', lat: 14.5, lon: -14.5, label: true },
    { n: 'Morocco', lat: 31.8, lon: -7.1, label: true },
    { n: "Côte d'Ivoire", lat: 7.5, lon: -5.5, label: true, dy: -10 },
    { n: 'Africa', lat: 5, lon: 20, label: true, dy: 10 }
  ];

  class VVGlobe extends VVBase {
    build(T, root, cam) {
      this.fov = 38;
      this.spin0 = -Math.PI / 2;
      cam.position.set(0, 0.15, 6.1);
      var R = 1.62;
      this.R = R;

      var core = new T.Mesh(new T.SphereGeometry(R * 0.98, 48, 32),
        new T.MeshStandardMaterial({ color: INK, roughness: 0.9, metalness: 0.1 }));
      root.add(core);

      var grid = new T.Mesh(new T.SphereGeometry(R, 36, 24),
        new T.MeshBasicMaterial({ color: 0x5b6f86, wireframe: true, transparent: true, opacity: 0.55 }));
      root.add(grid);
      this.grid = grid;

      var equator = new T.Mesh(new T.TorusGeometry(R * 1.003, 0.0055, 6, 120),
        new T.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.85 }));
      equator.rotation.x = Math.PI / 2;
      root.add(equator);

      var halo = new T.Mesh(new T.SphereGeometry(R * 1.2, 32, 24),
        new T.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.07, side: T.BackSide }));
      root.add(halo);

      function pos(lat, lon, r) {
        var p = (90 - lat) * Math.PI / 180, t = (lon + 180) * Math.PI / 180;
        return new T.Vector3(-r * Math.sin(p) * Math.cos(t), r * Math.cos(p), r * Math.sin(p) * Math.sin(t));
      }
      this.pos = pos;

      var france = pos(46.6, 2.3, R);
      this.pins = [];
      this.arcs = [];

      PLACES.forEach(function (pl) {
        var v = pos(pl.lat, pl.lon, R * 1.005);
        var s = pl.hero ? 0.062 : 0.036;
        var col = pl.hero ? GOLD : RED;
        var dot = new T.Mesh(new T.SphereGeometry(s, 16, 12), new T.MeshBasicMaterial({ color: col }));
        dot.position.copy(v);
        root.add(dot);
        var ring = new T.Mesh(new T.RingGeometry(s * 1.7, s * 2.15, 28),
          new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, side: T.DoubleSide }));
        ring.position.copy(v);
        ring.lookAt(0, 0, 0);
        root.add(ring);
        var stem = new T.Mesh(new T.CylinderGeometry(0.007, 0.007, pl.hero ? 0.42 : 0.24, 6),
          new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.65 }));
        stem.position.copy(v.clone().multiplyScalar(1 + (pl.hero ? 0.13 : 0.075)));
        stem.lookAt(0, 0, 0);
        stem.rotateX(Math.PI / 2);
        root.add(stem);

        this.pins.push({
          ring: ring, dot: dot, hero: !!pl.hero, name: pl.n, dy: pl.dy || 0,
          anchor: v.clone().multiplyScalar(pl.hero ? 1.34 : 1.2),
          el: pl.label ? this.label(pl.n, pl.hero ? '#F5A623' : '#ffffff') : null
        });

        if (!pl.hero) {
          var to = v.clone();
          var mid = france.clone().add(to).multiplyScalar(0.5).normalize()
            .multiplyScalar(R * (1.28 + france.distanceTo(to) / (R * 9)));
          var curve = new T.QuadraticBezierCurve3(france.clone().multiplyScalar(1.005), mid, to);
          var line = new T.Line(
            new T.BufferGeometry().setFromPoints(curve.getPoints(50)),
            new T.LineBasicMaterial({ color: RED, transparent: true, opacity: 0.4 }));
          root.add(line);
          var jet = new T.Mesh(new T.SphereGeometry(0.028, 10, 8), new T.MeshBasicMaterial({ color: GOLD }));
          root.add(jet);
          this.arcs.push({ curve: curve, jet: jet, line: line, off: Math.random() });
        }
      }, this);

      this.france = france;
    }

    tick(t, T, k) {
      var w = this.clientWidth, h = this.clientHeight, cam = this.cam;
      var camDir = new T.Vector3(0, 0, 1);
      this.root.rotation.x = 0.2 + Math.sin(t * 0.3) * 0.035;

      this.pins.forEach(function (p, i) {
        var s = 1 + 0.4 * Math.sin(t * (p.hero ? 2.4 : 1.5) + i);
        p.ring.scale.setScalar(s);
        p.ring.material.opacity = (p.hero ? 0.9 : 0.6) - 0.35 * (s - 1);
        if (!p.el) return;
        var world = p.anchor.clone().applyMatrix4(this.root.matrixWorld);
        var facing = world.clone().normalize().dot(camDir) > 0.18;
        this.place(p.el, world, cam, w, h, facing && k > 0.55, 52, p.dy);
      }, this);

      this.arcs.forEach(function (a) {
        a.line.material.opacity = 0.4 * k;
        var u = REDUCED ? 0.5 : ((t * 0.22 + a.off) % 1);
        a.jet.position.copy(a.curve.getPointAt(u));
        a.jet.scale.setScalar(REDUCED ? 1 : (0.6 + Math.sin(u * Math.PI) * 0.9));
        a.jet.visible = !REDUCED;
      });

      this.grid.material.opacity = 0.35 + 0.2 * Math.sin(t * 0.8) + 0.15;
      this.root.scale.setScalar(0.82 + 0.18 * k);
    }

    fallback() {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:16px;padding:24px;max-width:420px;text-align:center';

      var eyebrow = document.createElement('span');
      eyebrow.textContent = 'Where French is spoken';
      eyebrow.style.cssText = 'font:700 10px/1 Inter,system-ui,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#F5A623';
      wrap.appendChild(eyebrow);

      var row = document.createElement('div');
      row.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;justify-content:center';
      PLACES.forEach(function (pl) {
        var chip = document.createElement('span');
        chip.textContent = pl.n;
        chip.style.cssText = 'display:inline-block;border:1px solid rgba(255,255,255,0.28);color:#fff;padding:9px 16px;font-size:12px;font-weight:600;border-radius:999px';
        row.appendChild(chip);
      });
      wrap.appendChild(row);
      this.appendChild(wrap);

      var stage = this.closest('.stage');
      var caption = stage && stage.nextElementSibling;
      if (caption && caption.classList.contains('stage-caption')) {
        caption.textContent = 'Where French takes you';
      }
    }
  }

  /* ---------- Ladder: A1 → B2 with a climbing pulse ---------- */
  var LEVELS = ['A1', 'A2', 'B1', 'B2'];
  class VVLadder extends VVBase {
    static get observedAttributes() { return ['active']; }
    build(T, root, cam) {
      cam.position.set(0, 1.05, 5.5);
      cam.lookAt(0, 0.05, 0);
      this.auto = 0.0018;
      var widths = [1.5, 1.9, 2.3, 2.7];
      var cols = [0x7d1a24, 0xa3202e, 0xc02431, RED];
      this.rungs = [];
      widths.forEach(function (w, i) {
        var g = new T.Group();
        var box = new T.Mesh(new T.BoxGeometry(w, 0.34, 1.15),
          new T.MeshStandardMaterial({ color: cols[i], roughness: 0.4, metalness: 0.18 }));
        g.add(box);
        g.add(new T.LineSegments(new T.EdgesGeometry(box.geometry),
          new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 })));
        var cap = new T.Mesh(new T.BoxGeometry(w * 0.99, 0.03, 1.14),
          new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 }));
        cap.position.y = 0.185;
        g.add(cap);
        g.position.y = -0.85 + i * 0.5;
        root.add(g);
        this.rungs.push({
          g: g, box: box, cap: cap, baseY: g.position.y, w: w, i: i,
          el: this.label(LEVELS[i], '#ffffff')
        });
      }, this);

      var trophy = new T.Mesh(new T.TorusGeometry(0.2, 0.055, 14, 36),
        new T.MeshStandardMaterial({ color: GOLD, roughness: 0.25, metalness: 0.75 }));
      trophy.position.set(0, 1.2, 0);
      root.add(trophy);
      this.trophy = trophy;

      var glow = new T.Mesh(new T.RingGeometry(0.3, 1.6, 48),
        new T.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.12, side: T.DoubleSide }));
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = -1.06;
      root.add(glow);
      this.glow = glow;

      root.rotation.x = 0.06;
      this.applyActive();
    }
    attributeChangedCallback() {
      this.applyActive();
      if (!this.rungs) this.updateFallbackActive();
    }
    applyActive() {
      var idx = LEVELS.indexOf((this.getAttribute('active') || 'A1').toUpperCase());
      this.activeIdx = idx < 0 ? 0 : idx;
    }
    tick(t, T, k) {
      var w = this.clientWidth, h = this.clientHeight, cam = this.cam;
      var climb = REDUCED ? this.activeIdx : ((t * 0.55) % 4);
      this.rungs.forEach(function (r) {
        var on = r.i === this.activeIdx;
        var enter = Math.max(0, Math.min(1, (k * 1.6) - r.i * 0.14));
        var pulse = Math.max(0, 1 - Math.abs(climb - r.i) * 1.6);
        var target = r.baseY + (on ? 0.15 : 0) + pulse * 0.05 - (1 - ease(enter)) * 1.1;
        r.g.position.y += (target - r.g.position.y) * 0.16;
        var sx = (on ? 1.05 : 1) + pulse * 0.03;
        r.g.scale.x += (sx - r.g.scale.x) * 0.14;
        r.g.scale.y = r.g.scale.z = 0.4 + 0.6 * ease(enter);
        r.cap.material.color.setHex(on ? GOLD : 0xffffff);
        r.box.material.emissive.setRGB(
          on ? 0.24 : pulse * 0.16,
          on ? 0.07 : pulse * 0.03,
          0.02);
        var anchor = new T.Vector3(r.w / 2 + 0.28, r.g.position.y, 0).applyMatrix4(this.root.matrixWorld);
        this.place(r.el, anchor, cam, w, h, k > 0.6);
        r.el.style.color = on ? '#F5A623' : 'rgba(255,255,255,.75)';
      }, this);
      this.trophy.rotation.x = t * 1.1;
      this.trophy.rotation.z = t * 0.45;
      this.trophy.position.y = 1.2 + Math.sin(t * 1.7) * 0.07;
      this.trophy.scale.setScalar(ease(k) * (this.activeIdx === 3 ? 1.25 : 1));
      this.glow.material.opacity = 0.08 + 0.06 * Math.sin(t * 1.4);
    }

    fallback() {
      this.applyActive();
      var cols = ['#7d1a24', '#a3202e', '#c02431', '#D62839'];
      var wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column-reverse;align-items:center;gap:10px;padding:24px;width:100%;max-width:260px';
      this._fallbackBars = LEVELS.map(function (lvl, i) {
        var bar = document.createElement('div');
        bar.textContent = lvl;
        bar.style.cssText = 'display:flex;align-items:center;justify-content:center;height:38px;width:' + (50 + i * 15) + '%;border-radius:4px;font:700 12px/1 Inter,system-ui,sans-serif;letter-spacing:.08em;transition:background .25s,color .25s;background:' + cols[i] + ';color:#fff';
        wrap.appendChild(bar);
        return bar;
      });
      this.appendChild(wrap);
      this.updateFallbackActive();
    }

    updateFallbackActive() {
      if (!this._fallbackBars) return;
      var cols = ['#7d1a24', '#a3202e', '#c02431', '#D62839'];
      this._fallbackBars.forEach(function (bar, i) {
        var on = i === this.activeIdx;
        bar.style.background = on ? '#F5A623' : cols[i];
        bar.style.color = on ? '#1F2933' : '#fff';
      }, this);
    }
  }

  /* ---------- Podium: victory ---------- */
  class VVPodium extends VVBase {
    build(T, root, cam) {
      cam.position.set(0, 1.25, 5.3);
      cam.lookAt(0, 0.02, 0);
      this.auto = 0.002;
      var spec = [{ x: -1.15, h: 0.85, d: 0.16 }, { x: 0, h: 1.35, d: 0 }, { x: 1.15, h: 0.6, d: 0.3 }];
      this.blocks = [];
      spec.forEach(function (s) {
        var g = new T.Group();
        var box = new T.Mesh(new T.BoxGeometry(1.05, s.h, 1.05),
          new T.MeshStandardMaterial({ color: GRAPHITE, roughness: 0.45, metalness: 0.15 }));
        box.position.y = s.h / 2;
        g.add(box);
        var top = new T.Mesh(new T.BoxGeometry(1.07, 0.055, 1.07),
          new T.MeshStandardMaterial({ color: RED, roughness: 0.35, emissive: 0x2a0207 }));
        top.position.y = s.h + 0.02;
        g.add(top);
        var e = new T.LineSegments(new T.EdgesGeometry(box.geometry),
          new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 }));
        e.position.y = s.h / 2;
        g.add(e);
        g.position.set(s.x, -0.6, 0);
        root.add(g);
        this.blocks.push({ g: g, h: s.h, d: s.d });
      }, this);

      var medal = new T.Mesh(new T.TorusGeometry(0.28, 0.075, 16, 40),
        new T.MeshStandardMaterial({ color: GOLD, roughness: 0.2, metalness: 0.85 }));
      medal.position.set(0, 1.4, 0);
      root.add(medal);
      this.medal = medal;

      this.sparks = [];
      for (var i = 0; i < 14; i++) {
        var sp = new T.Mesh(new T.SphereGeometry(0.022, 8, 6),
          new T.MeshBasicMaterial({ color: i % 3 === 0 ? RED : GOLD, transparent: true }));
        root.add(sp);
        this.sparks.push({ m: sp, a: Math.random() * Math.PI * 2, r: 0.5 + Math.random() * 0.9, s: 0.4 + Math.random() * 0.7, y: Math.random() });
      }

      var ground = new T.Mesh(new T.CircleGeometry(2.7, 48),
        new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }));
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.61;
      root.add(ground);
      root.rotation.x = 0.05;
    }
    tick(t, T, k) {
      this.blocks.forEach(function (b) {
        var e = ease(Math.max(0, Math.min(1, (k - b.d) / (1 - b.d || 1))));
        b.g.scale.y = 0.05 + 0.95 * e;
        b.g.position.y = -0.6;
      });
      this.medal.rotation.y = t * 1.5;
      this.medal.position.y = 1.4 + Math.sin(t * 1.6) * 0.08;
      this.medal.scale.setScalar(ease(k));
      this.sparks.forEach(function (s) {
        var u = REDUCED ? 0.5 : ((t * s.s * 0.35 + s.y) % 1);
        s.m.position.set(Math.cos(s.a + t * 0.3) * s.r, -0.55 + u * 2.3, Math.sin(s.a + t * 0.3) * s.r);
        s.m.material.opacity = Math.sin(u * Math.PI) * 0.85 * k;
      });
    }

    fallback() {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;align-items:flex-end;gap:8px;padding:24px';
      [{ h: 70, c: '#7d1a24' }, { h: 108, c: '#D62839' }, { h: 50, c: '#a3202e' }].forEach(function (s) {
        var block = document.createElement('div');
        block.style.cssText = 'width:64px;height:' + s.h + 'px;background:#1F2933;border-top:4px solid ' + s.c + ';border-radius:2px 2px 0 0';
        wrap.appendChild(block);
      });
      this.appendChild(wrap);
    }
  }

  if (!window.customElements.get('vv-globe')) customElements.define('vv-globe', VVGlobe);
  if (!window.customElements.get('vv-ladder')) customElements.define('vv-ladder', VVLadder);
  if (!window.customElements.get('vv-podium')) customElements.define('vv-podium', VVPodium);
})();

/* =========================================================
   Sugar-Free Valley — game.js  (Three.js r149)
   ========================================================= */
(function () {
  'use strict';

  // ---------------- DOM ----------------
  const $ = (id) => document.getElementById(id);
  const ui = {
    hud: $('hud'), scoreText: $('scoreText'), scoreFill: $('scoreFill'),
    sugarText: $('sugarText'), sugarBox: $('sugarBox'),
    stageName: $('stageName'), missionList: $('missionList'), effects: $('effects'),
    bossPanel: $('bossPanel'), bossFill: $('bossFill'), ammoText: $('ammoText'),
    toast: $('toast'), hint: $('hint'), overlay: $('sugarOverlay'), floaters: $('floaters'),
    modal: $('modal'), modalBody: $('modalBody'), modalButtons: $('modalButtons'),
    start: $('startScreen'), touch: $('touch'), btnThrow: $('btnThrow'), badgeNote: $('badgeNote')
  };

  // ---------------- Renderer / Scene ----------------
  const canvas = $('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfe9ff);
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 400);
  camera.position.set(0, 10, 14);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x99cc88, 0.85));
  const sun = new THREE.DirectionalLight(0xffffff, 0.85);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 120 });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---------------- State ----------------
  const state = {
    mode: 'menu', paused: false, dead: false,
    stageIndex: 0, stage: null, time: 0,
    score: START_SCORE, sugarTsp: 0, sugarAtStageStart: 0, ammo: 0
  };
  const effects = { slow: 0, speed: 0, jump: 0, invuln: 0 };
  let stageGroup = null, items = [], colliders = [];
  let shake = 0, portalCooldown = 0, jumpPressed = false, throwPressed = false;
  let quizIndex = 0;
  const quizOrder = shuffle([...LABEL_QUIZ.keys()]);
  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpV3 = new THREE.Vector3();
  const camTarget = new THREE.Vector3();

  // ---------------- Utils ----------------
  const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function lerpAngle(a, b, t) { const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  // ---------------- Textures / Sprites ----------------
  const emojiCache = new Map();
  function emojiTexture(emoji, bg) {
    const key = emoji + '|' + (bg || '');
    if (emojiCache.has(key)) return emojiCache.get(key);
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    if (bg) { g.fillStyle = bg; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill(); }
    g.font = '80px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(emoji, 64, 70);
    const t = new THREE.CanvasTexture(c);
    emojiCache.set(key, t);
    return t;
  }
  function makeSprite(emoji, size = 1.4, bg) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(emoji, bg), transparent: true }));
    s.scale.set(size, size, 1);
    return s;
  }
  const textCache = new Map();
  function textSprite(text, opts = {}) {
    const key = text + '|' + (opts.bg || '') + '|' + (opts.color || '');
    let entry = textCache.get(key);
    if (!entry) {
      const c = document.createElement('canvas'), g = c.getContext('2d');
      const font = '600 40px Mitr, Tahoma, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
      g.font = font;
      const w = Math.ceil(g.measureText(text).width) + 44, h = 70;
      c.width = w; c.height = h; g.font = font;
      g.fillStyle = opts.bg || 'rgba(255,255,255,0.9)'; roundRect(g, 0, 0, w, h, 28); g.fill();
      g.fillStyle = opts.color || '#37474f'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 2);
      const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      entry = { tex, aspect: w / h }; textCache.set(key, entry);
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: entry.tex, transparent: true, depthWrite: false }));
    const hh = opts.h || 0.5;
    s.scale.set(hh * entry.aspect, hh, 1);
    return s;
  }
  function checkerTex(c1, c2, rx, ry) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = c1; g.fillRect(0, 0, 64, 64);
    g.fillStyle = c2; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.magFilter = THREE.NearestFilter;
    return t;
  }

  // ---------------- World builders ----------------
  function addOuterGround(color) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat(color));
    m.rotation.x = -Math.PI / 2; m.position.y = -0.05; m.receiveShadow = true;
    stageGroup.add(m);
  }
  function addGround(w, d, color, tex) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color, map: tex || null, roughness: 0.9 }));
    m.rotation.x = -Math.PI / 2; m.receiveShadow = true;
    stageGroup.add(m);
  }
  function addBox(w, h, d, x, y, z, color, o = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true;
    stageGroup.add(m);
    if (o.collide !== false) colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top: y + h, noTop: !!o.noTop });
    return m;
  }
  function addTree(x, z) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 2, 8), mat(0x8d6e63));
    trunk.position.set(x, 1, z); trunk.castShadow = true;
    const top = new THREE.Mesh(new THREE.SphereGeometry(1.6, 14, 12), mat(0x66bb6a));
    top.position.set(x, 3, z); top.castShadow = true;
    stageGroup.add(trunk, top);
    colliders.push({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5, top: 4.6, noTop: true });
  }
  function spawnItem(id, x, z, o = {}) {
    const def = ITEMS[id];
    const group = new THREE.Group();
    const bg = def.type === 'label' ? 'rgba(255,241,118,0.95)' : 'rgba(255,255,255,0.92)';
    const sprite = makeSprite(def.emoji, o.size || 1.4, bg);
    sprite.position.y = 1.2; group.add(sprite);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.65, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.visible = !o.obstacle;
    group.add(ring);
    if (o.label !== false) { const l = textSprite(def.name, { h: 0.42 }); l.position.y = 2.2; group.add(l); }
    group.position.set(x, o.y || 0, z);
    stageGroup.add(group);
    const it = {
      id, def, mesh: group, sprite, radius: 0.8, active: true, dead: false, t: Math.random() * 6,
      move: o.move || null, respawn: o.respawn || 0, timer: 0, obstacle: !!o.obstacle, ammo: !!o.ammo
    };
    items.push(it);
    return it;
  }
  function makePortal(x, z, active, onText, offText) {
    const group = new THREE.Group();
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x9e9e9e, roughness: 0.4 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.25, 12, 36), ringMat);
    ring.position.y = 1.9; ring.castShadow = true;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.45, 36),
      new THREE.MeshBasicMaterial({ color: 0xb9f6ca, transparent: true, opacity: 0.12, side: THREE.DoubleSide }));
    disc.position.y = 1.9;
    const on = textSprite(onText || '✨ ไปด่านต่อไป', { h: 0.7 }); on.position.y = 4.3;
    const off = textSprite(offText || '🔒 ทำภารกิจให้ครบก่อน', { h: 0.6 }); off.position.y = 4.3;
    group.add(ring, disc, on, off);
    group.position.set(x, 0, z);
    stageGroup.add(group);
    const portal = {
      group, ring, disc, active: false,
      setActive(v) {
        this.active = v;
        ringMat.color.setHex(v ? 0x69f0ae : 0x9e9e9e);
        ringMat.emissive.setHex(v ? 0x1b5e20 : 0x000000);
        on.visible = v; off.visible = !v;
      }
    };
    portal.setActive(active);
    return portal;
  }

  // ---------------- Player ----------------
  const player = buildPlayer();
  scene.add(player.group);

  function buildPlayer() {
    const group = new THREE.Group();
    const shirtMat = new THREE.MeshStandardMaterial({ color: 0x42a5f5, roughness: 0.6 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffd1a1, roughness: 0.7 });
    const capMat = new THREE.MeshStandardMaterial({ color: 0xff5252, roughness: 0.5 });
    const dark = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x37474f });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.55, 6, 14), shirtMat);
    body.position.y = 0.75; body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 22, 16), skinMat);
    head.position.y = 1.65; head.castShadow = true;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.44, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
    cap.position.y = 1.7;
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.35), capMat);
    brim.position.set(0, 1.72, 0.45);
    const eyes = [-0.14, 0.14].map((x) => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), dark);
      e.position.set(x, 1.62, 0.38); return e;
    });
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 12, Math.PI), dark);
    smile.position.set(0, 1.5, 0.39); smile.rotation.z = Math.PI;
    const legs = [-0.18, 0.18].map((x) => {
      const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.25, 4, 8), pantsMat);
      l.position.set(x, 0.22, 0); l.castShadow = true; return l;
    });
    group.add(body, head, cap, brim, smile, ...eyes, ...legs);
    return { group, body, legs, shirtMat, vy: 0, onGround: true, radius: 0.55, walk: 0 };
  }

  // ---------------- Stage 1: Morning Routine ----------------
  function buildStage1() {
    addOuterGround(0xa5d6a7);
    addGround(32, 26, 0xffffff, checkerTex('#fff3e0', '#ffe0b2', 8, 6.5));
    const wallC = 0xffccbc;
    addBox(32, 3.5, 0.6, 0, 0, -13, wallC);
    addBox(0.6, 3.5, 26, -16, 0, 0, wallC);
    addBox(0.6, 3.5, 26, 16, 0, 0, wallC);
    addBox(12, 1.2, 2, -6, 0, -11, 0xffffff);     // เคาน์เตอร์
    addBox(6, 1.0, 3.5, 0, 0, 1, 0xc68b59);       // โต๊ะกินข้าว
    addBox(1.2, 0.6, 1.2, -4, 0, 1, 0xff8a65);    // เก้าอี้
    addBox(1.2, 0.6, 1.2, 4, 0, 1, 0xff8a65);
    addBox(3, 4.5, 2.2, 12, 0, -11.5, 0xe3f2fd);  // ตู้เย็น
    const fl = textSprite('🧊 ตู้เย็น', { h: 0.7 }); fl.position.set(12, 5.3, -11.5); stageGroup.add(fl);

    const S = (id, x, z, o) => spawnItem(id, x, z, o);
    S('egg', -10, -6); S('fish', 8, 6);
    S('rice', -1.5, 1, { y: 1.0 }); S('bread', -12, 7);
    S('broccoli', 5, -5); S('carrot', -6, 8);
    S('apple', 1.5, 1, { y: 1.0 }); S('banana', 10, -3);
    S('avocado', -4, -5);
    S('milk', -9, -11, { y: 1.2 }); S('water', -3, -11, { y: 1.2 }); S('water', 13, 8);
    S('soda', 10.5, -8.5); S('juice', 13.5, -8.5); S('boba', 12, -7); S('energy', 8.5, -9.5);
    S('juice', -13, -2);
    S('donut', 3, 9); S('fries', -9, 2);
    S('card', 0, 9); S('card', 14, 2);

    const portal = makePortal(6, -11.5, false, '🚌 ไปโรงเรียน!', '🚌 ไปโรงเรียน (กินให้ครบก่อน)');
    const groups = ['หมู่ 1 โปรตีน 🥚', 'หมู่ 2 ข้าว-แป้ง 🍚', 'หมู่ 3 ผัก 🥦', 'หมู่ 4 ผลไม้ 🍎', 'หมู่ 5 ไขมัน 🥑'];
    const missions = groups.map((g) => ({ label: g, cur: 0, max: 1 }));
    missions.push({ label: 'ดื่มนมจืดหรือน้ำเปล่า 🥛', cur: 0, max: 1 });
    let mealDone = false;

    return {
      spawn: new THREE.Vector3(0, 0, 10),
      bounds: { minX: -15.1, maxX: 15.1, minZ: -12.3, maxZ: 12.5 },
      sky: 0xbfe9ff, camOffset: new THREE.Vector3(0, 11, 13), missions, portal,
      onCollect(it) {
        if (it.def.group) missions[it.def.group - 1].cur = 1;
        if (it.def.type === 'healthyDrink') missions[5].cur = 1;
        if (!mealDone && missions.slice(0, 5).every((m) => m.cur >= 1)) {
          mealDone = true; effects.jump = 15; floatText('🍽️ ครบ 5 หมู่!', true);
        }
      },
      onLockedPortal() {
        sfx('bad');
        addScore(POINTS.SKIP_MEAL, 'ข้ามมื้อเช้า!');
        toast('🚫 <b>ห้ามข้ามมื้อเช้า!</b> −15<br>ร่างกายต้องการพลังงานจากอาหารเช้า กลับไปกินให้ครบ 5 หมู่ก่อนนะ', 'bad', 4500);
        player.group.position.z += 3;
      },
      update() {
        const p = player.group.position;
        setHint(Math.hypot(p.x - 12, p.z - 8.5) < 5 ? '⚠️ แถวตู้เย็นมีน้ำหวานซ่อนอยู่ อ่านชื่อก่อนเก็บนะ!' : '');
      }
    };
  }

  // ---------------- Stage 2: School Yard ----------------
  function buildStage2() {
    addOuterGround(0x9ccc65);
    addGround(52, 42, 0x8bc34a);
    const track = new THREE.Mesh(new THREE.RingGeometry(12.6, 15.4, 72), mat(0xe57345));
    track.rotation.x = -Math.PI / 2; track.scale.set(1, 9 / 14, 1);
    track.position.set(0, 0.02, -2); track.receiveShadow = true;
    stageGroup.add(track);

    const PAD = { x: 0, z: -2, r: 2.2 };
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(PAD.r, PAD.r, 0.12, 32), mat(0xffa726));
    pad.position.set(PAD.x, 0.06, PAD.z); pad.receiveShadow = true; stageGroup.add(pad);
    const padLabel = textSprite('🤸 จุดกระโดดตบ', { h: 0.7 }); padLabel.position.set(PAD.x, 2.8, PAD.z); stageGroup.add(padLabel);

    // ห่วงวิ่ง
    const N = 6, gates = [];
    for (let i = 0; i < N; i++) {
      const a = Math.PI / 2 + (i / N) * Math.PI * 2;
      const x = 14 * Math.cos(a), z = -2 + 9 * Math.sin(a);
      const tx = -14 * Math.sin(a), tz = 9 * Math.cos(a);
      const m = new THREE.MeshStandardMaterial({ color: 0xffffff });
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.18, 10, 32), m);
      mesh.position.set(x, 1.9, z); mesh.rotation.y = Math.atan2(tx, tz); mesh.castShadow = true;
      const num = textSprite(String(i + 1), { h: 0.8 }); num.position.set(x, 4.2, z);
      stageGroup.add(mesh, num);
      gates.push({ x, z, mesh, mat: m });
    }
    let runIdx = 0, jacks = 0;
    function paintGates() {
      gates.forEach((g, i) => {
        g.mat.color.setHex(i < runIdx ? 0x66bb6a : i === runIdx ? 0xffeb3b : 0xffffff);
        g.mat.emissive.setHex(i === runIdx ? 0x665500 : 0x000000);
      });
    }
    paintGates();

    // สิ่งกีดขวางลอยไปมา
    const obs = [
      { id: 'soda', cx: -8, cz: 3, ax: 'x', amp: 6, sp: 1.2 },
      { id: 'boba', cx: 8, cz: -6, ax: 'z', amp: 5, sp: 1.0 },
      { id: 'soda', cx: 0, cz: -11, ax: 'x', amp: 8, sp: 1.4 },
      { id: 'boba', cx: -14, cz: -2, ax: 'z', amp: 6, sp: 1.1 },
      { id: 'soda', cx: 14, cz: -2, ax: 'z', amp: 6, sp: 1.3 },
      { id: 'energy', cx: 0, cz: 7, ax: 'x', amp: 7, sp: 0.9 },
      { id: 'boba', cx: -6, cz: -8, ax: 'x', amp: 4, sp: 1.6 },
      { id: 'soda', cx: 6, cz: 4, ax: 'z', amp: 3, sp: 1.8 }
    ];
    obs.forEach((o, k) => spawnItem(o.id, o.cx, o.cz, {
      y: 0.4, respawn: 3, obstacle: true, label: false,
      move: (it, t) => {
        const s = Math.sin(t * o.sp + k);
        if (o.ax === 'x') it.mesh.position.x = o.cx + s * o.amp; else it.mesh.position.z = o.cz + s * o.amp;
      }
    }));

    spawnItem('water', -18, 10); spawnItem('water', 18, -12); spawnItem('water', 10, 12);
    spawnItem('card', -18, -14); spawnItem('card', 18, 12);
    spawnItem('fries', -10, 12);

    [[-21, -15], [21, -15], [-21, 15], [21, 15], [-22, 0], [22, 2]].forEach(([x, z]) => addTree(x, z));
    addBox(30, 8, 4, 0, 0, -24, 0xffe1a8, { collide: false });
    addBox(32, 1, 5, 0, 8, -24, 0xef5350, { collide: false });
    const school = textSprite('🏫 โรงเรียนหรรษา', { h: 1.2 }); school.position.set(0, 11, -24); stageGroup.add(school);

    const portal = makePortal(0, -16, false);
    const missions = [
      { label: 'วิ่งผ่านห่วง 🏃', cur: 0, max: N },
      { label: 'กระโดดตบ 🤸', cur: 0, max: 10 }
    ];

    return {
      spawn: new THREE.Vector3(0, 0, 15),
      bounds: { minX: -24, maxX: 24, minZ: -19, maxZ: 19 },
      sky: 0x9fd8ff, camOffset: new THREE.Vector3(0, 11, 14), missions, portal,
      update() {
        const p = player.group.position;
        gates.forEach((g, i) => g.mesh.scale.setScalar(i === runIdx ? 1 + Math.sin(state.time * 6) * 0.08 : 1));
        if (runIdx < N) {
          const g = gates[runIdx];
          if (Math.hypot(p.x - g.x, p.z - g.z) < 1.9) {
            runIdx++; missions[0].cur = runIdx; paintGates(); sfx('good');
            floatText(`🏃 ${runIdx}/${N}`, true);
            if (runIdx === N) {
              addScore(POINTS.EXERCISE, 'วิ่งครบรอบ!'); effects.speed = 6;
              toast('🏃 วิ่งครบรอบ! +20<br>การออกกำลังกายช่วยให้หัวใจแข็งแรงและใช้พลังงานส่วนเกิน', 'good', 4000);
            }
            refreshMissions();
          }
        }
        const onPad = Math.hypot(p.x - PAD.x, p.z - PAD.z) < PAD.r;
        setHint(onPad && jacks < 10 ? `🤸 กด Space หรือปุ่มกระโดด เพื่อกระโดดตบ ${jacks}/10` : '');
      },
      onJump() {
        const p = player.group.position;
        if (jacks < 10 && Math.hypot(p.x - PAD.x, p.z - PAD.z) < PAD.r) {
          jacks++; missions[1].cur = jacks; floatText(`🤸 ${jacks}/10`, true);
          if (jacks === 10) {
            addScore(POINTS.EXERCISE, 'กระโดดตบครบ!'); effects.jump = 10; sfx('win');
            toast('🤸 กระโดดตบครบ 10 ครั้ง! +20<br>ได้พลังกระโดดสูงชั่วคราว', 'good', 4000);
          }
          refreshMissions();
        }
      }
    };
  }

  // ---------------- Stage 3: Supermarket Maze ----------------
  function buildStage3() {
    const map = SUPERMARKET_MAP, H = map.length, W = map[0].length, C = 4;
    const ox = -(W - 1) * C / 2, oz = -(H - 1) * C / 2;
    addOuterGround(0xb0bec5);
    addGround(W * C, H * C, 0xffffff, checkerTex('#ffffff', '#e1f5fe', W, H));
    const shelfColors = [0xff8a80, 0x80d8ff, 0xffe57f, 0xb9f6ca, 0xea80fc];
    const vegs = ['broccoli', 'carrot', 'lettuce', 'cucumber'];
    const junks = ['candy', 'lollipop', 'cake', 'donut'];
    const spawn = new THREE.Vector3();
    let portal = null;

    function tempt(it, t, dt) {
      const p = player.group.position, m = it.mesh.position;
      const dx = p.x - m.x, dz = p.z - m.z, d = Math.hypot(dx, dz);
      if (d < 7 && d > 0.01) { m.x += dx / d * 1.6 * dt; m.z += dz / d * 1.6 * dt; }
      const hx = m.x - it.hx, hz = m.z - it.hz, hd = Math.hypot(hx, hz);
      if (hd > 1.8) { m.x = it.hx + hx / hd * 1.8; m.z = it.hz + hz / hd * 1.8; }
    }

    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const ch = map[r][c], x = ox + c * C, z = oz + r * C;
        if (ch === '#') {
          const outer = r === 0 || r === H - 1 || c === 0 || c === W - 1;
          addBox(C, outer ? 3 : 2.2, C, x, 0, z, outer ? 0x90a4ae : shelfColors[(r * 3 + c) % 5], { noTop: true });
        } else if (ch === 'P') spawn.set(x, 0, z);
        else if (ch === 'V') spawnItem(pick(vegs), x, z);
        else if (ch === 'W') spawnItem('water', x, z);
        else if (ch === 'J') spawnItem(pick(junks), x, z);
        else if (ch === 'C') spawnItem('card', x, z);
        else if (ch === 'L') spawnItem('label', x, z);
        else if (ch === 'S') {
          const it = spawnItem(pick(['soda', 'boba', 'energy', 'juice']), x, z);
          it.hx = x; it.hz = z; it.move = tempt;
        } else if (ch === 'E') {
          portal = makePortal(x, z, false, '🛒 ทางออก');
          portal.group.rotation.y = Math.PI / 2;
        }
      }
    }

    const missions = [
      { label: 'เก็บผัก 🥦', cur: 0, max: 3 },
      { label: 'เก็บน้ำเปล่า 💧', cur: 0, max: 2 },
      { label: 'อ่านฉลาก 🏷️', cur: 0, max: 3 }
    ];
    return {
      spawn, sky: 0xe1f5fe, camOffset: new THREE.Vector3(0, 18, 11), missions, portal,
      bounds: { minX: ox, maxX: ox + (W - 1) * C, minZ: oz, maxZ: oz + (H - 1) * C },
      onCollect(it) {
        if (it.def.group === 3) missions[0].cur++;
        if (it.id === 'water') missions[1].cur++;
      },
      onLabelRead() { missions[2].cur++; }
    };
  }

  // ---------------- Stage 4: Boss ----------------
  function buildBoss() {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff6fae, roughness: 0.3, emissive: 0x330011 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(3, 32, 24), bodyMat);
    body.position.y = 3; body.castShadow = true; group.add(body);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.5 + Math.random() * 0.3, 12, 10), bodyMat);
      d.position.set(Math.cos(a) * 2.6, 0.6, Math.sin(a) * 2.6); d.scale.y = 1.4; group.add(d);
    }
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const black = new THREE.MeshBasicMaterial({ color: 0x111111 });
    [-1, 1].forEach((s) => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.65, 16, 12), white); e.position.set(s, 3.9, 2.45); group.add(e);
      const pu = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), black); pu.position.set(s, 3.9, 3.05); group.add(pu);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.3), black);
      brow.position.set(s, 4.75, 2.6); brow.rotation.z = s * 0.35; group.add(brow);
    });
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.15, 8, 20, Math.PI), black);
    mouth.position.set(0, 2.3, 2.95); group.add(mouth);
    [0xe53935, 0xffb300, 0x8e24aa].forEach((col, k) => {
      const i = k - 1;
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.3, 16),
        new THREE.MeshStandardMaterial({ color: col, metalness: 0.4, roughness: 0.3 }));
      can.position.set(i * 1.1, 6.2, 0); can.rotation.z = -i * 0.3; group.add(can);
    });
    const name = textSprite('👾 ยักษ์น้ำตาล', { h: 0.9, bg: 'rgba(255,64,129,0.92)', color: '#ffffff' });
    name.position.y = 7.8; group.add(name);
    return { group, body, hp: 100, t: 0, flash: 0, slamming: 0 };
  }

  function buildStage4() {
    addOuterGround(0xf8bbd0);
    const arena = new THREE.Mesh(new THREE.CylinderGeometry(24, 24.5, 0.4, 64), mat(0xffe0ef));
    arena.position.y = -0.2; arena.receiveShadow = true; stageGroup.add(arena);
    const edge = new THREE.Mesh(new THREE.RingGeometry(23, 24, 64), new THREE.MeshBasicMaterial({ color: 0xff80ab }));
    edge.rotation.x = -Math.PI / 2; edge.position.y = 0.02; stageGroup.add(edge);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 6, 12), mat(i % 2 ? 0xff80ab : 0xffffff));
      pil.position.set(Math.cos(a) * 27, 3, Math.sin(a) * 27); pil.castShadow = true; stageGroup.add(pil);
    }

    const boss = buildBoss();
    boss.group.position.set(0, 0, -10);
    stageGroup.add(boss.group);
    state.ammo = 5;

    const missions = [{ label: 'เอาชนะยักษ์น้ำตาล 👾', cur: 0, max: 1 }];
    const st = {
      spawn: new THREE.Vector3(0, 0, 12), bounds: { radius: 22 },
      sky: 0xffc1e3, camOffset: new THREE.Vector3(0, 11, 15), missions, portal: null,
      boss, waves: [], bombs: [], shots: [], spawnTimer: 0, waveTimer: 3, bombTimer: 4,
      throwCd: 0, defeated: false, endTimer: 2, finished: false, shotCount: 0
    };

    function spawnAmmo() {
      const bp = boss.group.position;
      for (let tries = 0; tries < 10; tries++) {
        const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 15;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (Math.hypot(x - bp.x, z - bp.z) < 7) continue;
        if (Math.random() < 0.2) spawnItem(pick(['soda', 'boba']), x, z);   // ของล่อใจ
        else spawnItem(pick(['water', 'water', 'broccoli', 'apple', 'carrot']), x, z, { ammo: true, label: false });
        return;
      }
    }
    function spawnWave() {
      const bp = boss.group.position;
      const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64),
        new THREE.MeshBasicMaterial({ color: 0xff4fa3, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.position.set(bp.x, 0.08, bp.z);
      stageGroup.add(m);
      st.waves.push({ mesh: m, r: 2, x: bp.x, z: bp.z, hit: false, dead: false });
    }
    function throwBomb() {
      const bp = boss.group.position, p = player.group.position;
      const to = new THREE.Vector3(p.x, 0, p.z);
      const marker = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.8, 32),
        new THREE.MeshBasicMaterial({ color: 0xff1744, transparent: true, opacity: 0.3, side: THREE.DoubleSide }));
      marker.rotation.x = -Math.PI / 2; marker.position.set(to.x, 0.06, to.z);
      const spr = makeSprite('🥤', 1.4);
      const from = new THREE.Vector3(bp.x, 6 * boss.group.scale.x, bp.z);
      spr.position.copy(from);
      stageGroup.add(marker, spr);
      st.bombs.push({ spr, marker, from, to, t: 0, dur: 1.4, dead: false });
    }
    function defeatBoss() {
      st.defeated = true; missions[0].cur = 1; renderMissions(); sfx('win');
      toast('🎉 ยักษ์น้ำตาลหดเล็กลงจนหายไปแล้ว!', 'good', 3000);
      st.waves.forEach((w) => stageGroup.remove(w.mesh));
      st.bombs.forEach((b) => stageGroup.remove(b.spr, b.marker));
      st.waves = []; st.bombs = [];
    }
    function updateShots(dt) {
      const bg = boss.group;
      const center = new THREE.Vector3(bg.position.x, bg.position.y + 3 * bg.scale.x, bg.position.z);
      for (const s of st.shots) {
        const desired = tmpV.copy(center).sub(s.spr.position).normalize().multiplyScalar(24);
        s.vel.lerp(desired, 0.12);                       // เล็งอัตโนมัติ (homing)
        s.spr.position.addScaledVector(s.vel, dt);
        s.spr.material.rotation += dt * 10;
        s.life -= dt;
        if (!st.defeated && s.spr.position.distanceTo(center) < 3 * bg.scale.x + 0.4) {
          s.dead = true; boss.hp = Math.max(0, boss.hp - 8); boss.flash = 0.15; sfx('hit');
          floatTextAt('💥 −8', true, center);
          ui.bossFill.style.width = boss.hp + '%';
          if (boss.hp <= 0) defeatBoss();
        } else if (s.life <= 0) s.dead = true;
        if (s.dead) stageGroup.remove(s.spr);
      }
      st.shots = st.shots.filter((s) => !s.dead);
    }

    st.onThrow = () => {
      if (st.defeated || st.throwCd > 0) return;
      if (state.ammo <= 0) { toast('💧 กระสุนหมด! เก็บน้ำเปล่าหรือผักผลไม้ในสนามก่อนนะ', 'info', 2000); return; }
      st.throwCd = 0.3; state.ammo--; updateHUD(); sfx('throw');
      const p = player.group.position;
      const spr = makeSprite(['💧', '🥦', '🍎', '🥕'][st.shotCount++ % 4], 1.1);
      spr.position.set(p.x, p.y + 1.5, p.z);
      stageGroup.add(spr);
      const bp = boss.group.position;
      const vel = new THREE.Vector3(bp.x - p.x, 3, bp.z - p.z).normalize().multiplyScalar(20);
      st.shots.push({ spr, vel, life: 2.5, dead: false });
    };

    st.update = (dt) => {
      const b = boss, bp = b.group.position, p = player.group.position;
      b.t += dt; st.throwCd = Math.max(0, st.throwCd - dt);

      if (st.defeated) {
        b.group.scale.setScalar(Math.max(0.01, b.group.scale.x - dt * 0.6));
        b.group.rotation.y += dt * 10;
        updateShots(dt);
        st.endTimer -= dt;
        if (st.endTimer <= 0 && !st.finished) { st.finished = true; finishGame(); }
        return;
      }

      // เคลื่อนที่ + หันหน้าหาผู้เล่น + หดตัวตาม HP
      bp.x = Math.sin(b.t * 0.5) * 8;
      b.group.rotation.y = Math.atan2(p.x - bp.x, p.z - bp.z);
      const targetS = 0.55 + 0.45 * (b.hp / 100);
      b.group.scale.setScalar(THREE.MathUtils.lerp(b.group.scale.x, targetS, 0.1));
      b.flash = Math.max(0, b.flash - dt);
      b.body.material.emissive.setHex(b.flash > 0 ? 0xffffff : 0x330011);
      b.body.scale.set(1 + Math.sin(b.t * 3) * 0.03, 1 + Math.cos(b.t * 3) * 0.03, 1);

      // ท่ากระแทกพื้น → คลื่นน้ำตาล
      st.waveTimer -= dt;
      if (st.waveTimer <= 0 && !b.slamming) b.slamming = 0.8;
      if (b.slamming > 0) {
        b.slamming -= dt;
        const k = 1 - Math.max(0, b.slamming) / 0.8;
        bp.y = Math.sin(k * Math.PI) * 3;
        if (b.slamming <= 0) {
          b.slamming = 0; bp.y = 0; spawnWave(); shake = 0.5; sfx('hit');
          st.waveTimer = b.hp > 50 ? 4.5 : 3;
        }
      }

      // เฟส 2: ระเบิดน้ำอัดลม
      if (b.hp <= 60) {
        st.bombTimer -= dt;
        if (st.bombTimer <= 0) { st.bombTimer = 2.4; throwBomb(); }
      }

      for (const w of st.waves) {
        w.r += 9 * dt;
        w.mesh.scale.set(w.r, w.r, 1);
        w.mesh.material.opacity = Math.max(0, 0.9 - w.r / 30);
        const d = Math.hypot(p.x - w.x, p.z - w.z);
        if (!w.hit && Math.abs(d - w.r) < 0.7 && p.y < 0.6 && effects.invuln <= 0) {
          w.hit = true; sugarShock('คลื่นน้ำตาล');
          if (state.mode !== 'playing') return;
        }
        if (w.r > 30) { w.dead = true; stageGroup.remove(w.mesh); }
      }
      st.waves = st.waves.filter((w) => !w.dead);

      for (const bm of st.bombs) {
        bm.t += dt;
        const k = Math.min(1, bm.t / bm.dur);
        bm.spr.position.set(
          THREE.MathUtils.lerp(bm.from.x, bm.to.x, k),
          THREE.MathUtils.lerp(bm.from.y, 0.6, k) + Math.sin(k * Math.PI) * 6,
          THREE.MathUtils.lerp(bm.from.z, bm.to.z, k)
        );
        bm.marker.material.opacity = 0.3 + 0.5 * k;
        if (k >= 1) {
          bm.dead = true; stageGroup.remove(bm.spr, bm.marker); shake = Math.max(shake, 0.3);
          if (Math.hypot(p.x - bm.to.x, p.z - bm.to.z) < 1.8 && p.y < 1.2 && effects.invuln <= 0) {
            sugarShock('ระเบิดน้ำอัดลม');
            if (state.mode !== 'playing') return;
          }
        }
      }
      st.bombs = st.bombs.filter((x) => !x.dead);

      // ชนตัวบอส
      const br = 3 * b.group.scale.x + player.radius;
      const dd = Math.hypot(p.x - bp.x, p.z - bp.z);
      if (dd < br) {
        const nx = (p.x - bp.x) / (dd || 1), nz = (p.z - bp.z) / (dd || 1);
        p.x = bp.x + nx * br; p.z = bp.z + nz * br;
        if (effects.invuln <= 0) { sugarShock('ชนยักษ์น้ำตาล'); if (state.mode !== 'playing') return; }
      }

      updateShots(dt);

      st.spawnTimer -= dt;
      if (st.spawnTimer <= 0) {
        st.spawnTimer = 2.5;
        if (items.filter((i) => i.active && !i.dead).length < 6) spawnAmmo();
      }
    };

    for (let i = 0; i < 3; i++) spawnAmmo();
    return st;
  }

  // ---------------- Scoring ----------------
  function addScore(delta, reason) {
    if (state.dead) return;
    state.score += delta;
    floatText(`${delta > 0 ? '+' : ''}${delta} ${reason || ''}`, delta > 0);
    if (state.score <= 0) { state.score = 0; updateHUD(); gameOver(); return; }
    updateHUD();
  }
  function drinkSugar(d) {
    state.sugarTsp += d.tsp || 0;
    effects.slow = 4; effects.invuln = 1.2; shake = 0.5; sfx('bad');
    toast(`${d.emoji} <b>${d.name}</b> ${POINTS.SUGARY_DRINK} · น้ำตาล ${d.tsp} ช้อนชา!<br>${d.tip}<br><small>😵 น้ำตาลพุ่งแล้วตก ตัวเลยเชื่องช้าชั่วคราว</small>`, 'bad', 5000);
    addScore(POINTS.SUGARY_DRINK, d.name);
  }
  function sugarShock(reason) {
    effects.slow = 3; effects.invuln = 1.5; shake = 0.6; sfx('bad');
    toast(`⚡ โดน${reason}! พลังสุขภาพ −20<br><small>กระโดดหลบคลื่น และวิ่งออกจากเป้าสีแดงนะ</small>`, 'bad', 2500);
    addScore(POINTS.SUGARY_DRINK, reason);
  }
  function collectItem(it) {
    const d = it.def;
    if (it.respawn) { it.active = false; it.mesh.visible = false; it.timer = it.respawn; }
    else { it.active = false; it.dead = true; stageGroup.remove(it.mesh); }

    switch (d.type) {
      case 'healthyDrink':
        sfx('good'); effects.speed = 4;
        if (!it.ammo) toast(`${d.emoji} <b>${d.name}</b> +${POINTS.HEALTHY_DRINK} · วิ่งเร็วขึ้น!<br>${d.tip}`, 'good');
        addScore(POINTS.HEALTHY_DRINK, d.name);
        break;
      case 'food':
        sfx('good');
        if (!it.ammo) toast(`${d.emoji} <b>${d.name}</b> +${POINTS.HEALTHY_FOOD}<br>${d.tip}`, 'good');
        addScore(POINTS.HEALTHY_FOOD, d.name);
        break;
      case 'sugary':
        drinkSugar(d);
        break;
      case 'junk':
        state.sugarTsp += d.tsp || 0; sfx('bad');
        toast(`${d.emoji} <b>${d.name}</b> ${POINTS.JUNK_FOOD}<br>${d.tip}`, 'bad');
        addScore(POINTS.JUNK_FOOD, d.name);
        break;
      case 'card':
        sfx('good');
        toast(`📘 <b>การ์ดความรู้</b> +${POINTS.EDU_CARD}<br>${pick(FACT_CARDS)}`, 'info', 6500);
        addScore(POINTS.EDU_CARD, 'การ์ดความรู้');
        break;
      case 'label':
        sfx('good');
        openQuiz(() => { if (state.stage.onLabelRead) state.stage.onLabelRead(); refreshMissions(); });
        break;
    }
    if (it.ammo && !state.dead) { state.ammo += 3; updateHUD(); toast(`${d.emoji} +3 กระสุนสุขภาพ!`, 'good', 1500); }
    if (state.stage && state.stage.onCollect) state.stage.onCollect(it);
    if (!state.dead) refreshMissions();
  }

  // ---------------- UI helpers ----------------
  let toastTimer = null;
  function toast(html, kind = 'info', ms = 3500) {
    ui.toast.innerHTML = html;
    ui.toast.className = kind;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { ui.toast.className = 'hidden'; }, ms);
  }
  function setHint(text) { if (ui.hint.textContent !== text) ui.hint.textContent = text; }
  function floatTextAt(text, good, worldPos) {
    tmpV2.copy(worldPos).project(camera);
    if (tmpV2.z > 1) return;
    const el = document.createElement('div');
    el.className = 'floater ' + (good ? 'good' : 'bad');
    el.textContent = text;
    el.style.left = ((tmpV2.x * 0.5 + 0.5) * window.innerWidth) + 'px';
    el.style.top = ((-tmpV2.y * 0.5 + 0.5) * window.innerHeight) + 'px';
    ui.floaters.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }
  function floatText(text, good) {
    const p = player.group.position;
    floatTextAt(text, good, tmpV3.set(p.x, p.y + 2.6, p.z));
  }
  function updateHUD() {
    ui.scoreText.textContent = state.score;
    ui.scoreFill.style.width = (Math.max(0, Math.min(1, state.score / 150)) * 100) + '%';
    ui.scoreFill.style.background = state.score > 70 ? 'linear-gradient(90deg,#4cd964,#9be15d)'
      : state.score > 40 ? 'linear-gradient(90deg,#ffcc00,#ffe066)' : 'linear-gradient(90deg,#ff3b30,#ff7b72)';
    ui.sugarText.textContent = state.sugarTsp;
    ui.sugarBox.classList.toggle('over', state.sugarTsp > SUGAR_LIMIT_TSP);
    ui.ammoText.textContent = state.ammo;
  }
  let lastFx = '';
  function updateEffectsUI() {
    const parts = [];
    if (effects.slow > 0) parts.push(`<span class="fx bad">🐌 น้ำตาลตก ช้าลง ${Math.ceil(effects.slow)}s</span>`);
    if (effects.speed > 0) parts.push(`<span class="fx good">💨 สดชื่น วิ่งเร็ว ${Math.ceil(effects.speed)}s</span>`);
    if (effects.jump > 0) parts.push(`<span class="fx good">🦘 กระโดดสูง ${Math.ceil(effects.jump)}s</span>`);
    const html = parts.join('');
    if (html !== lastFx) { ui.effects.innerHTML = html; lastFx = html; }
    ui.overlay.classList.toggle('on', effects.slow > 0);
  }
  function renderMissions() {
    ui.stageName.textContent = STAGES[state.stageIndex].title;
    ui.missionList.innerHTML = state.stage.missions.map((m) => {
      const done = m.cur >= m.max;
      return `<li class="${done ? 'done' : ''}">${done ? '✅' : '⬜'} ${m.label}${m.max > 1 ? ` (${Math.min(m.cur, m.max)}/${m.max})` : ''}</li>`;
    }).join('');
  }
  function refreshMissions() {
    renderMissions();
    const st = state.stage;
    if (st.portal && !st.portal.active && st.missions.every((m) => m.cur >= m.max)) {
      st.portal.setActive(true); sfx('win');
      toast('🎉 ภารกิจครบแล้ว! ไปที่ประตูสีเขียวเพื่อไปด่านต่อไป', 'good', 4500);
    }
  }

  // ---------------- Modal ----------------
  function showModal(html, buttons) {
    state.mode = 'modal';
    ui.modalBody.innerHTML = html;
    ui.modalButtons.innerHTML = '';
    buttons.forEach((b) => {
      const el = document.createElement('button');
      el.className = 'btn ' + (b.cls || '');
      el.innerHTML = b.text;
      el.addEventListener('click', () => { sfxInit(); b.action(); });
      ui.modalButtons.appendChild(el);
    });
    ui.modal.classList.remove('hidden');
    for (const k in keys) keys[k] = false;
  }
  function closeModal() {
    ui.modal.classList.add('hidden');
    state.mode = 'playing'; state.paused = false;
    jumpPressed = throwPressed = false;
    lastTime = performance.now();
  }
  function togglePause() {
    if (state.mode === 'playing') {
      showModal('<h2>⏸️ พักก่อน</h2><p>ดื่มน้ำเปล่าสักแก้ว แล้วกลับมาเล่นต่อนะ!</p>', [{ text: '▶ เล่นต่อ', action: closeModal }]);
      state.paused = true;
    } else if (state.paused) closeModal();
  }
  function openQuiz(onDone) {
    const q = LABEL_QUIZ[quizOrder[quizIndex++ % quizOrder.length]];
    let html = '<h2>🏷️ ฝึกอ่านฉลาก</h2>';
    if (q.labels) {
      html += `<div class="labels">${q.labels.map((l, i) =>
        `<div class="nlabel"><div class="t">${q.labels.length > 1 ? String.fromCharCode(65 + i) + '. ' : ''}${l.name}</div><div>ข้อมูลโภชนาการ</div><div class="s">${l.sugar}</div></div>`
      ).join('')}</div>`;
    }
    html += `<p class="q">${q.q}</p>`;
    showModal(html, q.choices.map((c, i) => ({
      text: c, cls: 'choice',
      action: () => {
        const ok = i === q.answer;
        sfx(ok ? 'good' : 'bad');
        showModal(`<h2>${ok ? '✅ ถูกต้อง! +' + POINTS.EDU_CARD : '🤔 ยังไม่ใช่นะ ลองจำไว้'}</h2><p>${q.explain}</p>`, [{
          text: 'ไปต่อ ▶',
          action: () => { closeModal(); if (ok) addScore(POINTS.EDU_CARD, 'อ่านฉลากเก่ง!'); onDone(); }
        }]);
      }
    })));
  }

  // ---------------- Stage flow ----------------
  const BUILDERS = [buildStage1, buildStage2, buildStage3, buildStage4];

  function clearStage() {
    if (stageGroup) {
      stageGroup.traverse((o) => {
        if (o.geometry && !o.isSprite) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      scene.remove(stageGroup);
    }
    items = []; colliders = []; stageGroup = null;
  }
  function loadStage(i) {
    clearStage();
    state.stageIndex = i; state.dead = false; state.ammo = 0;
    state.sugarAtStageStart = state.sugarTsp;
    for (const k in effects) effects[k] = 0;
    stageGroup = new THREE.Group();
    scene.add(stageGroup);
    const st = BUILDERS[i]();
    state.stage = st;
    player.group.position.copy(st.spawn);
    player.vy = 0; player.group.rotation.y = Math.PI; player.group.visible = true;
    scene.background = new THREE.Color(st.sky);
    scene.fog = new THREE.Fog(st.sky, 45, 120);
    camera.position.copy(st.spawn).add(st.camOffset);
    ui.bossPanel.classList.toggle('hidden', i !== 3);
    ui.bossFill.style.width = '100%';
    ui.btnThrow.style.display = i === 3 ? '' : 'none';
    setHint(''); ui.toast.className = 'hidden';
    updateHUD(); renderMissions(); updateEffectsUI();
    const meta = STAGES[i];
    showModal(`<h2>${meta.title}</h2><p>${meta.intro}</p><ul>${meta.goals.map((g) => `<li>${g}</li>`).join('')}</ul>`,
      [{ text: 'เริ่มเลย! 🚀', action: closeModal }]);
  }
  function stageClear() {
    sfx('win');
    const meta = STAGES[state.stageIndex];
    showModal(`<h2>🎉 ผ่าน${meta.title}</h2><p>พลังสุขภาพตอนนี้: <b>${state.score}</b></p><div class="tipbox">💡 ${meta.lesson}</div>`,
      [{ text: 'ด่านต่อไป ▶', action: () => loadStage(state.stageIndex + 1) }]);
  }
  function restartStage() {
    state.score = START_SCORE;
    state.sugarTsp = state.sugarAtStageStart;
    loadStage(state.stageIndex);
  }
  function newGame() {
    state.score = START_SCORE; state.sugarTsp = 0;
    loadStage(0);
  }
  function gameOver() {
    state.dead = true; sfx('bad');
    showModal(`<h2>😵 พลังสุขภาพหมดแล้ว!</h2><p>ร่างกายได้รับน้ำตาลและของไม่มีประโยชน์มากเกินไป</p>
      <div class="tipbox">💡 <b>รู้ไหม?</b> ${pick(GAME_OVER_TIPS)}</div>`,
      [{ text: '🔁 เริ่มด่านนี้ใหม่', action: restartStage }]);
  }
  function finishGame() {
    if (state.score > WIN_SCORE) {
      try { localStorage.setItem('sfv_badge', '1'); } catch (e) { /* ignore */ }
      sfx('win');
      const tsp = state.sugarTsp;
      showModal(`<div class="badge">🏅</div><h2>Healthy Champion!</h2>
        <p>สุดยอดไปเลย! คุณเอาชนะยักษ์น้ำตาลด้วยการเลือกสิ่งที่ดีต่อสุขภาพ</p>
        <div class="stats">❤️ พลังสุขภาพสุดท้าย: <b>${state.score}</b><br>
        🥄 น้ำตาลที่ได้รับระหว่างเกม: <b>${tsp}</b> ช้อนชา
        ${tsp <= SUGAR_LIMIT_TSP ? '— ไม่เกินเกณฑ์ เยี่ยมมาก! 🌟' : '— เกิน 6 ช้อนชา ครั้งหน้าลองหลบให้มากขึ้นนะ'}</div>
        <div class="tipbox">🤝 <b>สัญญากับตัวเอง:</b><br>ดื่มน้ำเปล่าแทนน้ำหวาน • อ่านฉลากก่อนซื้อ • กินอาหารครบ 5 หมู่ • ออกกำลังกายทุกวัน</div>`,
        [{ text: '🔄 เล่นใหม่อีกครั้ง', action: newGame }]);
    } else {
      showModal(`<h2>😮 เกือบแล้ว!</h2><p>คุณชนะยักษ์น้ำตาลได้ แต่พลังสุขภาพเหลือ <b>${state.score}</b>
        ต้องมากกว่า ${WIN_SCORE} จึงจะได้เหรียญ Healthy Champion</p>
        <div class="tipbox">💡 ${pick(GAME_OVER_TIPS)}</div>`,
        [{ text: '🔁 สู้บอสอีกครั้ง', action: restartStage }]);
    }
  }

  // ---------------- Physics ----------------
  function clampToBounds(p) {
    const b = state.stage.bounds;
    if (b.radius) {
      const d = Math.hypot(p.x, p.z);
      if (d > b.radius) { p.x *= b.radius / d; p.z *= b.radius / d; }
    } else {
      p.x = THREE.MathUtils.clamp(p.x, b.minX, b.maxX);
      p.z = THREE.MathUtils.clamp(p.z, b.minZ, b.maxZ);
    }
  }
  // ตรวจชนแบบวงกลมกับกล่อง (ลื่นไหลตามกำแพง ไม่ติดรอยต่อ) และคืนค่าความสูงพื้นที่ยืนได้
  function resolveCollisions(prevY) {
    const p = player.group.position, r = player.radius;
    let groundY = 0;
    for (const c of colliders) {
      const cx = Math.max(c.minX, Math.min(p.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (!c.noTop && prevY >= c.top - 0.05) { groundY = Math.max(groundY, c.top); continue; }
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r;
      } else {
        const dl = p.x - c.minX, dr = c.maxX - p.x, db = p.z - c.minZ, df = c.maxZ - p.z;
        const m = Math.min(dl, dr, db, df);
        if (m === dl) p.x = c.minX - r; else if (m === dr) p.x = c.maxX + r;
        else if (m === db) p.z = c.minZ - r; else p.z = c.maxZ + r;
      }
    }
    return groundY;
  }
  function updatePlayer(dt) {
    const p = player.group.position;
    let ix = 0, iz = 0;
    if (keys.KeyA || keys.ArrowLeft) ix -= 1;
    if (keys.KeyD || keys.ArrowRight) ix += 1;
    if (keys.KeyW || keys.ArrowUp) iz -= 1;
    if (keys.KeyS || keys.ArrowDown) iz += 1;
    ix += joy.x; iz += joy.z;
    const len = Math.hypot(ix, iz);
    if (len > 1) { ix /= len; iz /= len; }

    const mult = effects.slow > 0 ? 0.45 : effects.speed > 0 ? 1.35 : 1;
    const speed = 7 * mult;
    const prevY = p.y;
    p.x += ix * speed * dt;
    p.z += iz * speed * dt;
    clampToBounds(p);
    const groundY = resolveCollisions(prevY);

    if (jumpPressed && player.onGround) {
      player.vy = effects.jump > 0 ? 12.5 : 10;
      player.onGround = false; sfx('jump');
      if (state.stage.onJump) state.stage.onJump();
    }
    jumpPressed = false;
    player.vy -= 25 * dt;
    p.y += player.vy * dt;
    if (p.y <= groundY) { p.y = groundY; player.vy = 0; player.onGround = true; }
    else player.onGround = false;

    // แอนิเมชัน
    if (len > 0.1) {
      player.group.rotation.y = lerpAngle(player.group.rotation.y, Math.atan2(ix, iz), 1 - Math.exp(-12 * dt));
      player.walk += dt * 12 * mult;
    }
    const swing = len > 0.1 && player.onGround ? Math.sin(player.walk) : 0;
    player.legs[0].rotation.x = swing * 0.6;
    player.legs[1].rotation.x = -swing * 0.6;
    player.body.position.y = 0.75 + Math.abs(swing) * 0.06;
    player.shirtMat.emissive.setHex(effects.slow > 0 ? 0x880055 : 0x000000);
    player.group.visible = effects.invuln > 0 ? Math.floor(state.time * 14) % 2 === 0 : true;
  }
  function updateItems(dt) {
    const p = player.group.position;
    for (const it of items) {
      if (it.dead) continue;
      if (!it.active) {
        if (it.respawn) { it.timer -= dt; if (it.timer <= 0) { it.active = true; it.mesh.visible = true; } }
        continue;
      }
      it.t += dt;
      it.sprite.position.y = 1.2 + Math.sin(it.t * 2.5) * 0.15;
      if (it.move) it.move(it, state.time, dt);
      const m = it.mesh.position;
      const dxz = Math.hypot(p.x - m.x, p.z - m.z);
      const dy = Math.abs((p.y + 1) - (m.y + it.sprite.position.y));
      if (dxz < it.radius + 0.35 && dy < 1.0) {
        if (it.obstacle && effects.invuln > 0) continue;
        collectItem(it);
        if (state.mode !== 'playing') break;
      }
    }
    if (items.some((i) => i.dead)) items = items.filter((i) => !i.dead);
  }
  function checkPortal() {
    const po = state.stage.portal;
    if (!po) return;
    po.disc.material.opacity = po.active ? 0.45 + Math.sin(state.time * 4) * 0.2 : 0.12;
    const p = player.group.position, g = po.group.position;
    if (Math.hypot(p.x - g.x, p.z - g.z) < 1.5 && p.y < 2) {
      if (po.active) stageClear();
      else if (portalCooldown <= 0) {
        portalCooldown = 2;
        if (state.stage.onLockedPortal) state.stage.onLockedPortal();
        else toast('🔒 ทำภารกิจให้ครบก่อน แล้วประตูจะเปลี่ยนเป็นสีเขียว!', 'info', 2500);
      }
    }
  }
  function updateCamera(dt) {
    const p = player.group.position, off = state.stage.camOffset;
    camTarget.set(p.x + off.x, p.y * 0.5 + off.y, p.z + off.z);
    camera.position.lerp(camTarget, 1 - Math.exp(-5 * dt));
    if (shake > 0) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
      shake = Math.max(0, shake - dt * 1.5);
    }
    camera.lookAt(p.x, p.y * 0.5 + 1, p.z - 1.5);
    sun.position.set(p.x + 15, 35, p.z + 12);
    sun.target.position.set(p.x, 0, p.z);
  }

  // ---------------- Main loop ----------------
  function update(dt) {
    state.time += dt;
    for (const k in effects) effects[k] = Math.max(0, effects[k] - dt);
    portalCooldown = Math.max(0, portalCooldown - dt);
    updatePlayer(dt);
    if (state.mode !== 'playing') return;
    updateItems(dt);
    if (state.mode !== 'playing') return;
    if (state.stage.update) state.stage.update(dt);
    if (state.mode !== 'playing') return;
    if (throwPressed) { throwPressed = false; if (state.stage.onThrow) state.stage.onThrow(); }
    checkPortal();
    updateEffectsUI();
  }
  let lastTime = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    if (state.mode === 'playing' && state.stage) update(dt);
    if (state.stage) updateCamera(dt);
    renderer.render(scene, camera);
  }

  // ---------------- Audio (WebAudio beeps) ----------------
  let actx = null;
  function sfxInit() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* no audio */ } }
    if (actx && actx.state === 'suspended') actx.resume();
  }
  const SFX = {
    good: [660, 1320, 0.15, 'triangle'], bad: [320, 90, 0.35, 'sawtooth'], jump: [380, 760, 0.12, 'square'],
    throw: [900, 300, 0.15, 'triangle'], hit: [220, 60, 0.25, 'square'], win: [523, 1568, 0.6, 'triangle']
  };
  function sfx(name) {
    if (!actx) return;
    const [f1, f2, d, type] = SFX[name];
    const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(0.07, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g); g.connect(actx.destination);
    o.start(t); o.stop(t + d + 0.02);
  }

  // ---------------- Input ----------------
  const keys = {};
  window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    keys[e.code] = true;
    if (e.repeat) return;
    if (e.code === 'Escape' || e.code === 'KeyP') { togglePause(); return; }
    if (state.mode !== 'playing') return;
    if (e.code === 'Space') jumpPressed = true;
    if (e.code === 'KeyF' || e.code === 'KeyJ') throwPressed = true;
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && state.mode === 'playing') throwPressed = true;
  });

  // Joystick สำหรับจอสัมผัส
  const joy = { active: false, id: null, x: 0, z: 0, cx: 0, cy: 0 };
  const jEl = $('joystick'), stick = $('stick');
  function moveJoy(e) {
    let dx = e.clientX - joy.cx, dy = e.clientY - joy.cy;
    const max = 50, len = Math.hypot(dx, dy);
    if (len > max) { dx *= max / len; dy *= max / len; }
    joy.x = dx / max; joy.z = dy / max;
    stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }
  jEl.addEventListener('pointerdown', (e) => {
    joy.active = true; joy.id = e.pointerId;
    const r = jEl.getBoundingClientRect();
    joy.cx = r.left + r.width / 2; joy.cy = r.top + r.height / 2;
    jEl.setPointerCapture(e.pointerId); moveJoy(e);
  });
  jEl.addEventListener('pointermove', (e) => { if (joy.active && e.pointerId === joy.id) moveJoy(e); });
  const endJoy = (e) => {
    if (e.pointerId !== joy.id) return;
    joy.active = false; joy.x = joy.z = 0;
    stick.style.transform = 'translate(-50%, -50%)';
  };
  jEl.addEventListener('pointerup', endJoy);
  jEl.addEventListener('pointercancel', endJoy);
  $('btnJump').addEventListener('pointerdown', (e) => { e.preventDefault(); if (state.mode === 'playing') jumpPressed = true; });
  $('btnThrow').addEventListener('pointerdown', (e) => { e.preventDefault(); if (state.mode === 'playing') throwPressed = true; });

  // ---------------- Start ----------------
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  try { if (localStorage.getItem('sfv_badge')) ui.badgeNote.classList.remove('hidden'); } catch (e) { /* ignore */ }

  $('btnStart').addEventListener('click', () => {
    sfxInit();
    const begin = () => {
      ui.start.classList.add('hidden');
      ui.hud.classList.remove('hidden');
      if (isTouch) ui.touch.classList.remove('hidden');
      newGame();
    };
    if (document.fonts && document.fonts.load) document.fonts.load('600 40px Mitr').then(begin, begin);
    else begin();
  });

  requestAnimationFrame(loop);
})();
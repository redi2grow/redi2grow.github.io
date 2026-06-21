/* =========================================================
   지영's 꽃밭 — travelling garden engine (vanilla canvas)
   A continuous world you move THROUGH. The camera glides
   along a winding path; parallax layers drift at depth;
   the mood (sky + flowers) melts from one 지영 to the next
   as you pass through their colour zone. Sun arcs like a day.

   API
     Garden.init(canvasEl)
     Garden.configure(stations)   // [{at, theme, ...}]  at = 0..1
     Garden.render(progress, vel) // progress 0..1, vel = travel speed
     Garden.pulse(x, y)           // petal burst at screen point
   ========================================================= */
const Garden = (function () {
  "use strict";

  let canvas, ctx;
  let W = 0, H = 0, dpr = 1;
  let t = 0;

  const TRAVEL = 6400;          // virtual px travelled start→end
  const HORIZON = 0.58;

  let stations = [];            // {at, worldX, theme(rgb)}
  let zones = [];               // sorted colour stops {at, theme(rgb)}
  let flowers = [];             // ambient field in world space
  let petals = [];
  let butterflies = [];
  let clouds = [];
  let stones = [];

  const pointer = { x: -1, y: -1, tx: -1, ty: -1, active: false };
  let camera = 0, travelVel = 0;
  // the travellers — 지영 (girl) and her little follower (a baby boy)
  const travA = { walk: 0, face: 1, blink: 0, blinkCd: 2.5, bloom: 0, hop: 0 };
  const travB = { walk: 1.3, face: 1, blink: 0, blinkCd: 3.7, bloom: 0, hop: 1.1, x: undefined };
  const hearts = [];           // little hearts the two exchange
  let heartCd = 2.2;
  let previewTheme = null, previewAmt = 0, previewOn = false; // map hover colour peek

  /* ---------- colour helpers ---------- */
  function hexToRgb(h) {
    h = h.replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const smooth = (t) => t * t * (3 - 2 * t);
  function lerpRgb(a, b, t) {
    return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) };
  }
  const rgb = (c, a) =>
    a == null ? `rgb(${c.r | 0},${c.g | 0},${c.b | 0})`
              : `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${a})`;

  function mkTheme(t) {
    return {
      sky: t.sky.map(hexToRgb),
      sun: hexToRgb(t.sun),
      sunGlow: hexToRgb(t.sunGlow),
      hills: t.hills.map(hexToRgb),
      flowers: t.flowers.map(hexToRgb),
      center: hexToRgb(t.center),
      pollen: hexToRgb(t.pollen),
    };
  }

  /* blend whole themes for a smooth zone transition */
  function blendTheme(a, b, t) {
    return {
      sky: [0, 1, 2].map((i) => lerpRgb(a.sky[i], b.sky[i], t)),
      sun: lerpRgb(a.sun, b.sun, t),
      sunGlow: lerpRgb(a.sunGlow, b.sunGlow, t),
      hills: [0, 1].map((i) => lerpRgb(a.hills[i], b.hills[i], t)),
      flowers: a.flowers.map((c, i) => lerpRgb(c, b.flowers[i % b.flowers.length], t)),
      center: lerpRgb(a.center, b.center, t),
      pollen: lerpRgb(a.pollen, b.pollen, t),
    };
  }

  function themeAt(p) {
    if (!zones.length) return null;
    if (p <= zones[0].at) return zones[0].theme;
    if (p >= zones[zones.length - 1].at) return zones[zones.length - 1].theme;
    for (let i = 0; i < zones.length - 1; i++) {
      const a = zones[i], b = zones[i + 1];
      if (p >= a.at && p <= b.at) {
        const tt = smooth((p - a.at) / (b.at - a.at));
        return blendTheme(a.theme, b.theme, tt);
      }
    }
    return zones[zones.length - 1].theme;
  }

  /* ---------- configure stations + zones ---------- */
  function configure(list) {
    stations = list.map((s) => ({ ...s, theme: mkTheme(s.theme) }));
    // colour zones: extend first/last to the world ends so the mood
    // is settled before/after the first/last 지영
    zones = [];
    zones.push({ at: 0, theme: stations[0].theme });
    stations.forEach((s) => zones.push({ at: s.at, theme: s.theme }));
    zones.push({ at: 1, theme: stations[stations.length - 1].theme });
    zones.sort((a, b) => a.at - b.at);
    layoutStations();
  }
  function layoutStations() {
    stations.forEach((s) => (s.worldX = s.at * TRAVEL + W / 2));
  }

  /* ---------- world seed ---------- */
  function rand(a, b) { return a + Math.random() * (b - a); }

  function build() {
    // ambient flower field spread across the whole world, by depth
    flowers.length = 0;
    const count = Math.max(70, Math.min(150, Math.round(TRAVEL / 60)));
    for (let i = 0; i < count; i++) {
      const depth = Math.pow(Math.random(), 0.7);
      const k = lerp(0.55, 1.4, depth);
      flowers.push({
        worldX: rand(-W, TRAVEL * k + W),
        k,
        depth,
        baseYr: lerp(HORIZON + 0.03, 1.06, depth) + rand(-0.015, 0.015),
        size: lerp(7, 38, depth) * rand(0.85, 1.15),
        pIndex: (Math.random() * 5) | 0,
        petals: 5 + ((Math.random() * 3) | 0),
        phase: rand(0, Math.PI * 2),
        speed: rand(0.5, 1.1),
        col: null,
      });
    }
    flowers.sort((a, b) => a.depth - b.depth);

    // stepping stones along the path (k = 1)
    stones.length = 0;
    for (let x = 0; x < TRAVEL + W; x += 250) {
      stones.push({ worldX: x + rand(-30, 30), r: rand(0.85, 1.15) });
    }

    petals.length = 0;
    const pc = Math.max(26, Math.min(60, Math.round((W * H) / 32000)));
    for (let i = 0; i < pc; i++) petals.push(mkPetal(true));

    butterflies.length = 0;
    const bc = W < 700 ? 2 : 4;
    for (let i = 0; i < bc; i++) butterflies.push(mkButterfly());

    clouds.length = 0;
    for (let i = 0; i < 6; i++) {
      clouds.push({
        worldX: rand(0, TRAVEL), yr: rand(0.06, 0.32),
        s: rand(0.7, 1.7), o: rand(0.16, 0.4),
      });
    }
  }

  function mkPetal(spread) {
    return {
      x: spread ? Math.random() * W : W + rand(0, 60),
      y: spread ? Math.random() * H : rand(-20, H * 0.7),
      vx: rand(-0.5, 0.1),
      vy: rand(0.15, 0.6),
      r: rand(3, 8),
      rot: rand(0, Math.PI * 2),
      vr: rand(-0.03, 0.03),
      sway: rand(0, Math.PI * 2),
      pIndex: (Math.random() * 5) | 0,
      o: rand(0.5, 0.95),
    };
  }
  function mkButterfly() {
    return {
      x: Math.random() * W, y: rand(H * 0.28, H * 0.72),
      a: rand(0, Math.PI * 2), sp: rand(0.4, 0.9),
      wing: rand(0, Math.PI * 2), wspeed: rand(0.25, 0.4),
      size: rand(7, 12), pIndex: (Math.random() * 5) | 0,
      turn: rand(-0.02, 0.02),
    };
  }

  /* ---------- resize ---------- */
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layoutStations();
    build();
  }

  /* ---------- draw: sky + sun (sun arcs across the day) ---------- */
  function drawSky(th, p) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgb(th.sky[0]));
    g.addColorStop(0.5, rgb(th.sky[1]));
    g.addColorStop(1, rgb(th.sky[2]));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const sx = W * (0.12 + p * 0.74);
    const sy = H * (0.34 - Math.sin(clamp01(p) * Math.PI) * 0.2);
    const rgrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, H * 0.75);
    rgrad.addColorStop(0, rgb(th.sunGlow, 0.5));
    rgrad.addColorStop(0.25, rgb(th.sunGlow, 0.2));
    rgrad.addColorStop(1, rgb(th.sunGlow, 0));
    ctx.fillStyle = rgrad;
    ctx.fillRect(0, 0, W, H);

    const sd = ctx.createRadialGradient(sx, sy, 0, sx, sy, 64);
    sd.addColorStop(0, rgb(th.sun, 0.95));
    sd.addColorStop(1, rgb(th.sun, 0));
    ctx.beginPath();
    ctx.arc(sx, sy, 64, 0, Math.PI * 2);
    ctx.fillStyle = sd; ctx.fill();
  }

  function drawClouds(th) {
    const k = 0.12;
    for (const c of clouds) {
      const x = c.worldX - camera * k;
      const xs = ((x % (TRAVEL + W)) + (TRAVEL + W)) % (TRAVEL + W);
      const sx = xs - W * 0.2;
      if (sx < -200 || sx > W + 200) continue;
      const y = c.yr * H, s = c.s;
      ctx.save();
      ctx.globalAlpha = c.o;
      ctx.fillStyle = rgb(lerpRgb(th.sky[0], { r: 255, g: 255, b: 255 }, 0.6));
      blob(sx, y, 60 * s, 24 * s);
      blob(sx + 46 * s, y + 6 * s, 44 * s, 20 * s);
      blob(sx - 46 * s, y + 8 * s, 40 * s, 18 * s);
      ctx.restore();
    }
  }
  function blob(x, y, rx, ry) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  }

  function hill(yr, color, amp, len, k, phase) {
    const off = camera * k;
    const y0 = H * yr;
    ctx.beginPath();
    ctx.moveTo(0, y0);
    for (let x = 0; x <= W; x += 22) {
      const y = y0 + Math.sin((x + off) / len + phase) * amp;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fillStyle = rgb(color); ctx.fill();
  }

  /* ---------- the winding path + stepping stones ---------- */
  function pathY(screenX) {
    return H * 0.80 + Math.sin((screenX + camera) * 0.0016 + 1.3) * H * 0.03;
  }
  function drawPath(th) {
    const band = lerpRgb(th.hills[0], th.pollen, 0.5);
    ctx.save();
    ctx.beginPath();
    for (let x = 0; x <= W; x += 16) ctx.lineTo(x, pathY(x) - 26);
    for (let x = W; x >= 0; x -= 16) ctx.lineTo(x, pathY(x) + 26);
    ctx.closePath();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = rgb(band);
    ctx.fill();
    ctx.restore();

    // stones
    for (const s of stones) {
      const sx = s.worldX - camera;
      if (sx < -40 || sx > W + 40) continue;
      const sy = pathY(sx) + 6;
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = rgb(lerpRgb(band, { r: 255, g: 255, b: 255 }, 0.25));
      ctx.beginPath();
      ctx.ellipse(sx, sy, 22 * s.r, 9 * s.r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /* ---------- a single flower ---------- */
  function drawFlower(x, baseY, size, col, sway, depth, center) {
    const topX = x + sway;
    const topY = baseY - size * 3.0;
    ctx.save();
    ctx.globalAlpha = lerp(0.5, 1, depth);

    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.quadraticCurveTo((x + topX) / 2 + sway * 0.3, (baseY + topY) / 2, topX, topY);
    ctx.lineWidth = Math.max(1.4, size * 0.16);
    ctx.strokeStyle = rgb(center.stem);
    ctx.lineCap = "round";
    ctx.stroke();

    const lx = (x + topX) / 2, ly = (baseY + topY) / 2 + size * 0.2;
    ctx.beginPath();
    ctx.ellipse(lx + size * 0.5, ly, size * 0.5, size * 0.22, 0.5 + sway * 0.02, 0, Math.PI * 2);
    ctx.fillStyle = rgb(center.stem);
    ctx.fill();

    const pr = size * 0.86;
    ctx.save();
    ctx.translate(topX, topY);
    ctx.rotate(sway * 0.01);
    const petalsN = 6;
    for (let i = 0; i < petalsN; i++) {
      const a = (i / petalsN) * Math.PI * 2;
      ctx.save();
      ctx.translate(Math.cos(a) * pr * 0.62, Math.sin(a) * pr * 0.62);
      ctx.rotate(a);
      const grad = ctx.createLinearGradient(-pr * 0.5, 0, pr * 0.6, 0);
      grad.addColorStop(0, rgb(col, 0.92));
      grad.addColorStop(1, rgb(lerpRgb(col, { r: 255, g: 255, b: 255 }, 0.35), 0.95));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(pr * 0.42, 0, pr * 0.5, pr * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, pr * 0.34, 0, Math.PI * 2);
    ctx.fillStyle = rgb(center.center);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, pr * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = rgb(lerpRgb(center.center, { r: 180, g: 110, b: 40 }, 0.4));
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  function drawField(th) {
    const colors = { stem: th.hills[1], center: th.center };
    for (const f of flowers) {
      const x = f.worldX - camera * f.k;
      if (x < -80 || x > W + 80) continue;
      f.col = f.col ? lerpRgb(f.col, th.flowers[f.pIndex % th.flowers.length], 0.08)
                    : { ...th.flowers[f.pIndex % th.flowers.length] };
      const baseY = f.baseYr * H;
      const windSway = Math.sin(t * f.speed + f.phase) * 6 * (0.4 + f.depth);
      const motionLean = -travelVel * 70 * f.k * (0.4 + f.depth);
      drawFlower(x, baseY, f.size, f.col, windSway + motionLean, f.depth, colors);
    }
  }

  /* ---------- station marker: a tall signature flower + halo ---------- */
  function drawStations(th) {
    for (const s of stations) {
      const x = s.worldX - camera;
      if (x < -160 || x > W + 160) continue;
      const baseY = H * 0.92;
      const size = 46;
      const near = 1 - clamp01(Math.abs(x - W / 2) / (W * 0.5));
      // soft halo that intensifies as it centres
      const glow = ctx.createRadialGradient(x, baseY - size * 3, 0, x, baseY - size * 3, 160);
      glow.addColorStop(0, rgb(s.theme.pollen, 0.25 + near * 0.3));
      glow.addColorStop(1, rgb(s.theme.pollen, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(x - 160, baseY - size * 3 - 160, 320, 320);

      const sway = Math.sin(t * 0.7 + s.at * 10) * 7 - travelVel * 80;
      const col = s.theme.flowers[0];
      drawFlower(x, baseY, size * (1 + near * 0.12), col, sway, 1,
        { stem: s.theme.hills[1], center: s.theme.center });

      // little numbered seed-pod marker on the ground
      ctx.save();
      ctx.globalAlpha = 0.5 + near * 0.5;
      ctx.fillStyle = rgb(s.theme.center);
      ctx.beginPath();
      ctx.arc(x, baseY + 6, 5 + near * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /* ---------- petals stream with travel ---------- */
  function drawPetals(th) {
    const stream = travelVel * 900; // forward motion blows petals back
    for (const p of petals) {
      p.sway += 0.02;
      p.x += p.vx + Math.sin(p.sway) * 0.4 - stream;
      p.y += p.vy;
      p.rot += p.vr + travelVel * 6;
      if (p.y > H + 16 || p.x < -40 || p.x > W + 60) {
        Object.assign(p, mkPetal(false));
      }
      const c = th.flowers[p.pIndex % th.flowers.length];
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = p.o;
      ctx.fillStyle = rgb(c);
      ctx.beginPath();
      ctx.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawButterfly(b, th) {
    b.a += b.turn + Math.sin(t * 0.5 + b.x) * 0.01;
    b.turn += rand(-0.004, 0.004);
    b.turn = Math.max(-0.03, Math.min(0.03, b.turn));
    b.x += Math.cos(b.a) * b.sp - travelVel * 300;
    b.y += Math.sin(b.a) * b.sp * 0.6;
    if (b.x < -20) b.x = W + 20;
    if (b.x > W + 20) b.x = -20;
    if (b.y < H * 0.18) b.y = H * 0.18;
    if (b.y > H * 0.82) b.y = H * 0.82;
    b.wing += b.wspeed;

    const flap = Math.abs(Math.sin(b.wing));
    const s = b.size;
    const c = th.flowers[b.pIndex % th.flowers.length];
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.fillStyle = rgb(c, 0.92);
    for (const sgn of [-1, 1]) {
      ctx.save();
      ctx.scale(1, sgn);
      ctx.beginPath();
      ctx.ellipse(s * 0.2, s * (0.2 + flap * 0.5), s * 0.7, s * (0.55 - flap * 0.25), -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-s * 0.25, s * (0.35 + flap * 0.4), s * 0.45, s * (0.4 - flap * 0.18), 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = "rgba(70,45,60,0.85)";
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.12, s * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPointerGlow(th) {
    if (!pointer.active) return;
    pointer.x = lerp(pointer.x, pointer.tx, 0.15);
    pointer.y = lerp(pointer.y, pointer.ty, 0.15);
    const rgrad = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 150);
    rgrad.addColorStop(0, rgb(th.pollen, 0.16));
    rgrad.addColorStop(1, rgb(th.pollen, 0));
    ctx.fillStyle = rgrad;
    ctx.fillRect(pointer.x - 150, pointer.y - 150, 300, 300);
  }

  /* ---------- the travellers: 지영 (girl) + her little follower (baby boy) ---------- */
  function drawHeart(cx, cy, s, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.28);
    ctx.bezierCurveTo(cx + s * 0.5, cy - s * 0.25, cx + s * 0.5, cy + s * 0.34, cx, cy + s * 0.64);
    ctx.bezierCurveTo(cx - s * 0.5, cy + s * 0.34, cx - s * 0.5, cy - s * 0.25, cx, cy + s * 0.28);
    ctx.fill();
    ctx.restore();
  }
  function drawBalloon(hx, hy, S, phase) {
    const bob = Math.sin(t * 1.5 + phase) * S * 0.06;
    const bx = hx - S * 0.05, by = hy - S * 0.92 + bob;
    ctx.strokeStyle = "rgba(120,90,100,0.45)"; ctx.lineWidth = S * 0.012; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.quadraticCurveTo(hx + S * 0.06, hy - S * 0.42, bx, by + S * 0.2);
    ctx.stroke();
    drawHeart(bx, by, S * 0.36, "#ff7d97", 0.96);
    ctx.save(); ctx.globalAlpha = 0.55; ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(bx - S * 0.08, by - S * 0.02, S * 0.045, S * 0.07, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function drawBean(st, x, S, style, th, opts) {
    const boy = style === "boy";
    const groundY = pathY(x) + 4;
    const speed = Math.abs(travelVel);
    const moving = speed > 0.0006;

    // face the way we travel (smoothed; never rest flat)
    const want = travelVel > 0.0005 ? 1 : travelVel < -0.0005 ? -1 : (st.face >= 0 ? 1 : -1);
    st.face += (want - st.face) * (boy ? 0.14 : 0.18);
    const face = Math.abs(st.face) < 0.06 ? (st.face >= 0 ? 0.06 : -0.06) : st.face;

    // walk cadence + bob (the baby toddles quicker, shorter steps)
    st.walk += moving ? Math.min(0.72, (boy ? 0.2 : 0.16) + speed * (boy ? 32 : 26)) : 0;
    const bobY = moving ? -Math.abs(Math.sin(st.walk)) * S * (boy ? 0.07 : 0.06)
                        : -Math.sin(t * (boy ? 2.6 : 2.1)) * S * 0.018;

    // proximity to a 지영 → head bloom (girl) + joy (both)
    let prox = 0;
    for (const s of stations) {
      const d = Math.abs((s.worldX - camera) - x);
      prox = Math.max(prox, 1 - Math.min(1, d / 130));
    }
    const joy = prox * (1 - Math.min(1, speed * 220));
    st.bloom += (prox - st.bloom) * 0.07;
    st.hop += boy ? 0.22 : 0.16;
    const hopY = joy > 0.45 ? -Math.abs(Math.sin(st.hop)) * S * 0.1 * joy : 0;
    // the baby gives a little "wait for me!" hop when 지영 hurries
    const chase = (boy && speed > 0.004) ? -Math.abs(Math.sin(st.hop * 1.2)) * S * 0.06 : 0;

    // blink
    st.blinkCd -= 0.016;
    if (st.blinkCd < 0) {
      st.blink = 1;
      if (st.blinkCd < -0.11) { st.blink = 0; st.blinkCd = 2 + Math.random() * 3.2; }
    }

    const leanX = Math.min(S * 0.13, speed * 240);
    const cream = boy ? "#fff1e6" : "#fff5ee";
    const creamLo = boy ? "#ffdfcb" : "#ffe2d6";
    const leaf = rgb(th.hills[1]);

    // soft ground shadow
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = "rgba(70,45,60,1)";
    ctx.beginPath();
    ctx.ellipse(x, groundY + 6, S * 0.3 - (-bobY) * 0.4, S * 0.085, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(x, groundY + chase);
    ctx.scale(face, 1); // +x is now "forward"

    // legs
    ctx.strokeStyle = creamLo; ctx.lineCap = "round"; ctx.lineWidth = S * (boy ? 0.13 : 0.11);
    for (const i of [-1, 1]) {
      const sw = Math.sin(st.walk + (i < 0 ? 0 : Math.PI)) * (moving ? 1 : 0);
      const lift = Math.max(0, sw) * S * 0.1;
      const lx = i * S * (boy ? 0.1 : 0.11);
      ctx.beginPath();
      ctx.moveTo(lx, bobY + hopY - S * (boy ? 0.13 : 0.16));
      ctx.lineTo(lx + sw * S * 0.05, -lift);
      ctx.stroke();
    }

    // upper body group (bob + joy hop + forward lean)
    ctx.save();
    ctx.translate(leanX, bobY + hopY);

    // arms — inner arm clasps the other's hand; outer arm swings (baby holds a balloon)
    ctx.lineWidth = S * (boy ? 0.1 : 0.085);
    const holdSide = opts ? opts.holdSide : 0;
    for (const i of [-1, 1]) {
      const ax = i * S * (boy ? 0.28 : 0.27), ay = -S * (boy ? 0.42 : 0.5);
      if (opts && i === holdSide) {
        // reach toward the shared clasp point (screen → local)
        const hx = (opts.holdX - x) / face - leanX;
        const hy = opts.holdY - (groundY + chase) - (bobY + hopY);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo((ax + hx) / 2 + i * S * 0.04, (ay + hy) / 2, hx, hy);
        ctx.stroke();
        ctx.fillStyle = creamLo;
        ctx.beginPath();
        ctx.arc(hx, hy, S * (boy ? 0.075 : 0.055), 0, Math.PI * 2);
        ctx.fill();
      } else {
        const sw = Math.sin(st.walk + (i < 0 ? Math.PI : 0)) * (moving ? 1 : 0.25);
        const ey = lerp(ay + S * 0.12 + sw * S * 0.05, ay - S * 0.1, joy);
        const hx = ax + i * S * 0.05 + i * S * 0.04 * joy;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(hx, ey);
        ctx.stroke();
        if (boy) drawBalloon(hx, ey, S, st.hop);
      }
    }

    // body (mochi) — the baby is rounder & chubbier
    const rx = S * (boy ? 0.34 : 0.32), ry = S * (boy ? 0.34 : 0.36), cyB = -S * (boy ? 0.36 : 0.42);
    const bg = ctx.createLinearGradient(0, cyB - ry, 0, cyB + ry);
    bg.addColorStop(0, cream); bg.addColorStop(1, creamLo);
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.ellipse(0, cyB, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // cheeks (rosier on the baby)
    ctx.fillStyle = "rgba(255,150,180,0.82)";
    const chR = S * (boy ? 0.09 : 0.07), chY = cyB + S * 0.02;
    for (const i of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(i * S * (boy ? 0.2 : 0.19), chY, chR, chR * 0.78, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // eyes (baby = bigger, rounder) + sparkle + blink
    const eyeY = cyB - S * 0.06;
    const eR = S * (boy ? 0.06 : 0.045);
    ctx.fillStyle = "#5a3b4a";
    const eo = st.blink ? 0.12 : 1;
    for (const i of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(i * S * 0.1 + S * 0.03, eyeY, eR, eR * 1.1 * eo, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!st.blink) {
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      for (const i of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(i * S * 0.1 + S * 0.05, eyeY - S * 0.02, S * (boy ? 0.02 : 0.013), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // girl eyelashes — thin, short, lifted C-curl
    if (!boy && !st.blink) {
      ctx.strokeStyle = "#5a3b4a"; ctx.lineWidth = S * 0.009; ctx.lineCap = "round";
      for (const i of [-1, 1]) {
        const ex = i * S * 0.1 + S * 0.03;
        for (const k of [0, 1]) {
          const bx = ex + i * (S * 0.032 + k * S * 0.016);
          const by = eyeY - S * 0.034;
          // bow outward then lift the tip up & back → a curled "C"
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.quadraticCurveTo(bx + i * S * 0.024, by - S * 0.004, bx + i * S * 0.01, by - S * 0.028);
          ctx.stroke();
        }
      }
    }

    // mouth
    const mY = cyB + S * 0.07;
    if (joy > 0.45) {
      ctx.fillStyle = "#c76b7e";
      ctx.beginPath();
      ctx.ellipse(S * 0.03, mY, S * 0.05, S * 0.058, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (boy) {
      ctx.fillStyle = "#c76b7e"; // a little babbling "o"
      ctx.beginPath();
      ctx.ellipse(S * 0.03, mY, S * 0.034, S * 0.038, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = "#9a5b6e"; ctx.lineWidth = S * 0.022; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(S * 0.03, mY - S * 0.03, S * 0.05, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }

    // head decoration
    const headTop = cyB - ry;
    if (boy) {
      // a single baby hair curl (cowlick)
      ctx.strokeStyle = "#b98a5e"; ctx.lineWidth = S * 0.05; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(S * 0.02, headTop + S * 0.03);
      ctx.quadraticCurveTo(S * 0.18, headTop - S * 0.1, S * 0.0, headTop - S * 0.16);
      ctx.quadraticCurveTo(-S * 0.12, headTop - S * 0.18, -S * 0.02, headTop - S * 0.04);
      ctx.stroke();
    } else {
      // 지영's sprout — blooms in the mood colour near a 지영
      const sway = Math.sin(t * 1.6) * S * 0.03;
      const topY = headTop - S * 0.2;
      ctx.strokeStyle = leaf; ctx.lineWidth = S * 0.04; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, headTop + S * 0.02);
      ctx.quadraticCurveTo(sway * 0.5, headTop - S * 0.1, sway, topY);
      ctx.stroke();
      ctx.fillStyle = leaf;
      for (const i of [-1, 1]) {
        ctx.save();
        ctx.translate(sway * 0.6, headTop - S * 0.1);
        ctx.rotate(i * 0.8 + sway * 0.02);
        ctx.beginPath();
        ctx.ellipse(i * S * 0.055, 0, S * 0.07, S * 0.034, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      const b = st.bloom;
      if (b > 0.06) {
        ctx.save();
        ctx.translate(sway, topY);
        ctx.scale(b, b);
        const fc = th.flowers[0];
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + t * 0.4;
          ctx.save();
          ctx.translate(Math.cos(a) * S * 0.07, Math.sin(a) * S * 0.07);
          ctx.fillStyle = rgb(fc);
          ctx.beginPath();
          ctx.ellipse(0, 0, S * 0.055, S * 0.038, a, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = rgb(th.center);
        ctx.beginPath();
        ctx.arc(0, 0, S * 0.045, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = rgb(th.flowers[0]);
        ctx.beginPath();
        ctx.arc(sway, topY, S * 0.04, 0, Math.PI * 2);
        ctx.fill();
      }
      // a little flower hairpin (girl cue)
      ctx.save();
      ctx.translate(S * 0.19, headTop + S * 0.06);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.fillStyle = "#ff9ec0";
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * S * 0.045, Math.sin(a) * S * 0.045, S * 0.032, S * 0.02, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#fff0a6";
      ctx.beginPath();
      ctx.arc(0, 0, S * 0.022, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore(); // upper body
    ctx.restore(); // whole bean
  }

  function drawTraveler(th) {
    const small = W < 600;
    const Sj = small ? 90 : 116;
    const Sb = Sj * 0.5;
    const cxj = W * (small ? 0.5 : 0.44);
    // the baby trails just beside her, on the side away from travel
    const faceSign = travA.face >= 0 ? 1 : -1;
    const targetCxb = cxj - faceSign * Sj * 0.5;
    if (travB.x === undefined) travB.x = targetCxb;
    travB.x += (targetCxb - travB.x) * 0.12;

    const groundJ = pathY(cxj) + 4;
    const groundB = pathY(travB.x) + 4;
    // a shared clasp point between them (around the baby's hand height)
    const hold = { holdX: (cxj + travB.x) / 2, holdY: Math.max(groundJ, groundB) - Sb * 0.42 };
    drawBean(travB, travB.x, Sb, "boy", th, { ...hold, holdSide: 1 });  // follower (behind)
    drawBean(travA, cxj, Sj, "girl", th, { ...hold, holdSide: -1 });    // 지영 (in front)

    // every now and then they pass a little heart between them
    heartCd -= 0.016;
    if (heartCd < 0) {
      heartCd = 2.6 + Math.random() * 1.8;
      const fromJ = Math.random() < 0.5;
      const hj = { x: cxj, y: groundJ - Sj * 0.98 };
      const hb = { x: travB.x, y: groundB - Sb * 0.98 };
      const s = fromJ ? hj : hb, d = fromJ ? hb : hj;
      hearts.push({ x0: s.x, y0: s.y, x1: d.x, y1: d.y, t: 0, dur: 1.5 });
    }
    for (let i = hearts.length - 1; i >= 0; i--) {
      const h = hearts[i];
      h.t += 0.016 / h.dur;
      if (h.t >= 1) { hearts.splice(i, 1); continue; }
      const u = 1 - h.t;
      const mx = (h.x0 + h.x1) / 2, my = Math.min(h.y0, h.y1) - 46;
      const hx = u * u * h.x0 + 2 * u * h.t * mx + h.t * h.t * h.x1;
      const hy = u * u * h.y0 + 2 * u * h.t * my + h.t * h.t * h.y1;
      const pop = Math.sin(h.t * Math.PI);
      drawHeart(hx, hy, 13 * pop + 4, "#ff6f93", 0.9 * pop);
    }
  }

  /* ---------- render one frame ---------- */
  function render(progress, vel) {
    t += 0.016;
    camera = clamp01(progress) * TRAVEL;
    // smooth the velocity used for visual motion
    travelVel = lerp(travelVel, vel || 0, 0.2);
    let th = themeAt(clamp01(progress));
    if (!th) return;
    // map-hover colour peek
    previewAmt += ((previewOn ? 1 : 0) - previewAmt) * 0.12;
    if (previewTheme && previewAmt > 0.002) th = blendTheme(th, previewTheme, previewAmt);

    drawSky(th, clamp01(progress));
    drawClouds(th);
    hill(HORIZON, th.hills[0], 18, 240, 0.28, 0);
    hill(HORIZON + 0.08, th.hills[1], 26, 320, 0.45, 2.0);
    drawPath(th);
    drawField(th);
    drawStations(th);
    drawTraveler(th);
    drawPointerGlow(th);
    drawPetals(th);
    for (const b of butterflies) drawButterfly(b, th);
  }

  /* ---------- click petal burst ---------- */
  function pulse(x, y) {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(0.5, 2.4);
      petals.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.5,
        r: rand(3, 7), rot: rand(0, 6), vr: rand(-0.1, 0.1),
        sway: rand(0, 6), pIndex: (Math.random() * 5) | 0, o: 0.95,
      });
    }
    if (petals.length > 150) petals.splice(0, petals.length - 150);
  }

  /* ---------- screen X of a station (for UI alignment) ---------- */
  function stationScreenX(at) {
    return (at * TRAVEL + W / 2) - camera;
  }

  /* ---------- map hover: peek a mood colour (null to clear) ---------- */
  function preview(theme) {
    if (theme) { previewTheme = mkTheme(theme); previewOn = true; }
    else previewOn = false;
  }

  function init(el) {
    canvas = el;
    ctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", debounce(resize, 200));
    window.addEventListener("pointermove", (e) => {
      pointer.tx = e.clientX; pointer.ty = e.clientY; pointer.active = true;
      if (pointer.x < 0) { pointer.x = e.clientX; pointer.y = e.clientY; }
    });
    window.addEventListener("pointerleave", () => (pointer.active = false));
  }
  function debounce(fn, ms) {
    let id; return function () { clearTimeout(id); id = setTimeout(fn, ms); };
  }

  return { init, configure, render, pulse, preview, stationScreenX, TRAVEL };
})();

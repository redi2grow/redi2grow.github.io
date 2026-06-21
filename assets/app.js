/* =========================================================
   지영's 꽃밭 — the journey
   One continuous world. You travel through it (scroll / drag /
   arrows / trail map). The 7 지영s are stations along the path;
   arrive at one and its story blooms open.
   ========================================================= */
(function () {
  "use strict";

  /* ---------- the seven 지영s, placed along the path ---------- */
  const STATIONS = [
    {
      at: 0.12, num: "01", ko: "입사 전", en: "Everyone has their own timing.",
      teaser: "아직 아무것도 정해지지 않았던 시절의 지영.",
      theme: {
        sky: ["#ffe0d6", "#ffeede", "#fff6ec"], sun: "#fff0d0", sunGlow: "#ffc89a",
        hills: ["#d6ebb8", "#aedd9a"],
        flowers: ["#ff9e86", "#ffb59e", "#ffd29a", "#ffc0a8", "#ff8f9e"],
        center: "#ffd87a", pollen: "#ffe3b8",
      },
    },
    {
      at: 0.25, num: "02", ko: "서울 근무", en: "Burn the candle at both ends.",
      teaser: "양 끝에서 촛불을 태우던 서울의 지영.",
      theme: {
        sky: ["#ffd1c0", "#ffd8b0", "#ffe9c2"], sun: "#ffe3a0", sunGlow: "#ff9d5c",
        hills: ["#d9d088", "#bcae5e"],
        flowers: ["#ff6b6b", "#ff8e53", "#ffb24d", "#ff7a9c", "#ffd166"],
        center: "#ffcf5c", pollen: "#ffd28a",
      },
    },
    {
      at: 0.38, num: "03", ko: "건강이 제일", en: "Don't take your health for granted.",
      teaser: "몸이 보내온 신호 앞에 멈춰 선 지영.",
      theme: {
        sky: ["#d6f0e6", "#e4f6ec", "#f1faf0"], sun: "#eaffe0", sunGlow: "#aee5b0",
        hills: ["#bfe6bf", "#8fd49a"],
        flowers: ["#7fd6a8", "#a8e6b0", "#cfeede", "#9ad6c2", "#bfe0a0"],
        center: "#ffe98a", pollen: "#d6f0c0",
      },
    },
    {
      at: 0.51, num: "04", ko: "오사카 근무", en: "Turn the tables.",
      teaser: "판을 뒤집어 본 오사카의 지영.",
      theme: {
        sky: ["#cfeaf2", "#dcf0f4", "#eef8f6"], sun: "#e6fbff", sunGlow: "#8fd6e0",
        hills: ["#bfe3cf", "#93cfc0"],
        flowers: ["#5fc6d6", "#7fd0e0", "#9fdcd0", "#6fb8e0", "#8fd0c0"],
        center: "#ffe07a", pollen: "#cfeef0",
      },
    },
    {
      at: 0.64, num: "05", ko: "창원 근무", en: "Bloom where you are planted.",
      teaser: "심어진 자리에서 피어난 창원의 지영.",
      theme: {
        sky: ["#e6dcf2", "#efe4f6", "#f7eef8"], sun: "#f4e6ff", sunGlow: "#c6a8e6",
        hills: ["#cfe0c0", "#a7cf9a"],
        flowers: ["#b79ee6", "#c8b0ee", "#d8c0f0", "#a890e0", "#e0a8d8"],
        center: "#ffe07a", pollen: "#e6d6f0",
      },
    },
    {
      at: 0.77, num: "06", ko: "외국어 및 자격증", en: "Add another string to your bow.",
      teaser: "활시위에 화살을 더하던 지영.",
      theme: {
        sky: ["#fff0cf", "#fff6dc", "#fffbee"], sun: "#fff6cf", sunGlow: "#ffd86e",
        hills: ["#d8da8a", "#bcc066"],
        flowers: ["#ffcf4d", "#ffd970", "#ffe49a", "#ffc04d", "#ffdf80"],
        center: "#ff9e4d", pollen: "#fff0b0",
      },
    },
    {
      at: 0.90, num: "07", ko: "벼랑 끝 — 일·가정 양립", en: "Between a rock and a hard place.",
      teaser: "양립할 수 없는 것들 사이, 벼랑 끝의 지영.",
      theme: {
        sky: ["#d9b0c8", "#c89cc0", "#bf9ec0"], sun: "#ffd0c0", sunGlow: "#e08fb0",
        hills: ["#b8c0a0", "#94a880"],
        flowers: ["#d96b9c", "#c85f8e", "#e08fb0", "#b85fa0", "#ff8fae"],
        center: "#ffd27a", pollen: "#f0c0d8",
      },
    },
  ];

  const $ = (s, r = document) => r.querySelector(s);
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const lerp = (a, b, t) => a + (b - a) * t;

  // little flower used on the map cards
  function flowerSVG(petal, center) {
    let petals = "";
    for (let i = 0; i < 6; i++) {
      petals += `<ellipse cx="50" cy="28" rx="11" ry="20" transform="rotate(${60 * i} 50 50)" fill="${petal}" opacity="0.92"/>`;
    }
    return `<svg viewBox="0 0 100 100" aria-hidden="true"><g>${petals}<circle cx="50" cy="50" r="11" fill="${center}"/><circle cx="50" cy="50" r="6" fill="${shade(center, -0.25)}"/></g></svg>`;
  }
  function shade(hex, amt) {
    hex = hex.replace("#", "");
    const n = parseInt(hex, 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      .map((v) => Math.max(0, Math.min(255, v + amt * 255)) | 0);
    return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
  }

  /* ---------- journey state ---------- */
  let progress = 0, target = 0, vel = 0, prevProgress = 0;
  let started = false, reading = false, dragging = false, mapOpen = false;
  let lastX = 0, dragMoved = 0;
  let shownStation = null, endShown = false;
  const visited = new Set();

  /* ---------- elements ---------- */
  const intro = $("#intro");
  const hud = $("#hud");
  const travelHint = $("#travel-hint");
  const panel = $("#station-panel");
  const chapter = $("#chapter");
  let hintTimer = 0;

  /* ---------- helpers ---------- */
  function nearestStation(p) {
    let best = STATIONS[0], bd = 1e9;
    for (const s of STATIONS) {
      const d = Math.abs(p - s.at);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  function nextStationAt(p) {
    for (const s of STATIONS) if (s.at > p + 0.01) return s.at;
    return 1;
  }
  function prevStationAt(p) {
    for (let i = STATIONS.length - 1; i >= 0; i--)
      if (STATIONS[i].at < p - 0.01) return STATIONS[i].at;
    return 0;
  }
  function travelTo(at) { target = clamp01(at); vel = 0; hideHint(); }

  /* ---------- build trail map ---------- */
  function buildTrail() {
    const trail = $("#trail");
    trail.innerHTML = '<div class="trail-line"></div><div class="trail-fill" id="trail-fill"></div><div class="trail-marker" id="trail-marker"></div>';
    STATIONS.forEach((s, i) => {
      const node = document.createElement("button");
      node.className = "trail-node";
      node.type = "button";
      node.style.left = s.at * 100 + "%";
      node.style.setProperty("--c", s.theme.flowers[0]);
      node.setAttribute("aria-label", s.num + " " + s.ko);
      node.innerHTML = `<span class="trail-dot"></span><span class="trail-tip">${s.ko}</span>`;
      node.addEventListener("click", () => travelTo(s.at));
      s._node = node;
      trail.appendChild(node);
    });
  }

  /* ---------- the 지영 map (free navigation) ---------- */
  function buildMap() {
    const grid = $("#map-grid");
    grid.innerHTML = "";
    STATIONS.forEach((s, i) => {
      const card = document.createElement("button");
      card.className = "map-card";
      card.type = "button";
      card.setAttribute("role", "listitem");
      card.innerHTML = `
        <span class="map-num">${s.num}</span>
        <span class="map-flower">${flowerSVG(s.theme.flowers[0], s.theme.center)}</span>
        <span class="map-ko">${s.ko}</span>
        <span class="map-en">${s.en}</span>`;
      card.addEventListener("click", () => { closeMap(); openChapter(i); });
      card.addEventListener("mouseenter", () => Garden.preview(s.theme));
      card.addEventListener("mouseleave", () => Garden.preview(null));
      card.addEventListener("focus", () => Garden.preview(s.theme));
      card.addEventListener("blur", () => Garden.preview(null));
      grid.appendChild(card);
    });
  }
  function openMap() {
    if (!started) startJourney();
    hideHint();
    hidePanel();
    mapOpen = true;
    const map = $("#map");
    map.hidden = false;
    requestAnimationFrame(() => map.classList.add("show"));
  }
  function closeMap() {
    mapOpen = false;
    Garden.preview(null);
    const map = $("#map");
    map.classList.remove("show");
    setTimeout(() => { if (!mapOpen) map.hidden = true; }, 460);
  }

  /* ---------- station panel ---------- */
  function showPanel(s) {
    visited.add(s.num);
    if (s._node) s._node.classList.add("seen");
    panel.querySelector(".station-num").textContent = s.num;
    panel.querySelector(".station-ko").textContent = s.ko;
    panel.querySelector(".station-en").textContent = s.en;
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add("show"));
    shownStation = s;
  }
  function hidePanel() {
    if (!shownStation && panel.hidden) return;
    panel.classList.remove("show");
    shownStation = null;
    setTimeout(() => { if (!shownStation) panel.hidden = true; }, 420);
  }

  /* ---------- chapter (story) ---------- */
  let chapterIdx = 0;
  function openChapter(i) {
    chapterIdx = (i + STATIONS.length) % STATIONS.length;
    const s = STATIONS[chapterIdx];
    reading = true;
    target = s.at; // be there when we close
    $("#chapter-index").textContent = s.num;
    $("#chapter-title").textContent = s.ko;
    $("#chapter-quote").textContent = s.en;
    $("#chapter-body").innerHTML = `
      <p>${s.teaser}</p>
      <p>여기에 이 지영의 이야기가 들어갈 거예요. 그때의 마음, 결정, 그리고 배운 것들 —
         한 송이씩 천천히 채워 나가요.</p>
      <p><span class="chapter-placeholder">🌱 스토리라인 업댓 예정</span></p>`;
    hidePanel();
    chapter.hidden = false;
    requestAnimationFrame(() => chapter.classList.add("show"));
  }
  function closeChapter() {
    chapter.classList.remove("show");
    setTimeout(() => (chapter.hidden = true), 500);
    reading = false;
    shownStation = null; // allow panel to re-bloom
  }

  /* ---------- recommendation ---------- */
  function recommend() {
    let pick = STATIONS.find((s) => !visited.has(s.num)) || nearestStation(Math.random());
    hideHint();
    travelTo(pick.at);
    if (pick._node) {
      pick._node.classList.add("pulse");
      setTimeout(() => pick._node.classList.remove("pulse"), 1200);
    }
  }

  /* ---------- end note ---------- */
  function showEnd() {
    if (endShown) return;
    endShown = true;
    panel.querySelector(".station-num").textContent = "✿";
    panel.querySelector(".station-ko").textContent = "여행의 끝";
    panel.querySelector(".station-en").textContent = "또 다른 꽃이 피어날 거예요. 처음으로 돌아갈까요?";
    $("#station-open").textContent = "처음으로 ↺";
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add("show"));
    shownStation = { _end: true };
  }

  /* ---------- hint ---------- */
  function showHint() {
    travelHint.hidden = false;
    requestAnimationFrame(() => travelHint.classList.add("show"));
    clearTimeout(hintTimer);
    hintTimer = setTimeout(hideHint, 7000);
  }
  function hideHint() {
    travelHint.classList.remove("show");
    setTimeout(() => (travelHint.hidden = true), 600);
  }

  /* ---------- start ---------- */
  function startJourney() {
    if (started) return;
    started = true;
    intro.classList.add("leaving");
    setTimeout(() => (intro.hidden = true), 900);
    hud.hidden = false;
    requestAnimationFrame(() => hud.classList.add("show"));
    showHint();
    target = 0.05; // a gentle first step forward
  }

  /* ---------- controls ---------- */
  function bindControls() {
    window.addEventListener("wheel", (e) => {
      if (!started || reading || mapOpen) return;
      e.preventDefault();
      const d = (Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX);
      target = clamp01(target + d * 0.00038);
      vel = 0;
      hideHint();
    }, { passive: false });

    window.addEventListener("pointerdown", (e) => {
      if (!started || reading || mapOpen) return;
      if (e.target.closest("button, .overlay, .hud, .station-panel, .topbar, a")) return;
      dragging = true; lastX = e.clientX; dragMoved = 0; vel = 0;
    });
    window.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      dragMoved += Math.abs(dx);
      target = clamp01(target - dx * 0.0012);
      vel = -dx * 0.0012 * 0.6;
      hideHint();
    });
    window.addEventListener("pointerup", (e) => {
      if (dragging && dragMoved < 5) Garden.pulse(e.clientX, e.clientY);
      dragging = false;
    });

    window.addEventListener("keydown", (e) => {
      if (!started) { if (e.key === "Enter" || e.key === " ") startJourney(); return; }
      if (mapOpen) { if (e.key === "Escape") closeMap(); return; }
      if (reading) { if (e.key === "Escape") closeChapter(); return; }
      switch (e.key) {
        case "ArrowRight": case "ArrowDown": case " ":
          e.preventDefault(); travelTo(nextStationAt(progress)); break;
        case "ArrowLeft": case "ArrowUp":
          e.preventDefault(); travelTo(prevStationAt(progress)); break;
        case "Home": travelTo(0); break;
        case "End": travelTo(STATIONS[STATIONS.length - 1].at); break;
        case "Escape": travelTo(0); break;
      }
    });

    $("#start-btn").addEventListener("click", startJourney);
    $("#go-next").addEventListener("click", () => travelTo(nextStationAt(progress)));
    $("#go-prev").addEventListener("click", () => travelTo(prevStationAt(progress)));
    $("#recommend").addEventListener("click", openMap);
    $("#intro-map").addEventListener("click", openMap);
    $("#map-close").addEventListener("click", closeMap);
    $("#map-rec").addEventListener("click", () => { closeMap(); recommend(); });
    $("#station-open").addEventListener("click", () => {
      if (shownStation && shownStation._end) { endShown = false; $("#station-open").textContent = "이야기 열기 ✿"; hidePanel(); travelTo(0); return; }
      if (shownStation) openChapter(STATIONS.indexOf(shownStation));
    });
    $("#chapter-back").addEventListener("click", closeChapter);
    $("#chapter-prev").addEventListener("click", () => openChapter(chapterIdx - 1));
    $("#chapter-next").addEventListener("click", () => openChapter(chapterIdx + 1));
    $("#home-btn").addEventListener("click", () => { closeChapter(); travelTo(0); });
    $("#sound-btn").addEventListener("click", toggleSound);
  }

  /* ---------- main loop ---------- */
  function loop() {
    requestAnimationFrame(loop);

    // inertia + smoothing
    if (!dragging) { target = clamp01(target + vel); vel *= 0.90; }
    // magnetic stations: gently rest at a 지영 when nearly still
    if (started && !dragging && !reading && Math.abs(vel) < 0.0009) {
      const s = nearestStation(target);
      const dd = s.at - target;
      if (Math.abs(dd) < 0.06) target += dd * 0.08;
    }
    progress += (target - progress) * 0.12;
    const dv = progress - prevProgress;
    prevProgress = progress;

    Garden.render(progress, dv);
    updateHud(dv);
  }

  function updateHud(dv) {
    if (!started) return;
    const marker = $("#trail-marker");
    const fill = $("#trail-fill");
    if (marker) marker.style.left = progress * 100 + "%";
    if (fill) fill.style.width = progress * 100 + "%";

    // arrival → panel
    if (reading || mapOpen) return;
    if (progress > 0.962) { showEnd(); return; }
    if (endShown && progress <= 0.962) { endShown = false; $("#station-open").textContent = "이야기 열기 ✿"; hidePanel(); }

    const s = nearestStation(progress);
    const atStation = Math.abs(progress - s.at) < 0.018 && Math.abs(dv) < 0.0016;
    STATIONS.forEach((st) => st._node && st._node.classList.toggle("active", st === s && atStation));

    if (atStation && shownStation !== s && !endShown) showPanel(s);
    else if (!atStation && shownStation && !shownStation._end) hidePanel();
  }

  /* ---------- ambient sound (optional, lazy) ---------- */
  let audio = null, soundOn = false;
  function toggleSound() {
    const btn = $("#sound-btn");
    soundOn = !soundOn;
    btn.setAttribute("aria-pressed", String(soundOn));
    btn.querySelector(".sound-on").hidden = !soundOn;
    btn.querySelector(".sound-off").hidden = soundOn;
    if (soundOn) startAudio();
    else if (audio) audio.gain.gain.linearRampToValueAtTime(0, audio.ctx.currentTime + 0.6);
  }
  function startAudio() {
    if (!audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const gain = ctx.createGain(); gain.gain.value = 0;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900;
      gain.connect(ctx.destination); lp.connect(gain);
      [220, 277.18, 329.63].forEach((f, i) => {
        const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f;
        o.detune.value = (i - 1) * 6;
        const og = ctx.createGain(); og.gain.value = i === 0 ? 0.5 : 0.3;
        o.connect(og); og.connect(lp); o.start();
      });
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08;
      const lfoG = ctx.createGain(); lfoG.gain.value = 0.025;
      lfo.connect(lfoG); lfoG.connect(gain.gain); lfo.start();
      audio = { ctx, gain };
    }
    if (audio.ctx.state === "suspended") audio.ctx.resume();
    audio.gain.gain.cancelScheduledValues(audio.ctx.currentTime);
    audio.gain.gain.linearRampToValueAtTime(0.07, audio.ctx.currentTime + 1.2);
  }

  /* ---------- boot ---------- */
  function boot() {
    Garden.init($("#garden"));
    Garden.configure(STATIONS);
    buildTrail();
    buildMap();
    bindControls();
    // reveal intro
    $$reveal(intro);
    requestAnimationFrame(loop);
  }
  function $$reveal(scope) {
    scope.querySelectorAll(".reveal").forEach((r) => {
      const d = parseFloat(r.dataset.delay || 0);
      setTimeout(() => r.classList.add("show"), 160 + d * 150);
    });
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

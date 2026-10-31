// PROTOTYPE — Pax Beratercharakter rig ("Soft Block"). Framework-free so it can be
// wrapped in an Angular component later. Classic script: works from file:// too.
//
//   const avatar = PaxAvatar.mount(document.getElementById("host"));
//   avatar.setEmotion("happy");
//   avatar.attachStream(remoteAudioStream);   // body squashes with the voice
//   avatar.setLevelSource(() => 0.4);         // or any custom 0..1 level
(function () {
  const SVG = `
  <svg viewBox="0 0 200 200" aria-label="Pax Beratercharakter" style="width:100%;height:auto;overflow:visible">
    <defs>
      <radialGradient id="paxBody" cx="35%" cy="28%" r="85%">
        <stop offset="0" stop-color="#d4f08f" />
        <stop offset=".45" stop-color="#9acb41" />
        <stop offset="1" stop-color="#6f9c25" />
      </radialGradient>
      <filter id="paxSoft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5" /></filter>
      <mask id="paxMaskL" maskUnits="userSpaceOnUse" x="-50" y="-50" width="300" height="300">
        <rect x="-50" y="-50" width="300" height="300" fill="#fff" />
        <rect data-part="lidL" fill="#000" /><circle data-part="lowL" fill="#000" />
      </mask>
      <mask id="paxMaskR" maskUnits="userSpaceOnUse" x="-50" y="-50" width="300" height="300">
        <rect x="-50" y="-50" width="300" height="300" fill="#fff" />
        <rect data-part="lidR" fill="#000" /><circle data-part="lowR" fill="#000" />
      </mask>
    </defs>
    <ellipse data-part="shadow" cx="100" cy="172" rx="48" ry="7" fill="rgba(54,5,115,.18)" />
    <g data-part="char">
      <rect x="40" y="40" width="120" height="120" rx="34" fill="url(#paxBody)" />
      <ellipse cx="72" cy="62" rx="22" ry="11" fill="#fff" opacity=".35" transform="rotate(-20 72 62)" />
      <ellipse data-part="blushL" cx="66" cy="118" rx="10" ry="5" fill="#ff8fb1" filter="url(#paxSoft)" />
      <ellipse data-part="blushR" cx="134" cy="118" rx="10" ry="5" fill="#ff8fb1" filter="url(#paxSoft)" />
      <g fill="#360573">
        <rect data-part="eyeL" mask="url(#paxMaskL)" />
        <rect data-part="eyeR" mask="url(#paxMaskR)" />
      </g>
    </g>
    <g data-part="dots" fill="#360573"><circle r="3.2" /><circle r="4.2" /><circle r="5.4" /></g>
    <g data-part="sparkles" fill="#9acb41"></g>
  </svg>`;

  // ---------- Rig dimensions (viewBox units) ----------
  const EYE = { w: 8.5, h: 13, rx: 8.5 };

  // ---------- Emotions: target values for the rig ----------
  // gx/gy gaze (-1..1), open (eye height), size (eye scale), lidA (deg, + = droopy/sad outer corners),
  // lidD (upper lid drop 0..1), smile (lower lid push → ^^ eyes), squint (extra lid on right eye),
  // sx/sy body scale, rot body tilt, ty body lift, hop (bounce amount), blush, dots, sparkles
  const BASE = { gx:0, gy:0, open:1, size:1, lidA:0, lidD:0, smile:0, squint:0, sx:1, sy:1, rot:0, ty:0, hop:0, blush:0, dots:0, sparkles:0 };
  const EMOTIONS = {
    neutral:     { label: "Neutral" },
    listening:   { label: "Zuhören",      gy:-.1, open:1.06, size:1.08, rot:5, ty:-2 },
    thinking:    { label: "Nachdenken",   gx:.75, gy:-.8, open:.92, lidD:.12, squint:.35, rot:-5, dots:1 },
    happy:       { label: "Freude",       smile:.85, sy:1.02, hop:.5, blush:.6 },
    empathetic:  { label: "Mitgefühl",    gy:.4, lidA:22, lidD:.38, smile:.2, size:.95, sx:1.03, sy:.96, ty:3, blush:.25 },
    concerned:   { label: "Besorgt",      gx:-.25, gy:.1, lidA:26, lidD:.2, open:1.1, sx:.98, sy:.97, rot:-3 },
    surprised:   { label: "Überrascht",   open:1.3, size:1.22, sx:.95, sy:1.08, ty:-6 },
    celebrating: { label: "Abschluss 🎉", smile:1, size:1.08, hop:1.4, blush:.8, sparkles:1 },
  };

  const set = (el, attrs) => { for (const k in attrs) el.setAttribute(k, attrs[k]); };

  function mount(host, { onFrame } = {}) {
    host.innerHTML = SVG;
    const part = (name) => host.querySelector(`[data-part="${name}"]`);
    const P = {};
    for (const n of ["shadow", "char", "blushL", "blushR", "eyeL", "eyeR", "lidL", "lidR", "lowL", "lowR", "dots", "sparkles"]) P[n] = part(n);

    let emotion = "neutral";
    const cur = { ...BASE };
    let level = 0, levelSource = () => 0;
    let analyser = null, audioCtx = null, buf = null;
    let blinkT = 0, nextBlink = 2, saccade = { x: 0, y: 0 }, nextSaccade = 1.5;
    let pop = 0, popV = 0;   // spring impulse on emotion change
    const sparkles = [];

    function setEmotion(key) {
      if (!EMOTIONS[key] || key === emotion) return false;
      emotion = key; popV += 2.2;
      return true;
    }
    function setLevelSource(fn) { levelSource = fn || (() => 0); }
    // Speech level from any MediaStream, e.g. the remote track of an OpenAI Realtime WebRTC call.
    // Chrome only delivers samples from a remote WebRTC stream if it is also played by an <audio> element.
    function attachStream(stream) {
      audioCtx = audioCtx || new AudioContext();
      if (audioCtx.state === "suspended") audioCtx.resume();
      analyser = audioCtx.createAnalyser(); analyser.fftSize = 1024;
      buf = new Float32Array(analyser.fftSize);
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      setLevelSource(() => {
        analyser.getFloatTimeDomainData(buf);
        let s = 0; for (const x of buf) s += x * x;
        return Math.min(1, Math.sqrt(s / buf.length) * 7);
      });
    }

    function spawnSparkle() {
      const a = Math.random() * Math.PI * 2, r = 70 + Math.random() * 25;
      const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
      el.setAttribute("d", "M0,-6 L1.6,-1.6 6,0 1.6,1.6 0,6 -1.6,1.6 -6,0 -1.6,-1.6Z");
      P.sparkles.appendChild(el);
      sparkles.push({ el, x: 100 + Math.cos(a) * r, y: 100 + Math.sin(a) * r, life: 1, s: .6 + Math.random() * .8 });
    }

    let last = performance.now(), t = 0, raf = 0;
    function frame(now) {
      const dt = Math.min(.05, (now - last) / 1000); last = now; t += dt;
      const target = { ...BASE, ...EMOTIONS[emotion] };
      const k = 1 - Math.exp(-dt * 7);
      for (const key in BASE) cur[key] += (target[key] - cur[key]) * k;

      // speech level with fast attack / slow release
      const raw = levelSource(dt);
      level += (raw - level) * (1 - Math.exp(-dt * (raw > level ? 30 : 10)));

      // emotion-change pop (damped spring)
      popV += (-pop * 120 - popV * 12) * dt; pop += popV * dt;

      // blink
      blinkT += dt; let blink = 1;
      if (blinkT > nextBlink) { const p = (blinkT - nextBlink) / .14; blink = p < 1 ? Math.abs(1 - 2 * p) : 1;
        if (p >= 1) { blinkT = 0; nextBlink = 2 + Math.random() * 3.5; } }
      // micro saccades when idle-ish
      nextSaccade -= dt;
      if (nextSaccade < 0) { saccade = { x: (Math.random() - .5) * .5, y: (Math.random() - .5) * .3 }; nextSaccade = 1 + Math.random() * 2.5; }
      const idleGaze = emotion === "thinking" || emotion === "surprised" ? 0 : 1;

      // body
      const breathe = Math.sin(t * 2.1) * .012;
      const hop = cur.hop * Math.max(0, Math.sin(t * 7)) * 7;
      const sway = Math.sin(t * 1.3) * 1.2;
      const sy = cur.sy + breathe + level * .09 + pop * .06;
      const sx = cur.sx - breathe * .6 - level * .045 - pop * .03;
      const ty = cur.ty - hop - level * 4;
      const rot = cur.rot + sway + (emotion === "celebrating" ? Math.sin(t * 9) * 4 : 0);
      P.char.setAttribute("transform", `translate(100 ${160 + ty}) rotate(${rot}) scale(${sx} ${sy}) translate(-100 -160)`);
      set(P.shadow, { rx: 48 * (1 - (-ty) / 60) * sx, opacity: 1 - Math.min(.6, -ty / 30) });
      P.blushL.setAttribute("opacity", cur.blush * .55); P.blushR.setAttribute("opacity", cur.blush * .55);

      // eyes
      const gx = (cur.gx + saccade.x * idleGaze) * 9, gy = (cur.gy + saccade.y * idleGaze) * 7 - level * 1.5;
      for (const side of ["L", "R"]) {
        const sign = side === "L" ? -1 : 1;
        const cx = 100 + sign * 22 + gx, cy = 98 + gy;
        const w = EYE.w * cur.size, h = EYE.h * cur.size * cur.open * blink;
        set(P["eye" + side], { x: cx - w, y: cy - h, width: w * 2, height: Math.max(.6, h * 2), rx: Math.min(EYE.rx * cur.size, w, h) });
        const drop = cur.lidD + (side === "R" ? cur.squint : 0);
        const lidY = cy - h + drop * 2 * h;
        set(P["lid" + side], { x: cx - 30, y: lidY - 40, width: 60, height: 40,
          transform: `rotate(${sign * cur.lidA} ${cx} ${lidY})` });
        const r = w * 1.25;
        set(P["low" + side], { cx, cy: cy + h + r - cur.smile * h * 1.45, r });
      }

      // thinking dots
      const dots = P.dots.children;
      for (let i = 0; i < 3; i++) set(dots[i], { cx: 160 + i * 11, cy: 42 - i * 10 + Math.sin(t * 4 + i) * 2, opacity: cur.dots * (.5 + .5 * Math.sin(t * 5 - i)) });

      // sparkles
      if (cur.sparkles > .5 && Math.random() < dt * 9) spawnSparkle();
      for (let i = sparkles.length - 1; i >= 0; i--) {
        const s = sparkles[i]; s.life -= dt * 1.2; s.y -= dt * 18;
        set(s.el, { transform: `translate(${s.x} ${s.y}) scale(${s.s * Math.sin(Math.max(0, s.life) * Math.PI)})` });
        if (s.life <= 0) { s.el.remove(); sparkles.splice(i, 1); }
      }

      onFrame?.({ emotion, level, cur, body: { sx, sy, rot, ty } });
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return {
      setEmotion, attachStream, setLevelSource,
      get emotion() { return emotion; },
      destroy() { cancelAnimationFrame(raf); host.innerHTML = ""; },
    };
  }

  window.PaxAvatar = { mount, EMOTIONS };
})();

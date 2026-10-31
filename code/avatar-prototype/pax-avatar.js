// PROTOTYPE — Pax Beratercharakter rig ("Soft Block"): drawing + animation only.
// Framework-free ES module. Voice code should not call this directly; use pax-avatar-controller.js.
//
//   const rig = mountPaxAvatar(document.getElementById("host"));
//   rig.setEmotion("pleased");
//   rig.attachStream(remoteAudioStream);   // audio level remains available to the UI
//   rig.setLevelSource(() => 0.4);         // or any custom 0..1 level
const SVG = `
<svg viewBox="0 0 200 200" aria-label="Pax Beratercharakter" style="width:100%;height:auto;overflow:visible">
  <defs>
    <radialGradient id="paxBody" cx="35%" cy="28%" r="85%">
      <stop offset="0" stop-color="#9bd509" />
      <stop offset=".45" stop-color="#8bcb00" />
      <stop offset="1" stop-color="#62a600" />
    </radialGradient>
    <filter id="paxSoft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.8" /></filter>
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
      <ellipse data-part="eyeL" mask="url(#paxMaskL)" />
      <ellipse data-part="eyeR" mask="url(#paxMaskR)" />
    </g>
  </g>
  <g data-part="dots" fill="#360573"><circle r="3.2" /><circle r="4.2" /><circle r="5.4" /></g>
  <g data-part="sparkles" fill="#8bcb00"></g>
</svg>`;

// Every pose and motion target is numeric, including independent eye geometry.
const BASE = {
  gx:0, gy:0, open:1, size:1, smile:0, blush:0, dots:0, sparkles:0,
  wL:1, wR:1, hL:1, hR:1, yL:0, yR:0, lidL:0, lidR:0, angleL:0, angleR:0,
  tilt:0, sway:0.6, speed:.6, breathe:.018, breathPeriod:4, nod:0, glance:.08, pulse:0,
  hop:0, shake:0, speech:0, blinkDuration:.18, blinkGap:4,
};
export const EMOTIONS = {
  neutral: { label:"Neutral", subtitle:"Calm and available" },
  listening: { label:"Listening", subtitle:"Focused attention", gx:-.18, tilt:-4, sway:.5, speed:.4, glance:.025, blinkDuration:.3, blinkGap:5.5 },
  acknowledging: { label:"Acknowledging", subtitle:"I hear you", wL:1.05, wR:1.05, hL:.63, hR:.63, nod:2.2, speed:.55 },
  curious: { label:"Curious", subtitle:"Tell me more", hL:1.24, hR:.9, wL:.96, wR:.93, yL:-4, yR:3, tilt:4, gx:.12, pulse:.025, glance:.12 },
  thinking: { label:"Thinking", subtitle:"Considering your question", gx:.25, gy:-.25, hL:1.2, hR:1.05, lidL:.23, lidR:.48, dots:1, glance:.035, speed:.4 },
  explaining: { label:"Explaining", subtitle:"Clear and engaged", wL:.9, wR:.9, hL:1.22, hR:1.22, glance:.17, speed:1.2, speech:.025 },
  reassuring: { label:"Reassuring", subtitle:"We can take this step by step", wL:1.08, wR:1.08, hL:.78, hR:.78, breathe:.026, breathPeriod:5.5, speed:.4, glance:.025, blinkDuration:.38, blinkGap:5 },
  empathetic: { label:"Empathetic", subtitle:"Quiet concern", gy:.25, angleL:-27, angleR:27, lidL:.34, lidR:.34, sway:.4, speed:.32, glance:.025, blinkDuration:.36, blinkGap:5 },
  pleased: { label:"Pleased", subtitle:"A warm welcome", smile:1, blush:1, hop:3, sway:1, speed:.65 },
  recovering: { label:"Recovering", subtitle:"Let me try again", wR:.85, hR:.85, yR:7, shake:1, glance:.04, speed:.5 },
  presenting_offer: { label:"Presenting an offer", subtitle:"Your offer is ready", smile:1, blush:1, sparkles:1, hop:4, sway:.8, speed:.6 },
};
let mountId = 0;

const set = (el, attrs) => { for (const k in attrs) el.setAttribute(k, attrs[k]); };

export function mountPaxAvatar(host, { onFrame } = {}) {
  const id = `pax-${++mountId}-`;
  host.innerHTML = SVG.replace(/id="(pax\w+)"/g, (_, name) => `id="${id}${name}"`)
    .replace(/url\(#(pax\w+)\)/g, (_, name) => `url(#${id}${name})`);
  const part = (name) => host.querySelector(`[data-part="${name}"]`);
  const P = {};
  for (const n of ["shadow", "char", "blushL", "blushR", "eyeL", "eyeR", "lidL", "lidR", "lowL", "lowR", "dots", "sparkles"]) P[n] = part(n);

  let emotion = "neutral";
  const cur = { ...BASE };
  let level = 0, levelSource = () => 0;
  let analyser = null, audioCtx = null, buf = null;
  let blinkDuration = 0;
  let blinkT = 0, nextBlink = 3 + Math.random() * 3, saccade = { x: 0, y: 0 }, nextSaccade = 1.5;
  const gaze = { x: 0, y: 0 };
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const sparkles = [];
  let dotsEnteredAt = 0;
  const entries = [];
  const dotOpacity = [0, 0, 0];
  const pose = { sx:1, sy:1, rot:0, ty:0, tx:0, lift:0 };
  function replay() {
    const target = { ...BASE, ...EMOTIONS[emotion] };
    // Let an in-flight gesture finish; changing expressions cannot reset its envelope.
    for (const kind of ["hop", "shake"]) {
      if (target[kind] && !entries.some(e => e.kind === kind)) {
        entries.push({ kind, amount:target[kind], startedAt:t, duration:kind === "shake" ? .6 : .8 });
      }
    }
  }
  // Fixed positions keep decoration calm and avoid particle churn.
  for (const [x,y,scale] of [[32,47,.7],[48,20,.8],[145,22,.65],[174,42,1],[176,105,.7],[124,183,.6]]) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
    el.setAttribute("d", "M0,-7 L2,-2 7,0 2,2 0,7 -2,2 -7,0 -2,-2Z");
    P.sparkles.appendChild(el);
    sparkles.push({ el, x, y, scale });
  }

  function setEmotion(key) {
    if (!Object.hasOwn(EMOTIONS, key) || key === emotion) return false;
    emotion = key;
    if (key === "thinking") dotsEnteredAt = t;
    replay();
    return true;
  }
  function setLevelSource(fn) { levelSource = fn || (() => 0); }
  // Speech level from a MediaStream (e.g. the remote track of an OpenAI Realtime WebRTC call)
  // or from an <audio> element that plays TTS. Chrome only delivers samples from a remote
  // WebRTC stream if it is also played by an <audio> element.
  function attachStream(source) {
    audioCtx = audioCtx || new AudioContext();
    if (audioCtx.state === "suspended") audioCtx.resume();
    analyser = audioCtx.createAnalyser(); analyser.fftSize = 1024;
    buf = new Float32Array(analyser.fftSize);
    if (source instanceof HTMLMediaElement) {
      // a media element can only be routed once; it must still reach the speakers
      const node = audioCtx.createMediaElementSource(source);
      node.connect(analyser); node.connect(audioCtx.destination);
    } else {
      audioCtx.createMediaStreamSource(source).connect(analyser);
    }
    setLevelSource(() => {
      analyser.getFloatTimeDomainData(buf);
      let s = 0; for (const x of buf) s += x * x;
      return Math.min(1, Math.sqrt(s / buf.length) * 7);
    });
  }

  let last = performance.now(), t = 0, phase = 0, breathPhase = 0, raf = 0;
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now; t += dt;
    const target = { ...BASE, ...EMOTIONS[emotion] };
    const k = 1 - Math.exp(-dt * 7);
    for (const key in BASE) cur[key] += (target[key] - cur[key]) * k;

    // speech level with fast attack / slow release
    const raw = levelSource(dt);
    level += (raw - level) * (1 - Math.exp(-dt * (raw > level ? 30 : 10)));

    const motion = reducedMotion.matches ? 0 : 1;
    phase += dt * cur.speed;
    breathPhase += dt * 2 * Math.PI / cur.breathPeriod;
    let hop = 0, shake = 0;
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i], age = t - e.startedAt;
      if (age >= e.duration) { entries.splice(i, 1); continue; }
      const progress = age / e.duration;
      if (e.kind === "hop") hop += e.amount * Math.sin(progress * Math.PI) ** 2;
      else shake += e.amount * Math.sin(progress * 5 * Math.PI) * Math.sin(progress * Math.PI) ** 2 * (1 - progress);
    }
    const nod = Math.max(0, Math.sin(phase * 2)) ** 8 * cur.nod;
    const lift = -hop;
    const breath = Math.sin(breathPhase) * cur.breathe;
    const body = {
      sx:1 + motion * (-breath * .28 + hop * .003),
      sy:1 + motion * (breath - hop * .003),
      rot:motion * (cur.tilt + Math.sin(phase) * .45 + shake * 2),
      ty:motion * (nod + lift),
    };
    let tx = motion * (Math.sin(phase) * cur.sway + shake * 2);
    // Ease pose targets while the independent entry gestures finish continuously.
    const bodyTarget = { ...body, tx, lift:motion * lift };
    for (const key in pose) pose[key] = motion ? pose[key] + (bodyTarget[key] - pose[key]) * (1 - Math.exp(-dt * 16)) : bodyTarget[key];
    for (const key in body) body[key] = pose[key];
    tx = pose.tx;
    set(P.char, { transform:`translate(${tx} ${body.ty}) translate(100 160) rotate(${body.rot} 0 -60) scale(${body.sx} ${body.sy}) translate(-100 -160)` });
    set(P.shadow, { rx:48 * (1 - motion * breath * .28) + pose.lift * 1.2, opacity:1 + pose.lift * .04 });
    P.blushL.setAttribute("opacity", cur.blush * .8); P.blushR.setAttribute("opacity", cur.blush * .8);

    blinkT += dt; let blink = 1;
    if (!motion) { blinkT = 0; blinkDuration = 0; }
    else if (blinkT > nextBlink) {
      if (!blinkDuration) blinkDuration = cur.blinkDuration;
      const p = (blinkT - nextBlink) / blinkDuration;
      blink = p < 1 ? Math.abs(1 - 2 * p) : 1;
      if (p >= 1) { blinkDuration = 0; blinkT = 0; nextBlink = cur.blinkGap + Math.random() * 2; }
    }
    nextSaccade -= dt;
    if (nextSaccade < 0) {
      saccade = { x:Math.random() - .5, y:(Math.random() - .5) * .5 };
      nextSaccade = 2 + Math.random() * 3;
    }
    gaze.x += (saccade.x - gaze.x) * k;
    gaze.y += (saccade.y - gaze.y) * k;
    const gx = (cur.gx + motion * cur.glance * (gaze.x + Math.sin(phase * 2))) * 9;
    const gy = (cur.gy + motion * cur.glance * gaze.y) * 7;
    for (const side of ["L", "R"]) {
      const sign = side === "L" ? -1 : 1;
      const cx = 100 + sign * 23 + gx, cy = 101 + gy + cur["y" + side];
      const pulse = 1 + motion * (cur.pulse * Math.sin(phase * 2) + cur.speech * level);
      const w = 11 * cur.size * cur["w" + side];
      const h = 11 * cur.size * cur.open * cur["h" + side] * pulse * (blink + (1 - blink) * cur.smile);
      set(P["eye" + side], { cx, cy, rx:w, ry:Math.max(.3,h) });
      const lidY = cy - h + cur["lid" + side] * 2 * h;
      set(P["lid" + side], { x:cx - 30, y:lidY - 40, width:60, height:40,
        transform:`rotate(${cur["angle" + side]} ${cx} ${lidY})` });
      const r = w * 1.25;
      set(P["low" + side], { cx, cy:cy + h + r - cur.smile * h * 1.3, r });
    }
    for (let i = 0; i < 3; i++) {
      const reveal = motion ? Math.min(1, Math.max(0, (t - dotsEnteredAt - i * .22) * 4)) : 1;
      const wanted = cur.dots * (target.dots ? reveal : 1);
      dotOpacity[i] += (wanted - dotOpacity[i]) * k;
      set(P.dots.children[i], { cx:158 + i * 11, cy:35 - i * 10,
        opacity:dotOpacity[i] * (motion ? .7 + .3 * Math.sin(t * 3 - i) : 1) });
    }
    sparkles.forEach((s,i) => {
      const twinkle = motion ? .75 + .25 * Math.sin(t * 2.5 - i * 1.3) : 1;
      set(s.el, { opacity:cur.sparkles * twinkle, transform:`translate(${s.x} ${s.y}) scale(${s.scale * twinkle})` });
    });
    onFrame?.({ emotion, level, cur, body });
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    setEmotion, replay, attachStream, setLevelSource,
    get emotion() { return emotion; },
    destroy() { cancelAnimationFrame(raf); host.innerHTML = ""; },
  };
}

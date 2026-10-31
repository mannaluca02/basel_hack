// Pax avatar: one factory for conversation events, audio and animation.
const SVG = `
<svg viewBox="0 0 200 200" aria-label="Pax Beratercharakter" style="width:100%;height:auto;overflow:visible">
  <defs>
    <radialGradient id="paxBody" cx="35%" cy="28%" r="85%">
      <stop offset="0" stop-color="#9bd509" />
      <stop offset=".45" stop-color="#8bcb00" />
      <stop offset="1" stop-color="#62a600" />
    </radialGradient>
    <radialGradient id="paxBlush"><stop stop-color="#ff8fb1" stop-opacity=".9" /><stop offset="1" stop-color="#ff8fb1" stop-opacity="0" /></radialGradient>
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
    <ellipse data-part="highlight" cx="72" cy="62" rx="22" ry="11" fill="#fff" opacity=".35" transform="rotate(-20 72 62)" />
    <g data-part="blush">
    <ellipse data-part="blushL" cx="66" cy="118" rx="17" ry="12" fill="url(#paxBlush)" />
    <ellipse data-part="blushR" cx="134" cy="118" rx="17" ry="12" fill="url(#paxBlush)" />
    </g>
    <g fill="#360573">
      <rect data-part="eyeL" mask="url(#paxMaskL)" />
      <rect data-part="eyeR" mask="url(#paxMaskR)" />
    </g>
    <g data-part="glints" fill="#fff"><circle data-part="glintL" /><circle data-part="glintR" /></g>
    <g data-part="monocle" fill="none" stroke="#360573">
      <circle r="21" stroke-width="2.6" />
      <path d="M-14,-7 A15.5,15.5 0 0 1 -5,-14.8" stroke="#fff" stroke-opacity=".75" stroke-width="2.2" stroke-linecap="round" />
      <path d="M14.8,14.8 C25,23 35,27 31,43" stroke-width="1.6" stroke-dasharray="2 2.4" stroke-linecap="round" />
    </g>
  </g>
  <g data-part="alarm" fill="#360573"><rect x="-3.2" y="-17" width="6.4" height="19" rx="3.2" /><circle cy="9.5" r="3.6" /></g>
  <g data-part="dots" fill="#360573"><circle r="3.2" /><circle r="4.2" /><circle r="5.4" /></g>
  <g data-part="sparkles" fill="#8bcb00"></g>
</svg>`;

// Every pose and motion target is numeric, including independent eye geometry.
// Eyes are pills: taller than wide by default; flat expressions become horizontal pills.
const BASE = {
  gx:0, gy:0, open:1, size:1, smile:0, blush:0, dots:0, sparkles:0, monocle:0, alarm:0, back:0,
  wL:.85, wR:.85, hL:1.2, hR:1.2, yL:0, yR:0, lidL:0, lidR:0, angleL:0, angleR:0,
  tilt:0, sway:0.6, speed:.6, breathe:.018, breathPeriod:4, glance:.08, pulse:0,
  nod:0, nodFace:0, nodDown:.27, nodUp:.44, nodGap:.15, nodSecond:0, nodInterval:3, nodJitter:.25, nodDelay:.2,
  yaw:0, yawDir:0, yawIn:.5, yawHold:1.25, yawOut:.6, yawInterval:4.5, yawJitter:.4, yawDelay:.4,
  beat:0, beatRefractory:.7, beatRaise:.15, gazeStep:0,
  hop:0, shake:0, jolt:0, speech:0, blinkDuration:.18, blinkGap:4,
};
export const EMOTIONS = {
  neutral: { label:"Neutral", subtitle:"Calm and available" },
  listening: { label:"Listening", subtitle:"Focused attention", gx:-.18, tilt:-4, sway:.5, speed:.4, glance:.025, blinkDuration:.3, blinkGap:5.5 },
  acknowledging: {
    label:"Acknowledging", subtitle:"I hear you", wL:1.05, wR:1.05, hL:.63, hR:.63, speed:.55,
    nod:5.5, nodFace:3, nodDown:.27, nodUp:.44, nodGap:.15, nodSecond:.6,
    nodInterval:4.5, nodJitter:.4, nodDelay:.2,
  },
  curious: { label:"Curious", subtitle:"Tell me more", hL:1.1, hR:1.3, wL:.85, wR:1, yL:2, yR:-2, monocle:1, tilt:-4, gx:-.12, pulse:.025, glance:.12,
    yaw:1, yawIn:.5, yawHold:1.25, yawOut:.6, yawInterval:4.5, yawJitter:.4, yawDelay:.4 },
  thinking: { label:"Thinking", subtitle:"Considering your question", gx:.25, gy:-.25, hL:1.44, hR:1.26, lidL:.23, lidR:.48, dots:1, glance:.035, speed:.4 },
  explaining: { label:"Explaining", subtitle:"Clear and engaged", wL:.85, wR:.85, hL:1.46, hR:1.46, glance:0, speed:1.2, speech:.025,
    beat:1, beatRefractory:.7, beatRaise:.15, gazeStep:1, blinkDuration:.7,
    yaw:1, yawDir:-1, yawIn:.5, yawHold:1.2, yawOut:.6, yawInterval:6.5, yawJitter:.5, yawDelay:2 },
  // A frozen wide-eyed stare: the startle jolt is the only quick motion, then nearly no blinking.
  shocked: { label:"Shocked", subtitle:"Wait, really?", wL:1.12, wR:1.12, hL:1.55, hR:1.55, gy:-.12, alarm:1, jolt:5, back:.15,
    sway:.15, speed:.3, breathe:.01, glance:0, blinkDuration:.12, blinkGap:8 },
  empathetic: { label:"Empathetic", subtitle:"Quiet concern", gy:.25, angleL:-27, angleR:27, lidL:.2, lidR:.2, sway:.4, speed:.32, glance:.025, blinkDuration:.36, blinkGap:5 },
  pleased: { label:"Pleased", subtitle:"A warm welcome", smile:1, blush:1, hop:3, sway:1, speed:.65 },
  recovering: { label:"Recovering", subtitle:"Let me try again", wR:.72, hR:1.02, yR:7, shake:1, glance:.04, speed:.5 },
  presenting_offer: { label:"Presenting an offer", subtitle:"Your offer is ready", smile:1, blush:1, sparkles:1, hop:4, sway:.8, speed:.6 },
};
let mountId = 0;

export const REPLY_EMOTIONS = ["neutral", "acknowledging", "curious", "explaining", "shocked", "empathetic", "pleased", "recovering", "presenting_offer"];
const HOLD_AFTER_REPLY_MS = 1500;
const EMOTION_HOLD_MS = 4000;
const MAX_FINISHED_IDS = 50;

const POSES = Object.fromEntries(Object.entries(EMOTIONS).map(([key, value]) => [key, { ...BASE, ...value }]));
const SIDES = ["L", "R"], GAZES = [[-1.4,0], [.9,-.45], [0,.35], [-.6,-.4]];
const silence = () => 0;
// Cache strings at the SVG boundary; static geometry stops touching the DOM.
const attributes = new WeakMap();
function set(el, key, value) {
  const formatted = typeof value === "number" ? String(Math.round(value * 100) / 100) : value;
  const cache = attributes.get(el);
  if (cache[key] !== formatted) { cache[key] = formatted; el.setAttribute(key, formatted); }
}
const fmt = (value) => Math.round(value * 10000) / 10000;

export function createPaxAvatar(host) {
  const id = `pax-${++mountId}-`;
  host.innerHTML = SVG.replace(/id="(pax\w+)"/g, (_, name) => `id="${id}${name}"`)
    .replace(/url\(#(pax\w+)\)/g, (_, name) => `url(#${id}${name})`);
  const part = (name) => host.querySelector(`[data-part="${name}"]`);
  const P = {};
  for (const n of ["shadow", "char", "highlight", "blush", "blushL", "blushR", "eyeL", "eyeR", "lidL", "lidR", "lowL", "lowR", "dots", "sparkles", "monocle", "alarm", "glints", "glintL", "glintR"]) P[n] = part(n);

  for (const el of host.querySelectorAll("*")) attributes.set(el, Object.create(null));
  let emotion = "neutral", destroyed = false, visible = true;
  const cur = { ...BASE };
  let level = 0, levelSource = silence, hasLevelSource = false;
  let slowLevel = 0, onsetReady = true, beatAge = Infinity, beatStrength = 0, beatPose = 0;
  let beatCooldown = 0, nextBeat = .8, nextEngagedGaze = 0;
  const engagedGaze = { x:0, y:0 }, engagedTarget = { x:0, y:0 };
  let analyser = null, audioCtx = null, buf = null, audioNode = null;
  const mediaNodes = new Map();
  let blinkDuration = 0, blinkExitDuration = 0;
  let blinkT = 0, nextBlink = 3 + Math.random() * 3, saccade = { x: 0, y: 0 }, nextSaccade = 1.5;
  const gaze = { x: 0, y: 0 };
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const sparkles = [];
  let dotsEnteredAt = 0;
  let nodPose = 0, yawPose = 0, yawDirection = 1;
  const nodGesture = { clock:0, interval:BASE.nodInterval }, yawGesture = { clock:0, interval:BASE.yawInterval };
  function periodic(gesture, kind, target, dt, enter = false) {
    if (enter) gesture.clock = -Math.max(target[kind + "Delay"], blinkDuration ? nextBlink + blinkDuration - blinkT + .04 : 0);
    else if (cur[kind] > .001 || POSES[emotion][kind]) gesture.clock += dt;
    if (enter || (cur[kind] > .001 && gesture.clock >= gesture.interval)) {
      if (!enter) gesture.clock -= gesture.interval;
      gesture.interval = target[kind + "Interval"] + (Math.random() * 2 - 1) * target[kind + "Jitter"];
    }
  }
  function blocksBlink(gesture, amount, duration) {
    return amount > .01 && (gesture.interval - gesture.clock < cur.blinkDuration + .05 || gesture.clock < duration + .1);
  }
  function nodDip(age) {
    if (age < 0 || age >= cur.nodDown + cur.nodUp) return 0;
    return age < cur.nodDown ? (1 - Math.cos(Math.PI * age / cur.nodDown)) / 2
      : (1 + Math.cos(Math.PI * (age - cur.nodDown) / cur.nodUp)) / 2;
  }
  const entries = [];
  const dotOpacity = [0, 0, 0];
  const pose = { sx:1, sy:1, rot:0, ty:0, tx:0, lift:0 };
  function replay() {
    const target = POSES[emotion];
    // Let an in-flight gesture finish; changing expressions cannot reset its envelope.
    for (const kind of ["hop", "shake", "jolt"]) {
      if (target[kind] && !entries.some(e => e.kind === kind)) {
        entries.push({ kind, amount:target[kind], startedAt:t, duration:kind === "shake" ? .6 : kind === "jolt" ? .55 : .8 });
      }
    }
  }
  // Fixed positions keep decoration calm and avoid particle churn.
  for (const [x,y,scale] of [[32,47,.7],[48,20,.8],[145,22,.65],[174,42,1],[176,105,.7],[124,183,.6]]) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
    el.setAttribute("d", "M0,-7 L2,-2 7,0 2,2 0,7 -2,2 -7,0 -2,-2Z");
    attributes.set(el, Object.create(null));
    P.sparkles.appendChild(el);
    sparkles.push({ el, x, y, scale });
  }

  function setEmotion(key, force = false) {
    if (!Object.hasOwn(EMOTIONS, key) || (key === emotion && !force)) return false;
    // Carry the slower speaking blink through the first blink after a gesture exit.
    if (EMOTIONS[emotion].beat && !EMOTIONS[key].beat && !blinkDuration) blinkExitDuration = cur.blinkDuration;
    emotion = key;
    const target = POSES[key];
    if (target.nod) periodic(nodGesture, "nod", target, 0, true);
    if (target.yaw) { periodic(yawGesture, "yaw", target, 0, true); yawDirection = target.yawDir || Math.sign(target.tilt) || 1; }
    if (EMOTIONS[key].beat) { nextBeat = .8; nextEngagedGaze = 0; }
    if (key === "thinking") dotsEnteredAt = t;
    replay();
    return true;
  }
  function setLevelSource(fn) {
    levelSource = fn || silence;
    hasLevelSource = !!fn;
    slowLevel = level = 0;
    onsetReady = true;
    nextBeat = .8;
  }
  function audioLevel() {
    analyser.getFloatTimeDomainData(buf);
    let sum = 0; for (const x of buf) sum += x * x;
    return Math.min(1, Math.sqrt(sum / buf.length) * 7);
  }
  function attachAudio(source) {
    if (destroyed) return;
    audioNode?.disconnect(); analyser?.disconnect(); audioNode = analyser = buf = null;
    setLevelSource(typeof source === "function" ? source : null);
    if (!source || typeof source === "function") return;
    audioCtx ||= new AudioContext();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    analyser = audioCtx.createAnalyser(); analyser.fftSize = 1024;
    buf = new Float32Array(analyser.fftSize);
    if (source instanceof HTMLMediaElement) {
      audioNode = mediaNodes.get(source);
      if (!audioNode) { audioNode = audioCtx.createMediaElementSource(source); mediaNodes.set(source, audioNode); }
      audioNode.connect(audioCtx.destination);
    } else audioNode = audioCtx.createMediaStreamSource(source);
    audioNode.connect(analyser); setLevelSource(audioLevel);
  }

  let last = performance.now(), t = 0, phase = 0, breathPhase = 0, raf = 0;
  const body = { sx:1, sy:1, rot:0, ty:0, tx:0, lift:0 };
  function frame(now) {
    if (destroyed || !visible) return;
    const dt = Math.min(.05, (now - last) / 1000); last = now; t += dt;
    const target = POSES[emotion];
    const k = 1 - Math.exp(-dt * 7);
    for (const key in BASE) cur[key] += (target[key] - cur[key]) * k;

    // speech level with fast attack / slow release
    const raw = levelSource();
    level += (raw - level) * (1 - Math.exp(-dt * (raw > level ? 30 : 10)));

    const motion = reducedMotion.matches ? 0 : 1;
    phase += dt * cur.speed;
    breathPhase += dt * 2 * Math.PI / cur.breathPeriod;
    let hop = 0, shake = 0, jolt = 0;
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i], age = t - e.startedAt;
      if (age >= e.duration) { for (let j = i; j < entries.length - 1; j++) entries[j] = entries[j + 1]; entries.pop(); continue; }
      const progress = age / e.duration;
      if (e.kind === "hop") hop += e.amount * Math.sin(progress * Math.PI) ** 2;
      // Startle: snap up in the first 12%, then ease back down.
      else if (e.kind === "jolt") jolt += e.amount * (progress < .12 ? Math.sin(progress / .12 * Math.PI / 2) : (1 - (progress - .12) / .88) ** 2);
      else shake += e.amount * Math.sin(progress * 5 * Math.PI) * Math.sin(progress * Math.PI) ** 2 * (1 - progress);
    }
    periodic(nodGesture, "nod", cur, dt);
    const nodClock = nodGesture.clock, nodInterval = nodGesture.interval;
    const nodAmount = nodDip(nodClock) + cur.nodSecond * nodDip(nodClock - cur.nodDown - cur.nodUp - cur.nodGap);
    const nod = nodAmount * cur.nod;
    nodPose = motion ? nodPose + (nod - nodPose) * (1 - Math.exp(-dt * 16)) : 0;
    periodic(yawGesture, "yaw", cur, dt);
    const yawClock = yawGesture.clock, yawInterval = yawGesture.interval;
    const yawDuration = cur.yawIn + cur.yawHold + cur.yawOut;
    let yawAmount = 0;
    if (yawClock >= 0 && yawClock < yawDuration) {
      yawAmount = yawClock < cur.yawIn
        ? (1 - Math.cos(Math.PI * yawClock / cur.yawIn)) / 2
        : yawClock < cur.yawIn + cur.yawHold ? 1
        : (1 + Math.cos(Math.PI * (yawClock - cur.yawIn - cur.yawHold) / cur.yawOut)) / 2;
    }
    yawPose = motion ? yawPose + (yawAmount * cur.yaw * yawDirection - yawPose) * (1 - Math.exp(-dt * 16)) : 0;
    const yawWidth = Math.abs(yawPose);
    // Compare the speech envelope with a phrase-scale baseline, then require a fresh rise.
    slowLevel += (level - slowLevel) * (1 - Math.exp(-dt * 1.8));
    const onset = level - slowLevel;
    if (onset < .025 || level < .04) onsetReady = true;
    beatAge += dt;
    beatCooldown -= dt;
    if (target.beat && motion) {
      nextBeat -= dt;
      const audioBeat = hasLevelSource && onsetReady && level > .1 && onset > .07;
      if (beatCooldown <= 0 && (hasLevelSource ? audioBeat : nextBeat <= 0)) {
        beatAge = 0;
        beatStrength = hasLevelSource ? Math.min(1, .65 + onset * 1.2) : .85 + Math.random() * .15;
        beatCooldown = cur.beatRefractory;
        onsetReady = false;
        if (!hasLevelSource) nextBeat = Math.random() < .18 ? 2 + Math.random() : .7 + Math.random() * .9;
      }
    }
    const beatEnvelope = beatAge < .15 ? (1 - Math.cos(Math.PI * beatAge / .15)) / 2
      : beatAge < .5 ? (1 + Math.cos(Math.PI * (beatAge - .15) / .35)) / 2 : 0;
    const beatTarget = beatEnvelope * beatStrength * cur.beat * (1 - yawWidth * .2);
    beatPose = motion ? beatPose + (beatTarget - beatPose) * (1 - Math.exp(-dt * 24)) : 0;
    const beatDip = beatPose * 2.8;
    const lift = -hop - jolt;
    const breath = Math.sin(breathPhase) * cur.breathe;
    body.sx = 1 + motion * (-breath * .28 + hop * .003 + (nod + beatDip) * .01 / 5.5 - yawWidth * .035 - jolt * .004);
    body.sy = 1 + motion * (breath - hop * .003 + jolt * .006 - (nod + beatDip) * .02 / 5.5);
    body.rot = motion * (cur.tilt + Math.sin(phase) * .45 + shake * 2);
    body.ty = motion * (nod + beatDip + lift);
    let tx = motion * (Math.sin(phase) * cur.sway + shake * 2 + yawPose * 1.8);
    body.tx = tx; body.lift = motion * lift;
    for (const key in pose) pose[key] = motion ? pose[key] + (body[key] - pose[key]) * (1 - Math.exp(-dt * 16)) : body[key];
    for (const key in body) body[key] = pose[key];
    tx = pose.tx;
    // Stepping back is a pose, not decoration: it shrinks from the ground point even with reduced motion.
    const depth = 1 - cur.back;
    set(P.char, "transform", `translate(${fmt(tx)} ${fmt(body.ty)}) translate(100 160) rotate(${fmt(body.rot)} 0 -60) scale(${fmt(body.sx * depth)} ${fmt(body.sy * depth)}) translate(-100 -160)`);
    set(P.shadow, "cx", 100 + yawPose * 1.2); set(P.shadow, "rx", (48 * (1 - motion * breath * .28) + pose.lift * 1.2 + (nodPose + beatDip) * .6) * depth); set(P.shadow, "ry", 7 * depth); set(P.shadow, "opacity", 1 + pose.lift * .04); set(P.shadow, "fill", `rgba(54,5,115,${fmt(.18 + (nodPose + beatDip) * .006)})`);
    const faceDip = nodPose * cur.nodFace / 5.5 + beatPose * 1.5;
    set(P.highlight, "cx", 72 - yawPose * 1.5); set(P.highlight, "cy", 62 + (nodPose + beatDip) * 1.5 / 5.5);
    const blushVisible = cur.blush > .001 || target.blush;
    set(P.blush, "display", blushVisible ? "inline" : "none");
    if (blushVisible) for (const side of SIDES) { set(P["blush" + side], "cx", (side === "L" ? 66 : 134) + yawPose * 4.5); set(P["blush" + side], "cy", 118 + faceDip); }
    set(P.blushL, "opacity", cur.blush * .8); set(P.blushR, "opacity", cur.blush * .8);

    blinkT += dt; let blink = 1;
    if (!motion) { blinkT = 0; blinkDuration = 0; }
    else if (!blinkDuration && (blocksBlink(yawGesture, cur.yaw, yawDuration) ||
      blocksBlink(nodGesture, cur.nod, cur.nodDown + cur.nodUp + (cur.nodSecond > .01 ? cur.nodGap + cur.nodDown + cur.nodUp : 0)))) {
      // Finish an existing blink before entry; keep new blinks out of either gesture.
      if (blinkT > nextBlink) nextBlink = blinkT + .1;
    }
    else if (blinkT > nextBlink) {
      if (!blinkDuration) {
        blinkDuration = Math.max(cur.blinkDuration, blinkExitDuration);
        blinkExitDuration = 0;
      }
      const p = (blinkT - nextBlink) / blinkDuration;
      blink = p < 1 ? Math.abs(1 - 2 * p) : 1;
      if (p >= 1) { blinkDuration = 0; blinkT = 0; nextBlink = cur.blinkGap + Math.random() * 2; }
    }
    nextSaccade -= dt;
    if (nextSaccade < 0) {
      saccade.x = Math.random() - .5; saccade.y = (Math.random() - .5) * .5;
      nextSaccade = 2 + Math.random() * 3;
    }
    gaze.x += (saccade.x - gaze.x) * k;
    gaze.y += (saccade.y - gaze.y) * k;
    if (target.gazeStep && motion) {
      nextEngagedGaze -= dt;
      if (nextEngagedGaze <= 0) {
        const point = GAZES[Math.floor(Math.random() * GAZES.length)];
        engagedTarget.x = point[0]; engagedTarget.y = point[1];
        nextEngagedGaze = .8 + Math.random() * 1.2;
      }
    }
    const gazeEase = 1 - Math.exp(-dt * 25);
    engagedGaze.x += (engagedTarget.x - engagedGaze.x) * gazeEase;
    engagedGaze.y += (engagedTarget.y - engagedGaze.y) * gazeEase;
    const gx = motion * (cur.gazeStep * engagedGaze.x + yawPose * 1.8 * cur.gazeStep) + (cur.gx + motion * cur.glance * (gaze.x + Math.sin(phase * 2))) * 9;
    const gy = motion * cur.gazeStep * engagedGaze.y + (cur.gy + motion * cur.glance * gaze.y) * 7;
    for (const side of SIDES) {
      const sign = side === "L" ? -1 : 1;
      const far = Math.max(0, -sign * yawPose), near = Math.max(0, sign * yawPose);
      const cx = 100 + sign * 23 + gx + yawPose * 4.5 - sign * far * 1.5, cy = 101 + gy + cur["y" + side] + faceDip;
      const pulse = 1 + motion * (beatPose * cur.beatRaise + cur.pulse * Math.sin(phase * 2) + cur.speech * level);
      const w = 11 * cur.size * cur["w" + side] * (1 + near * .05);
      const h = 11 * cur.size * cur.open * cur["h" + side] * pulse * (1 - nodPose * .06 / 5.5) * (blink + (1 - blink) * cur.smile);
      const eyeH = Math.max(.3, h), round = Math.min(w, eyeH);
      set(P["eye" + side], "x", cx - w); set(P["eye" + side], "y", cy - eyeH); set(P["eye" + side], "width", 2 * w); set(P["eye" + side], "height", 2 * eyeH);
      set(P["eye" + side], "rx", round); set(P["eye" + side], "ry", round);
      if (cur.alarm > .001) { set(P["glint" + side], "cx", cx - w * .38); set(P["glint" + side], "cy", cy - eyeH * .5); set(P["glint" + side], "r", Math.min(3.2, eyeH * .3) * cur.alarm); }
      const lidY = cy - h + cur["lid" + side] * 2 * h;
      set(P["lid" + side], "x", cx - 30); set(P["lid" + side], "y", lidY - 40); set(P["lid" + side], "width", 60); set(P["lid" + side], "height", 40); set(P["lid" + side], "transform", `rotate(${fmt(cur["angle" + side])} ${fmt(cx)} ${fmt(lidY)})`);
      const r = w * 1.25;
      set(P["low" + side], "cx", cx); set(P["low" + side], "cy", cy + h + r - cur.smile * h * 1.3); set(P["low" + side], "r", r);
    }
    const dotsVisible = cur.dots > .001 || target.dots || dotOpacity[0] > .001 || dotOpacity[1] > .001 || dotOpacity[2] > .001;
    set(P.dots, "display", dotsVisible ? "inline" : "none");
    if (dotsVisible) for (let i = 0; i < 3; i++) {
      const reveal = motion ? Math.min(1, Math.max(0, (t - dotsEnteredAt - i * .22) * 4)) : 1;
      const wanted = cur.dots * (target.dots ? reveal : 1);
      dotOpacity[i] += (wanted - dotOpacity[i]) * k;
      set(P.dots.children[i], "cx", 158 + i * 11); set(P.dots.children[i], "cy", 35 - i * 10); set(P.dots.children[i], "opacity", dotOpacity[i] * (motion ? .7 + .3 * Math.sin(t * 3 - i) : 1));
    }
    // The monocle sits on the face, not the pupil, so the curious eye can still glance inside it.
    const monocleVisible = cur.monocle > .001 || target.monocle;
    set(P.monocle, "display", monocleVisible ? "inline" : "none");
    if (monocleVisible) {
      set(P.monocle, "opacity", cur.monocle);
      set(P.monocle, "transform", `translate(${fmt(123 + yawPose * 4.5)} ${fmt(101 + cur.yR + faceDip)}) scale(${fmt(.6 + .4 * cur.monocle)})`);
    }
    const alarmVisible = cur.alarm > .001 || target.alarm;
    set(P.glints, "display", alarmVisible ? "inline" : "none");
    set(P.alarm, "display", alarmVisible ? "inline" : "none");
    if (alarmVisible) {
      set(P.alarm, "opacity", cur.alarm);
      set(P.alarm, "transform", `translate(${fmt(100 + 72 * depth)} ${fmt(160 - 130 * depth)}) rotate(12) scale(${fmt(.4 + .6 * cur.alarm)})`);
    }
    const starsVisible = cur.sparkles > .001 || target.sparkles;
    set(P.sparkles, "display", starsVisible ? "inline" : "none");
    if (starsVisible) for (let i = 0; i < sparkles.length; i++) {
      const s = sparkles[i];
      const twinkle = motion ? .75 + .25 * Math.sin(t * 2.5 - i * 1.3) : 1;
      set(s.el, "opacity", cur.sparkles * twinkle); set(s.el, "transform", `translate(${fmt(s.x)} ${fmt(s.y)}) scale(${fmt(s.scale * twinkle)})`);
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  function resume() {
    cancelAnimationFrame(raf); last = performance.now();
    if (visible && !destroyed) raf = requestAnimationFrame(frame);
  }
  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; resume(); });
  observer.observe(host);
  reducedMotion.addEventListener("change", resume);
  let activity = "idle";          // what the conversation is doing when nobody speaks
  let playing = null;             // playbackId currently audible
  let replyEmotion = "neutral";   // tone of the current / upcoming reply
  const finished = [];            // ended or cancelled playbackIds
  let relaxTimer = 0;
  let emotionChangedAt = -Infinity, pendingEmotion = null, pendingTimer = 0;

  const isFinished = (id) => id != null && finished.includes(id);
  function finish(id) {
    if (id == null || finished.includes(id)) return;
    finished.push(id); if (finished.length > MAX_FINISHED_IDS) finished.shift();
  }

  function setReplyEmotion(emotion) {
    clearTimeout(pendingTimer); pendingEmotion = null;
    if (emotion !== replyEmotion) emotionChangedAt = Date.now();
    replyEmotion = emotion;
    render();
  }
  function clearPending() { clearTimeout(pendingTimer); pendingEmotion = null; }

  function render() {
    clearTimeout(relaxTimer);
    let face;
    if (playing) face = replyEmotion;
    else if (activity === "listening" || activity === "thinking") face = activity;
    else face = replyEmotion;
    setEmotion(face);
  }

  /** Returns false when the event was ignored. */
  function handle(ev) {
    if (destroyed) return false;
    switch (ev?.type) {
      case "activity":
        if (!["idle", "listening", "thinking"].includes(ev.state)) return false;
        if (ev.state === "listening" && activity === "idle" && !playing) { replyEmotion = "neutral"; clearPending(); }   // a new turn starts from neutral
        activity = ev.state;
        render();
        return true;

      case "emotion":
        if (!REPLY_EMOTIONS.includes(ev.emotion) || isFinished(ev.playbackId)) return false;
        // While the user speaks or the advisor thinks, keep that face; render() shows it at playback start.
        if (activity !== "idle") { setReplyEmotion(ev.emotion); return true; }
        if (ev.emotion === replyEmotion) { clearPending(); return true; }
        if (ev.emotion === "neutral") return true;   // sticky: no drop to neutral mid-reply
        const wait = EMOTION_HOLD_MS - (Date.now() - emotionChangedAt);
        if (wait <= 0) { setReplyEmotion(ev.emotion); return true; }
        pendingEmotion = ev.emotion; clearTimeout(pendingTimer);
        pendingTimer = setTimeout(() => {
          if (pendingEmotion && activity === "idle") setReplyEmotion(pendingEmotion);
        }, wait);
        return true;

      case "playback":
        if (isFinished(ev.playbackId)) return false;
        if (ev.event === "started") {
          playing = ev.playbackId; activity = "idle";
          render();
        } else {
          if (playing && playing !== ev.playbackId) return false;   // not the audible one
          finish(ev.playbackId); playing = null;
          if (ev.event === "cancelled") { clearPending(); activity = "listening"; render(); return true; }
          render();
          relaxTimer = setTimeout(() => {
            if (!playing && activity === "idle") { clearPending(); replyEmotion = "neutral"; render(); }
          }, HOLD_AFTER_REPLY_MS);
        }
        return true;
    }
    return false;
  }

  return {
    handle, attachAudio,
    show(face) {
      if (destroyed || !Object.hasOwn(EMOTIONS, face)) return;
      entries.length = 0;
      setEmotion(face, true);
    },
    reset() { if (destroyed) return; clearPending(); activity = "idle"; playing = null; replyEmotion = "neutral"; emotionChangedAt = -Infinity; finished.length = 0; render(); },
    get state() { return { face:emotion, activity, playing, replyEmotion, level }; },
    destroy() {
      destroyed = true; cancelAnimationFrame(raf); clearTimeout(relaxTimer); clearTimeout(pendingTimer);
      observer.disconnect(); reducedMotion.removeEventListener("change", resume);
      audioNode?.disconnect(); analyser?.disconnect();
      for (const node of mediaNodes.values()) node.disconnect();
      mediaNodes.clear(); audioCtx?.close().catch(() => {}); host.innerHTML = "";
    },
  };
}

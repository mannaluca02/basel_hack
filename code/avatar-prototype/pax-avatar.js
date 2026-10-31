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
    <ellipse data-part="highlight" cx="72" cy="62" rx="22" ry="11" fill="#fff" opacity=".35" transform="rotate(-20 72 62)" />
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
  tilt:0, sway:0.6, speed:.6, breathe:.018, breathPeriod:4, glance:.08, pulse:0,
  nod:0, nodFace:0, nodDown:.27, nodUp:.44, nodGap:.15, nodSecond:0, nodInterval:3, nodJitter:.25, nodDelay:.2,
  yaw:0, yawDir:0, yawIn:.5, yawHold:1.25, yawOut:.6, yawInterval:4.5, yawJitter:.4, yawDelay:.4,
  beat:0, beatRefractory:.7, beatRaise:.15, gazeStep:0,
  hop:0, shake:0, speech:0, blinkDuration:.18, blinkGap:4,
};
export const EMOTIONS = {
  neutral: { label:"Neutral", subtitle:"Calm and available" },
  listening: { label:"Listening", subtitle:"Focused attention", gx:-.18, tilt:-4, sway:.5, speed:.4, glance:.025, blinkDuration:.3, blinkGap:5.5 },
  acknowledging: {
    label:"Acknowledging", subtitle:"I hear you", wL:1.05, wR:1.05, hL:.63, hR:.63, speed:.55,
    nod:5.5, nodFace:3, nodDown:.27, nodUp:.44, nodGap:.15, nodSecond:.6,
    nodInterval:4.5, nodJitter:.4, nodDelay:.2,
  },
  curious: { label:"Curious", subtitle:"Tell me more", hL:.9, hR:1.24, wL:.93, wR:.96, yL:3, yR:-4, tilt:-4, gx:-.12, pulse:.025, glance:.12,
    yaw:1, yawIn:.5, yawHold:1.25, yawOut:.6, yawInterval:4.5, yawJitter:.4, yawDelay:.4 },
  thinking: { label:"Thinking", subtitle:"Considering your question", gx:.25, gy:-.25, hL:1.2, hR:1.05, lidL:.23, lidR:.48, dots:1, glance:.035, speed:.4 },
  explaining: { label:"Explaining", subtitle:"Clear and engaged", wL:.9, wR:.9, hL:1.22, hR:1.22, glance:0, speed:1.2, speech:.025,
    beat:1, beatRefractory:.7, beatRaise:.15, gazeStep:1, blinkDuration:.7,
    yaw:1, yawDir:-1, yawIn:.5, yawHold:1.2, yawOut:.6, yawInterval:6.5, yawJitter:.5, yawDelay:2 },
  reassuring: { label:"Reassuring", subtitle:"We can take this step by step", wL:1.08, wR:1.08, hL:.78, hR:.78, breathe:.026, breathPeriod:5.5, speed:.4, glance:.025, blinkDuration:.38, blinkGap:5 },
  empathetic: { label:"Empathetic", subtitle:"Quiet concern", gy:.25, angleL:-27, angleR:27, lidL:.2, lidR:.2, sway:.4, speed:.32, glance:.025, blinkDuration:.36, blinkGap:5 },
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
  for (const n of ["shadow", "char", "highlight", "blushL", "blushR", "eyeL", "eyeR", "lidL", "lidR", "lowL", "lowR", "dots", "sparkles"]) P[n] = part(n);

  let emotion = "neutral";
  const cur = { ...BASE };
  let level = 0, levelSource = () => 0, hasLevelSource = false;
  let slowLevel = 0, onsetReady = true, beatAge = Infinity, beatStrength = 0, beatPose = 0;
  let beatCooldown = 0, nextBeat = .8, nextEngagedGaze = 0;
  const engagedGaze = { x:0, y:0 }, engagedTarget = { x:0, y:0 };
  let analyser = null, audioCtx = null, buf = null;
  let blinkDuration = 0, blinkExitDuration = 0;
  let blinkT = 0, nextBlink = 3 + Math.random() * 3, saccade = { x: 0, y: 0 }, nextSaccade = 1.5;
  const gaze = { x: 0, y: 0 };
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const sparkles = [];
  let dotsEnteredAt = 0;
  let nodClock = 0, nodInterval = BASE.nodInterval, nodPose = 0;
  let yawClock = 0, yawInterval = BASE.yawInterval, yawPose = 0, yawDirection = 1;
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
    // Carry the slower speaking blink through the first blink after a gesture exit.
    if (EMOTIONS[emotion].beat && !EMOTIONS[key].beat && !blinkDuration) blinkExitDuration = cur.blinkDuration;
    emotion = key;
    if (EMOTIONS[key].nod) {
      const nodTarget = { ...BASE, ...EMOTIONS[key] };
      nodClock = -Math.max(nodTarget.nodDelay, blinkDuration ? nextBlink + blinkDuration - blinkT + .04 : 0);
      nodInterval = nodTarget.nodInterval + (Math.random() * 2 - 1) * nodTarget.nodJitter;
    }
    if (EMOTIONS[key].yaw) {
      const yawTarget = { ...BASE, ...EMOTIONS[key] };
      yawClock = -Math.max(yawTarget.yawDelay, blinkDuration ? nextBlink + blinkDuration - blinkT + .04 : 0);
      yawInterval = yawTarget.yawInterval + (Math.random() * 2 - 1) * yawTarget.yawJitter;
      yawDirection = yawTarget.yawDir || Math.sign(yawTarget.tilt) || 1;
    }
    if (EMOTIONS[key].beat) { nextBeat = .8; nextEngagedGaze = 0; }
    if (key === "thinking") dotsEnteredAt = t;
    replay();
    return true;
  }
  function setLevelSource(fn) {
    levelSource = fn || (() => 0);
    hasLevelSource = !!fn;
    slowLevel = level = 0;
    onsetReady = true;
    nextBeat = .8;
  }
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
    // An entry-relative clock keeps the gesture independent of the long-running sway phase.
    if (cur.nod > .001 || target.nod) nodClock += dt;
    if (cur.nod > .001 && nodClock >= nodInterval) {
      nodClock -= nodInterval;
      nodInterval = cur.nodInterval + (Math.random() * 2 - 1) * cur.nodJitter;
    }
    const nodDip = (age) => {
      if (age < 0 || age >= cur.nodDown + cur.nodUp) return 0;
      return age < cur.nodDown
        ? (1 - Math.cos(Math.PI * age / cur.nodDown)) / 2
        : (1 + Math.cos(Math.PI * (age - cur.nodDown) / cur.nodUp)) / 2;
    };
    const nodAmount = nodDip(nodClock) + cur.nodSecond * nodDip(nodClock - cur.nodDown - cur.nodUp - cur.nodGap);
    const nod = nodAmount * cur.nod;
    nodPose = motion ? nodPose + (nod - nodPose) * (1 - Math.exp(-dt * 16)) : 0;
    // A held peek uses the same entry-relative scheduling and pose easing as the nod.
    if (cur.yaw > .001 || target.yaw) yawClock += dt;
    if (cur.yaw > .001 && yawClock >= yawInterval) {
      yawClock -= yawInterval;
      yawInterval = cur.yawInterval + (Math.random() * 2 - 1) * cur.yawJitter;
    }
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
    const lift = -hop;
    const breath = Math.sin(breathPhase) * cur.breathe;
    const body = {
      sx:1 + motion * (-breath * .28 + hop * .003 + (nod + beatDip) * .01 / 5.5 - yawWidth * .035),
      sy:1 + motion * (breath - hop * .003 - (nod + beatDip) * .02 / 5.5),
      rot:motion * (cur.tilt + Math.sin(phase) * .45 + shake * 2),
      ty:motion * (nod + beatDip + lift),
    };
    let tx = motion * (Math.sin(phase) * cur.sway + shake * 2 + yawPose * 1.8);
    // Ease pose targets while the independent entry gestures finish continuously.
    const bodyTarget = { ...body, tx, lift:motion * lift };
    for (const key in pose) pose[key] = motion ? pose[key] + (bodyTarget[key] - pose[key]) * (1 - Math.exp(-dt * 16)) : bodyTarget[key];
    for (const key in body) body[key] = pose[key];
    tx = pose.tx;
    set(P.char, { transform:`translate(${tx} ${body.ty}) translate(100 160) rotate(${body.rot} 0 -60) scale(${body.sx} ${body.sy}) translate(-100 -160)` });
    set(P.shadow, { cx:100 + yawPose * 1.2, rx:48 * (1 - motion * breath * .28) + pose.lift * 1.2 + (nodPose + beatDip) * .6, opacity:1 + pose.lift * .04, fill:`rgba(54,5,115,${.18 + (nodPose + beatDip) * .006})` });
    const faceDip = nodPose * cur.nodFace / 5.5 + beatPose * 1.5;
    set(P.highlight, { cx:72 - yawPose * 1.5, cy:62 + (nodPose + beatDip) * 1.5 / 5.5 });
    for (const side of ["L", "R"]) set(P["blush" + side], { cx:(side === "L" ? 66 : 134) + yawPose * 4.5, cy:118 + faceDip });
    P.blushL.setAttribute("opacity", cur.blush * .8); P.blushR.setAttribute("opacity", cur.blush * .8);

    blinkT += dt; let blink = 1;
    if (!motion) { blinkT = 0; blinkDuration = 0; }
    else if (!blinkDuration && cur.yaw > .01 && (yawInterval - yawClock < cur.blinkDuration + .05 || yawClock < yawDuration + .1)) {
      // Let the eyes stay open through the peek and finish any blink before entry.
      if (blinkT > nextBlink) nextBlink = blinkT + .1;
    }
    else if (!blinkDuration && cur.nod > .01 && (nodInterval - nodClock < cur.blinkDuration + .05 || nodClock < cur.nodDown + cur.nodUp + (cur.nodSecond > .01 ? cur.nodGap + cur.nodDown + cur.nodUp : 0) + .1)) {
      // Keep a new blink out of the gesture; an existing blink finishes before the dip.
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
      saccade = { x:Math.random() - .5, y:(Math.random() - .5) * .5 };
      nextSaccade = 2 + Math.random() * 3;
    }
    gaze.x += (saccade.x - gaze.x) * k;
    gaze.y += (saccade.y - gaze.y) * k;
    if (target.gazeStep && motion) {
      nextEngagedGaze -= dt;
      if (nextEngagedGaze <= 0) {
        const points = [[-1.4,0], [.9,-.45], [0,.35], [-.6,-.4]];
        const point = points[Math.floor(Math.random() * points.length)];
        engagedTarget.x = point[0]; engagedTarget.y = point[1];
        nextEngagedGaze = .8 + Math.random() * 1.2;
      }
    }
    const gazeEase = 1 - Math.exp(-dt * 25);
    engagedGaze.x += (engagedTarget.x - engagedGaze.x) * gazeEase;
    engagedGaze.y += (engagedTarget.y - engagedGaze.y) * gazeEase;
    const gx = motion * (cur.gazeStep * engagedGaze.x + yawPose * 1.8 * cur.gazeStep) + (cur.gx + motion * cur.glance * (gaze.x + Math.sin(phase * 2))) * 9;
    const gy = motion * cur.gazeStep * engagedGaze.y + (cur.gy + motion * cur.glance * gaze.y) * 7;
    for (const side of ["L", "R"]) {
      const sign = side === "L" ? -1 : 1;
      const far = Math.max(0, -sign * yawPose), near = Math.max(0, sign * yawPose);
      const cx = 100 + sign * 23 + gx + yawPose * 4.5 - sign * far * 1.5, cy = 101 + gy + cur["y" + side] + faceDip;
      const pulse = 1 + motion * (beatPose * cur.beatRaise + cur.pulse * Math.sin(phase * 2) + cur.speech * level);
      const w = 11 * cur.size * cur["w" + side] * (1 - far * .15 + near * .05);
      const h = 11 * cur.size * cur.open * cur["h" + side] * pulse * (1 - nodPose * .06 / 5.5) * (blink + (1 - blink) * cur.smile);
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

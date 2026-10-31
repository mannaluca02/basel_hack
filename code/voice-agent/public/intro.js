export async function requestMicrophonePermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Only warm up permission; the conversation owns its own microphone stream.
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    // Browsers that require a gesture, or a denied prompt, retry through the normal start flow.
    return false;
  }
}

export function setupIntro(startConversation) {
  const root = document.documentElement;
  const overlay = document.getElementById("intro");
  const stage = document.getElementById("stage");
  const aside = document.querySelector("aside");
  const avatar = document.getElementById("avatar");
  const animations = [];
  let finished = false;
  let handoffTimer;

  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(handoffTimer);
    animations.forEach((animation) => animation.cancel());
    overlay.remove();
    root.classList.remove("intro-pending", "intro-running", "intro-landing");
    stage.style.visibility = aside.style.visibility = "";
    stage.inert = aside.inert = false;
    window.removeEventListener("resize", finish);
    if (!avatar.disabled) avatar.focus({ preventScroll: true });
    else document.getElementById("stop").focus({ preventScroll: true });
  }

  if (new URLSearchParams(location.search).get("intro") === "0") {
    overlay.remove();
    stage.inert = aside.inert = false;
    return;
  }

  function animate(element, frames, duration, delay = 0, easing = "ease") {
    const animation = element.animate(frames, { duration, delay, easing, fill: "both" });
    animations.push(animation);
    return animation;
  }

  overlay.disabled = false;
  overlay.addEventListener("click", () => {
    overlay.disabled = true;
    // Keep microphone and audio setup inside the original user gesture.
    startConversation();
    stage.style.visibility = aside.style.visibility = "visible";
    root.classList.add("intro-running");
    window.addEventListener("resize", finish);

    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      animate(avatar, [{ opacity: 0 }, { opacity: 1 }], 300);
      animate(overlay, [{ opacity: 1 }, { opacity: 0 }], 300).finished.then(finish, () => {});
      return;
    }

    const logo = document.getElementById("intro-logo");
    const dot = document.getElementById("intro-dot").getBoundingClientRect();
    const logoRect = logo.getBoundingClientRect();
    // The SVG body occupies 40…160 of its 200-unit viewBox.
    const target = avatar.querySelector("svg").getBoundingClientRect();
    const size = target.width * .6;
    const left = target.left + target.width * .2;
    const top = target.top + target.height * .2;
    const sx = size / dot.width;
    const sy = size / dot.height;
    const dx = left - logoRect.left - (dot.left - logoRect.left) * sx;
    const dy = top - logoRect.top - (dot.top - logoRect.top) * sy;
    const morph = document.createElement("span");
    morph.id = "intro-morph";
    // Laid out at its landing size and scaled down to the dot, so it is drawn sharp and only ever
    // shrinks; growing a dot-sized box blurs the eye edges on high-DPI screens.
    Object.assign(morph.style, { left: `${left}px`, top: `${top}px`, width: `${size}px`, height: `${size}px` });
    const eyes = document.createElement("span");
    eyes.className = "intro-eyes";
    eyes.innerHTML = "<i></i><i></i>";
    const shine = document.createElement("span");
    shine.className = "intro-shine";
    morph.append(shine, eyes);
    overlay.append(morph);
    // Wake-up: a rapid double blink in place, a short pause, then the eyes slowly open all the way
    // while we zoom in.
    const zoom = 625;
    const eyesOpen = zoom + 1000;
    animate(eyes, [
      { transform: "scaleY(.2)", easing: "ease-out" },
      { transform: "scaleY(.85)", offset: 125 / eyesOpen, easing: "ease-in" },
      { transform: "scaleY(.08)", offset: 250 / eyesOpen, easing: "ease-out" },
      { transform: "scaleY(.85)", offset: 375 / eyesOpen, easing: "ease-in" },
      { transform: "scaleY(.08)", offset: 500 / eyesOpen },
      { transform: "scaleY(.08)", offset: zoom / eyesOpen, easing: "cubic-bezier(.3, 0, .2, 1)" },
      { transform: "scaleY(1)" },
    ], eyesOpen, 0, "linear");
    if (!root.classList.contains("mic-ready")) animate(eyes, [{ opacity: 0 }, { opacity: 1 }], 140);

    const easing = "cubic-bezier(.65, 0, .2, 1)";
    animate(logo, [{ transform: "none" }, { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }], 1270, zoom, easing);
    animate(document.getElementById("intro-letters"), [{ opacity: 1 }, { opacity: 0 }], 650, zoom + 170);
    animate(morph, [
      { transform: `translate(${dot.left - left}px, ${dot.top - top}px) scale(${1 / sx}, ${1 / sy})`, borderRadius: "0" },
      { transform: "none", borderRadius: `${size * 34 / 120}px` },
    ], 1270, zoom, easing);
    // Hold purple through the wake-up, then reveal the avatar beneath the landing square.
    animate(overlay, [
      { backgroundColor: "#360573" },
      { backgroundColor: "#360573", offset: .45 },
      { backgroundColor: "#f5f3f8", offset: .9 },
      { backgroundColor: "rgb(245 243 248 / 0)" },
    ], 1450, zoom - 180, "linear");
    handoffTimer = setTimeout(() => root.classList.add("intro-landing"), zoom + 670);
    animate(avatar, [{ opacity: 0 }, { opacity: 1 }], 1, zoom + 1120);
    // Crossfade the waking face into the live expression without changing conversation emotions.
    animate(morph, [{ opacity: 1 }, { opacity: 0 }], 260, zoom + 1270);
    animate(aside, [{ opacity: 0, transform: "translateY(18px)" }, { opacity: 1, transform: "none" }], 250, zoom + 1420).finished.then(finish, () => {});
  }, { once: true });
}

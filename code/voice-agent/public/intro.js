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
    Object.assign(morph.style, { left: `${dot.left}px`, top: `${dot.top}px`, width: `${dot.width}px`, height: `${dot.height}px` });
    overlay.append(morph);

    const easing = "cubic-bezier(.65, 0, .2, 1)";
    animate(logo, [{ transform: "none" }, { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }], 1450, 0, easing);
    animate(document.getElementById("intro-letters"), [{ opacity: 1 }, { opacity: 0 }], 650, 350);
    animate(morph, [
      { transform: "none", borderRadius: "0" },
      { transform: `translate(${left - dot.left}px, ${top - dot.top}px) scale(${sx}, ${sy})`, borderRadius: `${dot.width * 34 / 120}px / ${dot.height * 34 / 120}px` },
    ], 1450, 0, easing);
    // Purple holds through the first half of the zoom, then gives way to the page; at the end the
    // overlay turns see-through so the avatar, already shown under the green square, takes over.
    animate(overlay, [
      { backgroundColor: "#360573" },
      { backgroundColor: "#360573", offset: .45 },
      { backgroundColor: "#f5f3f8", offset: .9 },
      { backgroundColor: "rgb(245 243 248 / 0)" },
    ], 1450, 0, "linear");
    handoffTimer = setTimeout(() => root.classList.add("intro-landing"), 850);
    animate(avatar, [{ opacity: 0 }, { opacity: 1 }], 1, 1300);
    // Same body, same place: fading the square out only reveals the eyes, no ghosting.
    animate(morph, [{ opacity: 1 }, { opacity: 0 }], 260, 1450);
    animate(aside, [{ opacity: 0, transform: "translateY(18px)" }, { opacity: 1, transform: "none" }], 250, 1600).finished.then(finish, () => {});
  }, { once: true });
}

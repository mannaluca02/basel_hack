// Demo page: wires paxi-voice.js to Lukas's avatar and a small test UI.
import { requestMicrophonePermission, setupIntro } from "./intro.js";
import { createPaxiVoice } from "./paxi-voice.js";
import { createPaxAvatar, EMOTIONS } from "/avatar/pax-avatar.js";

const $ = (id) => document.getElementById(id);
const TURN_GAP_MS = 1200;

// The sleeping dot only shows its closed eyes once the microphone is allowed.
const warmUpMicrophone = () => requestMicrophonePermission().then((allowed) => allowed && document.documentElement.classList.add("mic-ready"));

const questionnaire = await fetch("/api/questionnaire").then((response) => response.json());
$("questionnaire-title").textContent = questionnaire.title;

const avatar = createPaxAvatar($("avatar"));
// Shows which expression the avatar currently has, to check the emotions from the transcript.
setInterval(() => {
  const { face } = avatar.state;
  $("face").textContent = `Paxi: ${EMOTIONS[face]?.label ?? face}`;
}, 300);
const captured = {};
let turns = [];
// Set when Paxi closed the call for inactivity; the next tap continues that conversation.
let resumable = null;
const tierTitles = { core: "Kernangaben", extended: "Wenn es passt", planning: "Für die Berechnung" };
// Fields another part of the app wants first. In the demo: tap a field, or ?priorities=id,id.
const priorities = new Set(new URLSearchParams(location.search).get("priorities")?.split(",").filter(Boolean) ?? []);
// Set when the customer app opened Paxi for a case: what Paxi hears is proposed to that case.
const caseLink = new URLSearchParams(location.search).get("link") ?? undefined;

function renderAnswers() {
  $("answers").replaceChildren(
    ...Object.entries(tierTitles).flatMap(([tier, title]) => {
      const heading = document.createElement("h3");
      heading.textContent = title;
      return [heading, ...questionnaire.fields.filter((field) => (field.tier ?? "core") === tier).map(renderField)];
    }),
  );
}

function renderField(field) {
  const card = document.createElement("button");
  const answer = captured[field.id];
  card.className = "answer" + (answer ? ` ${answer.status}` : "") + (priorities.has(field.id) ? " priority" : "");
  card.title = "Antippen: Paxi soll das bevorzugt fragen";
  card.addEventListener("click", () => togglePriority(field.id));
  const label = document.createElement("div");
  label.className = "label";
  label.textContent = (priorities.has(field.id) ? "★ " : "") + field.label;
  const value = document.createElement("div");
  value.className = "value";
  value.textContent = !answer ? "–" : answer.status === "declined" ? "Möchte es nicht sagen – Kollege klärt es" : String(answer.value);
  card.append(label, value);
  return card;
}
renderAnswers();

async function togglePriority(fieldId) {
  if (priorities.has(fieldId)) priorities.delete(fieldId);
  else priorities.add(fieldId);
  renderAnswers();
  await paxi.prioritize([...priorities], "demo").catch((error) => console.error("Priorities failed", error));
}

// Same grouping rule as the server log, so the captions match the saved JSON.
function showFragment({ speaker, text, startMs, endMs }) {
  let turn = null;
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].speaker === speaker) {
      turn = turns[i];
      break;
    }
  }
  if (turn && startMs - turn.endMs <= TURN_GAP_MS) {
    turn.endMs = Math.max(turn.endMs, endMs);
    turn.element.textContent += text;
  } else {
    const element = document.createElement("div");
    element.className = `turn ${speaker}`;
    element.textContent = text;
    turn = { speaker, startMs, endMs, element };
    turns.push(turn);
    turns.sort((a, b) => a.startMs - b.startMs);
    $("transcript").replaceChildren(...turns.map((t) => t.element));
  }
  if (speaker === "agent") $("caption").textContent = turn.element.textContent;
  $("transcript").lastElementChild?.scrollIntoView({ block: "end" });
}

const statusText = {
  connecting: "Verbinde…",
  connected: "Verbunden – sprich einfach los.",
  switching: "Wechsle zur passenden Stimme…",
  ended: "Gespräch beendet. Log gespeichert.",
  inactive: "Wegen Inaktivität beendet. Tippe auf Paxi, um dort weiterzumachen.",
  error: "Fehler",
};

// The customer app that opened this window (FE-10): it gets Paxi's state for its avatar ring
// and controls. Only its own origin, passed in the URL, receives these messages.
const appOrigin = (() => {
  try {
    return window.opener ? new URL(new URLSearchParams(location.search).get("app") ?? "").origin : null;
  } catch {
    return null;
  }
})();
const tellApp = (status) => {
  if (appOrigin && window.opener && !window.opener.closed) window.opener.postMessage({ type: "pax.status", ...status }, appOrigin);
};
window.addEventListener("pagehide", () => tellApp({ state: "ended" }));

const callbacks = {
  onAudioStream: (stream) => avatar.attachAudio(stream),
  onAvatarEvent: (event) => {
    avatar.handle(event);
    if (event.type === "activity") tellApp({ state: "connected", activity: event.state });
  },
  onTranscript: showFragment,
  onAnswer: ({ fieldId, value, status }) => {
    captured[fieldId] = { value, status };
    renderAnswers();
  },
  onStatus: ({ state, detail, conversationId }) => {
    tellApp({ state: state === "error" ? "ended" : state, ...(state === "ended" || state === "error" ? { activity: "idle" } : {}) });
    const inactive = state === "ended" && detail === "inactive";
    resumable = inactive ? conversationId : state === "connecting" ? resumable : null;
    $("status").textContent = state === "error" ? `${statusText.error}: ${detail}` : statusText[inactive ? "inactive" : state];
    const active = state === "connecting" || state === "connected" || state === "switching";
    $("avatar").disabled = active;
    $("stop").hidden = !active;
    $("hint").textContent = active ? "" : inactive ? "Tippe auf Paxi, um weiterzumachen." : "Tippe auf Paxi, um das Gespräch zu starten.";
    if (paxi?.logUrl) {
      $("download").href = paxi.logUrl;
      $("download").hidden = false;
    }
  },
};

const paxi = createPaxiVoice({ ...callbacks, caseLink });

// Call controls of the customer app that opened this window (FE-10). Only that window may steer
// the call, and only with these actions.
window.addEventListener("message", (event) => {
  if (!window.opener || event.source !== window.opener) return;
  const { type, action } = event.data ?? {};
  if (type !== "pax.call") return;
  if (action === "end") paxi.stop();
  else if (action === "mute") paxi.setMuted(true);
  else if (action === "unmute") paxi.setMuted(false);
  else if (action === "stop_speaking") paxi.stopSpeaking();
  else if (action === "language" && ["de", "fr", "it", "en"].includes(event.data.language)) paxi.setLanguage(event.data.language);
});

// Opened without the customer app: the voice notice comes before the microphone.
const noticeNeeded = !caseLink;
let noticeAccepted = false;
$("notice-accept")?.addEventListener("click", () => {
  noticeAccepted = true;
  $("notice").hidden = true;
  warmUpMicrophone();
});
if (noticeNeeded) $("notice").hidden = false;
else warmUpMicrophone();

function startConversation() {
  if (paxi.running) return;
  if (noticeNeeded && !noticeAccepted) {
    $("notice").hidden = false;
    $("notice-accept").focus();
    return;
  }
  const resume = resumable;
  if (!resume) {
    turns = [];
    $("transcript").replaceChildren();
    $("caption").textContent = "";
    for (const key of Object.keys(captured)) delete captured[key];
    renderAnswers();
  }
  avatar.reset();
  paxi.start({ resume, priorities: [...priorities] }).catch(() => {});
}

$("avatar").addEventListener("click", startConversation);
setupIntro(startConversation);
$("stop").addEventListener("click", () => paxi.stop());

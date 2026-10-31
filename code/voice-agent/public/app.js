// Demo page: wires paxi-voice.js to Lukas's avatar and a small test UI.
import { createPaxiVoice } from "./paxi-voice.js";
import { mountPaxAvatar } from "/avatar/pax-avatar.js";
import { createAvatarController } from "/avatar/pax-avatar-controller.js";

const $ = (id) => document.getElementById(id);
const TURN_GAP_MS = 1200;

const questionnaire = await fetch("/api/questionnaire").then((response) => response.json());
$("questionnaire-title").textContent = questionnaire.title;

const avatar = createAvatarController(mountPaxAvatar($("avatar")));
const captured = {};
let turns = [];
// Set when Paxi closed the call for inactivity; the next tap continues that conversation.
let resumable = null;
const tierTitles = { core: "Kernangaben", extended: "Wenn es passt" };

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
  const card = document.createElement("div");
  const answer = captured[field.id];
  card.className = "answer" + (answer ? ` ${answer.status}` : "");
  const label = document.createElement("div");
  label.className = "label";
  label.textContent = field.label;
  const value = document.createElement("div");
  value.className = "value";
  value.textContent = !answer ? "–" : answer.status === "declined" ? "Möchte es nicht sagen – Kollege klärt es" : String(answer.value);
  card.append(label, value);
  return card;
}
renderAnswers();

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

const callbacks = {
  onAudioStream: (stream) => avatar.attachAudio(stream),
  onLevelSource: (level) => avatar.setLevelSource(() => level()),
  onAvatarEvent: (event) => avatar.handle(event),
  onTranscript: showFragment,
  onAnswer: ({ fieldId, value, status }) => {
    captured[fieldId] = { value, status };
    renderAnswers();
  },
  onStatus: ({ state, detail, conversationId }) => {
    const inactive = state === "ended" && detail === "inactive";
    resumable = inactive ? conversationId : state === "connecting" ? resumable : null;
    $("status").textContent = state === "error" ? `${statusText.error}: ${detail}` : statusText[inactive ? "inactive" : state];
    const active = state === "connecting" || state === "connected" || state === "switching";
    $("avatar").disabled = active;
    $("provider").disabled = active;
    $("stop").hidden = !active;
    $("hint").textContent = active ? "" : inactive ? "Tippe auf Paxi, um weiterzumachen." : "Tippe auf Paxi, um das Gespräch zu starten.";
    if (paxi?.logUrl) {
      $("download").href = paxi.logUrl;
      $("download").hidden = false;
    }
  },
};

// The AI source is chosen before the call. The ElevenLabs client is only loaded when needed.
const { providers } = await fetch("/api/providers").then((response) => response.json());
for (const { key, label, available } of providers) {
  $("provider").add(new Option(available ? label : `${label} (kein API-Key)`, key, false, false));
  $("provider").lastElementChild.disabled = !available;
}
const clients = {};
async function clientFor(provider) {
  if (!clients[provider]) {
    clients[provider] =
      provider === "elevenlabs"
        ? (await import("./paxi-voice-elevenlabs.js")).createPaxiElevenLabs(callbacks)
        : createPaxiVoice(callbacks);
  }
  return clients[provider];
}
let paxi = await clientFor($("provider").value);
$("provider").addEventListener("change", async () => {
  paxi = await clientFor($("provider").value);
});

$("avatar").addEventListener("click", () => {
  if (paxi.running) return;
  const resume = resumable;
  if (!resume) {
    turns = [];
    $("transcript").replaceChildren();
    $("caption").textContent = "";
    for (const key of Object.keys(captured)) delete captured[key];
    renderAnswers();
  }
  avatar.setLevelSource(null);
  paxi.start({ resume }).catch(() => {});
});
$("stop").addEventListener("click", () => paxi.stop());

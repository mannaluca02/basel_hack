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

function renderAnswers() {
  $("answers").replaceChildren(
    ...questionnaire.fields.map((field) => {
      const card = document.createElement("div");
      card.className = "answer" + (captured[field.id] ? " captured" : "");
      const label = document.createElement("div");
      label.className = "label";
      label.textContent = field.label;
      const value = document.createElement("div");
      value.className = "value";
      value.textContent = captured[field.id] ?? "–";
      card.append(label, value);
      return card;
    }),
  );
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
  error: "Fehler",
};

const paxi = createPaxiVoice({
  onAudioStream: (stream) => avatar.attachAudio(stream),
  onAvatarEvent: (event) => avatar.handle(event),
  onTranscript: showFragment,
  onAnswer: ({ fieldId, value }) => {
    captured[fieldId] = value;
    renderAnswers();
  },
  onStatus: ({ state, detail }) => {
    $("status").textContent = state === "error" ? `${statusText.error}: ${detail}` : statusText[state];
    const active = state === "connecting" || state === "connected" || state === "switching";
    $("avatar").disabled = active;
    $("stop").hidden = !active;
    $("hint").textContent = active ? "" : "Tippe auf Paxi, um das Gespräch zu starten.";
    if (paxi?.logUrl) {
      $("download").href = paxi.logUrl;
      $("download").hidden = false;
    }
  },
});

$("avatar").addEventListener("click", () => {
  if (paxi.running) return;
  turns = [];
  $("transcript").replaceChildren();
  $("caption").textContent = "";
  for (const key of Object.keys(captured)) delete captured[key];
  renderAnswers();
  paxi.start().catch(() => {});
});
$("stop").addEventListener("click", () => paxi.stop());

import { test } from "node:test";
import assert from "node:assert/strict";
import { addTranscriptFragment, createLog, openFields, validateAnswer } from "./conversation-log.mjs";

const questionnaire = {
  id: "q",
  version: "1",
  locale: "de-CH",
  fields: [
    { id: "full_name", label: "Name", type: "string" },
    { id: "birth_date", label: "Geburtsdatum", type: "date" },
  ],
};

test("groups fragments of one speaker into turns", () => {
  const log = createLog({ conversationId: "live_1", questionnaire, model: "m" });
  addTranscriptFragment(log, { speaker: "agent", text: "Wie heissen", start_ms: 0, end_ms: 400 });
  addTranscriptFragment(log, { speaker: "agent", text: " Sie?", start_ms: 450, end_ms: 700 });
  addTranscriptFragment(log, { speaker: "user", text: "Anna", start_ms: 2000, end_ms: 2300 });
  addTranscriptFragment(log, { speaker: "agent", text: "Danke.", start_ms: 5000, end_ms: 5400 });

  assert.deepEqual(
    log.transcript.map(({ speaker, text }) => [speaker, text]),
    [
      ["agent", "Wie heissen Sie?"],
      ["user", "Anna"],
      ["agent", "Danke."],
    ],
  );
});

test("lets a user turn keep growing while the agent overlaps", () => {
  const log = createLog({ conversationId: "live_2", questionnaire, model: "m" });
  addTranscriptFragment(log, { speaker: "user", text: "Ich heisse", start_ms: 0, end_ms: 500 });
  addTranscriptFragment(log, { speaker: "agent", text: "Mhm", start_ms: 550, end_ms: 700 });
  addTranscriptFragment(log, { speaker: "user", text: " Anna Muster", start_ms: 600, end_ms: 1200 });

  assert.equal(log.transcript[0].text, "Ich heisse Anna Muster");
  assert.equal(log.transcript[1].text, "Mhm");
});

test("validates dates and names", () => {
  const [name, birthDate] = questionnaire.fields;
  assert.deepEqual(validateAnswer(name, "  Anna Muster "), { ok: true, value: "Anna Muster" });
  assert.equal(validateAnswer(name, "").ok, false);
  assert.deepEqual(validateAnswer(birthDate, "1990-03-03"), { ok: true, value: "1990-03-03" });
  assert.equal(validateAnswer(birthDate, "1990-02-30").ok, false);
  assert.equal(validateAnswer(birthDate, "3. März 1990").ok, false);
  assert.equal(validateAnswer(birthDate, "2999-01-01").ok, false);
});

test("lists fields that are still open", () => {
  const log = createLog({ conversationId: "live_3", questionnaire, model: "m" });
  log.answers.full_name.status = "captured";
  assert.deepEqual(openFields(log), ["birth_date"]);
});

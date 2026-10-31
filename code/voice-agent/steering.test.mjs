import { test } from "node:test";
import assert from "node:assert/strict";
import { createCommandQueue, steerCommand } from "./steering.mjs";
import { addTranscriptFragment } from "./conversation-log.mjs";

const newLog = () => ({ events: [], priorities: [], transcript: [] });
const context = (describe = async ({ description }) => ({ description, change: null })) => ({
  describe,
  validFields: (value) => (Array.isArray(value) ? value.filter((id) => id === "annual_gross_income_chf") : null),
  labelsOf: (ids) => ids.map(() => "Bruttojahreseinkommen"),
  setPriorities: (log, priorities) => (log.priorities = priorities),
});

test("a topic waits for the current exchange and comes with a reminder", async () => {
  const log = newLog();
  const { command } = await steerCommand(log, { type: "topic", topic: "Hauskauf", reason: "neue Grafik", fields: ["annual_gross_income_chf"] }, context());
  assert.equal(command.type, "agenda");
  assert.match(command.note, /finish the current back-and-forth/);
  assert.match(command.reminder, /Hauskauf/);
  assert.deepEqual(log.priorities, ["annual_gross_income_chf"]);
  const soon = await steerCommand(log, { type: "topic", topic: "Ferien", urgency: "soon" }, context());
  assert.equal(soon.command.type, "note");
});

test("a changed visual says what changed; an unchanged or older one stays quiet", async () => {
  const log = newLog();
  const shown = await steerCommand(log, { type: "visual", id: "gap", title: "Lücke", description: "Gap 33k", revision: 1 }, context());
  assert.match(shown.command.note, /A new visual/);
  const same = await steerCommand(log, { type: "visual", event: "updated", id: "gap", description: "Gap 33k", revision: 2 }, context());
  assert.equal(same.command, null);
  const describe = async () => ({ description: "Gap 24k", change: "The gap shrank from 33k to 24k." });
  const updated = await steerCommand(log, { type: "visual", event: "updated", id: "gap", data: { gap: 24000 }, revision: 3 }, context(describe));
  assert.match(updated.command.note, /just changed.*shrank/s);
  assert.equal(updated.command.title, "Lücke");
  const older = await steerCommand(log, { type: "visual", event: "updated", id: "gap", description: "Gap 40k", revision: 2 }, context());
  assert.equal(older.command, null);
  const hidden = await steerCommand(log, { type: "visual", event: "hidden", id: "gap" }, context());
  assert.equal(hidden.command.type, "drop");
  assert.deepEqual(log.events.map((e) => e.type), ["visual_shown", "visual_updated", "visual_hidden"]);
});

test("end asks for a goodbye unless told otherwise", async () => {
  const log = newLog();
  const { command } = await steerCommand(log, { type: "end", reason: "Kollege übernimmt" }, context());
  assert.equal(command.goodbye, true);
  assert.match(command.note, /Kollege übernimmt.*goodbye/s);
  assert.equal((await steerCommand(log, { type: "end", goodbye: false }, context())).command.goodbye, false);
  assert.ok((await steerCommand(log, { type: "dance" }, context())).error);
});

test("the queue hands each command out until it was seen, newer visual updates replace older ones", () => {
  const queue = createCommandQueue();
  queue.push("c1", { type: "agenda", visualId: "gap", note: "v1" });
  queue.push("c1", { type: "note", note: "topic" });
  queue.push("c1", { type: "agenda", visualId: "gap", note: "v2" });
  assert.deepEqual(queue.since("c1", 0).map((c) => c.note), ["topic", "v2"]);
  assert.deepEqual(queue.since("c1", 3), []);
});

test("a confirmation question becomes its own turn with the given reply ID", () => {
  const log = newLog();
  addTranscriptFragment(log, { speaker: "agent", text: "Super.", start_ms: 0, end_ms: 500 });
  addTranscriptFragment(log, { speaker: "agent", text: " Stimmt das so?", start_ms: 700, end_ms: 1500, reply_id: "reply_1" });
  addTranscriptFragment(log, { speaker: "agent", text: " Ja oder nein?", start_ms: 1600, end_ms: 2000, reply_id: "reply_1" });
  assert.equal(log.transcript.length, 2);
  assert.equal(log.transcript[1].replyId, "reply_1");
  assert.equal(log.transcript[1].text, " Stimmt das so? Ja oder nein?");
});

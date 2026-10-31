import assert from "node:assert/strict";
import { test } from "node:test";
import { createCaseBridge } from "./case-bridge.mjs";

const CASE_ID = "0b1c2d3e-4f50-4a61-8b72-9c83d4e5f601";
const TOKEN = "a".repeat(43);
const HASH = "f".repeat(64);

// A fake case backend: answers the extractor context and records every proposal request.
function backend() {
  const requests = [];
  const batches = [];
  const fetchImpl = async (url, init) => {
    assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`);
    const path = new URL(url).pathname;
    if (init.method === "GET" && path.endsWith("/advisor/extractor-context")) {
      return json({ caseRevision: 5, profileVersion: null, draftHash: HASH, personIds: ["person_demo_1", "person_demo_2"], proposalBatches: batches });
    }
    if (init.method === "POST" && path.endsWith("/voice/agent-observations")) {
      const body = JSON.parse(init.body);
      requests.push(body);
      const batch = { id: `batch_${requests.length}`, status: "proposed", changes: body.observations.map((o) => ({ path: o.fieldId })) };
      batches.push(batch);
      return json({ proposalBatch: batch, issues: [] });
    }
    return json({ code: "NOT_FOUND" }, 404);
  };
  return { requests, batches, fetchImpl };
}

function json(body, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function conversation(answers, transcript) {
  return { conversationId: "conv_1", transcript, answers };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
const quiet = { warn() {}, info() {}, error() {} };

test("a link needs a case, a grant and a future expiry, and never hands the grant back", () => {
  const bridge = createCaseBridge({ apiUrl: "http://backend", fetchImpl: async () => json({}), log: quiet });
  assert.throws(() => bridge.register({ caseId: "x", agentToken: TOKEN, expiresAt: new Date(Date.now() + 60_000).toISOString() }));
  assert.throws(() => bridge.register({ caseId: CASE_ID, agentToken: TOKEN, expiresAt: new Date(Date.now() - 1).toISOString() }));
  const { linkId } = bridge.register({ caseId: CASE_ID, agentToken: TOKEN, expiresAt: new Date(Date.now() + 60_000).toISOString() });
  assert.deepEqual(bridge.linkFor(linkId), { linkId, caseId: CASE_ID });
  assert.equal(bridge.linkFor("unknown"), null);
});

test("captured answers become quoted observations for the right person", async () => {
  const fake = backend();
  const bridge = createCaseBridge({ apiUrl: "http://backend", fetchImpl: fake.fetchImpl, log: quiet });
  const { linkId } = bridge.register({ caseId: CASE_ID, agentToken: TOKEN, expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const log = conversation(
    {
      annual_gross_income_chf: { status: "captured", value: 119000, quote: "119'000" },
      partner_annual_gross_income_chf: { status: "captured", value: 60000, quote: "etwa sechzigtausend" },
      occupation: { status: "captured", value: "Lehrer", quote: "Lehrer" },
      civil_status: { status: "open", value: null },
    },
    [
      { speaker: "agent", text: "Was verdienst du?" },
      { speaker: "user", text: "Ich verdiene 119'000 brutto im Jahr." },
      { speaker: "user", text: "Meine Frau etwa sechzigtausend." },
    ],
  );
  bridge.answersChanged(linkId, log);
  await settle();

  assert.equal(fake.requests.length, 1);
  const [request] = fake.requests;
  assert.equal(request.expectedCaseRevision, 5);
  assert.equal(request.basisDraftHash, HASH);
  // Only fields the backend maps directly; the occupation needs structured input.
  assert.deepEqual(request.observations.map((o) => [o.fieldId, o.personId, o.precision]), [
    ["annual_gross_income_chf", "person_demo_1", "exact"],
    ["partner_annual_gross_income_chf", "person_demo_2", "approximate"],
  ]);
  assert.deepEqual(request.observations[0], {
    fieldId: "annual_gross_income_chf",
    personId: "person_demo_1",
    sourceMessageId: "conv_1_t1",
    quote: "119'000",
    value: 119000,
    precision: "exact",
    unit: "CHF",
    period: "year",
    basis: "gross",
  });
  assert.deepEqual(request.turns.map((t) => t.messageId), ["conv_1_t1", "conv_1_t2"]);
});

test("a newer answer replaces the open package, an accepted one is not proposed again", async () => {
  const fake = backend();
  const bridge = createCaseBridge({ apiUrl: "http://backend", fetchImpl: fake.fetchImpl, log: quiet });
  const { linkId } = bridge.register({ caseId: CASE_ID, agentToken: TOKEN, expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const transcript = [{ speaker: "user", text: "Ich bin 1984 geboren, 100 Prozent angestellt, ich verdiene 119000." }];
  const log = conversation({ annual_gross_income_chf: { status: "captured", value: 119000, quote: "119000" } }, transcript);

  bridge.answersChanged(linkId, log);
  await settle();
  log.answers.employment_rate_percent = { status: "captured", value: 100, quote: "100 Prozent" };
  bridge.answersChanged(linkId, log);
  await settle();
  assert.deepEqual(fake.requests[1].supersedesBatchIds, ["batch_1"]);
  assert.equal(fake.requests[1].observations.length, 2);

  fake.batches[1].status = "accepted";
  bridge.answersChanged(linkId, log);
  await settle();
  assert.equal(fake.requests.length, 2);

  transcript.push({ speaker: "user", text: "Korrektur: 120000." });
  log.answers.annual_gross_income_chf = { status: "captured", value: 120000, quote: "120000" };
  bridge.answersChanged(linkId, log);
  await settle();
  assert.deepEqual(fake.requests[2].observations.map((o) => [o.fieldId, o.value]), [["annual_gross_income_chf", 120000]]);
  assert.deepEqual(fake.requests[2].supersedesBatchIds, []);
});

test("an answer whose quote is in no customer turn is not proposed", async () => {
  const fake = backend();
  const bridge = createCaseBridge({ apiUrl: "http://backend", fetchImpl: fake.fetchImpl, log: quiet });
  const { linkId } = bridge.register({ caseId: CASE_ID, agentToken: TOKEN, expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const log = conversation(
    { annual_gross_income_chf: { status: "captured", value: 119000, quote: "119000" } },
    [{ speaker: "agent", text: "Also 119000?" }, { speaker: "user", text: "Ja." }],
  );
  bridge.answersChanged(linkId, log);
  await settle();
  assert.equal(fake.requests.length, 0);
});

test("a percentage spoken as words stays exact, an amount spoken as words is asked back", async () => {
  const fake = backend();
  const bridge = createCaseBridge({ apiUrl: "http://backend", fetchImpl: fake.fetchImpl, log: quiet });
  const { linkId } = bridge.register({ caseId: CASE_ID, agentToken: TOKEN, expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const log = conversation(
    {
      employment_rate_percent: { status: "captured", value: 100, quote: "hundert Prozent" },
      annual_gross_income_chf: { status: "captured", value: 100000, quote: "hunderttausend brutto" },
    },
    [{ speaker: "user", text: "Ich arbeite hundert Prozent und verdiene hunderttausend brutto." }],
  );
  bridge.answersChanged(linkId, log);
  await settle();
  assert.deepEqual(fake.requests[0].observations.map((o) => [o.fieldId, o.precision]), [
    ["employment_rate_percent", "exact"],
    ["annual_gross_income_chf", "approximate"],
  ]);
});

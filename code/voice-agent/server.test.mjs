import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// End to end through the real Paxi server: routes, origin checks, conversation logs, the
// questionnaire extraction, language, priorities, steering, close and resume. Only OpenAI is
// replaced, at the network: a stand-in for /v1/live/sessions and /v1/responses.

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer()
      .listen(0, "127.0.0.1", () => {
        const { port } = server.address();
        server.close(() => resolve(port));
      })
      .on("error", reject);
  });

const openai = { live: [], responses: [], rejectTriggersOnce: false, updates: [] };
const realFetch = globalThis.fetch;
let base, origin, server, logDirectory;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function responseWith(value) {
  return json({ id: `resp_${openai.responses.length}`, object: "response", status: "completed",
    output: [{ type: "message", id: "msg", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(value), annotations: [] }] }] });
}

before(async () => {
  logDirectory = await mkdtemp(join(tmpdir(), "paxi-logs-"));
  const port = await freePort();
  // The case backend is unreachable here: a linked case must degrade, not break the call.
  const closedPort = await freePort();
  Object.assign(process.env, { PAX_VOICE_AGENT_PORT: String(port), OPENAI_API_KEY: "sk-test", PAXI_STEER_TOKEN: "steer-secret", PAXI_LOG_DIR: logDirectory,
    PAX_API_URL: `http://127.0.0.1:${closedPort}`, PAX_APP_ORIGINS: "http://localhost:4200" });
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    if (!url.startsWith("https://api.openai.com/")) return realFetch(input, init);
    const body = JSON.parse(init.body ?? (await input.text()));
    if (url.endsWith("/live/sessions")) {
      openai.live.push(body);
      if (openai.rejectTriggersOnce && body.session.triggers) {
        openai.rejectTriggersOnce = false;
        return json({ error: { message: "triggers are not enabled for this project", type: "invalid_request_error" } }, 400);
      }
      return json({ session: { id: `sess_${openai.live.length}` }, transport: { type: "webrtc", sdp: "v=answer" } });
    }
    openai.responses.push(body);
    switch (body.text?.format?.name) {
      case "questionnaire_updates":
        return responseWith({ updates: openai.updates.splice(0), declines: [] });
      case "language":
        return responseWith({ language: "it" });
      case "conversation_context":
        return responseWith({ summary: "Spricht über Arbeit.", notes: [], proposals: [], possible_needs: [] });
      case "visual":
        return responseWith({ description: "Income stays flat.", change: "" });
      default:
        return json({ error: { message: "unexpected" } }, 400);
    }
  };
  const agent = await import("./server.mjs");
  server = await agent.startVoiceAgent();
  base = `http://127.0.0.1:${port}`;
  origin = `http://localhost:${port}`;
});

after(async () => {
  globalThis.fetch = realFetch;
  await new Promise((resolve) => server.close(resolve));
  await rm(logDirectory, { recursive: true, force: true });
});

const call = (method, path, body, headers = { Origin: origin }) =>
  realFetch(base + path, { method, headers: { "Content-Type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    .then(async (r) => ({ status: r.status, body: r.status === 204 ? null : await r.json().catch(() => null) }));

async function startSession(extra = {}) {
  const r = await call("POST", "/api/session", { sdp: "v=offer", ...extra });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}

test("serves the demo page and the questionnaire", async () => {
  assert.equal((await realFetch(`${base}/`)).status, 200);
  const questionnaire = await call("GET", "/api/questionnaire");
  assert.ok(questionnaire.body.fields.some((f) => f.id === "annual_gross_income_chf"));
});

test("only Paxi's own page starts sessions, and only with an SDP offer", async () => {
  assert.equal((await call("POST", "/api/session", { sdp: "v=offer" }, { Origin: "http://evil.example" })).status, 403);
  assert.equal((await call("POST", "/api/session", {})).status, 400);
  assert.equal((await call("POST", "/api/session", { sdp: "v=offer", continueFrom: "unknown" })).status, 404);
  assert.equal((await call("POST", "/api/session", { sdp: "v=offer", resume: "unknown" })).status, 404);
});

test("a new session: GPT-Live with persona, skills and the recorded intro; a log is written", async () => {
  const session = await startSession();
  assert.equal(session.session.id, `sess_${openai.live.length}`);
  assert.equal(session.conversationId, session.session.id);
  assert.equal(session.emotions, true);
  const sent = openai.live.at(-1);
  assert.equal(sent.transport.sdp, "v=offer");
  assert.match(sent.session.instructions, /Paxi/);
  assert.ok(sent.session.delegation.responses.tools.length > 0);
  assert.ok((await readdir(logDirectory)).some((name) => name.startsWith(session.conversationId)), "log in PAXI_LOG_DIR");
  const log = await call("GET", `/api/conversations/${session.session.id}`);
  assert.equal(log.body.status, "active");
  assert.equal((await call("GET", "/api/conversations/unknown")).status, 404);
});

test("without avatar emotions the session still starts", async () => {
  openai.rejectTriggersOnce = true;
  const session = await startSession();
  assert.equal(session.emotions, false);
  assert.equal(openai.live.at(-1).session.triggers, undefined);
});

test("transcript fragments are logged and fill the questionnaire after a short pause", async () => {
  const session = await startSession();
  const id = session.session.id;
  openai.updates.push({ field_id: "annual_gross_income_chf", value: "85000", quote: "rund 85000 brutto" });
  const fragments = [
    { speaker: "agent", text: "Wie viel verdienst du?", start_ms: 0, end_ms: 900 },
    { speaker: "user", text: "Ich verdiene rund 85000 brutto.", start_ms: 1000, end_ms: 2500, reply_id: "reply_1" },
    { speaker: "user", text: "Привет", start_ms: 2600, end_ms: 2700 },
    { speaker: "robot", text: "ignored", start_ms: 0, end_ms: 1 },
  ];
  assert.equal((await call("POST", `/api/conversations/${id}/transcript`, { fragments })).status, 204);
  await new Promise((resolve) => setTimeout(resolve, 1800));
  const log = (await call("GET", `/api/conversations/${id}`)).body;
  assert.deepEqual(log.transcript.map((t) => t.speaker), ["agent", "user"], "foreign-script noise and unknown speakers are dropped");
  assert.equal(log.answers.annual_gross_income_chf.status, "captured");
  const progress = (await call("GET", `/api/conversations/${id}/progress?since=0`)).body;
  assert.ok(progress.version >= 1);
  assert.ok(progress.changes.some((c) => c.fieldId === "annual_gross_income_chf"));
  assert.ok(Array.isArray(progress.open_core));
  assert.equal((await call("GET", `/api/conversations/${id}/progress?since=${progress.version}`)).body.changes.length, 0);
});

test("language: by the first words, by the model, or refused when unknown", async () => {
  const id = (await startSession()).session.id;
  const french = await call("POST", `/api/conversations/${id}/language`, { text: "Bonjour, je voudrais parler de ma retraite et de ma famille" });
  assert.equal(french.body.ok, true);
  assert.equal(french.body.language, "fr");
  assert.equal(french.body.switch_voice, true);
  const byModel = await call("POST", `/api/conversations/${id}/language`, { text: "ok ok" });
  assert.equal(byModel.body.language, "it");
  const unknown = await call("POST", `/api/conversations/${id}/language`, { language: "es" });
  assert.equal(unknown.body.ok, false);

  // The next session continues that conversation in the native voice.
  const next = await startSession({ continueFrom: id });
  assert.equal(next.conversationId, id);
  assert.equal(next.language, "it");
  assert.match(next.greeting, /continues in a new voice/);
});

test("priorities steer which questions come first", async () => {
  const id = (await startSession()).session.id;
  const set = await call("POST", `/api/conversations/${id}/priorities`, { fields: ["annual_gross_income_chf", "nope"], source: "test" });
  assert.equal(set.status, 200, JSON.stringify(set.body));
  assert.deepEqual(set.body.priorities, ["annual_gross_income_chf"]);
  assert.equal(set.body.open_priority[0], set.body.labels[0]);
  assert.equal((await call("POST", `/api/conversations/${id}/priorities`, { fields: "x" })).status, 400);
});

test("steering from the browser and from the backend, with its token", async () => {
  const id = (await startSession()).session.id;
  const visual = await call("POST", `/api/conversations/${id}/steer`, { type: "visual", id: "chart_income", title: "Einkommen", data: '{"values":[1,1]}' });
  assert.equal(visual.status, 200, JSON.stringify(visual.body));
  assert.equal(visual.body.description, "Income stays flat.");
  const legacy = await call("POST", `/api/conversations/${id}/visuals`, { id: "chart_income", title: "Einkommen", description: "Given text" });
  assert.equal(legacy.status, 200, JSON.stringify(legacy.body));
  assert.equal((await call("POST", `/api/conversations/${id}/steer`, { type: "dance" })).status, 400);

  const backend = (body, token = "steer-secret") => call("POST", "/api/steer", body, { Authorization: `Bearer ${token}` });
  assert.equal((await backend({ conversationId: id, type: "stop_speaking" }, "wrong")).status, 401);
  assert.equal((await backend({ conversationId: "missing", type: "stop_speaking" })).status, 404);
  const stop = await backend({ conversationId: id, type: "stop_speaking" });
  assert.equal(stop.status, 202, "queued for the browser");
  // The browser picks the command up with its next progress poll.
  const progress = (await call("GET", `/api/conversations/${id}/progress?commands=0`)).body;
  assert.ok(progress.commands.some((c) => c.command?.type === "stop_speaking" || c.type === "stop_speaking"));
});

test("closing ends the conversation and summarises it; a closed one can be resumed", async () => {
  const id = (await startSession()).session.id;
  await call("POST", `/api/conversations/${id}/transcript`, { fragments: [{ speaker: "user", text: "Ich arbeite als Lehrerin.", start_ms: 0, end_ms: 800 }] });
  assert.equal((await call("POST", `/api/conversations/${id}/close`, { status: "inactive" })).status, 204);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const closed = (await call("GET", `/api/conversations/${id}`)).body;
  assert.equal(closed.status, "inactive");
  assert.equal(closed.context.summary, "Spricht über Arbeit.");

  const resumed = await startSession({ resume: id });
  assert.equal(resumed.conversationId, id);
  assert.match(resumed.greeting, /back/i);
  assert.equal((await call("GET", `/api/conversations/${resumed.session.id}`)).body.status, "active");
  assert.equal((await call("POST", "/api/session", { sdp: "v=offer", resume: id })).status, 404, "an active conversation is not resumed twice");
});

test("the customer app hands a case to Paxi; only the app's origin, only valid grants", async () => {
  const app = { Origin: "http://localhost:4200" };
  const caseId = "9a2a0ccf-4f60-491c-9ac0-35c76e7b4a25";
  const grant = { caseId, agentToken: "a".repeat(43), expiresAt: new Date(Date.now() + 900_000).toISOString() };
  const preflight = await realFetch(`${base}/api/case-link`, { method: "OPTIONS", headers: app });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "http://localhost:4200");
  assert.equal((await call("POST", "/api/case-link", grant, { Origin: "http://evil.example" })).status, 403);
  assert.equal((await call("POST", "/api/case-link", { ...grant, agentToken: "short" }, app)).status, 400);
  const link = await call("POST", "/api/case-link", grant, app);
  assert.equal(link.status, 201, JSON.stringify(link.body));
  assert.equal(link.body.caseId, caseId);
  assert.doesNotMatch(JSON.stringify(link.body), /aaaa/, "the grant is never echoed");

  const renewed = await call("PUT", `/api/case-link/${link.body.linkId}`, { ...grant, agentToken: "b".repeat(43) }, app);
  assert.equal(renewed.status, 200, JSON.stringify(renewed.body));
  assert.equal((await call("PUT", "/api/case-link/unknown", grant, app)).status, 404);
  assert.equal((await call("PUT", `/api/case-link/${link.body.linkId}`, { ...grant, caseId: crypto.randomUUID() }, app)).status, 400);

  // A session for the link records only the case reference; an unreachable backend degrades.
  const session = await startSession({ link: link.body.linkId });
  const log = (await call("GET", `/api/conversations/${session.session.id}`)).body;
  assert.equal(log.caseLink.caseId, caseId);
  assert.doesNotMatch(JSON.stringify(log), /bbbb/, "no grant in the log");
  const progress = (await call("GET", `/api/conversations/${session.session.id}/progress`)).body;
  assert.equal(progress.case_linked, false);
  assert.deepEqual(progress.case_questions, []);
  assert.equal(progress.stop, false);
});


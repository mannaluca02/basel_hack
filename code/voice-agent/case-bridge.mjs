// Connects a Paxi conversation to the shared case in Valentin's backend. The customer's app
// hands over a case-scoped agent grant (POST /api/case-link); it stays in this process only.
// After every extraction the captured answers go to the backend as one unconfirmed proposal
// package (POST /api/cases/:id/voice/agent-observations). The customer accepts and confirms
// them in the app; nothing here confirms anything.
import { randomUUID } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// How each portfolio field is stated, see code/apps/api/src/voice/portfolio.ts.
const MONEY = {
  annual_gross_income_chf: { period: "year", basis: "gross" },
  partner_annual_gross_income_chf: { period: "year", basis: "gross" },
  pillar_3a_annual_contribution_chf: { period: "year", basis: "not_applicable" },
  monthly_housing_cost_chf: { period: "month", basis: "not_applicable" },
};
const UNITS = {
  birth_date: "text",
  partner_birth_year: "year",
  relationship_since_year: "year",
  desired_retirement_age: "year",
  employment_rate_percent: "percent",
  has_pension_fund: "boolean",
  sex: "enum",
  civil_status: "enum",
  risk_appetite: "enum",
};
// The fields the backend turns into a proposal directly; everything else needs structured input.
const DIRECT = new Set([...Object.keys(MONEY), ...Object.keys(UNITS)]);
const PARTNER_FIELDS = new Set(["partner_annual_gross_income_chf", "partner_birth_year"]);
const MAIN_PERSON_FIELDS = new Set(["annual_gross_income_chf", "birth_date", "sex", "employment_rate_percent", "has_pension_fund", "desired_retirement_age"]);

export function createCaseBridge({ apiUrl, fetchImpl = fetch, log = console }) {
  const links = new Map(); // linkId -> { caseId, token, expiresAt }
  const state = new Map(); // conversationId -> { openBatchId, sent, accepted, count, running, again }
  const stateOf = (conversationId) => {
    if (!state.has(conversationId)) {
      state.set(conversationId, { openBatchId: null, sent: new Map(), accepted: new Map(), count: 0, running: false, again: false });
    }
    return state.get(conversationId);
  };

  function register(body) {
    const { caseId, agentToken, expiresAt } = body ?? {};
    if (typeof caseId !== "string" || !UUID.test(caseId)) throw new Error("caseId is required");
    if (typeof agentToken !== "string" || !/^[A-Za-z0-9_-]{40,100}$/.test(agentToken)) throw new Error("agentToken is required");
    const until = Date.parse(expiresAt);
    if (!Number.isFinite(until) || until <= Date.now()) throw new Error("expiresAt must be in the future");
    const linkId = randomUUID();
    links.set(linkId, { caseId, token: agentToken, expiresAt: until });
    for (const [id, link] of links) if (link.expiresAt <= Date.now()) links.delete(id);
    return { linkId, caseId, expiresAt: new Date(until).toISOString() };
  }

  /** The link of a conversation, as long as its grant is valid. Never returns the token. */
  function linkFor(linkId) {
    const link = typeof linkId === "string" ? links.get(linkId) : undefined;
    if (!link || link.expiresAt <= Date.now()) return null;
    return { linkId, caseId: link.caseId };
  }

  async function call(link, method, path, body) {
    const response = await fetchImpl(`${apiUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${link.token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.code ?? `HTTP ${response.status}`);
      error.code = data.code;
      error.status = response.status;
      throw error;
    }
    return data;
  }

  /** One observation per captured answer the backend can map; the quote must be in a person's turn. */
  function observations(conversationLog, personIds, pending) {
    const userTurns = conversationLog.transcript
      .map((turn, index) => ({ ...turn, messageId: `${conversationLog.conversationId}_t${index}` }))
      .filter((turn) => turn.speaker === "user" && turn.text.trim());
    const turns = new Map();
    const result = [];
    for (const [fieldId, answer] of pending) {
      const personId = PARTNER_FIELDS.has(fieldId) ? personIds[1] : MAIN_PERSON_FIELDS.has(fieldId) ? personIds[0] : undefined;
      if ((PARTNER_FIELDS.has(fieldId) || MAIN_PERSON_FIELDS.has(fieldId)) && !personId) continue;
      const quote = String(answer.quote ?? "").trim().slice(0, 500);
      const turn = quote && [...userTurns].reverse().find((t) => t.text.toLocaleLowerCase().includes(quote.toLocaleLowerCase()));
      if (!turn) {
        log.warn?.(`case bridge: no customer turn holds the quote for ${fieldId}, not proposed`);
        continue;
      }
      turns.set(turn.messageId, { messageId: turn.messageId, turnId: turn.messageId, text: turn.text.slice(0, 4000) });
      const money = MONEY[fieldId];
      const value = answer.value;
      // A value the person did not say in these digits ("rund zweitausend") is asked back, not taken.
      const digits = typeof value === "number" ? String(value) : null;
      const exact = digits === null || quote.replace(/['’\s]/g, "").includes(digits);
      result.push({
        fieldId,
        ...(personId ? { personId } : {}),
        sourceMessageId: turn.messageId,
        quote,
        value,
        precision: exact ? "exact" : "approximate",
        unit: money ? "CHF" : UNITS[fieldId] ?? "text",
        period: money ? money.period : null,
        basis: money ? money.basis : null,
      });
    }
    return { observations: result, turns: [...turns.values()].slice(-24) };
  }

  async function submit(linkId, conversationLog) {
    const link = links.get(linkId);
    if (!link || link.expiresAt <= Date.now()) return;
    const s = stateOf(conversationLog.conversationId);
    const context = await call(link, "GET", `/api/cases/${link.caseId}/advisor/extractor-context`);
    const open = s.openBatchId ? context.proposalBatches.find((b) => b.id === s.openBatchId) : null;
    if (open && open.status === "accepted") s.accepted = new Map(s.sent);
    if (!open || open.status !== "proposed") s.openBatchId = null;

    const pending = Object.entries(conversationLog.answers).filter(
      ([fieldId, answer]) => answer.status === "captured" && DIRECT.has(fieldId) && s.accepted.get(fieldId) !== answer.value,
    );
    if (!pending.length) return;
    const { observations: found, turns } = observations(conversationLog, context.personIds ?? [], pending);
    if (!found.length) return;
    s.count += 1;
    const body = {
      messageId: `${conversationLog.conversationId}_obs_${s.count}`.slice(0, 120),
      conversationId: conversationLog.conversationId,
      expectedCaseRevision: context.caseRevision,
      expectedProfileVersion: context.profileVersion,
      basisDraftHash: context.draftHash,
      turns,
      observations: found,
      supersedesBatchIds: s.openBatchId ? [s.openBatchId] : [],
    };
    const result = await call(link, "POST", `/api/cases/${link.caseId}/voice/agent-observations`, body);
    if (result.proposalBatch) s.openBatchId = result.proposalBatch.id;
    s.sent = new Map([...s.accepted, ...found.map((o) => [o.fieldId, o.value])]);
    const issues = result.issues?.map((i) => `${i.fieldId}:${i.code}`).join(", ");
    log.info?.(`case bridge: proposed ${result.proposalBatch?.changes.length ?? 0} change(s) for case ${link.caseId}${issues ? `; follow-up: ${issues}` : ""}`);
  }

  /** Called after each extraction; runs one submission per conversation at a time. */
  function answersChanged(linkId, conversationLog) {
    const s = stateOf(conversationLog.conversationId);
    if (s.running) {
      s.again = true;
      return;
    }
    s.running = true;
    (async () => {
      try {
        do {
          s.again = false;
          try {
            await submit(linkId, conversationLog);
          } catch (error) {
            // A stale revision means the case moved on (e.g. the customer accepted): read and retry once.
            if (["VERSION_CONFLICT", "STALE_CONTEXT", "STALE_PROPOSAL"].includes(error.code)) await submit(linkId, conversationLog);
            else throw error;
          }
        } while (s.again);
      } catch (error) {
        log.error?.(`case bridge: proposing to case failed (${error.code ?? error.message})`);
      } finally {
        s.running = false;
      }
    })();
  }

  return { register, linkFor, answersChanged };
}

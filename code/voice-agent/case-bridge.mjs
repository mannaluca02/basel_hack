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

// A turn keeps its first start time while more speech is added, unlike its position.
function turnId(conversationId, turn, index) {
  return Number.isFinite(turn.start_ms)
    ? `${conversationId}_${turn.speaker === "user" ? "c" : "a"}${Math.round(turn.start_ms)}`.slice(0, 120)
    : `${conversationId}_t${index}`.slice(0, 120);
}

const TURN_DEBOUNCE_MS = 800;
const CASE_STATE_TTL_MS = 4000;

const cents = (value) => (typeof value === "number" ? Math.round(value) / 100 : undefined);

/**
 * What the shared case already knows, as questionnaire answers, so Paxi never asks for it again.
 * The reverse of the backend's direct voice mapping; anything else stays for the conversation.
 */
export function knownFromCase(draft) {
  const financial = draft?.financial;
  const insurance = draft?.insurance;
  const [first, partner] = insurance?.persons ?? [];
  const person = (id) => financial?.persons.find((p) => p.id === id);
  const housing = financial?.expenses.filter((e) => e.category === "housing") ?? [];
  const known = {
    annual_gross_income_chf: cents(first?.grossAnnualIncomeCents),
    partner_annual_gross_income_chf: cents(partner?.grossAnnualIncomeCents),
    partner_birth_year: partner ? person(partner.personId)?.birthYear : undefined,
    employment_rate_percent: first && person(first.personId) ? person(first.personId).employmentRateBps / 100 : undefined,
    has_pension_fund: typeof first?.withPillar2 === "boolean" ? first.withPillar2 : undefined,
    desired_retirement_age: first?.desiredWorkStopAge ?? undefined,
    sex: first?.providerSex === 1 ? "male" : first?.providerSex === 2 ? "female" : undefined,
    civil_status: insurance && insurance.relationship !== "unknown" ? insurance.relationship : undefined,
    relationship_since_year: insurance?.relationshipSinceYear ?? undefined,
    pillar_3a_annual_contribution_chf: cents(insurance?.existingAnnualPillar3aContributionCents),
    monthly_housing_cost_chf: housing.length === 1 && housing[0].amount.period === "month" ? cents(housing[0].amount.value) : undefined,
    risk_appetite: insurance && insurance.riskAppetite !== "unknown" ? insurance.riskAppetite : undefined,
    children_count: insurance ? insurance.children.filter((c) => c.kind !== "expected").length : undefined,
  };
  return Object.fromEntries(Object.entries(known).filter(([, value]) => value !== undefined && value !== null));
}

export function createCaseBridge({ apiUrl, fetchImpl = fetch, log = console, turnDebounceMs = TURN_DEBOUNCE_MS }) {
  const links = new Map(); // linkId -> { caseId, token, expiresAt, state, stateAt }
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

  /** A fresh grant for an existing link, so a long conversation keeps syncing. */
  function renew(linkId, body) {
    const link = links.get(linkId);
    if (!link) throw new Error("Unknown link");
    const { caseId, agentToken, expiresAt } = body ?? {};
    if (caseId !== link.caseId) throw new Error("caseId does not match the link");
    if (typeof agentToken !== "string" || !/^[A-Za-z0-9_-]{40,100}$/.test(agentToken)) throw new Error("agentToken is required");
    const until = Date.parse(expiresAt);
    if (!Number.isFinite(until) || until <= Date.now()) throw new Error("expiresAt must be in the future");
    Object.assign(link, { token: agentToken, expiresAt: until });
    return { linkId, caseId, expiresAt: new Date(until).toISOString() };
  }

  /**
   * What Paxi needs from the case, read at most every few seconds: the answers it already knows,
   * clarifications the backend still needs, and whether the digital advice was stopped for a
   * human advisor. `null` once the grant expired.
   */
  async function caseState(linkId) {
    const link = links.get(linkId);
    if (!link || link.expiresAt <= Date.now()) return null;
    if (link.state && Date.now() - link.stateAt < CASE_STATE_TTL_MS) return link.state;
    const [context, advice] = await Promise.all([
      call(link, "GET", `/api/cases/${link.caseId}/advisor/extractor-context`),
      call(link, "GET", `/api/cases/${link.caseId}/voice/agent-recommendation`).catch(() => ({ recommendation: null })),
    ]);
    const recommendation = advice.recommendation;
    link.state = {
      recommendation: recommendation
        ? {
            reviewOpen: recommendation.reviewOpen,
            products: recommendation.candidates.map((c) => ({ name: c.productName, suitabilityCheckRequired: c.suitabilityCheckRequired })),
          }
        : null,
      known: knownFromCase(context.draft),
      questions: (context.ambiguities ?? []).filter((a) => a.dialogueStatus === "needs_answer").map((a) => a.question),
      stop: context.handover?.stopDigitalConversation === true,
    };
    link.stateAt = Date.now();
    return link.state;
  }

  /** An answer that came from the case is not proposed back to it. */
  function markKnown(conversationId, fieldId, value) {
    const s = stateOf(conversationId);
    s.accepted.set(fieldId, value);
    s.sent.set(fieldId, value);
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
      .map((turn, index) => ({ ...turn, messageId: turnId(conversationLog.conversationId, turn, index) }))
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
      // An amount the person did not say in these digits ("rund zweitausend") is asked back, not
      // taken. Years and percentages are often spoken as words ("hundert Prozent") and stay exact.
      const digits = money && typeof value === "number" ? String(value) : null;
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

  /**
   * Sends the conversation's turns that are new or grew since the last call, for the call history
   * in the app. Waits for a short pause, so a turn is not sent fragment by fragment.
   */
  function turnsChanged(linkId, conversationLog) {
    const s = stateOf(conversationLog.conversationId);
    s.sentTurns ??= new Map();
    clearTimeout(s.turnTimer);
    s.turnTimer = setTimeout(async () => {
      const link = links.get(linkId);
      if (!link || link.expiresAt <= Date.now()) return;
      const started = Date.parse(conversationLog.startedAt ?? "") || Date.now();
      const turns = conversationLog.transcript
        .map((turn, index) => ({
          messageId: turnId(conversationLog.conversationId, turn, index),
          speaker: turn.speaker === "user" ? "customer" : "agent",
          text: turn.text.trim().slice(0, 4000),
          at: new Date(started + (Number.isFinite(turn.start_ms) ? turn.start_ms : 0)).toISOString(),
        }))
        .filter((turn) => turn.text && s.sentTurns.get(turn.messageId) !== turn.text)
        .slice(-50);
      if (!turns.length) return;
      try {
        await call(link, "POST", `/api/cases/${link.caseId}/voice/agent-turns`, { conversationId: conversationLog.conversationId, turns });
        for (const turn of turns) s.sentTurns.set(turn.messageId, turn.text);
      } catch (error) {
        log.error?.(`case bridge: recording the call history failed (${error.code ?? error.message})`);
      }
    }, turnDebounceMs);
  }

  return { register, renew, linkFor, caseState, markKnown, answersChanged, turnsChanged };
}

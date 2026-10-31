// Fills the questionnaire from the conversation itself. Paxi just chats; after each
// turn of the person, the backend model reads the transcript and returns every detail
// the person has stated or that clearly follows from what they said. This works the
// same for every voice provider and does not interrupt the conversation.

export function extractionSchema(fields) {
  const fieldIds = fields.map((field) => field.id);
  return {
    type: "object",
    properties: {
      updates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            field_id: { type: "string", enum: fieldIds },
            value: { type: "string", description: "The value in the field's format." },
            quote: { type: "string", description: "The person's words this is based on." },
          },
          required: ["field_id", "value", "quote"],
          additionalProperties: false,
        },
      },
      declines: {
        type: "array",
        description: "Details the person refused to give, with how many separate times they refused.",
        items: {
          type: "object",
          properties: {
            field_id: { type: "string", enum: fieldIds },
            times: { type: "integer" },
            reason: { type: "string" },
          },
          required: ["field_id", "times", "reason"],
          additionalProperties: false,
        },
      },
    },
    required: ["updates", "declines"],
    additionalProperties: false,
  };
}

const RECENT_TURNS = 24;

// Low reasoning effort keeps the extraction to a few seconds, so Paxi's notes stay current.
export async function extractAnswers({ client, model, fields, formatOf, log, today, effort = "low" }) {
  const known = Object.entries(log.answers)
    .filter(([, answer]) => answer.status === "captured")
    .map(([id, answer]) => `${id} = ${JSON.stringify(answer.value)}`);
  // The latest turns are enough: everything earlier is already in "known".
  const transcript = log.transcript
    .slice(-RECENT_TURNS)
    .map((turn) => `${turn.speaker === "user" ? "Person" : "Paxi"}: ${turn.text.trim()}`)
    .join("\n");
  const result = await client.responses.create({
    model,
    instructions: `Du füllst einen Fragebogen aus einem Gespräch zwischen Paxi und einer Person. Heute ist ${today}.
Felder:
${fields.map((field) => `- ${field.id}: ${field.label} (${formatOf(field)})`).join("\n")}

Regeln:
- Nimm nur Angaben auf, die die Person selbst gemacht oder bestätigt hat, oder die eindeutig daraus folgen. Beispiele: "seit drei Jahren verheiratet" -> relationship_since_year = aktuelles Jahr minus 3; "Tochter, im Juli geboren, zwei Monate alt" -> children_birth_years "2026"; "Vollzeit" -> employment_rate_percent 100; "zur Miete" -> housing rent; "darf auch mal schwanken" -> risk_appetite high oder medium.
- Was Paxi nur vorschlägt, zählt erst, wenn die Person zustimmt. Bei Korrekturen gilt die letzte Angabe.
- Ungefähre Beträge als beste Zahl angeben ("rund 2000" -> 2000; Monatslohn netto ist kein Jahresbrutto, solche Angaben nicht umrechnen).
- Spannen als gerundeten Mittelwert ("mit 40, 45 aufhören" -> desired_retirement_age 43; "in zwei, drei Jahren" -> home_purchase_year aktuelles Jahr plus 3).
- "Sie arbeitet nicht" -> partner_annual_gross_income_chf 0. "Das Maximum" in die 3a -> der gesetzliche 3a-Maximalbetrag des aktuellen Jahres für Personen mit Pensionskasse, wenn du ihn sicher kennst.
- Gib nur neue oder geänderte Werte zurück. Bereits bekannt: ${known.length ? known.join("; ") : "nichts"}.
- declines: Felder, bei denen die Person ausdrücklich ablehnt, die Angabe zu machen, mit der Anzahl getrennter Ablehnungen. "Weiss ich nicht" ist keine Ablehnung.`,
    input: transcript || "(noch kein Gespräch)",
    reasoning: { effort },
    text: { format: { type: "json_schema", name: "questionnaire_updates", strict: true, schema: extractionSchema(fields) } },
  });
  return JSON.parse(result.output_text);
}

// Paxi chats instead of interrogating, so life context is pulled out of the transcript
// after the conversation rather than saved by tool calls that would interrupt the flow.
export const contextSchema = {
  type: "object",
  properties: {
    summary: { type: "string", description: "Two or three sentences about the person, in German." },
    notes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string", enum: ["hobbies", "work", "family", "housing", "plans", "finances", "health", "other"] },
          note: { type: "string", description: "One fact the person said, in German." },
        },
        required: ["topic", "note"],
        additionalProperties: false,
      },
    },
    possible_needs: {
      type: "array",
      description: "Pension or insurance topics a Pax colleague could explore, in German. Internal only.",
      items: { type: "string" },
    },
  },
  required: ["summary", "notes", "possible_needs"],
  additionalProperties: false,
};

export async function extractContext(client, model, log) {
  const userTurns = log.transcript.filter((turn) => turn.speaker === "user");
  if (userTurns.length === 0) return;
  const transcript = log.transcript.map((turn) => `${turn.speaker === "user" ? "Person" : "Paxi"}: ${turn.text}`).join("\n");
  try {
    const result = await client.responses.create({
      model,
      instructions:
        "Du wertest ein lockeres Kennenlern-Gespräch zwischen Paxi (digitaler Begleiter von Pax) und einer Person aus. " +
        "Halte nur fest, was die Person selbst gesagt hat; erfinde nichts. Formuliere auf Deutsch, auch wenn das Gespräch in einer anderen Sprache war. " +
        "possible_needs sind Ansatzpunkte für einen Pax-Kollegen oder eine Pax-Kollegin (z. B. Familie absichern, Wohneigentum, Selbständigkeit), keine Produktempfehlungen.",
      input: transcript,
      text: { format: { type: "json_schema", name: "conversation_context", strict: true, schema: contextSchema } },
    });
    log.context = { ...JSON.parse(result.output_text), extractedAt: new Date().toISOString(), model };
  } catch (error) {
    console.error("Context extraction failed", log.conversationId, error.message);
    log.context = { error: "extraction_failed", extractedAt: new Date().toISOString() };
  }
}


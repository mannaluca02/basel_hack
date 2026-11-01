/** One turn of the conversation as the extraction models read it. */
export type Turn = { role: 'user' | 'assistant'; text: string };

/** A user block without a number and with at most four words: a confirmation (Ja, pro Monat, brutto). */
const confirmation = (block: Turn[]) => {
  const text = block.map(t => t.text).join(' ');
  return text.split(/\s+/).filter(Boolean).length <= 4 && !/\d/.test(text);
};

/**
 * The latest exchange only, not the whole log: Paxi's last question(s) and the customer's answer
 * (consecutive fragments such as "äh" / "ungefähr" / "6000" count as one answer). A bare
 * confirmation also takes the exchange before it, so "Ja" still knows what it confirms. Earlier
 * sentences belonged to earlier questions; reading them moved values into the wrong fields.
 */
export function latestExchange(turns: Turn[], exchanges = 1): Turn[] {
  const blocks: { role: Turn['role']; turns: Turn[] }[] = [];
  for (const turn of turns) {
    const last = blocks.at(-1);
    if (last?.role === turn.role) last.turns.push(turn);
    else blocks.push({ role: turn.role, turns: [turn] });
  }
  const answer = blocks.findLastIndex(b => b.role === 'user');
  if (answer < 0) return [];
  let start = blocks[answer - 1]?.role === 'assistant' ? answer - 1 : answer;
  // `exchanges` more for an answer that spans several (the partner's age, then the rate).
  for (let more = exchanges - 1 + (confirmation(blocks[answer]!.turns) ? 1 : 0); more > 0; more--) {
    const earlier = blocks.slice(0, start).findLastIndex(b => b.role === 'user');
    if (earlier < 0) break;
    start = blocks[earlier - 1]?.role === 'assistant' ? earlier - 1 : earlier;
  }
  // A long monologue of fragments is capped; the answer is at its end.
  return blocks.slice(start, answer + 1).flatMap(b => b.turns).slice(-8 * exchanges);
}

// Steering a running Paxi call from outside: the customer app (postMessage → paxi.steer) or
// the backend (POST /api/steer). Every command becomes a note for Paxi. Topics and visuals
// never cut the person off: Paxi finishes the current exchange first, and the browser reminds
// it when the person answers ("agenda" commands with a reminder and an idle nudge).

const MAX_TEXT = 300;
const text = (value, max = MAX_TEXT) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const ID = /^[A-Za-z0-9_.:-]{1,120}$/;

/**
 * Commands for one conversation, waiting for the browser's next progress poll. A newer
 * command for the same visual replaces one that was not picked up yet.
 */
export function createCommandQueue() {
  const queues = new Map(); // conversation ID -> { seq, items }
  return {
    push(conversationId, command) {
      const queue = queues.get(conversationId) ?? { seq: 0, items: [] };
      queues.set(conversationId, queue);
      if (command.visualId) queue.items = queue.items.filter((item) => item.visualId !== command.visualId);
      const item = { ...command, seq: ++queue.seq };
      queue.items.push(item);
      return item;
    },
    /** Commands after `since`; older ones count as delivered and are dropped. */
    since(conversationId, since) {
      const queue = queues.get(conversationId);
      if (!queue) return [];
      queue.items = queue.items.filter((item) => item.seq > since);
      return queue.items;
    },
    clear(conversationId) {
      queues.delete(conversationId);
    },
  };
}

function topicCommand(body) {
  const topic = text(body.topic, 200);
  if (!topic) return { error: "topic is required" };
  const reason = text(body.reason, 200);
  const urgency = body.urgency === "soon" ? "soon" : "next";
  const why = reason ? ` (${reason})` : "";
  if (urgency === "soon") {
    return {
      command: {
        type: "note",
        note: `The app would like you to talk about "${topic}"${why}. Do not break off the current topic; bring it up at a natural moment in the next few turns, in your own words.`,
      },
    };
  }
  return {
    command: {
      type: "agenda",
      id: `topic:${topic}`,
      title: topic,
      note: `The app would like you to talk about "${topic}" next${why}. Do not break off the current topic for it: first finish the current back-and-forth. Then lead over to it naturally, in your own words, with an open question.`,
      reminder: `In your next turn, react briefly to what the person is saying now, then lead over to "${topic}" instead of asking something else.`,
      nudge: `The person is quiet. Lead over to "${topic}" now, with a light, open question.`,
    },
  };
}

function shownNote(title, description) {
  return `A new visual is now on the person's screen: "${title}".${description ? ` What it shows: ${description}` : ""}
Do not break off the current topic for it. First finish the current back-and-forth: let the person answer your current question and react to their answer. Then, instead of moving on to the next detail, turn to the visual naturally (for example "Schau mal, auf deinem Bildschirm siehst du jetzt …"): describe in one or two sentences what it shows, say what stands out for the person's situation, with rounded numbers, and ask what they think. Then continue where you left off. Never make up numbers that are not in the visual.`;
}

function updatedNote(title, description, change) {
  return `The visual "${title}" on the person's screen just changed.${change ? ` What changed: ${change}` : ""}${description ? ` It now shows: ${description}` : ""}
Do not break off the current topic for it. When the current back-and-forth is finished, point out briefly what changed and what it means for the person, with rounded numbers, and ask what they think. If you have not talked about this visual yet, describe it instead. Never make up numbers that are not in the visual.`;
}

/**
 * A visual was shown, changed or hidden. `describe({ title, description, data, previous })`
 * returns { description, change } (change is null when there is nothing to compare).
 * Returns { command: null } when nothing changed, so repeated updates stay quiet.
 */
async function visualCommand(log, body, describe) {
  const id = ID.test(body.id ?? "") ? body.id : null;
  const event = ["shown", "updated", "hidden"].includes(body.event) ? body.event : "shown";
  log.visuals ??= {};
  const previous = id ? log.visuals[id] : null;
  const title = text(body.title, 120) || previous?.title || "";
  if (!title) return { error: "title is required" };
  const at = new Date().toISOString();

  if (event === "hidden") {
    if (id) delete log.visuals[id];
    log.events.push({ type: "visual_hidden", at, id, title });
    return {
      command: {
        type: "drop",
        id: `visual:${id ?? title}`,
        note: `The visual "${title}" is no longer on the person's screen. Do not talk about it as if they could still see it.`,
      },
    };
  }

  const revision = Number.isInteger(body.revision) ? body.revision : null;
  if (previous && revision !== null && previous.revision !== null && revision <= previous.revision) return { command: null };
  const ownDescription = text(body.description, 900);
  const data = body.data === undefined ? undefined : JSON.stringify(body.data).slice(0, 8000);
  const fingerprint = ownDescription || data || "";
  if (previous && previous.fingerprint === fingerprint) return { command: null };

  const { description, change } = await describe({ title, description: ownDescription, data, previous });
  if (id) log.visuals[id] = { title, revision, fingerprint, data, description };
  const updated = Boolean(previous);
  log.events.push({ type: updated ? "visual_updated" : "visual_shown", at, id, title, revision, description, ...(change ? { change } : {}) });

  if (body.announce === false) {
    return {
      command: {
        type: "note",
        note: `For context, the person now sees the visual "${title}"${description ? `: ${description}` : ""}. Only talk about it if the person brings it up or it clearly helps.`,
      },
      description,
      change,
    };
  }
  return {
    command: {
      type: "agenda",
      id: `visual:${id ?? title}`,
      visualId: id ?? title,
      title,
      note: updated ? updatedNote(title, description, change) : shownNote(title, description),
      reminder: updated
        ? `In your next turn, react briefly to what the person is saying now, then point out what changed in "${title}" on their screen instead of asking something else.`
        : `In your next turn, react briefly to what the person is saying now, then turn to the visual "${title}" on their screen instead of asking a new question: describe it, comment on it and ask what they think.`,
      nudge: updated
        ? `The person is quiet. Point out now what changed in "${title}" on their screen and ask what they think.`
        : `The person is quiet. Turn to the visual "${title}" on their screen now: describe it, comment on it and ask what they think.`,
    },
    description,
    change,
  };
}

function endCommand(log, body) {
  const reason = text(body.reason, 200);
  log.events.push({ type: "end_requested", at: new Date().toISOString(), reason: reason || null, goodbye: body.goodbye !== false });
  return {
    command: {
      type: "end",
      goodbye: body.goodbye !== false,
      note: `End the conversation now. Finish your current sentence, do not ask anything else, and thank the person warmly in one or two sentences. ${
        reason ? `Briefly say why the conversation ends here (${reason}). ` : ""
      }Mention that a colleague of yours will get in touch about anything that is still open, and say goodbye.`,
    },
  };
}

/**
 * Turns a steering request into the command the browser applies. `context` provides
 * describe (visuals), validFields and labelsOf (priorities) and setPriorities.
 */
export async function steerCommand(log, body, context) {
  switch (body?.type) {
    case "topic": {
      const result = topicCommand(body);
      const fields = context.validFields(body.fields) ?? [];
      if (result.command && fields.length) context.setPriorities(log, [...new Set([...fields, ...(log.priorities ?? [])])], "steer");
      return result;
    }
    case "visual":
      return visualCommand(log, body, context.describe);
    case "priorities": {
      const fields = context.validFields(body.fields);
      if (!fields) return { error: "fields must be a list of questionnaire field IDs" };
      context.setPriorities(log, fields, text(body.source, 60) || "steer");
      return {
        command: fields.length
          ? {
              type: "note",
              note: `The app now especially needs: ${context.labelsOf(fields).join(", ")}. At the next natural moment, steer the conversation there, without breaking off what the person is telling you.`,
            }
          : null,
      };
    }
    case "end":
      return endCommand(log, body);
    case "stop_speaking":
      return { command: { type: "stop_speaking" } };
    default:
      return { error: "type must be topic, visual, priorities, end or stop_speaking" };
  }
}

// Records the welcome message (welcome.txt) with a GPT-Live voice, so every call starts
// with the same wording and pronunciation and no generation delay.
//   node record-welcome.mjs [voice] [takes]   -> welcome/take-1.wav, take-1.pcm, take-1.txt, …
//   node record-welcome.mjs --pick 2          -> uses take 2 as welcome/welcome.pcm
// Listen to the .wav files and pick the best take. A human recording also works:
// convert it to raw mono PCM16 at 24 kHz and save it as welcome/welcome.pcm.
import OpenAI from "openai";
import { LiveWS } from "openai/resources/live/ws";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const welcomeDirectory = resolve(here, "welcome");
try {
  process.loadEnvFile(resolve(here, "../../.env"));
} catch {
  // No .env at the repo root; rely on the process environment.
}

const SAMPLE_RATE = 24000;
const CHUNK_MS = 100;
const SILENCE_AFTER_SPEECH_MS = 2500;
const MAX_TAKE_MS = 40_000;

if (process.argv[2] === "--pick") {
  const take = Number(process.argv[3]);
  await copyFile(resolve(welcomeDirectory, `take-${take}.pcm`), resolve(welcomeDirectory, "welcome.pcm"));
  await copyFile(resolve(welcomeDirectory, `take-${take}.txt`), resolve(welcomeDirectory, "welcome-spoken.txt"));
  console.log(`Take ${take} is now the welcome recording. Restart the server.`);
  process.exit(0);
}

const voice = process.argv[2] ?? process.env.LIVE_VOICE ?? "juni";
const takes = Number(process.argv[3] ?? 3);
const welcomeText = (await readFile(resolve(here, "welcome.txt"), "utf8")).trim();
await mkdir(welcomeDirectory, { recursive: true });

for (let take = 1; take <= takes; take++) {
  const { audio, transcript } = await recordTake();
  const trimmed = trimSilence(audio);
  await writeFile(resolve(welcomeDirectory, `take-${take}.pcm`), trimmed);
  await writeFile(resolve(welcomeDirectory, `take-${take}.wav`), wav(trimmed));
  await writeFile(resolve(welcomeDirectory, `take-${take}.txt`), transcript.trim() + "\n");
  console.log(`take-${take}.wav (${(trimmed.length / 2 / SAMPLE_RATE).toFixed(1)} s): ${transcript.trim()}`);
}
console.log(`Listen to welcome/take-*.wav, then run: node record-welcome.mjs --pick <n>`);

function recordTake() {
  return new Promise((resolvePromise, reject) => {
    const ws = new LiveWS(new OpenAI());
    const chunks = [];
    let transcript = "";
    let lastAudioAt = 0;
    let silenceTimer;
    const startedAt = Date.now();

    ws.socket.on("open", () => {
      ws.send({
        type: "session.start",
        session: {
          model: process.env.LIVE_MODEL ?? "gpt-live-1",
          instructions:
            "You are a professional voice talent recording a short welcome message for Paxi. " +
            "Speak warmly, smoothly and naturally, without hesitation, with native pronunciation for each language. " +
            "Say exactly the given text once, nothing before or after it.",
          audio: { format: { type: "audio/pcm", rate: SAMPLE_RATE }, output: { voice } },
          input: [{ role: "developer", content: [{ type: "input_text", text: `Text to record: "${welcomeText}"` }] }],
        },
      });
    });

    ws.on("event", (event) => {
      if (event.type === "session.started") {
        // GPT-Live's timeline runs on input audio, so keep sending silence.
        const silence = Buffer.alloc((SAMPLE_RATE * CHUNK_MS) / 1000 * 2).toString("base64");
        silenceTimer = setInterval(() => {
          ws.send({ type: "session.input_audio.append", audio: silence });
          const quietFor = Date.now() - lastAudioAt;
          if ((lastAudioAt && quietFor > SILENCE_AFTER_SPEECH_MS) || Date.now() - startedAt > MAX_TAKE_MS) {
            clearInterval(silenceTimer);
            ws.send({ type: "session.close" });
          }
        }, CHUNK_MS);
        ws.send({
          type: "session.commentary.append",
          delegation_id: null,
          content: `Say exactly this now, then stop: "${welcomeText}"`,
        });
      } else if (event.type === "session.output_audio.delta") {
        chunks.push(Buffer.from(event.delta, "base64"));
        lastAudioAt = Date.now();
      } else if (event.type === "session.output_transcript.delta") {
        transcript += event.delta;
      } else if (event.type === "session.closed") {
        ws.close();
        resolvePromise({ audio: Buffer.concat(chunks), transcript });
      } else if (event.type === "error") {
        console.error("GPT-Live error", event.error?.code, event.error?.message);
      }
    });
    ws.on("error", (error) => {
      clearInterval(silenceTimer);
      reject(error);
    });
  });
}

// Cuts near-silent samples at both ends, keeping a short natural margin.
function trimSilence(pcm) {
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2);
  const threshold = 300;
  const margin = SAMPLE_RATE * 0.15;
  let start = samples.findIndex((sample) => Math.abs(sample) > threshold);
  let end = samples.findLastIndex((sample) => Math.abs(sample) > threshold);
  if (start < 0) return pcm;
  start = Math.max(0, start - margin);
  end = Math.min(samples.length, end + margin);
  return Buffer.from(pcm.subarray(start * 2, end * 2));
}

function wav(pcm) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { connectOpenAIRealtime } from "./openai-realtime-adapter.js";

test("microphone activity ignores clicks and speech pauses; playback stays immediate", async () => {
  let now = 0, tick, pc;
  const events = [];
  const microphone = { level: 0, getTracks: () => [{ stop() {} }], getAudioTracks: () => [{}] };
  const remote = { level: 0 };
  const channel = { readyState: "open", send() {} };
  class Peer {
    constructor() { pc = this; }
    iceGatheringState = "complete";
    localDescription = { sdp: "offer" };
    createDataChannel() { return channel; }
    addTrack() {}
    async createOffer() { return this.localDescription; }
    async setLocalDescription() {}
    async setRemoteDescription() {
      channel.onmessage({ data: JSON.stringify({ type: "session.started" }) });
    }
    close() {}
  }
  class Audio {
    async resume() {}
    createMediaStreamSource(stream) {
      return { connect(analyser) { analyser.stream = stream; }, disconnect() {} };
    }
    createAnalyser() {
      return { getFloatTimeDomainData(samples) { samples.fill(this.stream.level); } };
    }
    close() {}
  }
  mock.method(performance, "now", () => now);
  mock.method(globalThis, "setInterval", (callback) => { tick = callback; return 1; });
  mock.method(globalThis, "clearInterval", () => {});
  mock.method(globalThis, "fetch", async () => ({
    ok: true, headers: { get: () => null }, json: async () => ({ transport: { sdp: "answer" } }),
  }));
  const originals = Object.fromEntries(["RTCPeerConnection", "AudioContext", "navigator"].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)],
  ));
  Object.defineProperties(globalThis, {
    RTCPeerConnection: { configurable: true, value: Peer },
    AudioContext: { configurable: true, value: Audio },
    navigator: { configurable: true, value: { mediaDevices: { getUserMedia: async () => microphone } } },
  });
  const advance = (duration, level) => {
    microphone.level = level;
    for (let elapsed = 0; elapsed < duration; elapsed += 50) { now += 50; tick(); }
  };
  const activities = () => events.filter((e) => e.type === "activity").map((e) => e.state);
  try {
    await connectOpenAIRealtime({ sessionUrl: "/session", audioElement: { play: async () => {} }, onAvatarEvent: (e) => events.push(e) });
    pc.ontrack({ streams: [remote] });

    advance(50, 0.03); // A click must not look like a new user turn.
    advance(1500, 0);
    assert.deepEqual(activities(), [], "a short noise spike must not emit listening/thinking");

    advance(250, 0.03);
    assert.deepEqual(activities(), ["listening"]);
    for (let pause = 0; pause < 3; pause++) {
      advance(800, 0);
      advance(250, 0.03);
    }
    assert.deepEqual(activities(), ["listening"], "ordinary speech pauses must keep listening");
    advance(1300, 0);
    assert.deepEqual(activities(), ["listening", "thinking"]);
    advance(1500, 0);
    assert.deepEqual(activities(), ["listening", "thinking"], "silence must not repeat thinking");

    remote.level = 0.03;
    advance(50, 0);
    assert.equal(events.at(-1).event, "started", "output must start without the microphone debounce");
    remote.level = 0;
    advance(700, 0);
    assert.equal(events.at(-1).event, "ended", "output keeps its existing silence boundary");

    advance(250, 0.03);
    assert.deepEqual(activities(), ["listening", "thinking", "listening"]);
    channel.onmessage({ data: JSON.stringify({ type: "session.closed" }) });
    assert.equal(events.at(-1).state, "idle", "session close stays immediate");
  } finally {
    mock.restoreAll();
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

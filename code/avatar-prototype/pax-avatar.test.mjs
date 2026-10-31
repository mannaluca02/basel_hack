import { test } from "node:test";
import assert from "node:assert/strict";
import { createPaxAvatar } from "./pax-avatar.js";

function mount(t, options) {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  const node = () => ({ setAttribute() {}, appendChild() {} });
  const parts = new Map();
  const host = {
    innerHTML: "",
    querySelector(key) { if (!parts.has(key)) parts.set(key, node()); return parts.get(key); },
    querySelectorAll() { return [...parts.values()]; },
  };
  const globals = {
    document: { createElementNS: node },
    matchMedia: () => ({ addEventListener() {}, removeEventListener() {} }),
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    IntersectionObserver: class { observe() {} disconnect() {} },
  };
  const restore = [];
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    restore.push(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else delete globalThis[key];
    });
  }
  const avatar = createPaxAvatar(host, options);
  t.after(() => { avatar.destroy(); restore.forEach((restoreGlobal) => restoreGlobal()); });
  return avatar;
}
const emotion = (avatar, value, playbackId) => avatar.handle({ type: "emotion", emotion: value, playbackId });
const playback = (avatar, event, playbackId = "reply") => avatar.handle({ type: "playback", event, playbackId });

test("default hold cannot be bypassed by microphone activity during playback", (t) => {
  const avatar = mount(t);
  playback(avatar, "started");
  emotion(avatar, "pleased", "reply");
  t.mock.timers.tick(1000);
  avatar.handle({ type: "activity", state: "listening" });
  emotion(avatar, "curious", "reply");
  assert.equal(avatar.state.face, "pleased");
  t.mock.timers.tick(3999);
  assert.equal(avatar.state.face, "pleased");
  t.mock.timers.tick(1);
  assert.equal(avatar.state.face, "curious");
});

test("custom hold coalesces changes without repeated answers restarting the clock", (t) => {
  const avatar = mount(t, { emotionHoldMs: 1000 });
  emotion(avatar, "pleased");
  t.mock.timers.tick(200);
  emotion(avatar, "curious");
  t.mock.timers.tick(200);
  emotion(avatar, "explaining");
  t.mock.timers.tick(200);
  emotion(avatar, "explaining");
  t.mock.timers.tick(399);
  assert.equal(avatar.state.face, "pleased");
  t.mock.timers.tick(1);
  assert.equal(avatar.state.face, "explaining");
  emotion(avatar, "neutral");
  t.mock.timers.tick(1000);
  assert.equal(avatar.state.face, "neutral");
});

test("queued tone is held while thinking; playback end cannot relax it early", (t) => {
  const avatar = mount(t);
  avatar.handle({ type: "activity", state: "thinking" });
  emotion(avatar, "empathetic", "reply");
  t.mock.timers.tick(500);
  emotion(avatar, "curious", "reply");
  assert.equal(avatar.state.replyEmotion, "empathetic");
  playback(avatar, "started");
  assert.equal(avatar.state.face, "empathetic");
  playback(avatar, "ended");
  t.mock.timers.tick(4499);
  assert.equal(avatar.state.face, "empathetic");
  t.mock.timers.tick(1);
  assert.equal(avatar.state.face, "neutral", "expired reply's queued emotion must not appear");
});

test("cancellation and reset remain immediate and clear queued emotions", (t) => {
  const avatar = mount(t);
  playback(avatar, "started");
  emotion(avatar, "pleased", "reply");
  emotion(avatar, "curious", "reply");
  playback(avatar, "cancelled");
  assert.equal(avatar.state.face, "listening");
  t.mock.timers.tick(5000);
  assert.equal(avatar.state.replyEmotion, "pleased");
  avatar.reset();
  emotion(avatar, "explaining");
  assert.equal(avatar.state.face, "explaining");
});

test("an explicit initial neutral emotion starts the hold; repeated answers do not extend it", (t) => {
  const avatar = mount(t);
  emotion(avatar, "neutral");
  t.mock.timers.tick(1000);
  emotion(avatar, "neutral");
  emotion(avatar, "pleased");
  t.mock.timers.tick(3999);
  assert.equal(avatar.state.face, "neutral");
  t.mock.timers.tick(1);
  assert.equal(avatar.state.face, "pleased");
});

test("a new listening turn cannot reset an unexpired reply emotion hold", (t) => {
  const avatar = mount(t);
  emotion(avatar, "pleased");
  t.mock.timers.tick(1000);
  avatar.handle({ type: "activity", state: "listening" });
  emotion(avatar, "empathetic");
  assert.equal(avatar.state.face, "listening");
  assert.equal(avatar.state.replyEmotion, "pleased");
  t.mock.timers.tick(4000);
  assert.equal(avatar.state.replyEmotion, "empathetic");
  playback(avatar, "started");
  assert.equal(avatar.state.face, "empathetic");
});

test("zero hold applies immediately and destroy discards queued changes", (t) => {
  const avatar = mount(t, { emotionHoldMs: 0 });
  emotion(avatar, "pleased");
  emotion(avatar, "neutral");
  assert.equal(avatar.state.face, "neutral");
  const held = createPaxAvatar({ innerHTML: "", querySelector: () => ({ appendChild() {} }), querySelectorAll: () => [] });
  emotion(held, "pleased");
  emotion(held, "curious");
  held.destroy();
  t.mock.timers.tick(5000);
  assert.equal(held.state.replyEmotion, "pleased");
});

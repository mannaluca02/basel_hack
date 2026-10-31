import test from "node:test";
import assert from "node:assert/strict";
import { requestMicrophonePermission } from "./public/intro.js";

function mockNavigator(t, mediaDevices) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices } });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else delete globalThis.navigator;
  });
}

test("permission warm-up requests audio immediately and releases every track", async (t) => {
  let requested = false;
  let stopped = 0;
  mockNavigator(t, {
    getUserMedia: (constraints) => {
      assert.deepEqual(constraints, { audio: true });
      requested = true;
      return Promise.resolve({ getTracks: () => [
        { stop: () => stopped++ },
        { stop: () => stopped++ },
      ] });
    },
  });
  const permission = requestMicrophonePermission();
  assert.equal(requested, true);
  assert.equal(await permission, true);
  assert.equal(stopped, 2);
});

test("a denied permission does not block the intro", async (t) => {
  mockNavigator(t, { getUserMedia: () => Promise.reject(new Error("NotAllowedError")) });
  assert.equal(await requestMicrophonePermission(), false);
});

test("an unavailable microphone API does not block the intro", async (t) => {
  mockNavigator(t, undefined);
  assert.equal(await requestMicrophonePermission(), false);
});

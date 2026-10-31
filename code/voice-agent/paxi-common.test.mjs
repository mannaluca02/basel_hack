import { test } from "node:test";
import assert from "node:assert/strict";
import { withoutForeignScript } from "./public/paxi-common.js";

test("words in another script are removed as noise", () => {
  assert.equal(withoutForeignScript(" أختارك").trim(), "");
  assert.equal(withoutForeignScript(" สวัสดี ja gerne").trim(), "ja gerne");
});

test("German, French, Italian and English words stay, accents included", () => {
  for (const text of ["Grüezi, ich heisse Zoë Müller", "Ça va, très bien", "Sì, è così", "Yes, I'm 31"]) {
    assert.equal(withoutForeignScript(text), text);
  }
});

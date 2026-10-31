import { test } from "node:test";
import assert from "node:assert/strict";
import { detectLanguageByWords } from "./language-detect.mjs";

test("detects the usual first words", () => {
  assert.equal(detectLanguageByWords(" Bonjour, je préfère parler français, s'il te plaît"), "fr");
  assert.equal(detectLanguageByWords("Ciao! Mi chiamo Marco."), "it");
  assert.equal(detectLanguageByWords("Hoi, ich bin Anna"), "de");
  assert.equal(detectLanguageByWords("Hi, my name is Tom"), "en");
});

test("leaves unclear text to the model", () => {
  assert.equal(detectLanguageByWords("Anna"), null);
  assert.equal(detectLanguageByWords(""), null);
});

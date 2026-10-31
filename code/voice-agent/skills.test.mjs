import { test } from "node:test";
import assert from "node:assert/strict";
import { loadSkills, parseSkill, skillsPrompt } from "./skills.mjs";

test("parses the front matter and the body", () => {
  const skill = parseSkill("---\nname: Test\ndescription: A test\nassigned: true\n---\n\n## Part\nDo this.\n", "test.md");
  assert.equal(skill.name, "Test");
  assert.equal(skill.assigned, true);
  assert.equal(skill.body, "## Part\nDo this.");
});

test("only assigned skills reach the prompt, with headings one level down", () => {
  const skills = [
    parseSkill("---\nname: On\nassigned: true\n---\n## Part\nYes.", "a.md"),
    parseSkill("---\nname: Off\nassigned: false\n---\nNo.", "b.md"),
  ].filter((skill) => skill.assigned);
  assert.equal(skillsPrompt(skills), "## Skill: On\n\n### Part\nYes.");
});

test("the shipped skills load and are assigned", async () => {
  const skills = await loadSkills(new URL("./skills", import.meta.url).pathname);
  assert.ok(skills.some((skill) => skill.name === "Friendly conversation"));
});

test("a skill without front matter is rejected", () => {
  assert.throws(() => parseSkill("Just text", "bad.md"), /front matter/);
});

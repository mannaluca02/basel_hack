// Skills are Markdown files in skills/ that extend Paxi's opening prompt. Each starts with
// a small front matter block; only skills with "assigned: true" go into the prompt.
//
//   ---
//   name: Friendly conversation
//   description: …
//   source: documentation/…
//   assigned: true
//   ---
//   Instructions for Paxi …
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export function parseSkill(text, file) {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n/g, "\n"));
  if (!match) throw new Error(`Skill ${file} needs a front matter block`);
  const meta = Object.fromEntries(
    match[1]
      .split("\n")
      .map((line) => /^([a-z_]+):\s*(.*)$/i.exec(line))
      .filter(Boolean)
      .map(([, key, value]) => [key, value.trim()]),
  );
  if (!meta.name) throw new Error(`Skill ${file} needs a name`);
  return { file, name: meta.name, description: meta.description ?? "", source: meta.source ?? null, assigned: meta.assigned === "true", body: match[2].trim() };
}

/** The skills assigned to Paxi, in file name order. */
export async function loadSkills(directory) {
  const files = (await readdir(directory).catch(() => [])).filter((file) => file.endsWith(".md")).sort();
  const skills = await Promise.all(files.map(async (file) => parseSkill(await readFile(join(directory, file), "utf8"), file)));
  return skills.filter((skill) => skill.assigned);
}

/** The prompt section for the assigned skills; headings move one level down. */
export function skillsPrompt(skills) {
  if (!skills.length) return "";
  return skills
    .map((skill) => `## Skill: ${skill.name}\n\n${skill.body.replace(/^(#{1,5}) /gm, "#$1 ")}`)
    .join("\n\n");
}

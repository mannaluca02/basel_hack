import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadSkills} from '../voice-agent/skills.mjs';
import {fileURLToPath} from 'node:url';
import {buildVoicePrompt,voicePromptSettings} from '../apps/api/dist/voice/prompt.js';

test('the live voice prompt uses the actual assigned Voice Agent skill bodies',async()=>{
  const assigned=await loadSkills(fileURLToPath(new URL('../voice-agent/skills/',import.meta.url)));
  const settings=await voicePromptSettings(),prompt=await buildVoicePrompt('de');
  assert.ok(assigned.length>0);
  assert.deepEqual(settings.skills.map(s=>s.id),assigned.map(s=>s.file));
  for(const skill of assigned){
    assert.ok(prompt.includes(`## Skill: ${skill.name}`));
    assert.ok(prompt.includes(skill.body.replace(/^(#{1,5}) /gm,'#$1 ')));
  }
  assert.ok(prompt.indexOf('Application boundaries')>prompt.indexOf('## Skill:'));
  assert.ok(prompt.length<=32000);
});

test('conversation selections reach the prompt and unavailable skills/topics are rejected',async()=>{
  const settings=await voicePromptSettings(),selected=settings.skills[0];
  const prompt=await buildVoicePrompt('fr',{skillIds:[selected.id],timeBudgetMinutes:5,priorities:['monthly_housing_cost_chf']});
  assert.ok(prompt.includes(`## Skill: ${selected.name}`));
  for(const other of settings.skills.slice(1))assert.ok(!prompt.includes(`## Skill: ${other.name}`));
  assert.ok(prompt.includes('Current conversation language: fr'));
  assert.ok(prompt.includes('Time available: 5 minutes'));
  assert.ok(prompt.includes('Priority topics: monthly_housing_cost_chf'));
  await assert.rejects(buildVoicePrompt('de',{skillIds:['../not-a-skill.md']}),e=>e.code==='VOICE_SKILL_NOT_AVAILABLE');
  await assert.rejects(buildVoicePrompt('de',{priorities:['full_name']}),e=>e.code==='VOICE_TOPIC_NOT_AVAILABLE');
});

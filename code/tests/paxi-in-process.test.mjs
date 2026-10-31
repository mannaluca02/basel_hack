import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {existsSync} from 'node:fs';

const installed=existsSync(new URL('../voice-agent/node_modules/express',import.meta.url));

/** A free local port for Paxi. */
const freePort=()=>new Promise((resolve,reject)=>{
  const server=createServer().listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(()=>resolve(port));}).on('error',reject);
});

/**
 * The case backend imports Dario's voice agent and starts it in its own process (apps/api/src/main.ts,
 * PAX_VOICE_AGENT=1). This checks that seam: importing starts nothing, startVoiceAgent() listens on
 * PAX_VOICE_AGENT_PORT, and Paxi keeps its own origin checks.
 */
test('Paxi starts inside another process on its own port and keeps its origin checks',{skip:!installed&&'npm install in code/voice-agent first'},async()=>{
  const port=await freePort();
  process.env.PAX_VOICE_AGENT_PORT=String(port);
  const agent=await import('../voice-agent/server.mjs');
  await assert.rejects(fetch(`http://127.0.0.1:${port}/`),'importing alone does not listen');
  const server=await agent.startVoiceAgent();
  try {
    const page=await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(page.status,200);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/questionnaire`)).status,200);
    const foreign=await fetch(`http://127.0.0.1:${port}/api/case-link`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://evil.example'},body:'{}'});
    assert.equal(foreign.status,403,'only the customer app may hand a case to Paxi');
    const session=await fetch(`http://127.0.0.1:${port}/api/session`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:4200'},body:'{}'});
    assert.equal(session.status,403,'calls start only from Paxi\'s own page');
  } finally {
    await new Promise(resolve=>server.close(resolve));
  }
});

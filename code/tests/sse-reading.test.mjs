import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sseEvents} from './helpers/sse.mjs';

// FE-29: on Node 26 the stream's leading newline arrives as its own chunk ("actual: '\n'").
const streamOf=chunks=>new Response(new ReadableStream({start(controller){for(const c of chunks)controller.enqueue(new TextEncoder().encode(c));controller.close();}}));

test('whole events, however the transport splits them',async()=>{
  const events=sseEvents(streamOf(['\n','event: advisor.context.updated\nda','ta: {"a":1}\n','\nevent: second\ndata: 2\n\n']));
  assert.equal(await events.next(),'event: advisor.context.updated\ndata: {"a":1}');
  assert.equal(await events.next(),'event: second\ndata: 2');
  assert.equal(await events.next(),null);
});

test('until() stops at the matching event or at the end of the stream',async()=>{
  const events=sseEvents(streamOf(['\nevent: a\ndata: 1\n\nevent: b\ndata: wanted\n\nevent: c\ndata: 3\n\n']));
  const seen=await events.until('wanted');
  assert.match(seen,/data: 1/);
  assert.match(seen,/wanted/);
  assert.doesNotMatch(seen,/data: 3/);
  assert.equal(await sseEvents(streamOf(['\n'])).until('x'),'');
});

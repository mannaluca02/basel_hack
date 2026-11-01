import { createPaxAvatar } from '../code/avatar-prototype/pax-avatar.js';
import { config } from './config.js?v=live-qr-20261101';
import { createConfetti } from './confetti.js';
import { createPresentationCharacter, createQrCharacter } from './characters.js';
// Old preview parameters never select a different version of the presentation.
if(location.search) history.replaceState(null,'',location.pathname+location.hash);
const slides = [...document.querySelectorAll('.slide')];
const moments = [...document.querySelectorAll('.moment')];
const videos = moments.map(el => el.querySelector('video'));
let index = 0;
const avatars = [];
const confetti=createConfetti();
document.documentElement.style.setProperty('--backlight-fade','30px');
function fit() { document.documentElement.style.setProperty('--scale', Math.min(innerWidth / 1600, innerHeight / 900)); }
addEventListener('resize', fit); fit();
// Deterministic navigation: no timer-generated history entries can trap Back.
function backward() {
  if(stageBusy){if(stageDirection==='enter'){resetStage();return;}restoreDarkStage();}
  if(index===2){show(1,true);return;}
  if(index!==1){if(index>0)show(index-1);return;}
  const i=moments.findLastIndex(el=>el.dataset.state!=='off');
  if(i<0){show(0);return;}
  clearMomentTimer(i);videos[i].pause();videos[i].currentTime=0;
  const state=moments[i].dataset.state;
  if(state==='complete'||state==='finishing') {setState(i,'playing');moments[i].classList.add('paused');}
  else if(state==='playing'){setState(i,'startup');moments[i].classList.add('paused');}
  else {setState(i,'off');moments[i].classList.remove('paused');}
}
function forward(){next();}
const timers = new Map();
const playbackEpoch = [0,0,0];
function clearMomentTimer(i) { playbackEpoch[i]++; clearTimeout(timers.get(i)); timers.delete(i); }
function setState(i, state) {
  moments[i].dataset.state = state;
  moments[i].querySelector('.screen-recap').setAttribute('aria-hidden', String(state !== 'complete'));
  const preview = moments[i].querySelector('.preview-label');
  if (preview) preview.setAttribute('aria-hidden', String(state !== 'playing'));
  moments[i].querySelector('button').setAttribute('aria-label', `${state === 'off' ? 'Unlock' : state === 'complete' ? 'Replay' : 'Pause or resume'} demo ${i + 1}`);
  highlight();
}
function later(i, callback, delay) { clearMomentTimer(i); timers.set(i, setTimeout(() => { timers.delete(i); callback(); }, delay)); }
let previousActive = -1;
let stageBusy=false, stageReady=false, stageDirection='', stageTimers=[];
const demo=document.querySelector('.demo');
function clearStageTimers(){stageTimers.forEach(clearTimeout);stageTimers=[];stageBusy=false;stageDirection='';}
function stageAt(delay,action){stageTimers.push(setTimeout(action,delay));}
function resetStage(){
  clearStageTimers();stageReady=false;
  demo.classList.remove('demo-active','demo-raised','demo-title-hidden','lights-ready');
}
function restoreDarkStage(){
  clearStageTimers();stageReady=true;
  demo.classList.add('demo-active','demo-raised','demo-title-hidden','lights-ready');
}
function enterStage(phone){
  clearStageTimers();stageBusy=true;stageDirection='enter';
  demo.classList.add('demo-title-hidden');
  stageAt(600,()=>demo.classList.add('demo-raised'));
  stageAt(1450,()=>demo.classList.add('demo-active'));
  stageAt(2450,()=>{
    demo.classList.add('lights-ready');stageReady=true;stageBusy=false;stageDirection='';playMoment(phone);
  });
}
function leaveStage(){
  clearStageTimers();stageBusy=true;stageDirection='exit';stageReady=false;
  demo.classList.remove('lights-ready');
  // The last drop lasts 950 ms; allow it to land, then pause before moving the row.
  stageAt(1350,()=>demo.classList.remove('demo-raised'));
  stageAt(2250,()=>demo.classList.remove('demo-active'));
  stageAt(3150,()=>{demo.classList.remove('demo-title-hidden');stageBusy=false;stageDirection='';});
}
function highlight() {
  const active=moments.findIndex(el=>['startup','playing','finishing'].includes(el.dataset.state));
  moments.forEach((el,i)=>{
    if(active!==previousActive)el.style.setProperty('--ambient-delay',`${Math.round(25+Math.random()*115)}ms`);
    el.classList.toggle('playing',i===active);el.classList.toggle('ambient-dim',active>=0&&i!==active);
  });
  previousActive=active;
  document.querySelector('.phones').classList.toggle('has-playing',active>=0);
  if(moments.every(el=>el.dataset.state==='complete')&&stageReady&&!stageBusy)leaveStage();
}
function stopVideos() {
  videos.forEach((video, i) => {
    video.pause(); clearMomentTimer(i);
    if (['startup', 'playing', 'finishing'].includes(moments[i].dataset.state)) setState(i, 'off');
  });
}
function resetDemo() {
  resetStage();
  stopVideos();
  videos.forEach((video, i) => { video.currentTime = 0; moments[i].classList.remove('paused'); setState(i, 'off'); });
  document.getElementById('announcement').textContent = 'Three phones locked. Press Next to start the first demo.';
}
let visibleSlide = null;
const band = document.getElementById('slide-band');
slides.forEach((slide,i) => { slide.hidden = false; slide.style.top = `${i * 900}px`; });
function render() {
  const current = slides[index];
  slides.forEach(slide => { slide.inert = slide !== current; slide.setAttribute('aria-hidden', String(slide !== current)); });
  const enteringClosing=index===2 && visibleSlide!==current;
  visibleSlide = current;
  if(enteringClosing)confetti.play();else if(index!==2)confetti.stop();
  band.style.transform = `translateY(${-index * 900}px)`;
  location.hash = String(index + 1);
  document.getElementById('announcement').textContent = current.dataset.title;
}
function show(next, keepDemo = false) {
  if (next === index) return;
  clearStageTimers();
  videos.forEach((video,i) => { video.pause(); clearMomentTimer(i); });
  index = Math.max(0, Math.min(slides.length - 1, next));
  if (index === 1 && !keepDemo) resetDemo();
  if(index===1&&keepDemo){if(moments.some(el=>el.dataset.state!=='off')&&!moments.every(el=>el.dataset.state==='complete'))restoreDarkStage();else resetStage();}
  render();
}
function finishMoment(i) {
  videos[i].pause(); moments[i].classList.remove('paused');
  setState(i, 'finishing');
  later(i, () => {
    setState(i, 'complete');
    document.getElementById('announcement').textContent = `Demo ${i + 1} complete. Press next for ${i < 2 ? 'the next phone' : 'the closing slide'}.`;
  }, 550);
}
async function beginPlayback(i, advance = true) {
  if (index !== 1 || moments[i].dataset.state !== 'startup') return;
  const epoch = playbackEpoch[i];
  try {
    await videos[i].play();
    if (epoch !== playbackEpoch[i] || index !== 1 || moments[i].dataset.state !== 'startup') { videos[i].pause(); return; }
    moments[i].classList.remove('paused');
    if(advance) setState(i, 'playing');
    else later(i,()=>{if(moments[i].dataset.state==='startup')setState(i,'playing');},1900);
  } catch {
    finishMoment(i);
    document.getElementById('announcement').textContent = 'Demo video unavailable. Showing the chapter recap.';
  }
}
function playMoment(i) {
  if (index !== 1 || stageBusy) return;
  if(!stageReady){enterStage(i);return;}
  const state = moments[i].dataset.state;
  if (state === 'playing') {
    if (!videos[i].paused) { videos[i].pause(); moments[i].classList.add('paused'); }
    else videos[i].play().then(() => moments[i].classList.remove('paused')).catch(() => finishMoment(i));
    return;
  }
  if (state === 'startup' || state === 'finishing') return;
  moments.forEach((el, j) => {
    if (i !== j && ['startup', 'playing', 'finishing'].includes(el.dataset.state)) {
      clearMomentTimer(j); videos[j].pause(); el.classList.remove('paused'); setState(j, 'complete');
    }
  });
  videos[i].currentTime = 0;
  setState(i, 'startup');
  beginPlayback(i, false);
}
function next() {
  if(stageBusy)return;
  if (index !== 1) { if (index < slides.length - 1) show(index + 1); return; }
  const active = moments.findIndex(el => ['startup', 'playing', 'finishing'].includes(el.dataset.state));
  if (active >= 0) {
    clearMomentTimer(active);
    const state=moments[active].dataset.state;
    if(state==='startup') beginPlayback(active);
    else if(state==='playing'){
      if(moments[active].classList.contains('paused')){videos[active].play().then(()=>moments[active].classList.remove('paused')).catch(()=>finishMoment(active));}
      else finishMoment(active);
    }
    else setState(active,'complete');
    return;
  }
  const pending = moments.findIndex(el => el.dataset.state === 'off');
  if (pending >= 0) playMoment(pending); else show(2);
}
moments.forEach((el, i) => {
  const video = videos[i];
  const media = config.videos[i];
  video.muted=false; video.volume=.65;
  if (media.src) video.src = media.src;
  if (media.poster) video.poster = media.poster;
  if (media.placeholder) {
    const label = document.createElement('span'); label.className = 'preview-label'; label.textContent = 'DEMO PREVIEW'; label.setAttribute('aria-hidden', 'true'); el.querySelector('.browser-content').append(label);
  }
  if (media.captions) {
    const track = document.createElement('track');
    Object.assign(track, { kind: 'captions', src: media.captions, srclang: 'en', label: 'English', default: true }); video.append(track);
  }
  video.addEventListener('ended', () => { if (index === 1 && el.dataset.state === 'playing') finishMoment(i); });
  video.addEventListener('error', () => { if (index === 1 && ['startup','playing'].includes(el.dataset.state)) finishMoment(i); });
  el.querySelector('button').addEventListener('click', () => playMoment(i));
});
function updatePhoneClocks() {
  const now = new Date();
  const time = new Intl.DateTimeFormat('en-GB', { timeZone:'Europe/Zurich', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).format(now);
  const date = new Intl.DateTimeFormat('en-GB', { timeZone:'Europe/Zurich', weekday:'long', day:'numeric', month:'long' }).format(now);
  document.querySelectorAll('.lock-time, .status-time, .safari-live-time').forEach(el => { el.textContent = time; });
  document.querySelectorAll('.lock-date').forEach(el => { el.textContent = date; });
}
updatePhoneClocks();
setInterval(updatePhoneClocks, 1000);
const team = document.getElementById('team');
config.team.forEach((name, i) => {
  const member = document.createElement('div'); member.className = 'teammate';
  const head = document.createElement('div'); head.className = 'head';
  head.style.setProperty('--look-delay', `${i * -.9}s`);
  const label = document.createElement('p'); label.textContent = name;
  member.append(head, label); team.append(member);
  avatars.push(createPresentationCharacter(head, name));
});
document.querySelectorAll('[data-avatar]').forEach(host => {
  if (host.matches('.hero-avatar, .closing-avatar')) {
    avatars.push(createPresentationCharacter(host, 'Paxi', { hero: true }));
  } else {
    const avatar = createPaxAvatar(host); avatar.show(host.dataset.avatar); avatars.push(avatar);
  }
});
createQrCharacter(document.getElementById('qr-mascot'), config);
// Additive eye offsets while the pointer is moving; idle animation resumes after 900 ms.
const gazeHosts = [...document.querySelectorAll('[data-avatar], .teammate .head')];
for (const host of gazeHosts) {
  const custom = [...host.querySelectorAll('.round-eye')];
  if (custom.length) {
    for (const eye of custom) {
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g'); group.classList.add('pointer-eyes');
      [...eye.children].slice(1).forEach(node => group.append(node)); eye.append(group);
    }
  } else {
    const left = host.querySelector('[data-part="eyeL"]');
    const right = host.querySelector('[data-part="eyeR"]');
    if (!left || !right) continue;
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g'); group.classList.add('pointer-eyes');
    left.parentNode.append(group); group.append(left, right);
    const glints = host.querySelector('[data-part="glints"]'); if (glints) group.append(glints);
  }
}
let gazeTimer, gazeFrame = 0, lastGazeAt = 0;
const gazeTargets = new Map();
function smoothGaze(now) {
  const dt=Math.min(.05,(now-(lastGazeAt||now-16))/1000);lastGazeAt=now;
  const ease=1-Math.exp(-dt*22);
  const headEase=1-Math.exp(-dt*7);
  for(const [host,v] of gazeTargets){
    v.cx+=(v.x-v.cx)*ease;v.cy+=(v.y-v.cy)*ease;
    v.hx+=(v.x-v.hx)*headEase;v.hy+=(v.y-v.hy)*headEase;
    host.style.setProperty('--look-x',`${v.cx*v.amount}px`);host.style.setProperty('--look-y',`${v.cy*v.amount*.65}px`);
    host.style.setProperty('--head-x',`${v.hx*v.head}px`);host.style.setProperty('--head-y',`${v.hy*v.head*.65}px`);
    host.style.setProperty('--head-turn',`${v.hx*2.5}deg`);
  }
  gazeFrame=requestAnimationFrame(smoothGaze);
}
function releaseGaze() {
  document.body.classList.remove('pointer-active');
  cancelAnimationFrame(gazeFrame);gazeFrame=0;lastGazeAt=0;gazeTargets.clear();
  gazeHosts.forEach(host => { host.classList.remove('pointer-tracking'); host.style.setProperty('--look-x', '0px'); host.style.setProperty('--look-y', '0px'); host.style.setProperty('--head-x','0px'); host.style.setProperty('--head-y','0px'); host.style.setProperty('--head-turn','0deg'); });
}
addEventListener('pointermove', event => {
  if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
  if (!event.movementX && !event.movementY) return;
  clearTimeout(gazeTimer);
  document.body.classList.add('pointer-active');
  for (const host of gazeHosts) {
    if (host.closest('.slide') !== visibleSlide) continue;
    const box = host.getBoundingClientRect(); if (!box.width || !box.height) continue;
    const amount = host.classList.contains('portrait-head') ? 2.3 : 6;
    const x = Math.max(-1, Math.min(1, (event.clientX - box.left - box.width / 2) / (innerWidth * .3)));
    const y = Math.max(-1, Math.min(1, (event.clientY - box.top - box.height / 2) / (innerHeight * .3)));
    const previous=gazeTargets.get(host);
    gazeTargets.set(host,{x,y,amount,head:host.classList.contains('portrait-head')?4:8,cx:previous?.cx||0,cy:previous?.cy||0,hx:previous?.hx||0,hy:previous?.hy||0});
    host.classList.add('pointer-tracking');
  }
  if(!gazeFrame)gazeFrame=requestAnimationFrame(smoothGaze);
  gazeTimer = setTimeout(releaseGaze, 900);
});
document.addEventListener('pointerleave', releaseGaze);
addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if(event.target instanceof HTMLInputElement) return;
  if (['ArrowRight', 'PageDown', 'ArrowLeft', 'PageUp', ' ', 'Home', 'End'].includes(event.key)) {event.preventDefault();event.stopPropagation();}
  if (['ArrowRight', 'PageDown'].includes(event.key)) forward();
  if (['ArrowLeft', 'PageUp'].includes(event.key)) backward();
  if (event.key === 'Home') show(0);
  if (event.key === 'End' || event.key === 'Escape') show(2);
  if (event.key.toLowerCase() === 'a') show(3);
  if (event.key.toLowerCase() === 'b') show(4);
  if (event.key.toLowerCase() === 'f') {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }
  if (['1','2','3'].includes(event.key)) playMoment(Number(event.key) - 1);
  if (event.key === ' ' && index === 1) {
    const active = moments.findIndex(el => el.dataset.state === 'playing');
    if (active >= 0) playMoment(active); else next();
  }
  if (event.key.toLowerCase() === 'r' && index === 1) resetDemo();
}, {capture:true});
addEventListener('visibilitychange', () => {
  if (document.hidden) videos.forEach((video,i) => { if (!video.paused) { video.pause(); moments[i].classList.add('paused'); } });
});
addEventListener('hashchange', () => { const n = Number(location.hash.slice(1)); if (Number.isInteger(n) && n >= 1 && n <= slides.length && n - 1 !== index) show(n - 1); });
const initial = Number(location.hash.slice(1)); if (initial >= 1 && initial <= slides.length) index = initial - 1;
render();

band.classList.add("band-ready");

// Backup-only interactions; the three pitch slides remain frozen.
import './backups.js?v=architecture-clean-4';

import { createConfetti } from './confetti.js';
import { createPresentationCharacter, createQrCharacter } from './characters.js';
const team = document.getElementById('team');
['Luca', 'Lukas', 'Dario', 'Valentin', 'Ernest', 'Paxi'].forEach((name, i) => {
  const member = document.createElement('div'); member.className = 'teammate';
  const head = document.createElement('div'); head.className = 'head';
  head.style.setProperty('--look-delay', `${i * -.9}s`);
  const label = document.createElement('p'); label.textContent = name;
  member.append(head, label); team.append(member);
  createPresentationCharacter(head, name);
});
createQrCharacter(document.getElementById('qr-mascot'), { qrImage: 'media/qr-paxi-live.svg' });
createConfetti().play();
// Additive eye offsets while the pointer is moving; idle animation resumes after 900 ms.
const gazeHosts = [...document.querySelectorAll('.teammate .head')];
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
  cancelAnimationFrame(gazeFrame);gazeFrame=0;lastGazeAt=0;gazeTargets.clear();
  gazeHosts.forEach(host => { host.classList.remove('pointer-tracking'); host.style.setProperty('--look-x', '0px'); host.style.setProperty('--look-y', '0px'); host.style.setProperty('--head-x','0px'); host.style.setProperty('--head-y','0px'); host.style.setProperty('--head-turn','0deg'); });
}
addEventListener('pointermove', event => {
  if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
  if (!event.movementX && !event.movementY) return;
  clearTimeout(gazeTimer);
  for (const host of gazeHosts) {
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

import { createConfetti } from './confetti.js';
import { createPresentationCharacter, createQrCharacter } from './characters.js';
const team = document.getElementById('team');
['Luca', 'Lukas', 'Dario', 'Valentin', 'Ernest', 'Paxi'].forEach((name, i) => {
  const member = document.createElement('div'); member.className = 'teammate';
  member.style.setProperty('--i', i);
  const head = document.createElement('div'); head.className = 'head';
  head.style.setProperty('--look-delay', `${i * -.9}s`);
  const label = document.createElement('p'); label.textContent = name;
  member.append(head, label); team.append(member);
  createPresentationCharacter(head, name);
});
createPresentationCharacter(document.getElementById('hero-avatar'), 'Paxi');
createQrCharacter(document.getElementById('qr-mascot'), { qrImage: 'media/qr-paxi-live.svg' });
// The closing celebrates once, when it actually scrolls into view.
const confetti = createConfetti();
const closing = document.querySelector('.closing');
closing.classList.add('pending');
new IntersectionObserver(([entry], observer) => {
  if (!entry.isIntersecting) return;
  observer.disconnect(); closing.classList.remove('pending'); confetti.play();
}, { threshold: .35 }).observe(closing);
// One spring per head: eyes and head chase the pointer, then drift back to an idle glance.
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const GLANCES = [[.18, 0, 0], [.46, -3, -.5], [.77, 3, 0], [.95, 0, -.5], [1, 0, 0]];
const clamp = value => Math.max(-1, Math.min(1, value));
function wrap(parent, nodes) {
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  parent.append(group); group.append(...nodes);
  return group;
}
const heads = [...document.querySelectorAll('.hero-avatar, .teammate .head')].map(host => {
  const portrait = host.classList.contains('portrait-head');
  const part = name => host.querySelector(`[data-part="${name}"]`);
  const eyes = portrait
    ? [...host.querySelectorAll('.round-eye')].map(eye => wrap(eye, [...eye.children].slice(1)))
    : [wrap(part('eyeL').parentNode, [part('eyeL'), part('eyeR'), part('glints')])];
  return { host, svg: host.querySelector('svg'), eyes, portrait, eyeRange: portrait ? 2.3 : 6, headRange: portrait ? 4 : 8, ex: 0, ey: 0, hx: 0, hy: 0, eyePose: '', headPose: '' };
});
let lastGazeAt = 0, pointerX = 0, pointerY = 0, pointerAt = -Infinity, centers = null;
function smoothGaze(now) {
  const dt = Math.min(.05, (now - (lastGazeAt || now - 16)) / 1000); lastGazeAt = now;
  const tracking = now - pointerAt < 900;
  const eyeEase = 1 - Math.exp(-dt * (tracking ? 22 : 6)), headEase = 1 - Math.exp(-dt * 7);
  // Measured once, so pointer frames never force a layout.
  if (tracking) centers ||= heads.map(({ host }) => {
    const box = host.getBoundingClientRect();
    return { x: box.left + box.width / 2 + scrollX, y: box.top + box.height / 2 + scrollY };
  });
  heads.forEach((head, i) => {
    let x = 0, y = 0, eyeX = 0, eyeY = 0;
    if (tracking) {
      x = clamp((pointerX - centers[i].x) / (innerWidth * .3));
      y = clamp((pointerY - centers[i].y) / (innerHeight * .3));
      eyeX = x * head.eyeRange; eyeY = y * head.eyeRange * .65;
    } else if (head.portrait && !reduced.matches) {
      [, eyeX, eyeY] = GLANCES.find(([until]) => (now + i * 900) / 8000 % 1 < until);
    }
    head.ex += (eyeX - head.ex) * eyeEase; head.ey += (eyeY - head.ey) * eyeEase;
    head.hx += (x - head.hx) * headEase; head.hy += (y - head.hy) * headEase;
    // Direct transforms: no inherited custom property, so no style pass over the whole SVG.
    const eyePose = `translate(${head.ex.toFixed(2)}px,${head.ey.toFixed(2)}px)`;
    if (eyePose !== head.eyePose) { head.eyePose = eyePose; head.eyes.forEach(group => { group.style.transform = eyePose; }); }
    const headPose = `translate(${(head.hx * head.headRange).toFixed(2)}px,${(head.hy * head.headRange * .65).toFixed(2)}px) rotate(${(head.hx * 2.5).toFixed(2)}deg)`;
    if (headPose !== head.headPose) { head.headPose = headPose; head.svg.style.transform = headPose; }
  });
  requestAnimationFrame(smoothGaze);
}
requestAnimationFrame(smoothGaze);
addEventListener('resize', () => { centers = null; });
addEventListener('pointermove', event => {
  if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
  if (!event.movementX && !event.movementY) return;
  pointerX = event.pageX; pointerY = event.pageY; pointerAt = performance.now();
});
document.documentElement.addEventListener('pointerleave', () => { pointerAt = -Infinity; });

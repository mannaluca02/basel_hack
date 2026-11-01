// Presentation-only styling of the existing Paxi SVG system.
// Features follow the user-labelled reference photos; original photos stay outside the repo.
import { createPaxAvatar } from './pax-avatar.js';
const NS = 'http://www.w3.org/2000/svg';
function element(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}
function path(parent, d, attrs = {}) { const node = element('path', { d, ...attrs }); parent.append(node); return node; }
const people = {
  Luca: { iris: '#7b8547', skin: ['#f1c7a8', '#dfa582', '#c78666'], hair: '#35271e', style: 'cap', beard: 'stubble', beardColor: '#6a5040' },
  Lukas: { iris: '#7b8547', skin: ['#f0c4ac', '#dda68d', '#c68a73'], hair: '#302622', style: 'short', beard: 'short', beardColor: '#4a342b' },
  Dario: { iris: '#9bcfec', skin: ['#f2c6ac', '#e5ac8b', '#ca896b'], hair: '#30251f', style: 'curly', beard: 'chinstrap', beardColor: '#3b2b22' },
  Valentin: { iris: '#a8d9f1', skin: ['#f4cfb2', '#e6b18e', '#cf9577'], hair: '#9b7145', style: 'swept', beard: 'goatee', beardColor: '#805d3d', glasses: 'bold' },
  Ernest: { iris: '#795131', skin: ['#ebbd9d', '#dba17e', '#bd8263'], hair: '#31251f', style: 'wave', beard: 'goatee', beardColor: '#54382a', glasses: 'fine' },
};
function smile(group) {
  path(group, 'M88 130 Q100 140 112 130', { fill: 'none', stroke: '#65362d', 'stroke-width': 2.5, 'stroke-linecap': 'round' });
}
function addRoundEyes(char, person) {
  const eyes = element('g');
  for (const cx of [77, 123]) {
    const eye = element('g', { class: 'round-eye' });
    eye.style.transformOrigin = `${cx}px 100px`;
    eye.append(element('circle', { cx, cy:100, r:10.5, fill:'#fffdf8', stroke:'#9d7762', 'stroke-width':.7 }));
    eye.append(element('circle', { cx, cy:100, r:7.5, fill:person.iris }));
    if (person.iris === '#7b8547') eye.append(element('circle', { cx, cy:100, r:4.7, fill:'#917345' }));
    eye.append(element('circle', { cx, cy:100, r:3.8, fill:'#272225' }));
    eye.append(element('circle', { cx:cx-2.2, cy:97.5, r:2, fill:'#fff' }));
    eyes.append(eye);
  }
  char.append(eyes);
}
function addHair(group, person) {
  const common = { fill: person.hair };
  if (person.style === 'cap') {
    path(group, 'M41 88 L40 67 Q38 39 64 32 Q94 17 129 32 Q160 39 160 65 L159 87 L149 75 L148 56 Q102 40 51 57 L50 78Z', common);
    path(group, 'M38 72 Q37 30 70 24 Q102 17 135 30 Q164 42 163 73 L151 69 L146 48 Q102 35 55 49 L50 70Z', { fill: '#bba777' });
    path(group, 'M69 34 Q100 21 132 35 L135 48 Q102 40 66 48Z', { fill: person.hair });
    const strap = element('rect', { x: 66, y: 46, width: 69, height: 13, rx: 5, fill: '#d7c18d', stroke: '#9a865e', 'stroke-width': 1 }); group.append(strap);
    for (let x = 77; x < 130; x += 12) group.append(element('circle', { cx: x, cy: 52.5, r: 2, fill: '#8c7955' }));
    path(group, 'M47 60 Q41 46 53 36 M151 59 Q159 44 146 36', { fill: 'none', stroke: '#d3c094', 'stroke-width': 1.2 });
  } else if (person.style === 'curly') {
    path(group, 'M40 87 L39 61 Q37 36 63 34 Q96 21 132 34 Q164 39 161 64 L160 87 L150 76 L148 63 Q124 70 113 59 Q99 71 86 60 Q73 70 58 60 L50 81Z', common);
    [[52,45,13],[69,35,13],[87,34,13],[106,31,13],[124,36,14],[143,44,14],[148,58,10],[65,52,12],[90,49,13],[115,49,13]].forEach(([cx,cy,r])=>group.append(element('circle',{cx,cy,r,fill:person.hair})));
    path(group, 'M65 36 Q78 28 84 37 M98 32 Q110 25 118 35 M126 43 Q141 34 147 48', { fill: 'none', stroke: '#4e3a2b', 'stroke-width': 2.5, 'stroke-linecap': 'round' });
  } else if (person.style === 'swept') {
    path(group, 'M40 88 L39 60 Q39 37 62 33 Q85 22 113 28 Q146 25 159 52 L161 86 L150 72 L146 55 Q129 53 112 39 Q101 68 74 70 Q90 54 88 44 Q71 64 51 67 L49 81Z', common);
    path(group, 'M55 47 Q80 28 106 34 M70 57 Q94 37 103 36 M114 33 Q142 33 150 53', { fill: 'none', stroke: '#c39865', 'stroke-width': 3.2, 'stroke-linecap': 'round' });
  } else if (person.style === 'wave') {
    path(group, 'M40 86 L38 63 Q34 37 60 31 Q82 16 109 25 Q129 18 144 35 Q164 40 161 65 L159 87 L149 76 L148 57 Q117 48 97 43 Q76 61 51 63 L50 80Z', common);
    path(group, 'M55 44 Q77 24 101 32 M91 38 Q118 24 138 40', { fill: 'none', stroke: '#4e382a', 'stroke-width': 4, 'stroke-linecap': 'round' });
  } else {
    path(group, 'M40 87 L39 62 Q36 38 60 34 L66 28 L76 32 L88 27 L100 31 L112 26 L124 32 L139 33 Q163 40 161 63 L160 87 L150 77 L148 61 L136 56 L126 60 L114 54 L103 59 L92 54 L81 59 L69 55 L54 64 L50 80Z', common);
    path(group, 'M56 46 L63 38 M75 44 L80 35 M95 43 L99 34 M117 44 L119 35 M137 46 L136 38', { fill: 'none', stroke: '#5a4639', 'stroke-width': 2, 'stroke-linecap': 'round' });
  }
}
function addBeard(group, person) {
  const color = person.beardColor;
  if (['short', 'chinstrap'].includes(person.beard)) {
    path(group, 'M43 109 Q48 136 65 144 Q99 163 135 144 Q152 135 157 109 L157 134 Q153 161 126 163 L75 163 Q48 160 43 136Z', { fill: color, opacity: person.beard === 'short' ? .72 : .94 });
    path(group, 'M85 123 Q94 115 100 121 Q107 115 116 123 L114 128 Q105 124 100 125 Q92 124 86 128Z', { fill: color });
  } else if (person.beard === 'goatee') {
    path(group, 'M84 140 Q100 148 117 139 L115 153 Q100 173 85 153Z', { fill: color });
    path(group, 'M80 123 Q92 112 100 119 Q108 111 121 123 L118 129 Q107 123 100 124 Q90 123 82 129Z', { fill: color });
    if (person.glasses === 'fine') path(group, 'M79 128 L84 124 L87 145 L81 148Z M117 124 L122 128 L119 148 L113 145Z', { fill: color, opacity: .85 });
  } else {
    path(group, 'M49 128 Q58 150 82 153 Q104 161 128 151 Q145 144 152 127', { fill: 'none', stroke: color, 'stroke-width': 2.4, 'stroke-dasharray': '1 4', opacity: .35, 'stroke-linecap': 'round' });
  }
}
function addGlasses(group, bold) {
  const g = element('g', { fill: '#fff', 'fill-opacity': .07, stroke: bold ? '#292420' : '#57443b', 'stroke-width': bold ? 3.2 : 1.5, 'stroke-linejoin': 'round' });
  path(g, 'M49 88 Q67 83 91 87 L91 104 Q88 116 73 116 Q55 115 52 105Z M109 87 Q133 83 151 88 L148 105 Q145 116 127 116 Q112 116 109 104Z');
  path(g, 'M91 94 Q100 89 109 94 M49 91 L42 88 M151 91 L158 88', { fill: 'none' });
  path(g, 'M58 92 L68 89 M117 92 L128 89', { stroke: '#fff', 'stroke-opacity': .65, 'stroke-width': 1.5 });
  group.append(g);
}
export function createPresentationCharacter(host, name = 'Paxi', { hero = false } = {}) {
  const avatar = createPaxAvatar(host);
  avatar.show('pleased');
  const svg = host.querySelector('svg');
  svg.setAttribute('aria-label', name === 'Paxi' ? 'Paxi, standard pleased animation' : `${name}, animated Paxi-style portrait`);
  const char = host.querySelector('[data-part="char"]');
  const person = people[name];
  if (person) {
    host.querySelectorAll('radialGradient stop').forEach(stop => {
      if (!stop.closest('radialGradient').id.endsWith('paxBody')) return;
      const stops = [...stop.parentNode.children];
      stop.setAttribute('stop-color', person.skin[stops.indexOf(stop)]);
    });
    host.querySelector('[data-part="highlight"]').setAttribute('opacity', '.16');
    // Leave Lukas's Paxi component unchanged; only portrait heads replace its eyes.
    host.querySelector('[data-part="eyeL"]').parentElement.style.display = 'none';
    host.querySelector('[data-part="glints"]').style.display = 'none';
    addRoundEyes(char, person);
    addBeard(char, person);
    smile(char);
    path(char, 'M66 81 Q77 77 87 81 M113 81 Q124 77 135 81', { fill:'none', stroke:person.hair, 'stroke-width':2.8, 'stroke-linecap':'round', opacity:.8 });
    addHair(char, person);
    if (person.glasses) addGlasses(char, person.glasses === 'bold');
    // Keep the iris-like Paxi pills visible behind glasses while retaining the smile.
    avatar.show('neutral');
    host.classList.add('portrait-head');
  } // Paxi uses the original, unmodified SVG and pleased animation: no added mouth.
  return avatar;
}
export async function createQrCharacter(host, config) {
  // Inline the actual QR modules; no image element, character frame, border or shadow.
  try {
    const response = await fetch(config.qrImage);
    if (!response.ok) throw new Error('QR asset unavailable');
    const parsed = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
    const source = parsed.documentElement;
    if (source.localName !== 'svg' || parsed.querySelector('parsererror')) throw new Error('Invalid QR SVG');
    const svg = element('svg', { viewBox: source.getAttribute('viewBox'), role:'img', 'aria-label':'Scan to try Paxi', class:'qr-code' });
    const modules = element('g', { class:'qr-modules' });
    // Assets are local project SVGs. Copy only QR geometry, never scripts or external content.
    for (const sourcePath of source.querySelectorAll('path')) {
      modules.append(element('path', { d:sourcePath.getAttribute('d'), fill:sourcePath.getAttribute('fill') || '#360573' }));
    }
    svg.append(modules);
    const floor=element('svg',{viewBox:'0 0 180 32',class:'qr-floor','aria-hidden':'true'});
    floor.append(element('ellipse',{cx:90,cy:16,rx:87,ry:13,fill:'#360573',opacity:'.2'}));
    const motion=document.createElement('div');motion.className='qr-motion';motion.append(svg);
    host.replaceChildren(floor,motion);
    animateQr(host,motion,floor);
  } catch {
    const label = document.createElement('p'); label.textContent = 'Try Paxi'; host.replaceChildren(label);
  }
}

// A shared continuous phase drives both the body and its ground projection.
// Smoothly varied speed/width avoids repeating an identical mechanical loop.
function animateQr(host, motion, floor) {
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let phase=0, last=performance.now(), speed=.8, targetSpeed=.8, width=12, targetWidth=12, turn=0;
  function frame(now){
    const dt=Math.min(.05,(now-last)/1000);last=now;
    if(!reduced.matches){
      speed+=(targetSpeed-speed)*(1-Math.exp(-dt*1.8));
      width+=(targetWidth-width)*(1-Math.exp(-dt*1.1));
      phase+=dt*speed;
      if(Math.floor(phase/Math.PI)!==turn){turn=Math.floor(phase/Math.PI);targetSpeed=.58+Math.random()*.6;targetWidth=9+Math.random()*7;}
      const side=Math.sin(phase), lift=Math.cos(phase)**2;
      const x=side*width, y=14-7*lift, angle=side*3.2;
      motion.style.transform=`translate(${x}px,${y}px) rotate(${angle}deg) scale(${1.045-.045*lift},${.97+.05*lift})`;
      floor.style.transform=`translateX(${x*.85}px) scale(${1-.12*lift},${1-.05*lift})`;
      floor.style.opacity=String(1-.25*lift);
    }else{motion.style.transform='none';floor.style.transform='none';floor.style.opacity='1';}
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

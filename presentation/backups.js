const topics = {
 features: [
 ['Full duplex','Listen while speaking. The Live voice connection supports natural turn taking and customer interruptions, including during the welcome.'],
 ['Multilingual','German, French, Italian and English. Speaking a different language can trigger a voice/session handoff within the same conversation.'],
 ['Full interviews','A complete questionnaire-backed life-context interview: priorities, missing details, progress and a final context extraction after the call.'],
 ['Live transcript','Both speakers’ turns appear in the conversation history. Linked calls also send transcript turns to the shared case.'],
 ['Structured intake','Answers are extracted from the conversation, validated against the questionnaire and saved with source turns.'],
 ['Growing visuals','The app can send a chart and revised data to the voice agent, which explains what is visible and what changed.'],
 ['Spoken confirmation','Explicit questions can request a spoken confirmation. Interrupted questions are cancelled rather than counted as confirmed.'],
 ['Conversation steering','The app can change topic priorities, stop speech, show a visual or request a natural end to the conversation.'],
 ['Resume & recover','Conversation resume, inactivity handling and case relinking support continuing after a pause or voice service restart.'],
 ['Animated Paxi','The avatar responds to listening, speech playback, activity and expression events.'],
 ['Shared case','A linked voice call submits unconfirmed observations to the case. The customer reviews and confirms the profile.'],
 ['Scenario calculations','The case backend integrates Logismata calculations for budget, risk and pension scenarios. Proposals and review are separate workflow steps.']
 ],
 boundaries: [
 ['Synthetic data only','This PoC is designed for invented customers. A production approval for real customer data has not been established.'],
 ['No binding policy','The contract journey is a saved demo workflow. It does not issue a real insurance policy.'],
 ['No voice sales pitch','The voice persona gathers and explains life context. Product recommendations belong to the separate confirmed-needs and review path.'],
 ['Customer confirmation','Extracted observations are proposals, not accepted facts. Confirming the customer profile is a distinct step.'],
 ['Human review','Suitability and specialist checks remain explicit workflow gates; finishing an interview does not satisfy them.'],
 ['No guaranteed returns','Pension and financial scenarios illustrate assumptions. They are not guaranteed benefits, returns or a mortgage approval.'],
 ['Production identity','Pax customer identity, production hosting and approved production access remain future integration work.'],
 ['Real advisor booking','A handover record does not establish a booked meeting. The external advisor/contact workflow still needs approval and integration.'],
 ['No silent fallback','Live calculator failures must not quietly switch to invented results. Replay requires an exact matching request.']
 ],
 limitations: [
 ['Extraction delay','Transcript updates and saved answers arrive asynchronously. The server debounces updates before scheduling extraction.'],
 ['Recognition errors','Speech, language detection and structured extraction can be wrong. Corrections and review remain necessary.'],
 ['Language handoff','A language change can open a new Live session, introducing a transition rather than a perfectly seamless voice switch.'],
 ['Browser permissions','Microphone access, a secure connection and browser audio policies affect whether a call can start and play sound.'],
 ['Network dependency','Live speech, model extraction and Logismata rely on network and provider availability. Partial failures need recovery.'],
 ['Voice naturalness','Voice imitation and expressiveness can still improve. We chose GPT-Live-1 for full-duplex, interruptible speech. ElevenLabs TTS is an alternative to evaluate for naturalness, but a separate TTS pipeline needs additional orchestration; ElevenLabs also offers interruptible agents. No comparative quality benchmark has been run.'],
 ['Session continuity','Persistent sessions exist in the case backend, but customer sessions expire after one hour and agent grants after at most 15 minutes. Long-lived, cross-device account continuity is not implemented.'],
 ['Anonymous demo users','The prototype uses anonymous demo identities and access-code roles. It has no production customer account registration, identity verification or full user-management experience.'],
 ['Operational monitoring','A backend, audit records and aggregate prototype analytics exist. A complete production activity-tracking and live operations dashboard has not been established.'],
 ['Proactive human observer','Handover and voice steering controls exist. A proactive observer console that detects a stuck AI and lets a human monitor and intervene live is not implemented.'],
 ['No measured benchmark','No quantified claim about extraction accuracy, conversion, latency or time saved is established by this presentation.'],
 ]
};
const cloudSpots=[[490,180],[145,75],[940,95],[70,255],[480,40],[1010,260],[410,320],[65,425],[890,430],[540,465],[810,5],[620,530]];
// Floating pill groups expand inline; dragging never triggers a detail click.
for(const slide of document.querySelectorAll('[data-cloud]')){
 const cloud=slide.querySelector('.word-cloud');slide.querySelector('.cloud-detail').remove();
 let busy=false;
 topics[slide.dataset.cloud].forEach(([label,description],i)=>{
  const item=document.createElement('div');item.className='topic-pill';
  const angle=i*2.399963, radius=Math.sqrt(i)*70;
  item.style.cssText=`left:${640+Math.cos(angle)*radius*2.2}px;top:${255+Math.sin(angle)*radius*.9}px`;
  const button=document.createElement('button');button.type='button';button.textContent=label;
  button.setAttribute('aria-expanded','false');
  const detail=document.createElement('div');detail.className='pill-detail';detail.id=`${slide.dataset.cloud}-${i}`;detail.textContent=description;detail.hidden=true;
  button.setAttribute('aria-controls',detail.id);item.append(button,detail);cloud.append(item);
  item.dataset.closedWidth=item.offsetWidth;
  let drag=null,moved=false;
  button.addEventListener('pointerdown',e=>{
   if(e.button!==0)return;moved=false;
   drag={x:e.clientX,y:e.clientY,left:parseFloat(item.style.left),top:parseFloat(item.style.top)};
   button.setPointerCapture(e.pointerId);
  });
  button.addEventListener('pointermove',e=>{
   if(!drag)return;const scale=cloud.getBoundingClientRect().width/cloud.offsetWidth;
   const dx=(e.clientX-drag.x)/scale,dy=(e.clientY-drag.y)/scale;
   if(Math.hypot(dx,dy)>5)moved=true;
   if(moved){item.classList.add('dragging');item.style.left=`${Math.max(0,Math.min(cloud.offsetWidth-item.offsetWidth,drag.left+dx))}px`;item.style.top=`${Math.max(0,Math.min(cloud.offsetHeight-70,drag.top+dy))}px`;}
  });
  for(const event of ['pointerup','pointercancel'])button.addEventListener(event,()=>{drag=null;item.classList.remove('dragging');});
  button.addEventListener('click',async()=>{
   if(moved){moved=false;return;}if(busy)return;busy=true;
   try{
    const previous=cloud.querySelector('.expanded');
    if(previous)await foldPill(previous,false,cloud);
    if(previous!==item)await foldPill(item,true,cloud);
   }finally{busy=false;}
  });
 });
 animateCloud(cloud);
}

async function foldPill(item,open,cloud){
 const button=item.querySelector('button'),detail=item.querySelector('.pill-detail');
 const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:1000;
 const tween=async(from,to)=>{const animation=item.animate([from,to],{duration,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'});await animation.finished;Object.assign(item.style,to);animation.cancel();};
 const compact=Number(item.dataset.closedWidth)||item.offsetWidth,shortHeight=Number(item.dataset.closedHeight)||button.offsetHeight;
 if(open){
  item.style.width=`${compact}px`;item.style.height=`${shortHeight}px`;
  item.classList.add('expanded');button.setAttribute('aria-expanded','true');
  // First widen the closed capsule. Only then separate its two caps.
  await tween({width:`${compact}px`},{width:'390px'});
  detail.hidden=false;item.classList.add('unfolded');
  const fullHeight=button.offsetHeight+detail.offsetHeight+22;
  item.style.top=`${Math.min(parseFloat(item.style.top),cloud.offsetHeight-fullHeight-8)}px`;
  await tween({height:`${shortHeight}px`},{height:`${fullHeight}px`});
  item.classList.add('is-green');
 }else{
  await tween({height:`${item.offsetHeight}px`},{height:`${shortHeight}px`});
  detail.hidden=true;item.classList.remove('unfolded');
  await tween({width:'390px'},{width:`${compact}px`});
  item.classList.remove('is-green','expanded');button.setAttribute('aria-expanded','false');
  item.style.height='';item.style.width='';
 }
}

function displace(cloud,active){
 const items=[active,...[...cloud.children].filter(el=>el!==active)];
 const placed=[];
 for(const el of items){
  const w=el.offsetWidth,h=el.offsetHeight,ox=parseFloat(el.style.left),oy=parseFloat(el.style.top);
  let best=null,score=Infinity;
  for(let y=0;y<=cloud.offsetHeight-h;y+=14)for(let x=0;x<=cloud.offsetWidth-w;x+=14){
   if(placed.some(b=>x<b.x+b.w+16&&x+w+16>b.x&&y<b.y+b.h+16&&y+h+16>b.y))continue;
   const d=(x-ox)**2+(y-oy)**2;if(d<score){score=d;best={x,y,w,h};}
  }
  if(best){placed.push(best);el.style.left=`${best.x}px`;el.style.top=`${best.y}px`;}
 }
}

function animateCloud(cloud){
 const items=[...cloud.children];let previous=performance.now(),initialized=false;
 const phases=items.map((_,i)=>i*2.399);
 function frame(now){
  const dt=Math.min(32,now-previous)/1000;previous=now;
  if(!cloud.closest('.slide').inert){
   if(!initialized){
    if(document.fonts.status!=='loaded'){requestAnimationFrame(frame);return;}
    items.forEach((el,i)=>{
     el.dataset.closedWidth=el.offsetWidth;el.dataset.closedHeight=el.offsetHeight;
     const angle=i*2.399963,radius=Math.sqrt(i)*70;
     el.style.left=`${(cloud.offsetWidth-el.offsetWidth)/2+Math.cos(angle)*radius*2.2}px`;
     el.style.top=`${(cloud.offsetHeight-el.offsetHeight)/2+Math.sin(angle)*radius*.9}px`;
    });
    displace(cloud,items[0]);initialized=true;
   }
   const boxes=items.map((el,i)=>({el,x:parseFloat(el.style.left),y:parseFloat(el.style.top),w:el.offsetWidth,h:el.offsetHeight,fixed:el.matches('.expanded,.dragging'),i}));
   const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
   for(const b of boxes)if(!b.fixed&&!reduced){b.x+=(Math.sin(now/3400+phases[b.i])+Math.sin(now/1730+phases[b.i]*3)*.4)*dt*4;b.y+=(Math.cos(now/4100+phases[b.i])+Math.sin(now/2310+phases[b.i]*2)*.4)*dt*4;}
   for(let pass=0;pass<12;pass++)for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
    const a=boxes[i],b=boxes[j],gap=24;
    const ox=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)+gap;
    const oy=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)+gap;
    if(ox<=0||oy<=0)continue;
    const ax=a.fixed?0:b.fixed?1:.5,bx=b.fixed?0:a.fixed?1:.5;
    if(ox<oy){const sign=a.x+a.w/2<b.x+b.w/2?-1:1;a.x+=sign*ox*ax;b.x-=sign*ox*bx;}
    else{const sign=a.y+a.h/2<b.y+b.h/2?-1:1;a.y+=sign*oy*ax;b.y-=sign*oy*bx;}
    for(const c of [a,b])if(!c.fixed){c.x=Math.max(0,Math.min(cloud.offsetWidth-c.w,c.x));c.y=Math.max(0,Math.min(cloud.offsetHeight-c.h,c.y));}
   }
   for(const b of boxes)if(!b.el.classList.contains('dragging')){b.el.style.left=`${b.x}px`;b.el.style.top=`${b.y}px`;}
   const overlap=boxes.some((a,i)=>boxes.slice(i+1).some(b=>a.x<b.x+b.w+16&&a.x+a.w+16>b.x&&a.y<b.y+b.h+16&&a.y+a.h+16>b.y));
   if(overlap)displace(cloud,cloud.querySelector('.dragging,.expanded')||items[0]);
  }
  requestAnimationFrame(frame);
 }
 requestAnimationFrame(frame);
}

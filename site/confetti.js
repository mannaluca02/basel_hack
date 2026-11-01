// Local full-page celebration, with no external runtime or network dependency.
export function createConfetti() {
  const canvas=document.createElement('canvas');canvas.className='closing-confetti';canvas.setAttribute('aria-hidden','true');document.body.append(canvas);
  const ctx=canvas.getContext('2d');let frame=0,started=0,last=0,particles=[];
  const colors=['#8bcb00','#360573','#de7399','#c5a4ed','#e4d6a4'];
  function fit(){const dpr=Math.min(devicePixelRatio||1,2);canvas.width=innerWidth*dpr;canvas.height=innerHeight*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);}
  function stop(){cancelAnimationFrame(frame);frame=0;canvas.hidden=true;ctx.clearRect(0,0,innerWidth,innerHeight);}
  function tick(now){
    const dt=Math.min(.04,(now-last)/1000);last=now;const age=(now-started)/1000;ctx.clearRect(0,0,innerWidth,innerHeight);
    for(const p of particles){
      p.x+=(p.vx+Math.sin(age*1.6+p.phase)*22)*dt;p.y+=p.vy*dt;p.vy+=18*dt;p.angle+=p.spin*dt;
      const fade=Math.min(1,Math.max(0,(9-age)/2));
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);ctx.globalAlpha=.85*fade;ctx.fillStyle=p.color;
      const flip=.25+.75*Math.abs(Math.cos(age*2+p.phase));ctx.fillRect(-p.w/2,-p.h/2,p.w*flip,p.h);ctx.restore();
    }
    if(age<9)frame=requestAnimationFrame(tick);else stop();
  }
  function play(){
    stop();if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    fit();canvas.hidden=false;
    particles=Array.from({length:210},()=>({x:Math.random()*innerWidth,y:-Math.random()*innerHeight-.05*innerHeight,vx:(Math.random()-.5)*70,vy:65+Math.random()*125,w:5+Math.random()*7,h:3+Math.random()*6,angle:Math.random()*Math.PI,spin:(Math.random()-.5)*5,phase:Math.random()*Math.PI*2,color:colors[Math.floor(Math.random()*colors.length)]}));
    started=last=performance.now();frame=requestAnimationFrame(tick);
  }
  addEventListener('resize',fit);stop();return {play,stop};
}

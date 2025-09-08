/* ======= Utils ======= */
const pad2 = (n)=> n.toString().padStart(2,'0');
const clamp = (n,min,max)=>Math.min(max,Math.max(min,n));

/* ======= Stato iniziale ======= */
const state = { prep:0, work:4, rest:4, rounds:10 };

const displays = {
  prep: document.querySelector('[data-display="prep"]'),
  work: document.querySelector('[data-display="work"]'),
  rest: document.querySelector('[data-display="rest"]'),
  rounds: document.querySelector('[data-display="rounds"]'),
};

const secToLabel = s => `${pad2(Math.floor(s/60))}:${pad2(s%60)}`;
function refreshDials(){
  displays.prep.textContent = secToLabel(state.prep);
  displays.work.textContent = secToLabel(state.work);
  displays.rest.textContent = secToLabel(state.rest);
  displays.rounds.textContent = state.rounds;
}
refreshDials();

/* ======= Wheels ======= */
class SnapWheel{
  constructor(root,{min,max,selected,pad=false}){
    this.root=root; this.min=min; this.max=max; this.pad=pad;
    this.itemHeight=64;
    this.updateOffset=()=>{ this.offset = (this.root.clientHeight/2 - this.itemHeight/2); };
    this.updateOffset();

    const frag=document.createDocumentFragment();
    for(let i=min;i<=max;i++){
      const el=document.createElement('div');
      el.className='wheel-item';
      el.textContent=pad?pad2(i):i;
      frag.appendChild(el);
    }
    root.innerHTML=''; root.appendChild(frag);

    this.setSelected(selected,false);

    this.onScroll=this.onScroll.bind(this);
    this.onTouchEnd=this.onTouchEnd.bind(this);
    root.addEventListener('scroll',this.onScroll,{passive:true});
    root.addEventListener('touchend',this.onTouchEnd);
    root.addEventListener('pointerup',this.onTouchEnd);
    window.addEventListener('resize',()=>{ this.updateOffset(); this.setSelected(this.value(),false); });
    this.afterScrollTimer=null;
    this.updateActive();
  }
  index(){ return Math.round((this.root.scrollTop + this.offset) / this.itemHeight); }
  value(){ return this.min + this.index(); }
  setSelected(v,smooth=true){
    const idx=clamp(v-this.min,0,this.max-this.min);
    this.root.scrollTo({top: idx*this.itemHeight - this.offset, behavior: smooth?'smooth':'auto'});
    this.updateActive(idx);
  }
  updateActive(forceIndex=null){
    const idx=forceIndex ?? this.index();
    [...this.root.children].forEach((el,i)=> el.classList.toggle('active',i===idx));
  }
  onScroll(){
    if(this.afterScrollTimer) clearTimeout(this.afterScrollTimer);
    this.updateActive();
    this.afterScrollTimer=setTimeout(()=>{
      const idx=this.index();
      this.root.scrollTo({top: idx*this.itemHeight - this.offset, behavior:'smooth'});
      this.updateActive(idx);
    },80);
  }
  onTouchEnd(){
    const idx=this.index();
    this.root.scrollTo({top: idx*this.itemHeight - this.offset, behavior:'smooth'});
    this.updateActive(idx);
  }
}

/* ======= Modal Picker ======= */
const modal=document.getElementById('picker-modal');
const wheelsContainer=document.getElementById('wheels-container');
const wheelRoundsWrap=document.getElementById('wheel-rounds');
const btnCancel=document.getElementById('btn-cancel');
const btnConfirm=document.getElementById('btn-confirm');
const pickerTitle=document.getElementById('picker-title');

let activeKey=null; let minuteWheel,secondsWheel,roundsWheel;

function titleFor(key){
  if(key==='prep') return 'Imposta Preparazione';
  if(key==='work') return 'Imposta Work';
  if(key==='rest') return 'Imposta Rest';
  return 'Imposta giri';
}

function openPicker(key){
  activeKey=key;
  modal.classList.remove('hidden');
  pickerTitle.textContent = titleFor(key);

  if(key==='rounds'){
    wheelsContainer.style.display='none';
    wheelRoundsWrap.style.display='flex';
    if(!roundsWheel){
      roundsWheel=new SnapWheel(wheelRoundsWrap.querySelector('.wheel'),{min:1,max:99,selected:state.rounds,pad:true});
    }else{
      roundsWheel.setSelected(state.rounds,false);
    }
  }else{
    wheelsContainer.style.display='flex';
    wheelRoundsWrap.style.display='none';
    if(!minuteWheel){
      minuteWheel=new SnapWheel(wheelsContainer.querySelector('[data-type="minutes"]'),{min:0,max:59,selected:0,pad:true});
      secondsWheel=new SnapWheel(wheelsContainer.querySelector('[data-type="seconds"]'),{min:0,max:59,selected:0,pad:true});
    }
    const total=state[key];
    minuteWheel.setSelected(Math.floor(total/60),false);
    secondsWheel.setSelected(total%60,false);
  }
}
function closePicker(){ modal.classList.add('hidden'); }

btnCancel.addEventListener('click',closePicker);
btnConfirm.addEventListener('click',()=>{
  if(activeKey==='rounds'){ state.rounds=roundsWheel.value(); }
  else { state[activeKey]=minuteWheel.value()*60 + secondsWheel.value(); }
  refreshDials(); closePicker();
});

document.querySelectorAll('.dial').forEach(btn=> btn.addEventListener('click',()=>openPicker(btn.dataset.key)));

/* ======= Avvio: animazione collasso ======= */
const editScreen=document.getElementById('edit-screen');
const startBtn=document.getElementById('start-btn');
const runScreen=document.getElementById('run-screen');

startBtn.addEventListener('click', ()=>{
  const grid=editScreen.querySelector('.grid');
  const r=grid.getBoundingClientRect();
  const cx=r.left+r.width/2, cy=r.top+r.height/2;

  editScreen.classList.add('collapsing');
  grid.querySelectorAll('.dial').forEach(d=>{
    const b=d.getBoundingClientRect();
    d.style.setProperty('--dx', (cx-(b.left+b.width/2))+'px');
    d.style.setProperty('--dy', (cy-(b.top+b.height/2))+'px');
  });

  setTimeout(()=>{
    editScreen.classList.remove('active','collapsing');
    runScreen.classList.add('active');
    bootTimer();
  },620);
});

/* ======= Timer ======= */
const phaseLabel=document.getElementById('phase-label');
const timeLabel=document.getElementById('time-label');
const roundLabel=document.getElementById('round-label');
const svgProgress=document.querySelector('.progress');
const radius=150, circumference=2*Math.PI*radius;
svgProgress.style.strokeDasharray=`${circumference}`;
svgProgress.style.strokeDashoffset=`0`;

const phaseColors={
  prep:getComputedStyle(document.documentElement).getPropertyValue('--prep').trim(),
  work:getComputedStyle(document.documentElement).getPropertyValue('--green').trim(),
  rest:getComputedStyle(document.documentElement).getPropertyValue('--salmon').trim(),
};

let timer=null, paused=false;

function setProgress(frac,phase){
  svgProgress.style.strokeDashoffset=`${circumference*(1-frac)}`;
  svgProgress.style.stroke=phaseColors[phase];
}
function hslFromHex(hex){
  const m=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if(!m) return [0,0,100];
  let r=parseInt(m[1],16)/255, g=parseInt(m[2],16)/255, b=parseInt(m[3],16)/255;
  const mx=Math.max(r,g,b), mn=Math.min(r,g,b); let h,s,l=(mx+mn)/2;
  if(mx===mn){h=s=0}else{
    const d=mx-mn; s=l>0.5? d/(2-mx-mn) : d/(mx+mn);
    switch(mx){case r:h=(g-b)/d+(g<b?6:0);break; case g:h=(b-r)/d+2;break; case b:h=(r-g)/d+4;break;}
    h/=6;
  }
  return [Math.round(h*360),Math.round(s*100),Math.round(l*100)];
}

function buildQueue(){
  const q=[]; if(state.prep>0) q.push({phase:'prep',duration:state.prep});
  for(let i=1;i<=state.rounds;i++){
    q.push({phase:'work',duration:state.work,round:i});
    if(i<state.rounds && state.rest>0) q.push({phase:'rest',duration:state.rest,round:i});
  }
  return q;
}

function bootTimer(){
  paused=false; const q=buildQueue(); let step=0;

  function runStep(){
    if(step>=q.length){ phaseLabel.textContent='Fatto!'; setProgress(1,'work'); timeLabel.textContent='00:00'; roundLabel.textContent=''; return; }

    const {phase,duration,round}=q[step];
    const total=duration; let remaining=duration;
    const [h,s,l]=hslFromHex(phaseColors[phase]);

    phaseLabel.textContent = phase==='prep'?'Preparazione':(phase==='work'?'Work':'Rest');
    roundLabel.textContent = round?`round ${round}/${state.rounds}`:'';

    svgProgress.style.transition='none'; setProgress(1,phase); void svgProgress.offsetWidth;
    svgProgress.style.transition='stroke-dashoffset .2s linear, stroke .2s linear';
    timeLabel.textContent=secToLabel(remaining);

    if(timer) clearInterval(timer);
    timer=setInterval(()=>{
      if(paused) return;
      remaining = clamp(remaining-1,0,total);
      const frac = total===0?1:remaining/total;
      setProgress(frac,phase);
      const lum=Math.max(40,Math.min(70,l-(1-frac)*15));
      svgProgress.style.stroke=`hsl(${h} ${s}% ${lum}%)`;
      timeLabel.textContent=secToLabel(remaining);
      if(remaining<=0){ clearInterval(timer); step++; setTimeout(runStep,260); }
    },1000);

    setProgress(total===0?1:remaining/total,phase);
  }
  runStep();
}

/* pausa/riprendi toccando il cerchio */
document.getElementById('main-timer').addEventListener('click', ()=>{
  if(!runScreen.classList.contains('active')) return;
  paused=!paused;
});

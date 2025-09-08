/* ======= Utility helpers ======= */
const pad2 = (n)=> n.toString().padStart(2,'0');
const clamp = (n,min,max)=>Math.min(max,Math.max(min,n));

/* ======= Initial state ======= */
const state = {
  prep: 0,        // seconds
  work: 4,        // seconds
  rest: 4,        // seconds
  rounds: 10,
};

// Keep references
const displays = {
  prep: document.querySelector('[data-display="prep"]'),
  work: document.querySelector('[data-display="work"]'),
  rest: document.querySelector('[data-display="rest"]'),
  rounds: document.querySelector('[data-display="rounds"]'),
};

function secToLabel(s){
  const m = Math.floor(s/60), sec = s%60;
  return `${pad2(m)}:${pad2(sec)}`;
}

function refreshDials(){
  displays.prep.textContent = secToLabel(state.prep);
  displays.work.textContent = secToLabel(state.work);
  displays.rest.textContent = secToLabel(state.rest);
  displays.rounds.textContent = state.rounds;
}
refreshDials();

/* ======= Wheels (snap pickers) ======= */

class SnapWheel {
  constructor(root, {min, max, selected, pad=false}){
    this.root = root;
    this.min = min; this.max = max; this.pad = pad;
    this.itemHeight = 64;
    // Build items
    const frag = document.createDocumentFragment();
    for(let i=min;i<=max;i++){
      const el = document.createElement('div');
      el.className = 'wheel-item';
      el.textContent = pad ? pad2(i) : i;
      frag.appendChild(el);
    }
    root.innerHTML = '';
    root.appendChild(frag);

    // Scroll to selected index
    this.setSelected(selected, false);

    // Scroll handling
    this.onScroll = this.onScroll.bind(this);
    this.onTouchEnd = this.onTouchEnd.bind(this);
    root.addEventListener('scroll', this.onScroll, {passive:true});
    root.addEventListener('touchend', this.onTouchEnd);
    root.addEventListener('pointerup', this.onTouchEnd);
    this.afterScrollTimer = null;
    this.updateActive();
  }
  value(){ return this.min + Math.round(this.root.scrollTop / this.itemHeight); }
  setSelected(v, smooth=true){
    const idx = clamp(v - this.min, 0, this.max - this.min);
    this.root.scrollTo({top: idx*this.itemHeight, behavior: smooth? 'smooth' : 'auto'});
    this.updateActive(idx);
  }
  updateActive(forceIndex=null){
    const idx = forceIndex ?? Math.round(this.root.scrollTop / this.itemHeight);
    [...this.root.children].forEach((el,i)=> el.classList.toggle('active', i===idx));
  }
  onScroll(){
    if(this.afterScrollTimer) clearTimeout(this.afterScrollTimer);
    this.updateActive();
    this.afterScrollTimer = setTimeout(()=>{
      // snap to nearest
      const idx = Math.round(this.root.scrollTop / this.itemHeight);
      this.root.scrollTo({top: idx*this.itemHeight, behavior:'smooth'});
      this.updateActive(idx);
    }, 80);
  }
  onTouchEnd(){
    // kick one last snap
    const idx = Math.round(this.root.scrollTop / this.itemHeight);
    this.root.scrollTo({top: idx*this.itemHeight, behavior:'smooth'});
    this.updateActive(idx);
  }
}

/* ======= Modal Picker ======= */
const modal = document.getElementById('picker-modal');
const sheet = modal.querySelector('.sheet');
const wheelsContainer = document.getElementById('wheels-container');
const wheelRoundsWrap = document.getElementById('wheel-rounds');
const btnCancel = document.getElementById('btn-cancel');
const btnConfirm = document.getElementById('btn-confirm');
const pickerTitle = document.getElementById('picker-title');

let activeKey = null;
let minuteWheel, secondsWheel, roundsWheel;

function openPicker(key){
  activeKey = key;
  modal.classList.remove('hidden');
  requestAnimationFrame(()=> sheet.style.transform = 'translateY(0)'); // ensure hardware accel
  pickerTitle.textContent = key==='rounds' ? 'Imposta giri' :
    `Imposta ${key==='prep' ? 'Preparazione' : (key==='work'?'Work':'Rest')}`;

  if(key === 'rounds'){
    wheelsContainer.style.display='none';
    wheelRoundsWrap.style.display='flex';
    if(!roundsWheel){
      roundsWheel = new SnapWheel(wheelRoundsWrap.querySelector('.wheel'), {min:1, max:99, selected: state.rounds, pad:true});
    }else{
      roundsWheel.setSelected(state.rounds, false);
    }
  }else{
    wheelsContainer.style.display='flex';
    wheelRoundsWrap.style.display='none';
    if(!minuteWheel){
      minuteWheel = new SnapWheel(wheelsContainer.querySelector('[data-type="minutes"]'), {min:0, max:59, selected: 0, pad:true});
      secondsWheel = new SnapWheel(wheelsContainer.querySelector('[data-type="seconds"]'), {min:0, max:59, selected: 0, pad:true});
    }
    // Set initial from state
    const total = state[key];
    minuteWheel.setSelected(Math.floor(total/60), false);
    secondsWheel.setSelected(total%60, false);
  }
}
function closePicker(){ modal.classList.add('hidden'); }

btnCancel.addEventListener('click', closePicker);
btnConfirm.addEventListener('click', ()=>{
  if(activeKey==='rounds'){
    state.rounds = roundsWheel.value();
  }else{
    state[activeKey] = minuteWheel.value()*60 + secondsWheel.value();
  }
  refreshDials();
  closePicker();
});

document.querySelectorAll('.dial').forEach(btn=>{
  btn.addEventListener('click', ()=> openPicker(btn.dataset.key));
});

/* ======= Start -> Collapse animation then run ======= */
const editScreen = document.getElementById('edit-screen');
const startBtn = document.getElementById('start-btn');
const runScreen = document.getElementById('run-screen');

startBtn.addEventListener('click', ()=>{
  // compute dx/dy for each dial to center of grid
  const grid = editScreen.querySelector('.grid');
  const gridRect = grid.getBoundingClientRect();
  const centerX = gridRect.left + gridRect.width/2;
  const centerY = gridRect.top + gridRect.height/2;

  editScreen.classList.add('collapsing');
  grid.querySelectorAll('.dial').forEach(dial=>{
    const r = dial.getBoundingClientRect();
    const dx = (centerX - (r.left + r.width/2));
    const dy = (centerY - (r.top + r.height/2));
    dial.style.setProperty('--dx', dx+'px');
    dial.style.setProperty('--dy', dy+'px');
  });

  // After animation, swap screens and boot timer
  setTimeout(()=>{
    editScreen.classList.remove('active');
    editScreen.classList.remove('collapsing');
    runScreen.classList.add('active');
    bootTimer();
  }, 620);
});

/* ======= Main Timer Logic ======= */
const phaseLabel = document.getElementById('phase-label');
const timeLabel  = document.getElementById('time-label');
const roundLabel = document.getElementById('round-label');

const svgProgress = document.querySelector('.progress');
const radius = 150;
const circumference = 2 * Math.PI * radius;
svgProgress.style.strokeDasharray = `${circumference}`;
svgProgress.style.strokeDashoffset = `${0}`;

const phaseColors = {
  prep: getComputedStyle(document.documentElement).getPropertyValue('--prep').trim(),
  work: getComputedStyle(document.documentElement).getPropertyValue('--green').trim(),
  rest: getComputedStyle(document.documentElement).getPropertyValue('--salmon').trim(),
};

let timer = null;
let paused = false;

function setProgress(frac, phase){
  const offset = circumference*(1-frac);
  svgProgress.style.strokeDashoffset = `${offset}`;
  // Color that dims as time elapses
  const base = phaseColors[phase];
  svgProgress.style.stroke = base;
}

function hslFromHex(hex){
  // convert hex to hsl for slight animation if desired
  const res = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if(!res) return [0,0,100];
  let r = parseInt(res[1],16)/255;
  let g = parseInt(res[2],16)/255;
  let b = parseInt(res[3],16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h,s,l=(max+min)/2;
  if(max===min){h=s=0;}else{
    const d = max-min;
    s = l>0.5 ? d/(2-max-min) : d/(max+min);
    switch(max){
      case r: h=(g-b)/d+(g<b?6:0); break;
      case g: h=(b-r)/d+2; break;
      case b: h=(r-g)/d+4; break;
    }
    h/=6;
  }
  return [Math.round(h*360), Math.round(s*100), Math.round(l*100)];
}

// Timer phases queue
function buildQueue(){
  const seq = [];
  if(state.prep>0){ seq.push({phase:'prep', duration: state.prep}); }
  for(let r=1; r<=state.rounds; r++){
    seq.push({phase:'work', duration: state.work, round:r});
    if(r<state.rounds && state.rest>0) seq.push({phase:'rest', duration: state.rest, round:r});
  }
  return seq;
}

function bootTimer(){
  paused=false;
  const queue = buildQueue();
  let step = 0;

  function runStep(){
    if(step>=queue.length){
      phaseLabel.textContent = 'Fatto!';
      setProgress(1,'work');
      timeLabel.textContent = '00:00';
      roundLabel.textContent = '';
      return;
    }
    const {phase, duration, round} = queue[step];
    const total = duration;
    let remaining = duration;
    const [h,s,l] = hslFromHex(phaseColors[phase]);
    phaseLabel.textContent = phase==='prep' ? 'Preparazione' : (phase==='work' ? 'Work' : 'Rest');
    roundLabel.textContent = round ? `round ${round}/${state.rounds}` : '';
    svgProgress.style.transition = 'none';
    setProgress(1, phase);
    void svgProgress.offsetWidth; // reflow to reset transition
    svgProgress.style.transition = 'stroke-dashoffset .2s linear, stroke .2s linear';
    timeLabel.textContent = secToLabel(remaining);

    if(timer) clearInterval(timer);
    timer = setInterval(()=>{
      if(paused) return;
      remaining = clamp(remaining-1, 0, total);
      const frac = total===0? 1 : remaining/total;
      setProgress(frac, phase);
      // Slight color dimming
      const lum = Math.max(40, Math.min(70, l - (1-frac)*15));
      svgProgress.style.stroke = `hsl(${h} ${s}% ${lum}%)`;
      timeLabel.textContent = secToLabel(remaining);
      if(remaining<=0){
        clearInterval(timer);
        step++;
        // brief delay between phases for visual clarity
        setTimeout(runStep, 260);
      }
    }, 1000);

    // immediate initial update (so ring starts at almost full)
    const fracStart = total===0?1: remaining/total;
    setProgress(fracStart, phase);
  }

  runStep();
}

/* Pause/Resume on circle tap */
document.getElementById('main-timer').addEventListener('click', ()=>{
  if(!runScreen.classList.contains('active')) return;
  paused = !paused;
  document.querySelector('.touch-hint').style.opacity = paused? .85 : 1;
});

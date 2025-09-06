// app.js - Modifica: home solo 4 cerchi; animazione collasso verso il centro all'Avvio; wheel 'Giri' singola e centrata.
(() => {
  // ----------------------------- DOM -----------------------------
  const app = document.getElementById('app');
  const pageTitle = document.getElementById('pageTitle');

  // Mode switch
  const modeTimerBtn = document.getElementById('modeTimer');
  const modeGymBtn = document.getElementById('modeGym');

  // Standard timer area (hidden until running)
  const standardArea = document.getElementById('standardArea');
  const clockWrap = document.getElementById('clockWrap');
  const timeLabel = document.getElementById('timeLabel');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const phaseLabel = document.getElementById('phaseLabel');

  // Gym area
  const gymArea = document.getElementById('gymArea');
  const gymGrid = document.getElementById('gymGrid');
  const prepCircle = document.getElementById('prepCircle');
  const workCircle = document.getElementById('workCircle');
  const restCircle = document.getElementById('restCircle');
  const roundsCircle = document.getElementById('roundsCircle');
  const prepValueEl = document.getElementById('prepValue');
  const workValueEl = document.getElementById('workValue');
  const restValueEl = document.getElementById('restValue');
  const roundsValueEl = document.getElementById('roundsValue');
  const gymStartBtn = document.getElementById('gymStartBtn');

  // Picker modal
  const overlay = document.getElementById('pickerOverlay');
  const pickerTitle = document.getElementById('pickerTitle');
  const minutesCol = document.getElementById('minutesCol');
  const wheels = document.getElementById('wheels');
  const minutesLabel = document.getElementById('minutesLabel');
  const secondsLabel = document.getElementById('secondsLabel');
  const secondsCol = document.getElementById('secondsCol');
  const minutesWheel = document.getElementById('minutesWheel');
  const secondsWheel = document.getElementById('secondsWheel');
  const confirmPicker = document.getElementById('confirmPicker');
  const cancelPicker = document.getElementById('cancelPicker');

  // SVG ring
  const ring = document.querySelector('.ring');
  const R = 88;
  const C = 2 * Math.PI * R;
  ring.style.strokeDasharray = `${C}px`;
  ring.style.strokeDashoffset = `0px`;

  // ----------------------------- Config/State -----------------------------
  const MAX_MIN = 59;
  const MAX_SEC = 59;

  // Standard timer state
  let selectedMin = 0, selectedSec = 30;
  let duration = selectedMin * 60 + selectedSec;

  // Runtime state
  let rafId = null;
  let startTs = null;
  let remaining = 0;
  let isPaused = false;
  let pausedAt = 0;
  let pausedRemaining = 0;
  let totalDurationOnRun = 0;
  let wakeLock = null;
  let audioCtx = null;

  // Picker state
  let isPickerOpen = false;
  let pickerContext = 'standard-time'; // 'standard-time' | 'prep' | 'work' | 'rest' | 'rounds'
  let pickerMode = 'time'; // 'time' | 'integer'

  // Wheel state helpers
  const wheelState = {
    minutes: { locked:false, initialized:false, scrollTimeout:null },
    seconds: { locked:false, initialized:false, scrollTimeout:null }
  };

  // Gym state
  const gym = {
    prepSec: 10,
    workSec: 30,
    restSec: 20,
    rounds: 3,
    active: false,
    phases: [],
    index: -1
  };

  // ----------------------------- Utils -----------------------------
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (sec) => `${pad(Math.floor(sec/60))}:${pad(sec%60)}`;

  function updateLabel(min, sec){
    timeLabel.textContent = `${pad(min)}:${pad(sec)}`;
    timeLabel.setAttribute('aria-label', `${min} minuti e ${sec} secondi`);
  }
  updateLabel(selectedMin, selectedSec);

  function updateGymUI(){
    prepValueEl.textContent = fmt(gym.prepSec);
    workValueEl.textContent = fmt(gym.workSec);
    restValueEl.textContent = fmt(gym.restSec);
    roundsValueEl.textContent = String(gym.rounds);
  }
  updateGymUI();

  function setPhaseInfo(text){
    phaseLabel.textContent = text;
  }

  // ----------------------------- Wheel (picker) -----------------------------
  function cleanupListeners(container){
    if (container._scrollHandler){ container.removeEventListener('scroll', container._scrollHandler); container._scrollHandler=null; }
    if (container._keyHandler){ container.removeEventListener('keydown', container._keyHandler); container._keyHandler=null; }
  }

  function buildWheel(container, max){
    cleanupListeners(container);
    container.innerHTML = '';
    const ul = document.createElement('ul');
    ul.className = 'list';

    // Create items 0..max
    for (let i=0;i<=max;i++){
      const li = document.createElement('li');
      li.className = 'wheel-item';
      li.textContent = i.toString().padStart(2,'0');
      li.dataset.value = i;
      ul.appendChild(li);
    }

    // Spacers for center alignment
    const sample = document.createElement('li');
    sample.className='wheel-item';
    sample.textContent='00';
    container.appendChild(ul);
    const itemH = 128; // sync with CSS var
    const containerH = Math.max(0, container.getBoundingClientRect().height) || (window.innerHeight - 220);
    const spacerH = Math.max(0, Math.round((containerH - itemH)/2));

    const topSpacer = document.createElement('li'); topSpacer.className='spacer'; topSpacer.style.height = `${spacerH}px`;
    const bottomSpacer = document.createElement('li'); bottomSpacer.className='spacer'; bottomSpacer.style.height = `${spacerH}px`;
    ul.insertBefore(topSpacer, ul.firstChild);
    ul.appendChild(bottomSpacer);

    return ul;
  }

  function markSelected(list, value){
    const items = list.querySelectorAll('.wheel-item');
    items.forEach(it => it.classList.toggle('selected', Number(it.dataset.value) === value));
  }

  function setupWheel(container, list, max, onSelect){
    const state = container === minutesWheel ? wheelState.minutes : wheelState.seconds;
    const itemH = 128;

    function snap(){
      const y = container.scrollTop;
      const idx = Math.round((y / itemH));
      const value = Math.min(max, Math.max(0, idx));
      const targetTop = value * itemH;
      container.classList.add('smooth-scroll');
      container.scrollTop = targetTop;
      setTimeout(()=> container.classList.remove('smooth-scroll'), 180);
      onSelect(value);
      markSelected(list, value);
    }

    container._scrollHandler = () => {
      if (state.scrollTimeout) clearTimeout(state.scrollTimeout);
      state.scrollTimeout = setTimeout(snap, 120);
    };
    container.addEventListener('scroll', container._scrollHandler);

    container._keyHandler = (e) => {
      if (e.key === 'ArrowUp'){ e.preventDefault(); const v = Math.max(0, (container._value||0)-1); container._value=v; container.scrollTop = v*itemH; onSelect(v); markSelected(list,v); }
      if (e.key === 'ArrowDown'){ e.preventDefault(); const v = Math.min(max, (container._value||0)+1); container._value=v; container.scrollTop = v*itemH; onSelect(v); markSelected(list,v); }
    };
    container.addEventListener('keydown', container._keyHandler);
  }

  function trapFocus(modalRoot){
    lastFocused = document.activeElement;
    const focusable = modalRoot.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])');
    const first = focusable[0];
    const last = focusable[focusable.length-1];
    trapKeyHandler = (e) => {
      if (e.key === 'Tab'){
        if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first?.focus(); }
      }
      if (e.key === 'Escape'){ closePicker(); }
    };
    modalRoot.addEventListener('keydown', trapKeyHandler);
    setTimeout(()=> first?.focus(), 0);
  }
  function releaseFocusTrap(){
    if (trapKeyHandler){ overlay.removeEventListener('keydown', trapKeyHandler); trapKeyHandler = null; }
    try{ lastFocused?.focus(); }catch{}
  }
  let trapKeyHandler = null;
  let lastFocused = null;

  function openPickerFor(ctx){
    pickerContext = ctx;

    if (ctx === 'rounds'){
      pickerMode = 'integer';
      pickerTitle.textContent = 'Imposta giri';
      minutesLabel.textContent = 'Giri';
      secondsCol.hidden = true;
      wheels.classList.add('one-col');

      // Build only minutes wheel 0..99, clamp later
      const list = buildWheel(minutesWheel, 99);
      const current = Math.min(99, Math.max(1, gym.rounds));
      minutesWheel._value = current;
      const itemH = 128; minutesWheel.scrollTop = current*itemH;
      markSelected(list, current);
      setupWheel(minutesWheel, list, 99, v => { minutesWheel._value = v; });
    } else {
      pickerMode = 'time';
      wheels.classList.remove('one-col');
      secondsCol.hidden = false;
      minutesLabel.textContent = 'Minuti';
      secondsLabel.textContent = 'Secondi';
      pickerTitle.textContent = ({
        'standard-time': 'Imposta tempo',
        'prep': 'Imposta Preparazione',
        'work': 'Imposta Work',
        'rest': 'Imposta Rest'
      })[ctx] || 'Imposta';

      const minList = buildWheel(minutesWheel, MAX_MIN);
      const secList = buildWheel(secondsWheel, MAX_SEC);

      let initMin=0, initSec=0;
      if (ctx === 'standard-time'){ initMin = selectedMin; initSec = selectedSec; }
      if (ctx === 'prep'){ initMin = Math.floor(gym.prepSec/60); initSec = gym.prepSec%60; }
      if (ctx === 'work'){ initMin = Math.floor(gym.workSec/60); initSec = gym.workSec%60; }
      if (ctx === 'rest'){ initMin = Math.floor(gym.restSec/60); initSec = gym.restSec%60; }

      const itemH = 128;
      minutesWheel._value = initMin; secondsWheel._value = initSec;
      minutesWheel.scrollTop = initMin*itemH; secondsWheel.scrollTop = initSec*itemH;
      markSelected(minList, initMin); markSelected(secList, initSec);

      setupWheel(minutesWheel, minList, MAX_MIN, v => { minutesWheel._value = v; });
      setupWheel(secondsWheel, secList, MAX_SEC, v => { secondsWheel._value = v; });
    }

    isPickerOpen = true;
    overlay.hidden = false;
    trapFocus(overlay);
  }

  function closePicker(){
    if (!isPickerOpen) return;
    isPickerOpen = false;
    overlay.hidden = true;
    wheels.classList.remove('one-col');
    releaseFocusTrap();
    cleanupListeners(minutesWheel);
    cleanupListeners(secondsWheel);
  }

  cancelPicker.addEventListener('click', closePicker);

  confirmPicker.addEventListener('click', () => {
    if (pickerMode === 'integer' && pickerContext === 'rounds'){
      let v = Math.max(1, Math.min(99, minutesWheel._value ?? gym.rounds));
      gym.rounds = v;
      updateGymUI();
      closePicker();
      return;
    }

    const m = minutesWheel._value ?? 0;
    const s = secondsWheel._value ?? 0;
    const secs = m*60 + s;

    if (pickerContext === 'standard-time'){
      if (secs <= 0){
        timeLabel.animate([{ transform:'translateY(0)' },{ transform:'translateY(-8px)' },{ transform:'translateY(0)' }], {duration:320, easing:'cubic-bezier(.2,.9,.2,1)'});
        return;
      }
      selectedMin = m; selectedSec = s; duration = secs;
      updateLabel(selectedMin, selectedSec);
      closePicker();
      return;
    }

    if (pickerContext === 'prep'){ gym.prepSec = secs; updateGymUI(); closePicker(); return; }
    if (pickerContext === 'work'){ gym.workSec = secs; updateGymUI(); closePicker(); return; }
    if (pickerContext === 'rest'){ gym.restSec = secs; updateGymUI(); closePicker(); return; }
  });

  // ----------------------------- Audio -----------------------------
  async function initAudioContext(){
    if (!audioCtx){
      try{ audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch{ audioCtx = null; }
    }
    return audioCtx;
  }
  async function playStartSound(){
    const ctx = await initAudioContext(); if (!ctx) return;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type='sine'; o.frequency.setValueAtTime(880, ctx.currentTime);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.01);
    o.connect(g).connect(ctx.destination); o.start();
    o.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.38);
    o.stop(ctx.currentTime + 0.42);
  }
  async function playFinishSound(){
    const ctx = await initAudioContext(); if (!ctx) return;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type='triangle'; o.frequency.setValueAtTime(330, ctx.currentTime);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.01);
    o.connect(g).connect(ctx.destination); o.start();
    o.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.28);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    o.stop(ctx.currentTime + 0.62);
  }

  // ----------------------------- WakeLock -----------------------------
  async function requestWakeLock(){
    try {
      if ('wakeLock' in navigator && navigator.wakeLock.request){
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch { wakeLock = null; }
  }
  function releaseWakeLock(){ try{ wakeLock?.release?.(); }catch{} finally{ wakeLock = null; }}

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && rafId !== null && !isPaused && !wakeLock){
      await requestWakeLock();
    }
  });

  // ----------------------------- Ring color interpolation -----------------------------
  function hexToRgb(hex){ const n = parseInt(hex.slice(1),16); return {r:(n>>16)&255, g:(n>>8)&255, b:n&255}; }
  const COL_START = getComputedStyle(document.documentElement).getPropertyValue('--accent-start').trim() || '#4de0a6';
  const COL_MID   = getComputedStyle(document.documentElement).getPropertyValue('--accent-mid').trim() || '#ffd166';
  const COL_END   = getComputedStyle(document.documentElement).getPropertyValue('--accent-end').trim() || '#ff6b6b';
  const S = hexToRgb(COL_START), M = hexToRgb(COL_MID), E = hexToRgb(COL_END);
  function lerp(a,b,t){ return a + (b-a)*t; }
  function interpolateColor(pct){
    const t = 1 - Math.max(0, Math.min(1, pct));
    const mid = t<0.5 ? t*2 : (t-0.5)*2;
    const from = t<0.5 ? S : M;
    const to = t<0.5 ? M : E;
    const r = Math.round(lerp(from.r, to.r, mid));
    const g = Math.round(lerp(from.g, to.g, mid));
    const b = Math.round(lerp(from.b, to.b, mid));
    return `rgb(${r},${g},${b})`;
  }

  // ----------------------------- Timer engine -----------------------------
  function setRingProgress(pct){
    const offset = C * (1 - pct);
    ring.style.strokeDashoffset = `${offset}px`;
    ring.style.stroke = interpolateColor(pct);
  }

  function runCountdown(total, resumeFromPause=false){
    if (total <= 0) return;

    const now = performance.now();
    if (resumeFromPause){
      const elapsedBeforePause = totalDurationOnRun - pausedRemaining;
      startTs = now - elapsedBeforePause*1000;
    } else {
      startTs = now;
      totalDurationOnRun = total;
    }

    isPaused = false;
    startBtn.setAttribute('aria-pressed','true');
    clockWrap.setAttribute('aria-label', 'Pausa timer');
    clockWrap.classList.remove('paused');
    timeLabel.classList.remove('paused');
    startBtn.hidden = true;
    stopBtn.hidden = false;

    requestWakeLock();

    function frame(ts){
      const elapsed = (ts - startTs)/1000;
      const rem = Math.max(0, totalDurationOnRun - elapsed);
      remaining = rem;

      const pct = totalDurationOnRun>0 ? rem/totalDurationOnRun : 0;
      const mm = Math.floor(rem/60);
      const ss = Math.floor(rem%60);
      updateLabel(mm, ss);
      setRingProgress(pct);

      if (rem <= 0.05){
        cancelAnimationFrame(rafId); rafId = null;
        finishTimer();
        return;
      }
      rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);
  }

  function startTimer(){
    duration = selectedMin*60 + selectedSec;
    if (duration <= 0){
      clockWrap.animate([{transform:'translateX(0)'},{transform:'translateX(-8px)'},{transform:'translateX(8px)'},{transform:'translateX(0)'}], {duration:340, easing:'ease-out'});
      return;
    }
    ring.style.strokeWidth = '18';
    playStartSound();
    runCountdown(duration, false);
  }

  function pauseTimer(){
    if (!rafId) return;
    isPaused = true;
    pausedAt = performance.now();
    pausedRemaining = Math.max(0, remaining);
    cancelAnimationFrame(rafId); rafId = null;

    timeLabel.classList.add('paused');
    clockWrap.classList.add('paused');
    startBtn.textContent = 'Riprendi';
    startBtn.hidden = false;
    stopBtn.hidden = false;

    releaseWakeLock();

    clockWrap.animate([{transform:'scale(1)'},{transform:'scale(.985)'},{transform:'scale(1)'}], {duration:220, easing:'ease-out'});
  }

  function resumeTimer(){
    if (!isPaused) return;
    if (pausedRemaining <= 0){ isPaused=false; pausedRemaining=0; return; }
    startBtn.textContent = 'Avvia';
    runCountdown(pausedRemaining, true);
  }

  async function finishTimer(){
    if (gym.active && gym.index < gym.phases.length - 1){
      await playStartSound();
      nextGymPhase();
      return;
    }

    await playFinishSound();

    startBtn.hidden = false;
    stopBtn.hidden = true;
    startBtn.setAttribute('aria-pressed','false');
    startBtn.textContent = 'Avvia';
    clockWrap.setAttribute('aria-label', 'Apri selettore tempo');
    clockWrap.classList.remove('paused');
    timeLabel.classList.remove('paused');
    ring.style.strokeWidth = '12';
    ring.style.strokeDashoffset = `0px`;

    if (gym.active){
      gym.active = false;
      phaseLabel.hidden = true;
      standardArea.hidden = true;
      gymArea.hidden = false;
      pageTitle.textContent = 'Allenamento';
      updateGymUI();
    } else {
      updateLabel(selectedMin, selectedSec);
    }

    releaseWakeLock();
  }

  function stopTimer(){
    if (rafId){ cancelAnimationFrame(rafId); rafId = null; }
    isPaused = false;
    pausedRemaining = 0;
    startBtn.hidden = false;
    stopBtn.hidden = true;
    startBtn.setAttribute('aria-pressed','false');
    startBtn.textContent = 'Avvia';
    clockWrap.setAttribute('aria-label', 'Apri selettore tempo');
    clockWrap.classList.remove('paused');
    timeLabel.classList.remove('paused');
    ring.style.strokeWidth = '12';
    ring.style.strokeDashoffset = `0px`;
    releaseWakeLock();

    if (gym.active){
      gym.active = false;
      phaseLabel.hidden = true;
      standardArea.hidden = true;
      gymArea.hidden = false;
      pageTitle.textContent = 'Allenamento';
      updateGymUI();
    } else {
      updateLabel(selectedMin, selectedSec);
    }
  }

  // ----------------------------- Gym sequence -----------------------------
  function buildPhases(){
    const list = [];
    if (gym.prepSec > 0){
      list.push({type:'prep', dur:gym.prepSec});
    }
    for (let r=1; r<=gym.rounds; r++){
      list.push({type:'work', dur:gym.workSec, round:r});
      if (gym.restSec > 0){ list.push({type:'rest', dur:gym.restSec, round:r}); }
    }
    return list;
  }
  function phaseLabelText(phase){
    const base = phase.type === 'prep' ? 'Preparazione' : (phase.type === 'work' ? 'Work' : 'Rest');
    const roundTxt = phase.type === 'prep' ? '' : ` • Round ${phase.round}/${gym.rounds}`;
    return base + roundTxt;
  }
  function nextGymPhase(){
    gym.index++;
    const ph = gym.phases[gym.index];
    if (!ph){ finishTimer(); return; }

    phaseLabel.hidden = false;
    setPhaseInfo(phaseLabelText(ph));
    ring.style.strokeWidth = '18';

    updateLabel(Math.floor(ph.dur/60), ph.dur%60);
    runCountdown(ph.dur, false);
  }

  function animateGridCollapse(callback){
    // Ensure we can measure target center
    standardArea.hidden = false;
    const prevVis = standardArea.style.visibility;
    standardArea.style.visibility = 'hidden';
    standardArea.style.pointerEvents = 'none';

    const targetRect = clockWrap.getBoundingClientRect();
    const tx = targetRect.left + targetRect.width/2;
    const ty = targetRect.top + targetRect.height/2;

    // restore visibility for now
    standardArea.style.visibility = prevVis || '';
    standardArea.hidden = true;
    standardArea.style.pointerEvents = '';

    const circles = [prepCircle, workCircle, restCircle, roundsCircle];
    circles.forEach((el) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width/2;
      const cy = r.top + r.height/2;
      el.style.setProperty('--dx', `${tx - cx}px`);
      el.style.setProperty('--dy', `${ty - cy}px`);
      el.classList.add('collapse-anim');
    });

    // After animation end
    setTimeout(() => {
      circles.forEach(el => el.classList.remove('collapse-anim'));
      callback?.();
    }, 460);
  }

  function startGym(){
    if (gym.workSec <= 0){
      gymArea.animate([{transform:'translateX(0)'},{transform:'translateX(-6px)'},{transform:'translateX(6px)'},{transform:'translateX(0)'}], {duration:260, easing:'ease-out'});
      return;
    }
    if (gym.rounds <= 0){ gym.rounds = 1; updateGymUI(); }

    gym.phases = buildPhases();
    gym.index = -1;
    gym.active = true;

    // Collassa 4 cerchi verso il centro, poi mostra cerchio grande e parte
    gymStartBtn.disabled = true;
    animateGridCollapse(() => {
      gymArea.hidden = true;
      standardArea.hidden = false;
      pageTitle.textContent = 'Interval Timer';
      gymStartBtn.disabled = false;

      playStartSound();
      nextGymPhase();
    });
  }

  // ----------------------------- Events -----------------------------
  modeTimerBtn.addEventListener('click', () => {
    modeTimerBtn.classList.add('selected'); modeTimerBtn.setAttribute('aria-selected','true');
    modeGymBtn.classList.remove('selected'); modeGymBtn.setAttribute('aria-selected','false');
    pageTitle.textContent = 'Timer';
    gymArea.hidden = true;
    standardArea.hidden = false;
    phaseLabel.hidden = true;
  });
  modeGymBtn.addEventListener('click', () => {
    modeGymBtn.classList.add('selected'); modeGymBtn.setAttribute('aria-selected','true');
    modeTimerBtn.classList.remove('selected'); modeTimerBtn.setAttribute('aria-selected','false');
    pageTitle.textContent = 'Allenamento';
    standardArea.hidden = true;
    gymArea.hidden = false;
    phaseLabel.hidden = true;
  });

  startBtn.addEventListener('click', () => {
    if (rafId) return;
    if (isPaused) resumeTimer(); else startTimer();
  });
  stopBtn.addEventListener('click', stopTimer);

  clockWrap.addEventListener('click', () => {
    if (rafId) { pauseTimer(); }
    else if (isPaused) { resumeTimer(); }
    else { openPickerFor('standard-time'); }
  });
  clockWrap.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' '){
      e.preventDefault();
      if (rafId) pauseTimer();
      else if (isPaused) resumeTimer();
      else openPickerFor('standard-time');
    }
  });

  function attachOpen(el, ctx){
    el.addEventListener('click', () => { openPickerFor(ctx); });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openPickerFor(ctx); }
    });
  }
  attachOpen(prepCircle, 'prep');
  attachOpen(workCircle, 'work');
  attachOpen(restCircle, 'rest');
  attachOpen(roundsCircle, 'rounds');
  gymStartBtn.addEventListener('click', startGym);

  overlay.addEventListener('click', (e) => { if (e.target === overlay) closePicker(); });
  document.addEventListener('keydown', (e) => {
    if (isPickerOpen && e.key === 'Escape'){ closePicker(); }
  });

  window.addEventListener('beforeunload', () => {
    releaseWakeLock();
    cleanupListeners(minutesWheel);
    cleanupListeners(secondsWheel);
    try{ audioCtx?.close?.(); }catch{}
  });
})();

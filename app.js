// app.js - Wheel stabilizzate con evidenziazione in tempo reale
(() => {
  // ----------------------------- DOM -----------------------------
  const app = document.getElementById('app');
  const pageTitle = document.getElementById('pageTitle');

  // Mode switch
  const modeTimerBtn = document.getElementById('modeTimer');
  const modeGymBtn = document.getElementById('modeGym');

  // Standard timer area
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
  const ITEM_HEIGHT = 128; // Sync with CSS

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
  let pickerContext = 'standard-time';
  let pickerMode = 'time';

  // Wheel tracking
  const wheelTracking = {
    minutes: { rafId: null, currentValue: 0 },
    seconds: { rafId: null, currentValue: 0 }
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

  // ----------------------------- Wheel (picker) STABILIZZATO -----------------------------
  function cleanupWheel(container){
    const tracking = container === minutesWheel ? wheelTracking.minutes : wheelTracking.seconds;
    if (tracking.rafId){
      cancelAnimationFrame(tracking.rafId);
      tracking.rafId = null;
    }
    container.innerHTML = '';
  }

  function buildWheel(container, max){
    cleanupWheel(container);
    
    const ul = document.createElement('ul');
    ul.className = 'list';

    // Calcola spacer per centrare
    const containerH = container.clientHeight || (window.innerHeight - 220);
    const spacerH = Math.max(0, Math.floor((containerH - ITEM_HEIGHT) / 2));

    // Top spacer
    const topSpacer = document.createElement('li');
    topSpacer.className = 'spacer';
    topSpacer.style.height = `${spacerH}px`;
    ul.appendChild(topSpacer);

    // Items 0..max
    for (let i = 0; i <= max; i++){
      const li = document.createElement('li');
      li.className = 'wheel-item';
      li.textContent = pad(i);
      li.dataset.value = i;
      ul.appendChild(li);
    }

    // Bottom spacer
    const bottomSpacer = document.createElement('li');
    bottomSpacer.className = 'spacer';
    bottomSpacer.style.height = `${spacerH}px`;
    ul.appendChild(bottomSpacer);

    container.appendChild(ul);
    return ul;
  }

  function updateWheelHighlight(container){
    const tracking = container === minutesWheel ? wheelTracking.minutes : wheelTracking.seconds;
    const items = container.querySelectorAll('.wheel-item');
    const scrollTop = container.scrollTop;
    const containerH = container.clientHeight;
    const centerY = scrollTop + (containerH / 2);

    let closestItem = null;
    let closestDist = Infinity;
    let closestValue = 0;

    items.forEach(item => {
      const rect = item.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const itemCenterY = rect.top - containerRect.top + (rect.height / 2) + scrollTop;
      const dist = Math.abs(itemCenterY - centerY);

      // Rimuovi classi precedenti
      item.classList.remove('in-center', 'near-center');

      // Trova l'elemento più vicino al centro
      if (dist < closestDist){
        closestDist = dist;
        closestItem = item;
        closestValue = parseInt(item.dataset.value) || 0;
      }

      // Applica classi in base alla distanza
      if (dist < ITEM_HEIGHT * 0.5){
        item.classList.add('in-center');
      } else if (dist < ITEM_HEIGHT * 1.5){
        item.classList.add('near-center');
      }
    });

    tracking.currentValue = closestValue;
    return closestValue;
  }

  function trackWheel(container){
    const tracking = container === minutesWheel ? wheelTracking.minutes : wheelTracking.seconds;
    
    function update(){
      updateWheelHighlight(container);
      tracking.rafId = requestAnimationFrame(update);
    }
    
    tracking.rafId = requestAnimationFrame(update);
  }

  function scrollToValue(container, value, smooth = false){
    const itemH = ITEM_HEIGHT;
    const targetScroll = value * itemH;
    
    if (smooth){
      container.style.scrollBehavior = 'smooth';
      container.scrollTop = targetScroll;
      setTimeout(() => {
        container.style.scrollBehavior = 'auto';
      }, 300);
    } else {
      container.scrollTop = targetScroll;
    }
  }

  function setupWheel(container, list, max, initialValue){
    const tracking = container === minutesWheel ? wheelTracking.minutes : wheelTracking.seconds;
    let scrollTimeout = null;
    let isUserScrolling = false;

    // Posiziona inizialmente
    scrollToValue(container, initialValue, false);
    tracking.currentValue = initialValue;

    // Avvia tracking visuale
    trackWheel(container);

    // Gestione scroll con snap migliorato
    container.addEventListener('scroll', () => {
      isUserScrolling = true;
      
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        if (!isUserScrolling) return;
        
        // Calcola valore più vicino
        const scrollTop = container.scrollTop;
        const value = Math.round(scrollTop / ITEM_HEIGHT);
        const clampedValue = Math.min(max, Math.max(0, value));
        
        // Snap al valore più vicino
        scrollToValue(container, clampedValue, true);
        tracking.currentValue = clampedValue;
        isUserScrolling = false;
      }, 80); // Ridotto per snap più rapido
    });

    // Keyboard navigation
    container.addEventListener('keydown', (e) => {
      let newValue = tracking.currentValue;
      
      if (e.key === 'ArrowUp'){
        e.preventDefault();
        newValue = Math.max(0, newValue - 1);
      } else if (e.key === 'ArrowDown'){
        e.preventDefault();
        newValue = Math.min(max, newValue + 1);
      } else {
        return;
      }
      
      scrollToValue(container, newValue, true);
      tracking.currentValue = newValue;
    });

    // Touch handling per momentum control
    let touchStartY = 0;
    let touchStartTime = 0;
    
    container.addEventListener('touchstart', (e) => {
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
      isUserScrolling = true;
    }, { passive: true });

    container.addEventListener('touchend', (e) => {
      const touchEndY = e.changedTouches[0].clientY;
      const touchEndTime = Date.now();
      const deltaY = touchEndY - touchStartY;
      const deltaTime = touchEndTime - touchStartTime;
      
      // Se swipe veloce, lascia momentum naturale
      if (Math.abs(deltaY) > 50 && deltaTime < 200){
        // Lascia che il momentum naturale faccia il suo corso
        setTimeout(() => {
          isUserScrolling = false;
        }, 500);
      } else {
        isUserScrolling = false;
      }
    }, { passive: true });
  }

  // Focus trap per modal
  let trapKeyHandler = null;
  let lastFocused = null;

  function trapFocus(modalRoot){
    lastFocused = document.activeElement;
    const focusable = modalRoot.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    
    trapKeyHandler = (e) => {
      if (e.key === 'Tab'){
        if (e.shiftKey && document.activeElement === first){
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last){
          e.preventDefault();
          first?.focus();
        }
      }
      if (e.key === 'Escape'){
        closePicker();
      }
    };
    
    modalRoot.addEventListener('keydown', trapKeyHandler);
    setTimeout(() => first?.focus(), 50);
  }

  function releaseFocusTrap(){
    if (trapKeyHandler){
      overlay.removeEventListener('keydown', trapKeyHandler);
      trapKeyHandler = null;
    }
    try { lastFocused?.focus(); } catch {}
  }

  function openPickerFor(ctx){
    pickerContext = ctx;

    // Cleanup precedente
    cleanupWheel(minutesWheel);
    cleanupWheel(secondsWheel);

    if (ctx === 'rounds'){
      pickerMode = 'integer';
      pickerTitle.textContent = 'Imposta giri';
      minutesLabel.textContent = 'Giri';
      
      // Nascondi colonna secondi e centra minuti
      secondsCol.hidden = true;
      wheels.classList.add('one-col');

      // Build wheel 1..99 per rounds
      const list = buildWheel(minutesWheel, 99);
      const current = Math.min(99, Math.max(1, gym.rounds));
      setupWheel(minutesWheel, list, 99, current);
      
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

      // Determina valori iniziali
      let initMin = 0, initSec = 0;
      if (ctx === 'standard-time'){
        initMin = selectedMin;
        initSec = selectedSec;
      } else if (ctx === 'prep'){
        initMin = Math.floor(gym.prepSec / 60);
        initSec = gym.prepSec % 60;
      } else if (ctx === 'work'){
        initMin = Math.floor(gym.workSec / 60);
        initSec = gym.workSec % 60;
      } else if (ctx === 'rest'){
        initMin = Math.floor(gym.restSec / 60);
        initSec = gym.restSec % 60;
      }

      // Build e setup wheels
      const minList = buildWheel(minutesWheel, MAX_MIN);
      const secList = buildWheel(secondsWheel, MAX_SEC);
      
      setupWheel(minutesWheel, minList, MAX_MIN, initMin);
      setupWheel(secondsWheel, secList, MAX_SEC, initSec);
    }

    isPickerOpen = true;
    overlay.hidden = false;
    trapFocus(overlay);
  }

  function closePicker(){
    if (!isPickerOpen) return;
    
    // Cleanup tracking
    if (wheelTracking.minutes.rafId){
      cancelAnimationFrame(wheelTracking.minutes.rafId);
      wheelTracking.minutes.rafId = null;
    }
    if (wheelTracking.seconds.rafId){
      cancelAnimationFrame(wheelTracking.seconds.rafId);
      wheelTracking.seconds.rafId = null;
    }
    
    isPickerOpen = false;
    overlay.hidden = true;
    wheels.classList.remove('one-col');
    releaseFocusTrap();
  }

  cancelPicker.addEventListener('click', closePicker);

  confirmPicker.addEventListener('click', () => {
    if (pickerMode === 'integer' && pickerContext === 'rounds'){
      const v = Math.max(1, Math.min(99, wheelTracking.minutes.currentValue));
      gym.rounds = v;
      updateGymUI();
      closePicker();
      return;
    }

    const m = wheelTracking.minutes.currentValue;
    const s = wheelTracking.seconds.currentValue;
    const secs = m * 60 + s;

    if (pickerContext === 'standard-time'){
      if (secs <= 0){
        timeLabel.animate([
          { transform: 'translateY(0)' },
          { transform: 'translateY(-8px)' },
          { transform: 'translateY(0)' }
        ], { duration: 320, easing: 'cubic-bezier(.2,.9,.2,1)' });
        return;
      }
      selectedMin = m;
      selectedSec = s;
      duration = secs;
      updateLabel(selectedMin, selectedSec);
    } else if (pickerContext === 'prep'){
      gym.prepSec = secs;
      updateGymUI();
    } else if (pickerContext === 'work'){
      gym.workSec = secs;
      updateGymUI();
    } else if (pickerContext === 'rest'){
      gym.restSec = secs;
      updateGymUI();
    }
    
    closePicker();
  });

  // ----------------------------- Audio -----------------------------
  async function initAudioContext(){
    if (!audioCtx){
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        audioCtx = null;
      }
    }
    return audioCtx;
  }

  async function playStartSound(){
    const ctx = await initAudioContext();
    if (!ctx) return;
    
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, ctx.currentTime);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.01);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.38);
    o.stop(ctx.currentTime + 0.42);
  }

  async function playFinishSound(){
    const ctx = await initAudioContext();
    if (!ctx) return;
    
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(330, ctx.currentTime);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.01);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.28);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    o.stop(ctx.currentTime + 0.62);
  }

  // ----------------------------- WakeLock -----------------------------
  async function requestWakeLock(){
    try {
      if ('wakeLock' in navigator && navigator.wakeLock.request){
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
          wakeLock = null;
        });
      }
    } catch {
      wakeLock = null;
    }
  }

  function releaseWakeLock(){
    try {
      wakeLock?.release?.();
    } catch {} finally {
      wakeLock = null;
    }
  }

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && rafId !== null && !isPaused && !wakeLock){
      await requestWakeLock();
    }
  });

  // ----------------------------- Ring color interpolation -----------------------------
  function hexToRgb(hex){
    const n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  const COL_START = getComputedStyle(document.documentElement).getPropertyValue('--accent-start').trim() || '#4de0a6';
  const COL_MID = getComputedStyle(document.documentElement).getPropertyValue('--accent-mid').trim() || '#ffd166';
  const COL_END = getComputedStyle(document.documentElement).getPropertyValue('--accent-end').trim() || '#ff6b6b';
  const S = hexToRgb(COL_START), M = hexToRgb(COL_MID), E = hexToRgb(COL_END);

  function lerp(a, b, t){
    return a + (b - a) * t;
  }

  function interpolateColor(pct){
    const t = 1 - Math.max(0, Math.min(1, pct));
    const mid = t < 0.5 ? t * 2 : (t - 0.5) * 2;
    const from = t < 0.5 ? S : M;
    const to = t < 0.5 ? M : E;
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

  function runCountdown(total, resumeFromPause = false){
    if (total <= 0) return;

    const now = performance.now();
    if (resumeFromPause){
      const elapsedBeforePause = totalDurationOnRun - pausedRemaining;
      startTs = now - elapsedBeforePause * 1000;
    } else {
      startTs = now;
      totalDurationOnRun = total;
    }

    isPaused = false;
    startBtn.setAttribute('aria-pressed', 'true');
    clockWrap.setAttribute('aria-label', 'Pausa timer');
    clockWrap.classList.remove('paused');
    timeLabel.classList.remove('paused');
    startBtn.hidden = true;
    stopBtn.hidden = false;

    requestWakeLock();

    function frame(ts){
      const elapsed = (ts - startTs) / 1000;
      const rem = Math.max(0, totalDurationOnRun - elapsed);
      remaining = rem;

      const pct = totalDurationOnRun > 0 ? rem / totalDurationOnRun : 0;
      const mm = Math.floor(rem / 60);
      const ss = Math.floor(rem % 60);
      updateLabel(mm, ss);
      setRingProgress(pct);

      if (rem <= 0.05){
        cancelAnimationFrame(rafId);
        rafId = null;
        finishTimer();
        return;
      }
      rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);
  }

  function startTimer(){
    duration = selectedMin * 60 + selectedSec;
    if (duration <= 0){
      clockWrap.animate([
        { transform: 'translateX(0)' },
        { transform: 'translateX(-8px)' },
        { transform: 'translateX(8px)' },
        { transform: 'translateX(0)' }
      ], { duration: 340, easing: 'ease-out' });
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
    cancelAnimationFrame(rafId);
    rafId = null;

    timeLabel.classList.add('paused');
    clockWrap.classList.add('paused');
    startBtn.textContent = 'Riprendi';
    startBtn.hidden = false;
    stopBtn.hidden = false;

    releaseWakeLock();

    clockWrap.animate([
      { transform: 'scale(1)' },
      { transform: 'scale(.985)' },
      { transform: 'scale(1)' }
    ], { duration: 220, easing: 'ease-out' });
  }

  function resumeTimer(){
    if (!isPaused) return;
    if (pausedRemaining <= 0){
      isPaused = false;
      pausedRemaining = 0;
      return;
    }
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
    startBtn.setAttribute('aria-pressed', 'false');
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
    if (rafId){
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    isPaused = false;
    pausedRemaining = 0;
    startBtn.hidden = false;
    stopBtn.hidden = true;
    startBtn.setAttribute('aria-pressed', 'false');
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
      list.push({ type: 'prep', dur: gym.prepSec });
    }
    for (let r = 1; r <= gym.rounds; r++){
      list.push({ type: 'work', dur: gym.workSec, round: r });
      if (gym.restSec > 0){
        list.push({ type: 'rest', dur: gym.restSec, round: r });
      }
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
    if (!ph){
      finishTimer();
      return;
    }

    phaseLabel.hidden = false;
    setPhaseInfo(phaseLabelText(ph));
    ring.style.strokeWidth = '18';

    updateLabel(Math.floor(ph.dur / 60), ph.dur % 60);
    runCountdown(ph.dur, false);
  }

  function animateGridCollapse(callback){
    // Ensure we can measure target center
    standardArea.hidden = false;
    const prevVis = standardArea.style.visibility;
    standardArea.style.visibility = 'hidden';
    standardArea.style.pointerEvents = 'none';

    const targetRect = clockWrap.getBoundingClientRect();
    const tx = targetRect.left + targetRect.width / 2;
    const ty = targetRect.top + targetRect.height / 2;

    // Restore visibility
    standardArea.style.visibility = prevVis || '';
    standardArea.hidden = true;
    standardArea.style.pointerEvents = '';

    const circles = [prepCircle, workCircle, restCircle, roundsCircle];
    circles.forEach((el) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      el.style.setProperty('--dx', `${tx - cx}px`);
      el.style.setProperty('--dy', `${ty - cy}px`);
      el.style.setProperty('--rot', `${Math.random() * 20 - 10}deg`);
      el.classList.add('collapse-anim');
    });

    setTimeout(() => {
      circles.forEach(el => el.classList.remove('collapse-anim'));
      callback?.();
    }, 460);
  }

  function startGym(){
    if (gym.workSec <= 0){
      gymArea.animate([
        { transform: 'translateX(0)' },
        { transform: 'translateX(-6px)' },
        { transform: 'translateX(6px)' },
        { transform: 'translateX(0)' }
      ], { duration: 260, easing: 'ease-out' });
      return;
    }
    if (gym.rounds <= 0){
      gym.rounds = 1;
      updateGymUI();
    }

    gym.phases = buildPhases();
    gym.index = -1;
    gym.active = true;

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
    modeTimerBtn.classList.add('selected');
    modeTimerBtn.setAttribute('aria-selected', 'true');
    modeGymBtn.classList.remove('selected');
    modeGymBtn.setAttribute('aria-selected', 'false');
    pageTitle.textContent = 'Timer';
    gymArea.hidden = true;
    standardArea.hidden = false;
    phaseLabel.hidden = true;
  });

  modeGymBtn.addEventListener('click', () => {
    modeGymBtn.classList.add('selected');
    modeGymBtn.setAttribute('aria-selected', 'true');
    modeTimerBtn.classList.remove('selected');
    modeTimerBtn.setAttribute('aria-selected', 'false');
    pageTitle.textContent = 'Allenamento';
    standardArea.hidden = true;
    gymArea.hidden = false;
    phaseLabel.hidden = true;
  });

  startBtn.addEventListener('click', () => {
    if (rafId) return;
    if (isPaused) resumeTimer();
    else startTimer();
  });

  stopBtn.addEventListener('click', stopTimer);

  clockWrap.addEventListener('click', () => {
    if (rafId){
      pauseTimer();
    } else if (isPaused){
      resumeTimer();
    } else {
      openPickerFor('standard-time');
    }
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
    el.addEventListener('click', () => openPickerFor(ctx));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' '){
        e.preventDefault();
        openPickerFor(ctx);
      }
    });
  }

  attachOpen(prepCircle, 'prep');
  attachOpen(workCircle, 'work');
  attachOpen(restCircle, 'rest');
  attachOpen(roundsCircle, 'rounds');

  gymStartBtn.addEventListener('click', startGym);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePicker();
  });

  document.addEventListener('keydown', (e) => {
    if (isPickerOpen && e.key === 'Escape'){
      closePicker();
    }
  });

  window.addEventListener('beforeunload', () => {
    releaseWakeLock();
    if (wheelTracking.minutes.rafId){
      cancelAnimationFrame(wheelTracking.minutes.rafId);
    }
    if (wheelTracking.seconds.rafId){
      cancelAnimationFrame(wheelTracking.seconds.rafId);
    }
    try {
      audioCtx?.close?.();
    } catch {}
  });
})();

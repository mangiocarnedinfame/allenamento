// app.js - FIXED: Wheel stability and smooth picker experience
(() => {
  // DOM elements
  const clockWrap = document.getElementById('clockWrap');
  const timeLabel = document.getElementById('timeLabel');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');

  const overlay = document.getElementById('pickerOverlay');
  const minutesWheel = document.getElementById('minutesWheel');
  const secondsWheel = document.getElementById('secondsWheel');
  const confirmPicker = document.getElementById('confirmPicker');
  const cancelPicker = document.getElementById('cancelPicker');

  const ring = document.querySelector('.ring');

  // config
  const MAX_MIN = 59;
  const MAX_SEC = 59;

  // state
  let selectedMin = 0, selectedSec = 30;
  let duration = selectedMin * 60 + selectedSec;
  let rafId = null;
  let startTs = null;
  let remaining = 0;
  let wakeLock = null;
  let audioCtx = null;

  // pause/resume specific - FIX RING CONTINUITY
  let isPaused = false;
  let pausedRemaining = 0;
  let totalDurationOnRun = 0;
  let pausedAt = 0;
  let totalPausedTime = 0;

  // performance optimization
  let isPickerOpen = false;
  let resizeTimeout = null;

  // IMPROVED wheel stability system
  let wheelState = {
    minutes: { locked: false, initialized: false, scrollTimeout: null },
    seconds: { locked: false, initialized: false, scrollTimeout: null }
  };

  // SVG radius math
  const R = 88;
  const C = 2 * Math.PI * R;
  if (ring) {
    ring.style.strokeDasharray = `${C}px`;
    ring.style.strokeDashoffset = `0px`;
  }

  // helpers
  function pad(n){ return String(n).padStart(2,'0') }
  
  function updateLabel(min, sec){
    timeLabel.textContent = `${pad(min)}:${pad(sec)}`;
    timeLabel.setAttribute('aria-label', `${min} minuti e ${sec} secondi`);
  }
  
  updateLabel(selectedMin, selectedSec);

  // cleanup function per event listeners
  function cleanupEventListeners(container) {
    if (container._scrollHandler) {
      container.removeEventListener('scroll', container._scrollHandler);
      container._scrollHandler = null;
    }
    if (container._keyHandler) {
      container.removeEventListener('keydown', container._keyHandler);
      container._keyHandler = null;
    }
  }

  // FIXED: Stable wheel building with better position control
  function buildWheel(container, max) {
    // Clear previous content
    const prev = container.querySelector('.list');
    if (prev) prev.remove();

    const wheelType = container === minutesWheel ? 'minutes' : 'seconds';
    const state = wheelState[wheelType];
    
    // Lock this wheel during rebuild
    state.locked = true;
    state.initialized = false;

    const ul = document.createElement('ul');
    ul.className = 'list';
    ul.setAttribute('role', 'listbox');
    ul.setAttribute('aria-label', `Seleziona valore da 0 a ${max}`);
    
    for(let i = 0; i <= max; i++){
      const li = document.createElement('li');
      li.className = 'wheel-item no-transition'; // Start without transitions
      li.dataset.value = String(i);
      li.textContent = pad(i);
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      ul.appendChild(li);
    }
    container.appendChild(ul);

    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        const firstItem = ul.querySelector('.wheel-item');
        if (!firstItem) {
          state.locked = false;
          resolve(ul);
          return;
        }
        
        const itemRect = firstItem.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const itemH = Math.round(itemRect.height) || 128;
        const containerH = Math.round(containerRect.height) || (window.innerHeight - 220);
        const spacerH = Math.max(0, Math.round((containerH - itemH) / 2));
        
        // Add spacers
        const topSpacer = document.createElement('li');
        topSpacer.className = 'spacer';
        topSpacer.style.height = `${spacerH}px`;
        topSpacer.setAttribute('aria-hidden', 'true');
        
        const bottomSpacer = topSpacer.cloneNode(true);
        ul.insertBefore(topSpacer, ul.firstChild);
        ul.appendChild(bottomSpacer);

        // CRITICAL: Set initial position without scroll events
        const initialValue = wheelType === 'minutes' ? selectedMin : selectedSec;
        const targetItem = ul.querySelector(`.wheel-item[data-value="${initialValue}"]`);
        
        if (targetItem) {
          const targetTop = targetItem.offsetTop - spacerH;
          // Direct scroll without events
          container.scrollTop = targetTop;
        }

        // Apply initial selection styling
        markSelected(ul, initialValue);

        // Enable transitions after positioning
        requestAnimationFrame(() => {
          const items = ul.querySelectorAll('.wheel-item');
          items.forEach(item => {
            item.classList.remove('no-transition');
          });
          
          state.initialized = true;
          
          // Unlock after a short delay to prevent immediate scroll conflicts
          setTimeout(() => {
            state.locked = false;
            resolve(ul);
          }, 150);
        });
      });
    });
  }

  // IMPROVED: More stable selection marking
  function markSelected(list, value) {
    if (!list) return;
    
    const items = Array.from(list.querySelectorAll('.wheel-item'));
    if (items.length === 0) return;
    
    const container = list.parentElement;
    const containerRect = container.getBoundingClientRect();
    const centerY = containerRect.top + containerRect.height / 2;
    
    items.forEach(li => {
      const num = Number(li.dataset.value);
      const isSelected = num === value;
      
      li.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      
      if (isSelected) {
        li.classList.add('selected');
      } else {
        li.classList.remove('selected');
      }

      // Apply 3D transforms based on distance from center
      const rect = li.getBoundingClientRect();
      const dist = (rect.top + rect.height / 2) - centerY;
      const maxDist = 160;
      const norm = Math.max(-1, Math.min(1, -dist / maxDist));
      
      const rotate = norm * 16;
      const translateZ = Math.abs(norm) * -32;
      const scale = 1 + (1 - Math.abs(norm)) * 0.06;
      const opacity = 0.55 + (1 - Math.abs(norm)) * 0.45;
      
      li.style.transform = `rotateX(${rotate}deg) translateZ(${translateZ}px) scale(${scale})`;
      li.style.opacity = opacity;
    });
  }

  // IMPROVED: Smoother scroll to value with conflict prevention
  function scrollToValue(container, value, smooth = true) {
    const wheelType = container === minutesWheel ? 'minutes' : 'seconds';
    const state = wheelState[wheelType];
    
    // Prevent scroll during lock or if not initialized
    if (state.locked || !state.initialized) return;
    
    const list = container.querySelector('.list');
    if (!list) return;
    
    const item = list.querySelector(`.wheel-item[data-value="${value}"]`);
    if (!item) return;
    
    const itemRect = item.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const itemH = itemRect.height;
    const containerH = containerRect.height;
    const spacerH = Math.round((containerH - itemH) / 2);
    const targetTop = item.offsetTop - spacerH;
    
    // Temporarily lock to prevent scroll event conflicts
    state.locked = true;
    
    try {
      if (smooth && container.scrollTo) {
        container.scrollTo({ 
          top: targetTop, 
          behavior: 'smooth'
        });
      } else {
        container.scrollTop = targetTop;
      }
    } catch(e) { 
      container.scrollTop = targetTop; 
    }
    
    // Unlock after scroll completes
    setTimeout(() => {
      state.locked = false;
    }, smooth ? 400 : 50);
  }

  // IMPROVED: Wheel behavior with better debouncing
  function setupWheelBehavior(container, list, max, onSelect) {
    cleanupEventListeners(container);

    const wheelType = container === minutesWheel ? 'minutes' : 'seconds';
    const state = wheelState[wheelType];
    let lastScrollTop = container.scrollTop;
    let scrollVelocity = 0;
    let lastScrollTime = 0;

    const scrollHandler = () => {
      // Skip if locked or not properly initialized
      if (state.locked || !state.initialized) return;
      
      const now = performance.now();
      const currentScrollTop = container.scrollTop;
      const scrollDelta = Math.abs(currentScrollTop - lastScrollTop);
      
      // Skip micro-scrolls that cause instability
      if (scrollDelta < 2) return;
      
      scrollVelocity = scrollDelta / Math.max(1, now - lastScrollTime);
      lastScrollTop = currentScrollTop;
      lastScrollTime = now;
      
      const items = Array.from(list.querySelectorAll('.wheel-item'));
      if (!items.length) return;
      
      const containerRect = container.getBoundingClientRect();
      const centerY = containerRect.top + containerRect.height / 2;
      
      let closest = null;
      let minDistance = Infinity;
      
      items.forEach(item => {
        const rect = item.getBoundingClientRect();
        const itemCenterY = rect.top + rect.height / 2;
        const distance = Math.abs(itemCenterY - centerY);
        
        if (distance < minDistance) {
          minDistance = distance;
          closest = item;
        }
      });
      
      if (!closest) return;
      
      const newValue = Number(closest.dataset.value);
      const currentValue = wheelType === 'minutes' ? selectedMin : selectedSec;
      
      // Update visual selection immediately
      markSelected(list, newValue);

      // Clear previous timeout
      if (state.scrollTimeout) {
        clearTimeout(state.scrollTimeout);
      }

      // Debounced value update and snap
      const debounceTime = scrollVelocity > 5 ? 300 : 150;
      
      state.scrollTimeout = setTimeout(() => {
        if (!state.locked && state.initialized && newValue !== currentValue) {
          onSelect(newValue);
          // Gentle snap to center
          scrollToValue(container, newValue, true);
        }
      }, debounceTime);
    };

    const keyHandler = (e) => {
      if (state.locked) return;
      
      const key = e.key;
      const currentValue = wheelType === 'minutes' ? selectedMin : selectedSec;
      
      if (key === 'ArrowUp' || key === 'PageUp') { 
        e.preventDefault(); 
        const newValue = Math.max(0, currentValue - 1); 
        scrollToValue(container, newValue, true); 
      }
      else if (key === 'ArrowDown' || key === 'PageDown') { 
        e.preventDefault(); 
        const newValue = Math.min(max, currentValue + 1); 
        scrollToValue(container, newValue, true); 
      }
      else if (key === 'Home') { 
        e.preventDefault(); 
        scrollToValue(container, 0, true); 
      }
      else if (key === 'End') { 
        e.preventDefault(); 
        scrollToValue(container, max, true); 
      }
    };

    container._scrollHandler = scrollHandler;
    container._keyHandler = keyHandler;
    container.addEventListener('scroll', scrollHandler, { passive: true });
    container.addEventListener('keydown', keyHandler);
  }

  // IMPROVED: Sequential wheel initialization to prevent conflicts
  async function initWheels() {
    // Reset all wheel states
    Object.keys(wheelState).forEach(key => {
      wheelState[key].locked = false;
      wheelState[key].initialized = false;
      if (wheelState[key].scrollTimeout) {
        clearTimeout(wheelState[key].scrollTimeout);
        wheelState[key].scrollTimeout = null;
      }
    });
    
    // Build minutes wheel first
    const minUl = await buildWheel(minutesWheel, MAX_MIN);
    setupWheelBehavior(minutesWheel, minUl, MAX_MIN, v => { selectedMin = v; });
    
    // Small delay before building seconds wheel
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Build seconds wheel
    const secUl = await buildWheel(secondsWheel, MAX_SEC);
    setupWheelBehavior(secondsWheel, secUl, MAX_SEC, v => { selectedSec = v; });
    
    return { minUl, secUl };
  }

  let wheelsPromise = initWheels();

  // ---------------- AudioContext management ----------------
  async function initAudioContext() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch(e) {
        console.warn('AudioContext not supported', e);
        return null;
      }
    }
    
    if (audioCtx.state === 'suspended') {
      try {
        await audioCtx.resume();
      } catch(e) {
        console.warn('Failed to resume AudioContext', e);
      }
    }
    
    return audioCtx;
  }

  // ---------------- RING CONTINUITY FIX ----------------
  function pauseTimer(){
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    
    isPaused = true;
    pausedRemaining = Math.max(0, remaining);
    pausedAt = performance.now();
    
    clockWrap.setAttribute('aria-label', 'Riprendi timer');
    clockWrap.classList.add('paused');
    timeLabel.classList.add('paused');
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

  function runCountdown(total, resumeFromPause = false){
    if (total <= 0) return;
    
    const now = performance.now();
    
    if (resumeFromPause) {
      const pauseDuration = now - pausedAt;
      totalPausedTime += pauseDuration;
      startTs = now - (totalDurationOnRun - total) * 1000;
    } else {
      startTs = now;
      totalDurationOnRun = total;
      totalPausedTime = 0;
    }
    
    startBtn.hidden = true;
    stopBtn.hidden = false;
    startBtn.setAttribute('aria-pressed','true');
    clockWrap.setAttribute('aria-label', 'Pausa timer');
    clockWrap.classList.remove('paused');
    timeLabel.classList.remove('paused');
    isPaused = false;

    requestWakeLock();

    function frame(currentTime){
      const elapsed = (currentTime - startTs) / 1000;
      const rem = Math.max(0, totalDurationOnRun - elapsed);
      remaining = rem;
      
      const pct = totalDurationOnRun > 0 ? rem / totalDurationOnRun : 0;
      const mm = Math.floor(rem / 60);
      const ss = Math.floor(rem % 60);
      
      updateLabel(mm, ss);

      if (ring) {
        const targetOffset = C * (1 - pct);
        ring.style.strokeDashoffset = `${targetOffset}px`;
        ring.style.stroke = interpolateColor(pct);
      }

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

  function resumeTimer(){
    if (!isPaused) return;
    if (pausedRemaining <= 0) { 
      isPaused = false; 
      pausedRemaining = 0; 
      return; 
    }
    
    startBtn.textContent = 'Avvia';
    runCountdown(pausedRemaining, true);
  }

  function startTimer(){
    duration = selectedMin * 60 + selectedSec;
    if (duration <= 0) {
      clockWrap.animate([
        { transform: 'translateX(0)' }, 
        { transform: 'translateX(-8px)' }, 
        { transform: 'translateX(8px)' }, 
        { transform: 'translateX(0)' }
      ], { duration: 340, easing: 'ease-out' });
      return;
    }
    
    if (ring) { 
      ring.style.transition = 'stroke-width .35s ease, stroke .3s linear'; 
      ring.style.strokeWidth = '18'; 
    }
    
    playStartSound();
    runCountdown(duration, false);
  }

  function stopTimer(){
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    
    isPaused = false;
    pausedRemaining = 0;
    totalPausedTime = 0;
    
    startBtn.hidden = false;
    stopBtn.hidden = true;
    startBtn.setAttribute('aria-pressed','false');
    startBtn.textContent = 'Avvia';
    clockWrap.setAttribute('aria-label', 'Apri selettore tempo');
    clockWrap.classList.remove('paused');
    timeLabel.classList.remove('paused');
    
    if (ring) { 
      ring.style.strokeWidth = '12'; 
      ring.style.strokeDashoffset = `0px`; 
    }
    
    updateLabel(selectedMin, selectedSec);
    releaseWakeLock();
  }

  async function finishTimer(){
    await playFinishSound();

    clockWrap.animate([
      { transform: 'scale(1)' }, 
      { transform: 'scale(1.06)' }, 
      { transform: 'scale(1)' }
    ], { duration: 520, easing: 'cubic-bezier(.2,.9,.2,1)' });

    startBtn.hidden = false;
    stopBtn.hidden = true;
    startBtn.setAttribute('aria-pressed','false');
    startBtn.textContent = 'Avvia';
    clockWrap.setAttribute('aria-label', 'Apri selettore tempo');
    clockWrap.classList.remove('paused');
    timeLabel.classList.remove('paused');

    if (ring) { 
      ring.style.strokeDashoffset = `${C}px`; 
      ring.style.strokeWidth = '12'; 
    }
    
    releaseWakeLock();
    updateLabel(selectedMin, selectedSec);
  }

  // Event listeners
  startBtn.addEventListener('click', () => {
    if (rafId) return;
    if (isPaused) {
      resumeTimer();
    } else {
      startTimer();
    }
  });

  stopBtn.addEventListener('click', stopTimer);

  clockWrap.addEventListener('click', (e) => {
    if (rafId) {
      pauseTimer();
    } else if (isPaused) {
      resumeTimer();
    } else {
      openPicker();
    }
  });

  clockWrap.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (rafId) {
        pauseTimer();
      } else if (isPaused) {
        resumeTimer();
      } else {
        openPicker();
      }
    }
  });

  // IMPROVED: Picker opening with proper wheel initialization
  async function openPicker(){
    if (isPickerOpen) return;
    
    isPickerOpen = true;
    overlay.hidden = false;
    
    try {
      await initWheels();
      trapFocus(overlay);
    } catch(e) {
      console.error('Error initializing wheels:', e);
      closePicker();
    }
  }

  function closePicker(){
    if (!isPickerOpen) return;
    
    isPickerOpen = false;
    overlay.hidden = true;
    releaseFocusTrap();
    
    // Clean up wheel states
    Object.keys(wheelState).forEach(key => {
      wheelState[key].locked = false;
      wheelState[key].initialized = false;
      if (wheelState[key].scrollTimeout) {
        clearTimeout(wheelState[key].scrollTimeout);
        wheelState[key].scrollTimeout = null;
      }
    });
    
    cleanupEventListeners(minutesWheel);
    cleanupEventListeners(secondsWheel);
    
    clockWrap.focus();
  }

  cancelPicker.addEventListener('click', closePicker);
  
  confirmPicker.addEventListener('click', () => {
    const newDuration = selectedMin * 60 + selectedSec;
    if (newDuration <= 0){
      timeLabel.animate([
        { transform: 'translateY(0)' }, 
        { transform: 'translateY(-8px)' }, 
        { transform: 'translateY(0)' }
      ], { duration: 320, easing: 'cubic-bezier(.2,.9,.2,1)'});
      return;
    }
    
    duration = newDuration;
    updateLabel(selectedMin, selectedSec);
    closePicker();
  });

  overlay.addEventListener('click', (e) => { 
    if (e.target === overlay) closePicker(); 
  });

  // Audio functions
  async function playStartSound(){
    const ctx = await initAudioContext();
    if (!ctx) return;
    
    try {
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
    } catch (err){ 
      console.warn('Audio start failed', err); 
    }
  }

  async function playFinishSound(){
    const ctx = await initAudioContext();
    if (!ctx) return;
    
    try {
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
    } catch(e){
      console.warn('Audio finish failed', e);
    }
  }

  // WakeLock helpers
  async function requestWakeLock(){
    try {
      if ('wakeLock' in navigator && navigator.wakeLock.request){
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { 
          wakeLock = null; 
        });
      }
    } catch (err){ 
      console.warn('Wake lock request failed:', err); 
      wakeLock = null; 
    }
  }
  
  async function releaseWakeLock(){
    if (wakeLock) {
      try {
        await wakeLock.release();
      } catch (err){ 
        console.warn('Wake lock release failed', err); 
      } finally {
        wakeLock = null;
      }
    }
  }

  // Color interpolation
  function interpolateColor(pct){
    function lerp(a,b,t){ return Math.round(a + (b-a)*t) }
    function hexToRgb(hex){ 
      hex = hex.replace('#',''); 
      return [
        parseInt(hex.substring(0,2),16), 
        parseInt(hex.substring(2,4),16), 
        parseInt(hex.substring(4,6),16)
      ]; 
    }
    
    const g = hexToRgb('4de0a6'), y = hexToRgb('ffd166'), r = hexToRgb('ff6b6b');
    let c1,c2,t;
    
    if (pct > 0.5){ 
      t = (pct - 0.5) / 0.5; 
      c1 = y; 
      c2 = g; 
    } else { 
      t = pct / 0.5; 
      c1 = r; 
      c2 = y; 
    }
    
    const rgb = [ 
      lerp(c1[0], c2[0], t), 
      lerp(c1[1], c2[1], t), 
      lerp(c1[2], c2[2], t) 
    ];
    return `rgb(${rgb.join(',')})`;
  }

  // Focus trap
  let lastFocused = null;
  let trapKeyHandler = null;
  
  function trapFocus(modalRoot){
    lastFocused = document.activeElement;
    const focusable = modalRoot.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length-1];
    
    trapKeyHandler = (e) => {
      if (e.key === 'Tab'){
        if (e.shiftKey && document.activeElement === first){ 
          e.preventDefault(); 
          last?.focus(); 
        }
        else if (!e.shiftKey && document.activeElement === last){ 
          e.preventDefault(); 
          first?.focus(); 
        }
      } else if (e.key === 'Escape'){ 
        e.preventDefault();
        closePicker(); 
      }
    };
    
    document.addEventListener('keydown', trapKeyHandler);
    requestAnimationFrame(() => first?.focus());
  }
  
  function releaseFocusTrap(){
    if (trapKeyHandler) {
      document.removeEventListener('keydown', trapKeyHandler);
      trapKeyHandler = null;
    }
    if (lastFocused?.focus) {
      try {
        lastFocused.focus();
      } catch(e) {
        clockWrap.focus();
      }
    }
  }

  // Visibility change handling
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      if (wakeLock === null && rafId !== null && !isPaused){
        await requestWakeLock();
      }
    }
  });

  // IMPROVED: Resize handling with better wheel management
  window.addEventListener('resize', () => {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    
    resizeTimeout = setTimeout(async () => {
      if (isPickerOpen) {
        try {
          await initWheels();
        } catch(e) {
          console.error('Error rebuilding wheels on resize:', e);
        }
      }
    }, 300);
  });

  // Initialize wheels
  wheelsPromise.then(({ minUl, secUl }) => {
    // Final setup after initialization
    setTimeout(() => {
      if (minUl && secUl) {
        markSelected(minUl, selectedMin);
        markSelected(secUl, selectedSec);
        updateLabel(selectedMin, selectedSec);
      }
    }, 100);
  }).catch(e => {
    console.error('Failed to initialize wheels:', e);
  });

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (rafId) cancelAnimationFrame(rafId);
    releaseWakeLock();
    cleanupEventListeners(minutesWheel);
    cleanupEventListeners(secondsWheel);
    Object.keys(wheelState).forEach(key => {
      if (wheelState[key].scrollTimeout) {
        clearTimeout(wheelState[key].scrollTimeout);
      }
    });
    if (audioCtx) {
      try {
        audioCtx.close();
      } catch(e) {}
    }
  });
})();

// app.js - 4 cerchi + wheels + timer a fasi (Preparazione, Work, Rest) con giri
// Nota: nessuna dipendenza esterna. Logica wheel identica per tutte le selezioni.

(() => {
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));

  // Stato configurazione
  const state = {
    prep: 10,            // secondi
    work: 30,            // secondi
    rest: 15,            // secondi
    rounds: 8,           // interi
  };

  // Riferimenti UI - CONFIG
  const configArea = $("#configArea");
  const circlesGrid = $("#circlesGrid");
  const startBtnConfig = $("#startBtnConfig");
  const circles = {
    prep: $("#circle-prep"),
    work: $("#circle-work"),
    rest: $("#circle-rest"),
    rounds: $("#circle-rounds"),
  };
  const labels = {
    prep: $("#label-prep"),
    work: $("#label-work"),
    rest: $("#label-rest"),
    rounds: $("#label-rounds"),
  };

  // Riferimenti UI - RUN
  const runArea = $("#runArea");
  const phaseHeading = $("#phaseHeading");
  const runTime = $("#runTime");
  const runRing = $("#runRing");
  const pauseBtn = $("#pauseBtn");
  const resumeBtn = $("#resumeBtn");
  const stopBtn = $("#stopBtn");

  // Picker overlay (riutilizzato per tutte le selezioni)
  const pickerOverlay = $("#pickerOverlay");
  const pickerTitle = $("#pickerTitle");
  const minutesWheel = $("#minutesWheel");
  const secondsWheel = $("#secondsWheel");
  const colLeft = $("#col-left");
  const colRight = $("#col-right");
  const leftLabel = $("#leftLabel");
  const rightLabel = $("#rightLabel");
  const confirmPicker = $("#confirmPicker");
  const cancelPicker = $("#cancelPicker");

  // Utilities
  const pad2 = n => String(n).padStart(2, "0");
  const formatMMSS = secs => `${pad2(Math.floor(secs/60))}:${pad2(secs%60)}`;

  // Aggiorna etichette dei 4 cerchi
  function refreshCircleLabels() {
    labels.prep.textContent = formatMMSS(state.prep);
    labels.work.textContent = formatMMSS(state.work);
    labels.rest.textContent = formatMMSS(state.rest);
    labels.rounds.textContent = pad2(state.rounds);
  }
  refreshCircleLabels();

  // ====== WHEEL LOGIC (riutilizzabile) ======
  function buildWheel(container, {min=0, max=59, step=1, format=v=>pad2(v), initial=0}) {
    container.innerHTML = "";
    container.classList.remove("smooth-scroll");
    const list = document.createElement("ul");
    list.className = "list";

    // spacer top
    const topSpacer = document.createElement("li");
    topSpacer.className = "spacer";
    list.appendChild(topSpacer);

    // items
    for (let v=min; v<=max; v+=step) {
      const li = document.createElement("li");
      li.className = "wheel-item";
      li.dataset.value = v;
      li.textContent = format(v);
      list.appendChild(li);
    }

    // spacer bottom
    const botSpacer = document.createElement("li");
    botSpacer.className = "spacer";
    list.appendChild(botSpacer);

    container.appendChild(list);

    const items = $$(".wheel-item", container);
    const itemH = items[0]?.offsetHeight || 128;

    // selezione corrente
    function selectByValue(val, smooth=true) {
      const idx = Math.min(Math.max(val - min, 0), (max-min));
      const target = items[idx];
      if (!target) return;
      items.forEach(el => el.classList.remove("selected"));
      target.classList.add("selected");
      // scroll per centrare
      const y = target.offsetTop - (container.clientHeight/2 - itemH/2);
      if (smooth) container.classList.add("smooth-scroll");
      container.scrollTop = y;
      if (smooth) setTimeout(()=>container.classList.remove("smooth-scroll"), 220);
    }

    // al scroll: evidenzia item più vicino al centro
    let rafId = null;
    container.addEventListener("scroll", () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const centerY = container.scrollTop + container.clientHeight/2;
        let closest = null, closestDist = Infinity;
        items.forEach(el => {
          const mid = el.offsetTop + itemH/2;
          const d = Math.abs(mid - centerY);
          if (d < closestDist) { closestDist = d; closest = el; }
        });
        if (closest) {
          items.forEach(el => el.classList.remove("selected"));
          closest.classList.add("selected");
        }
      });
    }, {passive:true});

    // fine scroll: snap preciso
    let snapTO = null;
    container.addEventListener("scroll", () => {
      if (snapTO) clearTimeout(snapTO);
      snapTO = setTimeout(() => {
        const sel = $(".wheel-item.selected", container);
        if (!sel) return;
        const y = sel.offsetTop - (container.clientHeight/2 - itemH/2);
        container.classList.add("smooth-scroll");
        container.scrollTop = y;
        setTimeout(()=>container.classList.remove("smooth-scroll"), 200);
      }, 120);
    }, {passive:true});

    // valore corrente
    function value() {
      const sel = $(".wheel-item.selected", container);
      return sel ? Number(sel.dataset.value) : min;
    }

    // iniziale
    selectByValue(initial, false);

    return { value, selectByValue, destroy: () => container.innerHTML = "" };
  }

  // Stato picker corrente
  let currentEdit = null; // 'prep' | 'work' | 'rest' | 'rounds'
  let leftWheel = null;
  let rightWheel = null;

  function openPicker(role) {
    currentEdit = role;

    // Imposta titolo e colonne
    if (role === "rounds") {
      pickerTitle.textContent = "Imposta giri";
      leftLabel.textContent = "Giri";
      rightLabel.textContent = "";
      colRight.style.display = "none";
      colLeft.style.maxWidth = "600px";
      // Wheel 1..99
      leftWheel = buildWheel(minutesWheel, {min:1, max:99, step:1, format:v=>String(v), initial: state.rounds});
      rightWheel = null;
    } else {
      pickerTitle.textContent = role === "prep" ? "Tempo di preparazione" : (role === "work" ? "Tempo di Work" : "Tempo di Rest");
      leftLabel.textContent = "Minuti";
      rightLabel.textContent = "Secondi";
      colRight.style.display = "";
      colLeft.style.maxWidth = "";
      // mins/secs 0..59
      const initialSecs = state[role];
      const initM = Math.floor(initialSecs/60);
      const initS = initialSecs%60;
      leftWheel = buildWheel(minutesWheel, {min:0, max:59, step:1, format: pad2, initial: initM});
      rightWheel = buildWheel(secondsWheel, {min:0, max:59, step:1, format: pad2, initial: initS});
    }

    pickerOverlay.hidden = false;
  }

  function closePicker() {
    pickerOverlay.hidden = true;
    minutesWheel.innerHTML = "";
    secondsWheel.innerHTML = "";
    leftWheel = rightWheel = null;
  }

  confirmPicker.addEventListener("click", () => {
    if (!currentEdit || !leftWheel) return closePicker();
    if (currentEdit === "rounds") {
      state.rounds = Math.max(1, Math.min(99, leftWheel.value()));
    } else {
      const mins = leftWheel.value();
      const secs = rightWheel ? rightWheel.value() : 0;
      state[currentEdit] = mins*60 + secs;
    }
    refreshCircleLabels();
    closePicker();
  });
  cancelPicker.addEventListener("click", closePicker);

  // Apertura picker al tap sui cerchi
  Object.entries(circles).forEach(([role, el]) => {
    el.addEventListener("click", () => openPicker(role));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPicker(role); }
    });
  });

  // ====== Animazione collasso e avvio ======
  function collapseCirclesAndStart() {
    // Se nessun giro/tempo valido, normalizza
    if (state.rounds < 1) state.rounds = 1;
    if (state.work < 1) state.work = 1; // evita divisione per 0 sul ring

    // Calcola centro del contenitore
    const gridRect = circlesGrid.getBoundingClientRect();
    const cx = gridRect.left + gridRect.width/2;
    const cy = gridRect.top + gridRect.height/2;

    const els = Object.values(circles);
    const animations = els.map(el => {
      const r = el.getBoundingClientRect();
      const dx = cx - (r.left + r.width/2);
      const dy = cy - (r.top + r.height/2);
      return el.animate(
        [
          { transform: "translate(0,0) scale(1)", opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.1)`, opacity: 0 }
        ],
        { duration: 550, easing: "cubic-bezier(.2,.8,.1,1)", fill: "forwards" }
      );
    });

    Promise.all(animations.map(a => a.finished)).then(() => {
      // Nascondi config, mostra run
      configArea.hidden = true;
      runArea.hidden = false;
      // reset animazioni per prossima apertura
      els.forEach(el => el.getAnimations().forEach(a => a.cancel()));
      // Avvia il timer
      startSequence();
    });
  }

  startBtnConfig.addEventListener("click", collapseCirclesAndStart);

  // ====== Timer a fasi ======
  const R = 88;
  const CIRC = 2 * Math.PI * R;
  runRing.style.strokeDasharray = String(CIRC);
  runRing.style.strokeDashoffset = String(CIRC);

  let seq = [];           // [{phase, dur}, ...]
  let iPhase = 0;
  let tStart = 0;         // ms
  let durMs = 0;          // ms della fase corrente
  let raf = null;
  let paused = false;
  let pauseAt = 0;        // ms

  function buildSequence() {
    seq = [];
    if (state.prep > 0) seq.push({ phase: "Preparazione", key: "prep", dur: state.prep });
    for (let i=0; i<state.rounds; i++) {
      if (state.work > 0) seq.push({ phase: "Work", key: "work", dur: state.work });
      if (state.rest > 0) seq.push({ phase: "Rest", key: "rest", dur: state.rest });
    }
  }

  function startSequence() {
    buildSequence();
    iPhase = 0;
    startPhase(iPhase);
  }

  function startPhase(index) {
    if (index >= seq.length) {
      // Fine
      phaseHeading.textContent = "Fatto!";
      runTime.textContent = "00:00";
      runRing.style.strokeDashoffset = "0";
      return;
    }
    const step = seq[index];
    phaseHeading.textContent = step.phase;
    // Cambia colore anello in base alla fase
    if (step.key === "prep") runRing.style.stroke = getComputedStyle(document.documentElement).getPropertyValue("--accent-start");
    else if (step.key === "work") runRing.style.stroke = getComputedStyle(document.documentElement).getPropertyValue("--accent-mid");
    else runRing.style.stroke = getComputedStyle(document.documentElement).getPropertyValue("--accent-end");

    tStart = performance.now();
    durMs = step.dur * 1000;
    paused = false;
    resumeBtn.hidden = true;
    pauseBtn.hidden = false;

    tick();
  }

  function tick(now) {
    if (paused) return;
    const t = now ?? performance.now();
    const elapsed = t - tStart;
    const remainMs = Math.max(0, durMs - elapsed);
    const remain = Math.ceil(remainMs / 1000);
    runTime.textContent = formatMMSS(remain);

    // progress (0..1)
    const prog = Math.min(1, elapsed / durMs);
    const offset = CIRC * (1 - prog);
    runRing.style.strokeDashoffset = String(offset);

    if (elapsed >= durMs) {
      // next
      iPhase++;
      startPhase(iPhase);
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  function pauseTimer() {
    if (paused) return;
    paused = true;
    pauseAt = performance.now();
    cancelAnimationFrame(raf);
    pauseBtn.hidden = true;
    resumeBtn.hidden = false;
  }
  function resumeTimer() {
    if (!paused) return;
    paused = false;
    const elapsedPause = performance.now() - pauseAt;
    tStart += elapsedPause;
    pauseBtn.hidden = false;
    resumeBtn.hidden = true;
    raf = requestAnimationFrame(tick);
  }
  function stopTimer() {
    cancelAnimationFrame(raf);
    paused = false;
    // Torna alla config
    runArea.hidden = true;
    configArea.hidden = false;
  }

  pauseBtn.addEventListener("click", pauseTimer);
  resumeBtn.addEventListener("click", resumeTimer);
  stopBtn.addEventListener("click", stopTimer);

  // Keyboard shortcuts in run (Space to pause/resume)
  $("#runClock").addEventListener("keydown", (e) => {
    if (e.key === " ") {
      e.preventDefault();
      paused ? resumeTimer() : pauseTimer();
    }
  });

  // Inizializza progress negli anelli dei 4 cerchi (solo estetico statico)
  $$(".grid-2x2 .circle").forEach(el => {
    const ring = $(".ring", el);
    ring.style.strokeDasharray = String(CIRC);
    ring.style.strokeDashoffset = String(0);
  });
})();

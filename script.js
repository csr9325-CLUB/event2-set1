/* ═══════════════════════════════════════════════
   CYBER_BREACH  —  script.js
   Features:
   • Team name prompt before game starts
   • Full sessionStorage persistence (survives reload)
   • Timer uses real wall-clock (tamper-resistant)
   • Game locks permanently once completed (no restart)
   • Email notification via EmailJS on completion
   • Anti-cheat: devtools detection, visibility API
     pause, console overrides
═══════════════════════════════════════════════ */

/* ── EmailJS config (update these before deploying) ── */
const EMAILJS_SERVICE_ID  = 'service_gtnm2ys';   // ← your EmailJS service ID
const EMAILJS_TEMPLATE_ID = 'template_5iu3g9v';   // ← your EmailJS template ID
const EMAILJS_PUBLIC_KEY  = 'qJGTvnW9SQf3r_7m3';        // ← your EmailJS public key
const RECIPIENT_EMAIL     = 'aasishkumar.it23@krct.ac.in';

/* ── Anti-cheat: block console tricks ── */
(function lockConsole() {
  const noop = () => {};
  try {
    // Warn but don't fully disable (breaks error reporting)
    const orig = console.warn;
    Object.defineProperty(window, '__cheating', { get(){ return false; } });
  } catch(e) {}
})();

/* Detect devtools open → pause timer */
let devtoolsOpen = false;
(function detectDevtools() {
  const threshold = 160;
  setInterval(() => {
    const before = performance.now();
    // eslint-disable-next-line no-debugger
    debugger;
    const after = performance.now();
    const isOpen = (after - before) > threshold;
    if (isOpen && !devtoolsOpen) {
      devtoolsOpen = true;
      pauseTimerAntiCheat('DEVTOOLS');
    } else if (!isOpen && devtoolsOpen) {
      devtoolsOpen = false;
      resumeTimerAntiCheat();
    }
  }, 1000);
})();

/* Pause timer when tab is hidden (prevents switching to answer lookup) */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pauseTimerAntiCheat('TAB_HIDDEN');
  } else {
    resumeTimerAntiCheat();
  }
});

/* ── Audio ── */
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let actx = null;
function getCtx() { if (!actx) actx = new AudioCtx(); return actx; }
function beep(freq, type, duration, vol = 0.3) {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(); osc.stop(ctx.currentTime + duration);
  } catch(e) {}
}
function playSuccess() {
  [523,659,784,1047].forEach((f,i) => setTimeout(() => beep(f,'square',0.12,0.25), i*110));
}
function playWrong() {
  beep(180,'sawtooth',0.25,0.35);
  setTimeout(() => beep(120,'sawtooth',0.25,0.35), 120);
}
function playType() { beep(700+Math.random()*500,'square',0.03,0.04); }
function playWin() {
  [262,330,392,523,659,784,1047,1319].forEach((n,i) => setTimeout(() => beep(n,'square',0.35,0.22), i*110));
}
function playUnlock() {
  beep(330,'square',0.08);
  setTimeout(()=>beep(440,'square',0.08),90);
  setTimeout(()=>beep(550,'square',0.12),180);
}

/* ══════════════════════════════════════════════
   ROUNDS DATA
══════════════════════════════════════════════ */
const ROUNDS = [
  {
    id: 1,
    title: "",
    challenge: "IDENTIFY THE SECURITY TERM",
    display: `? ? ? ? ? ? ? ? (8 letters)`,
    hint: "Secret key to access accounts. Should be strong & confidential. Used in login authentication.",
    answer: "PASSWORD",
    type: "text"
  },
  {
    id: 2,
    title: "",
    challenge: "DECODE & REVERSE",
    display: `01000011 01001111 01000100 01000101`,
    hint: "Step 1: Convert Binary → ASCII Text. Step 2: Reverse the decoded word.",
    answer: "EDOC",
    type: "binary"
  },
  {
    id: 3,
    title: "",
    challenge: "DECODE BASE64 → REPLACE NUMBER",
    display: `U2FmZTM=`,
    hint: "Decode the Base64 string first. Then replace any digit with its corresponding alphabet letter (1=A, 2=B, 3=C…).",
    answer: "SAFEC",
    type: "base64"
  },
  {
    id: 4,
    title: "",
    challenge: "APPLY SHIFT -3 TO DECRYPT",
    display: `Z H O F R P H`,
    hint: "Caesar Cipher with a shift of -3. Each letter moves 3 positions backward in the alphabet.",
    answer: "WELCOME",
    type: "caesar"
  },
  {
    id: 5,
    title: "",
    challenge: "CONVERT BINARY TO TEXT",
    display: `01001100 01001111 01000011 01001011`,
    hint: "Convert each 8-bit binary group to its ASCII character. 76=L, 79=O, 67=C, 75=K.",
    answer: "LOCK",
    type: "binary2"
  },
  {
    id: 6,
    title: "",
    challenge: "EXTRACT CAPITAL LETTERS ONLY",
    display: `CrYpTo Is FuN AnD SeCuRe`,
    hint: "Observe each character carefully. Extract only the uppercase (capital) letters in sequence.",
    answer: "CRYPTOFANS",
    type: "acrostic"
  },
  {
    id: 7,
    title: "",
    challenge: "REPLACE VOWELS WITH NEXT ALPHABET",
    display: `SECURE`,
    hint: "Keep all consonants unchanged. For each vowel (A,E,I,O,U), replace it with the next letter in the alphabet.",
    answer: "SFCVRF",
    type: "multi"
  }
];

/* ── Fisher-Yates shuffle ── */
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ══════════════════════════════════════════════
   PERSISTENCE  —  sessionStorage keys
   (session = tab lifetime; survives reload,
    wiped when browser/tab fully closes)
══════════════════════════════════════════════ */
const SK = {
  TEAM:        'cb_team',
  COMPLETED:   'cb_completed',    // JSON array of round indices
  ELAPSED:     'cb_elapsed',      // seconds elapsed (integer)
  WALL_START:  'cb_wall_start',   // Date.now() when timer last started
  STARTED:     'cb_started',      // "1" if timer has ever started
  FINISHED:    'cb_finished',     // "1" if game is done
  HINT_ORDER:  'cb_hint_order',   // JSON array of shuffled indices
  PAUSED_AT:   'cb_paused_at'     // elapsed at last pause
};

function ss(key, val) {
  if (val === undefined) return sessionStorage.getItem(key);
  if (val === null) sessionStorage.removeItem(key);
  else sessionStorage.setItem(key, val);
}

/* ── Runtime state ── */
let state = {
  teamName: '',
  currentRound: 0,
  completed: [],
  elapsed: 0,
  timerInterval: null,
  started: false,
  finished: false,
  shuffledHintIndices: [],
  pausedBy: null   // 'TAB_HIDDEN' | 'DEVTOOLS' | null
};

/* ══════════════════════════════════════════════
   TIMER  (wall-clock based — tamper-resistant)
   We store the wall-clock start time in session-
   Storage. On each tick we recompute elapsed as
   (now - wallStart) + previouslyAccruedSeconds.
   This means setting the system clock forward
   or faking Date.now() would be needed to cheat,
   and tab-hide pauses the accrual.
══════════════════════════════════════════════ */
let wallStart = null;   // Date.now() when current run started
let accruedMs = 0;      // ms accrued before current run

function startTimer() {
  if (state.timerInterval) return;
  state.started = true;
  ss(SK.STARTED, '1');
  wallStart = Date.now();
  ss(SK.WALL_START, String(wallStart));
  state.timerInterval = setInterval(timerTick, 500);
}

function timerTick() {
  if (state.pausedBy) return;
  const live = wallStart ? Date.now() - wallStart : 0;
  state.elapsed = Math.floor((accruedMs + live) / 1000);
  ss(SK.ELAPSED, String(state.elapsed));
  updateTimerDisplay();
}

function stopTimer() {
  if (wallStart) {
    accruedMs += Date.now() - wallStart;
    wallStart = null;
  }
  clearInterval(state.timerInterval);
  state.timerInterval = null;
  ss(SK.WALL_START, null);
}

function pauseTimerAntiCheat(reason) {
  if (state.pausedBy) return;
  state.pausedBy = reason;
  // Accrue what we have so far
  if (wallStart) {
    accruedMs += Date.now() - wallStart;
    wallStart = null;
  }
  ss(SK.ELAPSED, String(state.elapsed));
  ss(SK.WALL_START, null);
  showPauseOverlay(reason);
}

function resumeTimerAntiCheat() {
  if (!state.pausedBy) return;
  state.pausedBy = null;
  hidePauseOverlay();
  if (state.started && !state.finished) {
    wallStart = Date.now();
    ss(SK.WALL_START, String(wallStart));
  }
}

function updateTimerDisplay() {
  const el = document.getElementById('timer');
  if (!el) return;
  const m = String(Math.floor(state.elapsed / 60)).padStart(2,'0');
  const s = String(state.elapsed % 60).padStart(2,'0');
  el.textContent = `${m}:${s}`;
  el.classList.toggle('warning', state.elapsed > 900);
}

/* ── Pause overlay ── */
function showPauseOverlay(reason) {
  let overlay = document.getElementById('pause-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'pause-overlay';
    overlay.style.cssText = `
      position:fixed;top:0;left:0;right:0;bottom:0;
      background:rgba(0,0,0,0.92);z-index:999;
      display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:16px;
    `;
    overlay.innerHTML = `
      <div style="font-family:'VT323',monospace;font-size:48px;color:#ff003c;
                  text-shadow:0 0 20px #ff003c;letter-spacing:4px;">TIMER PAUSED</div>
      <div id="pause-reason" style="font-size:12px;color:#ff003c;letter-spacing:4px;"></div>
      <div style="font-size:11px;color:#3a6b3a;letter-spacing:3px;margin-top:8px;">
        RETURN TO TAB / CLOSE DEVTOOLS TO RESUME
      </div>
    `;
    document.body.appendChild(overlay);
  }
  const reasonMap = {
    TAB_HIDDEN: '// TAB SWITCHED — TIMER SUSPENDED',
    DEVTOOLS:   '// DEVTOOLS DETECTED — TIMER SUSPENDED'
  };
  document.getElementById('pause-reason').textContent = reasonMap[reason] || reason;
  overlay.style.display = 'flex';
}
function hidePauseOverlay() {
  const o = document.getElementById('pause-overlay');
  if (o) o.style.display = 'none';
}

/* ══════════════════════════════════════════════
   TEAM NAME MODAL
══════════════════════════════════════════════ */
function showTeamModal() {
  return new Promise(resolve => {
    const modal = document.createElement('div');
    modal.id = 'team-modal';
    modal.style.cssText = `
      position:fixed;top:0;left:0;right:0;bottom:0;
      background:rgba(0,0,0,0.96);z-index:500;
      display:flex;align-items:center;justify-content:center;
      padding:20px;
    `;
    modal.innerHTML = `
      <div style="
        border:1px solid #00ff4133;background:#0a1a0a;
        padding:40px 36px;max-width:480px;width:100%;
        position:relative;text-align:center;
      ">
        <div style="position:absolute;top:-1px;left:-1px;width:14px;height:14px;
          border-top:2px solid #00ff41;border-left:2px solid #00ff41;opacity:0.6;"></div>
        <div style="position:absolute;top:-1px;right:-1px;width:14px;height:14px;
          border-top:2px solid #00ff41;border-right:2px solid #00ff41;opacity:0.6;"></div>
        <div style="position:absolute;bottom:-1px;left:-1px;width:14px;height:14px;
          border-bottom:2px solid #00ff41;border-left:2px solid #00ff41;opacity:0.6;"></div>
        <div style="position:absolute;bottom:-1px;right:-1px;width:14px;height:14px;
          border-bottom:2px solid #00ff41;border-right:2px solid #00ff41;opacity:0.6;"></div>

        <div style="font-family:'VT323',monospace;font-size:36px;color:#00ff41;
                    text-shadow:0 0 16px #00ff41;letter-spacing:4px;margin-bottom:8px;">
          AGENT IDENTIFICATION
        </div>
        <div style="font-size:11px;color:#3a6b3a;letter-spacing:3px;margin-bottom:28px;">
          // ENTER YOUR TEAM NAME TO BEGIN MISSION
        </div>

        <input
          id="team-input"
          type="text"
          maxlength="30"
          autocomplete="off"
          spellcheck="false"
          placeholder="TEAM NAME..."
          style="
            width:100%;background:#020c02;border:1px solid #1a5c1a;
            color:#00ff41;font-family:'Share Tech Mono',monospace;
            font-size:18px;padding:12px 16px;outline:none;
            letter-spacing:3px;text-transform:uppercase;
            caret-color:#00ff41;margin-bottom:18px;box-sizing:border-box;
          "
        />
        <div id="team-error" style="
          font-size:11px;color:#ff003c;letter-spacing:3px;
          margin-bottom:12px;min-height:18px;
        "></div>

        <button id="team-start-btn" style="
          background:transparent;border:1px solid #00ff41;
          color:#00ff41;font-family:'Share Tech Mono',monospace;
          font-size:14px;padding:12px 32px;cursor:pointer;
          letter-spacing:4px;text-shadow:0 0 8px #00ff41;
          box-shadow:0 0 10px rgba(0,255,65,0.2);
          transition:all 0.15s;width:100%;
        ">
          [ BEGIN MISSION ]
        </button>
      </div>
    `;
    document.body.appendChild(modal);

    const input = document.getElementById('team-input');
    const btn   = document.getElementById('team-start-btn');
    const err   = document.getElementById('team-error');

    // Focus & style
    setTimeout(() => input.focus(), 100);
    input.addEventListener('focus', () => {
      input.style.borderColor = '#00ff41';
      input.style.boxShadow = '0 0 0 1px #00ff41,0 0 20px rgba(0,255,65,0.15)';
    });
    input.addEventListener('blur', () => {
      input.style.borderColor = '#1a5c1a';
      input.style.boxShadow = '';
    });

    function submit() {
      const name = input.value.trim().toUpperCase();
      if (!name) { err.textContent = '⚠ TEAM NAME REQUIRED TO PROCEED'; beep(200,'sawtooth',0.2,0.3); return; }
      if (name.length < 2) { err.textContent = '⚠ MINIMUM 2 CHARACTERS REQUIRED'; beep(200,'sawtooth',0.2,0.3); return; }
      err.textContent = '';
      ss(SK.TEAM, name);
      modal.style.transition = 'opacity 0.4s';
      modal.style.opacity = '0';
      setTimeout(() => { modal.remove(); resolve(name); }, 400);
      beep(440,'square',0.15);
    }

    btn.addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    btn.addEventListener('mouseover', () => {
      btn.style.background = 'rgba(0,255,65,0.1)';
      btn.style.boxShadow = '0 0 20px rgba(0,255,65,0.4)';
    });
    btn.addEventListener('mouseout', () => {
      btn.style.background = 'transparent';
      btn.style.boxShadow = '0 0 10px rgba(0,255,65,0.2)';
    });
  });
}

/* ══════════════════════════════════════════════
   PROGRESS
══════════════════════════════════════════════ */
function updateProgress() {
  const pct = (state.completed.length / ROUNDS.length) * 100;
  document.querySelector('.progress-fill').style.width = pct + '%';
  document.querySelector('.progress-label span:last-child').textContent =
    `${state.completed.length} / ${ROUNDS.length} DECRYPTED`;
  document.querySelectorAll('.pip').forEach((pip, i) => {
    pip.classList.remove('active','done');
    if (state.completed.includes(i)) pip.classList.add('done');
    else if (i === state.currentRound) pip.classList.add('active');
  });
}

/* ══════════════════════════════════════════════
   BUILD HINT CARDS  (shuffled, no labels)
══════════════════════════════════════════════ */
function buildHintCards() {
  const grid = document.getElementById('hint-cards-grid');
  if (!grid) return;
  grid.innerHTML = '';

  // Restore or create shuffle order
  let order = [];
  const saved = ss(SK.HINT_ORDER);
  if (saved) {
    try { order = JSON.parse(saved); } catch(e) {}
  }
  if (!order.length) {
    order = shuffleArray(ROUNDS.map((_,i) => i));
    ss(SK.HINT_ORDER, JSON.stringify(order));
  }
  state.shuffledHintIndices = order;

  const tags = ['INTEL FRAGMENT','INTERCEPT','SIGNAL','CLASSIFIED','DECOY?','PATTERN','ALGORITHM'];
  order.forEach((roundIdx, displayPos) => {
    const round = ROUNDS[roundIdx];
    const card  = document.createElement('div');
    card.className   = 'hint-card';
    card.id          = `hint-card-display-${displayPos}`;
    card.innerHTML   = `
      <div class="hint-card-tag">${tags[displayPos % tags.length]}</div>
      <div class="hint-card-body">${round.hint}</div>
    `;
    grid.appendChild(card);
  });
}

let hintsPanelOpen = true;
function toggleHintsPanel() {
  const grid = document.getElementById('hint-cards-grid');
  const btn  = document.querySelector('.hints-toggle-btn');
  hintsPanelOpen = !hintsPanelOpen;
  grid.style.display = hintsPanelOpen ? 'grid' : 'none';
  btn.textContent = hintsPanelOpen ? '[ COLLAPSE INTEL ]' : '[ EXPAND INTEL ]';
  beep(440,'sine',0.1,0.15);
}

/* ══════════════════════════════════════════════
   BUILD ROUND CARDS
══════════════════════════════════════════════ */
function buildRounds() {
  const container = document.getElementById('rounds-container');
  container.innerHTML = '';

  ROUNDS.forEach((round, idx) => {
    const isDone    = state.completed.includes(idx);
    const isLocked  = idx > state.currentRound && !isDone;

    const card = document.createElement('div');
    card.className = 'game-card';
    card.id = `round-card-${idx}`;
    card.setAttribute('data-round', `// LAYER ${round.id} OF ${ROUNDS.length}`);
    card.style.position = 'relative';

    card.innerHTML = `
      <div class="corner-decor corner-tl"></div>
      <div class="corner-decor corner-tr"></div>
      <div class="corner-decor corner-bl"></div>
      <div class="corner-decor corner-br"></div>

      <div class="round-title">${round.title || round.challenge}</div>

      <div class="challenge-box">
        <div class="challenge-label">// ENCRYPTED PAYLOAD</div>
        <div class="challenge-value" style="white-space:pre-line">${round.display}</div>
      </div>

      <div class="input-row">
        <input
          type="text"
          class="answer-input"
          id="input-${idx}"
          placeholder="ENTER DECRYPTED OUTPUT..."
          maxlength="40"
          autocomplete="off"
          spellcheck="false"
          ${(isLocked || isDone) ? 'disabled' : ''}
          onkeydown="handleKey(event,${idx})"
          oninput="playType()"
        />
        <button class="submit-btn" id="btn-${idx}"
          onclick="checkAnswer(${idx})"
          ${(isLocked || isDone) ? 'disabled' : ''}>
          ${isDone ? 'DONE ✓' : 'SUBMIT'}
        </button>
      </div>
      <div class="feedback" id="feedback-${idx}">
        ${isDone ? '<span style="color:var(--neon-green);text-shadow:0 0 10px var(--neon-green)">✅  LAYER BREACHED — DECRYPTION CONFIRMED</span>' : ''}
      </div>

      ${isLocked ? `
      <div class="locked-overlay" id="lock-${idx}">
        <div class="lock-icon">🔒</div>
        <div class="locked-text">BREACH PREVIOUS LAYER TO UNLOCK</div>
      </div>` : ''}
    `;
    container.appendChild(card);
  });
}

function handleKey(e, idx) { if (e.key === 'Enter') checkAnswer(idx); }

/* ══════════════════════════════════════════════
   CHECK ANSWER
══════════════════════════════════════════════ */
function checkAnswer(idx) {
  if (state.finished) return;
  if (state.pausedBy) {
    showPauseOverlay(state.pausedBy);
    return;
  }
  if (!state.started) startTimer();

  const input    = document.getElementById(`input-${idx}`);
  const feedback = document.getElementById(`feedback-${idx}`);
  const answer   = input.value.trim().toUpperCase();
  const correct  = ROUNDS[idx].answer.toUpperCase();
  if (!answer) return;

  if (answer === correct) {
    feedback.innerHTML = '<span style="color:var(--neon-green);text-shadow:0 0 10px var(--neon-green)">✅  LAYER BREACHED — DECRYPTION CONFIRMED</span>';
    input.disabled = true;
    document.getElementById(`btn-${idx}`).disabled = true;
    document.getElementById(`btn-${idx}`).textContent = 'DONE ✓';
    playSuccess();

    state.completed.push(idx);
    ss(SK.COMPLETED, JSON.stringify(state.completed));
    updateProgress();

    const next = idx + 1;
    if (next < ROUNDS.length) setTimeout(() => unlockRound(next), 800);
    else setTimeout(() => showWinScreen(), 1200);
  } else {
    feedback.innerHTML = '<span style="color:var(--neon-red);text-shadow:0 0 10px var(--neon-red)">❌  DECRYPTION FAILED — REANALYZE INTEL</span>';
    input.style.borderColor = 'var(--neon-red)';
    input.style.boxShadow   = '0 0 10px rgba(255,0,60,0.3)';
    playWrong();
    setTimeout(() => {
      input.style.borderColor = '';
      input.style.boxShadow   = '';
      feedback.innerHTML = '';
    }, 1200);
    input.value = '';
    input.focus();
  }
}

function unlockRound(idx) {
  const lock  = document.getElementById(`lock-${idx}`);
  const input = document.getElementById(`input-${idx}`);
  const btn   = document.getElementById(`btn-${idx}`);
  if (lock) {
    lock.style.transition = 'opacity 0.5s';
    lock.style.opacity    = '0';
    setTimeout(() => lock.remove(), 500);
  }
  if (input) input.disabled = false;
  if (btn)   btn.disabled   = false;
  state.currentRound = idx;
  updateProgress();
  playUnlock();
  setTimeout(() => {
    const card = document.getElementById(`round-card-${idx}`);
    if (card) card.scrollIntoView({ behavior:'smooth', block:'center' });
    if (input) input.focus();
  }, 600);
}

/* ══════════════════════════════════════════════
   WIN SCREEN  +  EMAIL NOTIFICATION
══════════════════════════════════════════════ */
function showWinScreen() {
  stopTimer();
  state.finished = true;
  ss(SK.FINISHED, '1');

  playWin();

  const m = String(Math.floor(state.elapsed/60)).padStart(2,'0');
  const s = String(state.elapsed%60).padStart(2,'0');
  const timeStr = `${m}:${s}`;

  document.getElementById('win-time').textContent   = timeStr;
  document.getElementById('win-rounds').textContent = ROUNDS.length;
  document.getElementById('win-team').textContent   = state.teamName;

  const grid = document.getElementById('win-grid');
  grid.innerHTML = '';
  for (let i = 0; i < 49; i++) {
    const cell = document.createElement('div');
    cell.className = 'win-cell';
    cell.style.animationDelay = (i*30)+'ms';
    grid.appendChild(cell);
  }

  // Hide restart button permanently
  const restartBtn = document.querySelector('.restart-btn');
  if (restartBtn) restartBtn.style.display = 'none';
  const footerRestartBtn = document.querySelector('#footer-restart');
  if (footerRestartBtn) footerRestartBtn.style.display = 'none';

  document.getElementById('win-screen').classList.add('visible');

  // Send email
  sendCompletionEmail(state.teamName, timeStr);
}

function sendCompletionEmail(teamName, timeStr) {
  const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  // EmailJS — will only work if EmailJS is loaded and keys are configured
  if (typeof emailjs !== 'undefined' && EMAILJS_PUBLIC_KEY !== 'YOUR_PUBLIC_KEY') {
    emailjs.init(EMAILJS_PUBLIC_KEY);
    emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email:   RECIPIENT_EMAIL,
      team_name:  teamName,
      time_taken: timeStr,
      timestamp:  timestamp,
      rounds:     ROUNDS.length
    }).then(() => {
      console.log('Completion email sent.');
    }).catch(err => {
      console.warn('EmailJS error:', err);
    });
  } else {
    // Fallback: mailto link (opens user's email client)
    const subject = encodeURIComponent(`CYBER_BREACH Completion — ${teamName}`);
    const body = encodeURIComponent(
      `Team "${teamName}" completed CYBER_BREACH!\n\nTime taken: ${timeStr}\nCompleted at: ${timestamp}\nLayers breached: ${ROUNDS.length}\n`
    );
    // Open silently in background (won't show popup unless user triggers)
    const link = `mailto:${RECIPIENT_EMAIL}?subject=${subject}&body=${body}`;
    const a = document.createElement('a');
    a.href = link;
    a.style.display = 'none';
    document.body.appendChild(a);
    // Don't auto-click as it can be intrusive; log for admin
    console.info(`[COMPLETION] Team: ${teamName} | Time: ${timeStr} | At: ${timestamp}`);
  }
}

/* ══════════════════════════════════════════════
   MATRIX RAIN
══════════════════════════════════════════════ */
function initMatrix() {
  const canvas = document.getElementById('matrix-bg');
  const ctx    = canvas.getContext('2d');
  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize);
  const chars = '01アイウエオカキクケコ#@%&!?ABCDEF0123456789';
  const cols  = Math.floor(canvas.width / 16);
  const drops = Array(cols).fill(1);
  setInterval(() => {
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#00ff41';
    ctx.font = '13px Share Tech Mono, monospace';
    drops.forEach((y,i) => {
      ctx.fillText(chars[Math.floor(Math.random()*chars.length)], i*16, y*16);
      if (y*16 > canvas.height && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    });
  }, 50);
}

/* ══════════════════════════════════════════════
   BOOT SEQUENCE  +  STATE RESTORE
══════════════════════════════════════════════ */
function bootSequence(onComplete) {
  const lines = [
    '> INITIALIZING BREACH PROTOCOL v7.3...',
    '> LOADING CRYPTOGRAPHIC ENGINE...',
    '> RESTORING SESSION STATE...',
    '> SCRAMBLING INTEL BOARD...',
    '> ALL LAYERS ARMED — IDENTIFY YOUR INTEL'
  ];
  const boot = document.getElementById('boot-log');
  lines.forEach((line, i) => {
    setTimeout(() => {
      const el = document.createElement('div');
      el.style.cssText = 'color:var(--neon-green);font-size:12px;letter-spacing:2px;margin:2px 0;';
      el.textContent = line;
      boot.appendChild(el);
      beep(300+i*50,'square',0.05,0.1);
    }, i*380);
  });
  setTimeout(() => {
    const bs = document.getElementById('boot-screen');
    bs.style.transition = 'opacity 0.6s';
    bs.style.opacity    = '0';
    setTimeout(() => { bs.style.display = 'none'; onComplete(); }, 600);
  }, lines.length*380+350);
}

/* ── Restore session from sessionStorage ── */
function restoreSession() {
  const savedTeam      = ss(SK.TEAM);
  const savedCompleted = ss(SK.COMPLETED);
  const savedElapsed   = ss(SK.ELAPSED);
  const savedStarted   = ss(SK.STARTED);
  const savedFinished  = ss(SK.FINISHED);
  const savedWallStart = ss(SK.WALL_START);

  if (savedTeam)      state.teamName  = savedTeam;
  if (savedStarted)   state.started   = true;
  if (savedFinished)  state.finished  = true;

  if (savedCompleted) {
    try {
      const c = JSON.parse(savedCompleted);
      state.completed    = c;
      state.currentRound = c.length > 0 ? Math.min(c.length, ROUNDS.length - 1) : 0;
      // If all previous rounds done but last not yet done, current = last done + 1
      if (c.length < ROUNDS.length) state.currentRound = c.length;
    } catch(e) {}
  }

  if (savedElapsed) {
    accruedMs = parseInt(savedElapsed, 10) * 1000;
    state.elapsed = parseInt(savedElapsed, 10);
  }

  // If timer was running when page reloaded, add gap
  if (savedWallStart && !state.finished) {
    const gap = Date.now() - parseInt(savedWallStart, 10);
    accruedMs += gap;
    state.elapsed = Math.floor(accruedMs / 1000);
    ss(SK.ELAPSED, String(state.elapsed));
  }

  return !!savedTeam; // returns true if session exists
}

/* ══════════════════════════════════════════════
   MAIN INIT
══════════════════════════════════════════════ */
async function initGame() {
  const sessionExists = restoreSession();

  // If game is already finished, jump straight to win screen
  if (state.finished) {
    document.getElementById('main-game').style.display = 'block';
    buildHintCards();
    buildRounds();
    updateProgress();
    updateTimerDisplay();
    // Re-show win screen immediately
    const m = String(Math.floor(state.elapsed/60)).padStart(2,'0');
    const s = String(state.elapsed%60).padStart(2,'0');
    document.getElementById('win-time').textContent   = `${m}:${s}`;
    document.getElementById('win-rounds').textContent = ROUNDS.length;
    document.getElementById('win-team').textContent   = state.teamName;
    const grid = document.getElementById('win-grid');
    grid.innerHTML = '';
    for (let i = 0; i < 49; i++) {
      const cell = document.createElement('div');
      cell.className = 'win-cell';
      cell.style.animationDelay = (i*30)+'ms';
      grid.appendChild(cell);
    }
    const restartBtn = document.querySelector('.restart-btn');
    if (restartBtn) restartBtn.style.display = 'none';
    document.getElementById('win-screen').classList.add('visible');
    return;
  }

  // Ask for team name if not in session
  if (!sessionExists) {
    await showTeamModal();
    state.teamName = ss(SK.TEAM) || 'UNKNOWN';
  }

  document.getElementById('main-game').style.display = 'block';
  buildHintCards();
  buildRounds();
  updateProgress();
  updateTimerDisplay();

  // Resume timer if it was running
  if (state.started && !state.finished) {
    startTimer();
  }

  // Update team display
  const agentEl = document.querySelector('.agent-name');
  if (agentEl) agentEl.textContent = `AGENT: ${state.teamName}`;
}

window.addEventListener('DOMContentLoaded', () => {
  initMatrix();
  bootSequence(() => initGame());
  document.addEventListener('click', () => {
    if (actx && actx.state === 'suspended') actx.resume();
  }, { once: true });
});

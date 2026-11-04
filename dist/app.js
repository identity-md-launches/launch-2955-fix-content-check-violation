// WHEELY9000: local educational calculations, never token balances or mining.
import { setupWallet } from './wallet.js';

/** @template {HTMLElement} T @param {string} id @param {new () => T} type @returns {T} */
function element(id, type) {
  const node = document.getElementById(id);
  if (!(node instanceof type)) throw new Error(`Missing ${id}`);
  return node;
}

const state = {
  rpm: 0, maxRpm: 0, rotation: 0, totalRevolutions: 0,
  simulatedBlocks: 0, currentBlockRevs: 0, points: 0,
  blockThreshold: 120, isTurbo: false, soundEnabled: false,
  userAura: 0, quests: { run500: false, reach300rpm: false, mineFirstBlock: false }
};
const canvas = element('wheel-canvas', HTMLCanvasElement);
const ctx = (() => { const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas unavailable'); return context; })();
/** @type {SparkParticle[]} */
const particles = [];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const runBtn = element('run-btn', HTMLButtonElement);
const turboBtn = element('turbo-toggle-btn', HTMLButtonElement);
const recordBtn = element('record-score-btn', HTMLButtonElement);
const soundBtn = element('sound-toggle', HTMLButtonElement);
const recordStatus = element('record-status', HTMLParagraphElement);
const logs = element('terminal-logs', HTMLOListElement);
const blockProgress = element('block-progress', HTMLProgressElement);
const questProgress = ['q1-progress', 'q2-progress', 'q3-progress'].map(id => element(id, HTMLProgressElement));
const fields = Object.fromEntries(['display-rpm', 'm-sqk', 'm-hash', 'm-revolutions', 'display-max-rpm', 'm-blocks', 'm-block-progress', 'session-status', 'user-aura', 'completed-missions', 'q1-status', 'q2-status', 'q3-status'].map(id => [id, element(id, HTMLElement)]));
const storageKey = 'squeekchain.demo.benchmark.v1';
/** @typedef {{version: 1, points: number, revolutions: number, peakRpm: number, simulatedBlocks: number, recordedAt: string}} DemoRecord */
let lastRecordedPoints = 0;

/** @param {DemoRecord} record @param {boolean} persistent */
function describeRecord(record, persistent) {
  const time = new Date(record.recordedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  recordStatus.textContent = `Demo score: ${record.points.toFixed(2)} points. Recorded ${time} ${persistent ? 'on this browser only.' : 'in this tab only. Storage is unavailable; reloading loses this record.'}`;
}
try {
  const raw = localStorage.getItem(storageKey);
  /** @type {unknown} */
  const saved = raw ? JSON.parse(raw) : null;
  if (saved && typeof saved === 'object' && 'version' in saved && saved.version === 1 &&
      'points' in saved && typeof saved.points === 'number' && Number.isFinite(saved.points) && saved.points >= 0 &&
      'revolutions' in saved && typeof saved.revolutions === 'number' && Number.isFinite(saved.revolutions) && saved.revolutions >= 0 &&
      'peakRpm' in saved && typeof saved.peakRpm === 'number' && Number.isFinite(saved.peakRpm) && saved.peakRpm >= 0 &&
      'simulatedBlocks' in saved && typeof saved.simulatedBlocks === 'number' && Number.isFinite(saved.simulatedBlocks) && saved.simulatedBlocks >= 0 &&
      'recordedAt' in saved && typeof saved.recordedAt === 'string' && Number.isFinite(Date.parse(saved.recordedAt))) {
    describeRecord(/** @type {DemoRecord} */ (saved), true);
  }
} catch { /* Restricted/corrupt storage never blocks the simulator. */ }

// Sound starts muted and is created only after an explicit opt-in.
/** @type {AudioContext | null} */
let audioCtx = null;
/** @type {OscillatorNode | null} */
let wheelOsc = null;
/** @type {GainNode | null} */
let wheelGain = null;
async function initAudio() {
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
      wheelOsc = audioCtx.createOscillator();
      wheelGain = audioCtx.createGain();
      wheelOsc.type = 'sine'; wheelOsc.frequency.value = 60; wheelGain.gain.value = 0;
      wheelOsc.connect(wheelGain); wheelGain.connect(audioCtx.destination); wheelOsc.start();
    } catch {
      state.soundEnabled = false; soundBtn.setAttribute('aria-pressed', 'false'); soundBtn.textContent = 'Sound unavailable';
      addLog('Audio unavailable. The benchmark still works.');
    }
  }
  if (audioCtx?.state === 'suspended') await audioCtx.resume().catch(() => {});
}
function updateAudioMotor() {
  if (!audioCtx || !wheelOsc || !wheelGain) return;
  wheelGain.gain.setTargetAtTime(state.soundEnabled && !document.hidden ? Math.min(.045, state.rpm / 14000) : 0, audioCtx.currentTime, .1);
  wheelOsc.frequency.setTargetAtTime(50 + state.rpm / 4, audioCtx.currentTime, .05);
}
  class SparkParticle {
    /** @param {number} x @param {number} y @param {number} angle */
    constructor(x, y, angle) {
      this.x = x;
      this.y = y;
      const speed = Math.random() * 4 + 2;
      this.vx = Math.cos(angle) * speed + (Math.random() - 0.5) * 2;
      this.vy = Math.sin(angle) * speed + (Math.random() - 0.5) * 2;
      this.life = 1;
      this.decay = Math.random() * 0.03 + 0.02;
      this.color = Math.random() > 0.4 ? '#35D07F' : '#FFE600';
      this.size = Math.random() * 3 + 1.5;
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.life -= this.decay;
    }
    /** @param {CanvasRenderingContext2D} c */
    draw(c) {
      c.save();
      c.globalAlpha = Math.max(0, this.life);
      c.fillStyle = this.color;
      c.shadowColor = this.color;
      c.shadowBlur = 8;
      c.beginPath();
      c.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
  }

  function drawWheel() {
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = w * 0.42;

    ctx.clearRect(0, 0, w, h);

    // 1. Outer Chassis
    ctx.save();
    ctx.strokeStyle = '#262A34';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 12, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#35D07F';
    ctx.lineWidth = 2;
    for (let i = 0; i < 36; i++) {
      const angle = (i * Math.PI) / 18;
      const r1 = radius + 18;
      const r2 = i % 3 === 0 ? radius + 26 : radius + 22;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
      ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
      ctx.stroke();
    }
    ctx.restore();

    // 2. Rotating Wheel
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(reducedMotion.matches ? 0 : state.rotation);

    ctx.strokeStyle = state.rpm > 350 ? '#FFE600' : '#35D07F';
    ctx.lineWidth = 8;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = state.rpm > 100 ? 15 : 6;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();

    const spokes = 12;
    ctx.strokeStyle = 'rgba(242, 242, 244, 0.25)';
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 0;
    for (let s = 0; s < spokes; s++) {
      const a = (s * Math.PI * 2) / spokes;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
      ctx.stroke();

      ctx.fillStyle = s % 2 === 0 ? '#35D07F' : '#FFE600';
      ctx.beginPath();
      ctx.arc(Math.cos(a) * (radius - 8), Math.sin(a) * (radius - 8), 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#17171B';
    ctx.strokeStyle = '#35D07F';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#FFE600';
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // 3. Cyber Hamster
    drawHamster(cx, cy + radius * 0.62);

    // 4. Kinetic Particles / Sparks
    if (!reducedMotion.matches && state.rpm > 180 && Math.random() < 0.6) {
      const tangent = Math.PI * 0.75;
      particles.push(new SparkParticle(cx - radius * 0.6, cy + radius * 0.6, tangent));
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      particles[i].update();
      particles[i].draw(ctx);
      if (particles[i].life <= 0) particles.splice(i, 1);
    }
  }

  /** @param {number} hx @param {number} hy */
  function drawHamster(hx, hy) {
    ctx.save();
    ctx.translate(hx, hy);

    const legPhase = reducedMotion.matches ? 0 : state.rotation * 8;
    const bob = Math.sin(legPhase) * (Math.min(state.rpm, 300) / 45);
    ctx.translate(0, bob);

    ctx.strokeStyle = '#D48622';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    
    const leg1Y = Math.sin(legPhase) * 12;
    ctx.beginPath();
    ctx.moveTo(-16, 12);
    ctx.lineTo(-24, 24 + leg1Y);
    ctx.stroke();

    const leg2Y = Math.sin(legPhase + Math.PI) * 12;
    ctx.beginPath();
    ctx.moveTo(-6, 12);
    ctx.lineTo(-14, 24 + leg2Y);
    ctx.stroke();

    ctx.fillStyle = '#E89B35';
    ctx.beginPath();
    ctx.ellipse(0, 6, 26, 18, 0.15, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFE6C4';
    ctx.beginPath();
    ctx.ellipse(4, 10, 16, 11, 0.15, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFB9B9';
    ctx.beginPath();
    ctx.arc(-24, 2, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#E89B35';
    ctx.beginPath();
    ctx.arc(20, -2, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#D48622';
    ctx.beginPath();
    ctx.arc(12, -18, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFB9B9';
    ctx.beginPath();
    ctx.arc(12, -18, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#17171B';
    ctx.strokeStyle = state.rpm > 300 ? '#FFE600' : '#35D07F';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(16, -9, 17, 9, 3);
    ctx.fill();
    ctx.stroke();

    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(18, -4);
    ctx.lineTo(30, -4);
    ctx.stroke();

    ctx.fillStyle = '#FF8383';
    ctx.beginPath();
    ctx.arc(32, 4, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(28, 4); ctx.lineTo(40, 2);
    ctx.moveTo(28, 6); ctx.lineTo(39, 8);
    ctx.stroke();

    const paw1X = Math.cos(legPhase) * 10;
    ctx.strokeStyle = '#D48622';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(14, 12);
    ctx.lineTo(20 + paw1X, 22);
    ctx.stroke();

    const paw2X = Math.cos(legPhase + Math.PI) * 10;
    ctx.beginPath();
    ctx.moveTo(8, 12);
    ctx.lineTo(14 + paw2X, 22);
    ctx.stroke();

    ctx.restore();
  }


/** @param {string} message @param {string} [kind] */
function addLog(message, kind = 'info') {
  const line = document.createElement('li');
  line.className = `log-line ${kind}`;
  line.textContent = message;
  logs.append(line);
  while (logs.children.length > 40) logs.firstElementChild?.remove();
  logs.scrollTop = logs.scrollHeight;
}

function checkMissions() {
  const missions = [
    { key: /** @type {const} */ ('run500'), done: state.totalRevolutions >= 500, points: 100, title: '500 revolutions' },
    { key: /** @type {const} */ ('reach300rpm'), done: state.maxRpm >= 300, points: 150, title: '300 RPM' },
    { key: /** @type {const} */ ('mineFirstBlock'), done: state.simulatedBlocks >= 1, points: 200, title: 'First simulated block' }
  ];
  for (const mission of missions) {
    if (mission.done && !state.quests[mission.key]) {
      state.quests[mission.key] = true;
      state.userAura += mission.points;
      addLog(`${mission.title}: +${mission.points} demo Aura. Local progress only.`, 'speed');
    }
  }
}

function updateTelemetry() {
  fields['display-rpm'].textContent = String(Math.floor(state.rpm));
  fields['display-max-rpm'].textContent = String(state.maxRpm);
  fields['m-sqk'].textContent = state.points.toFixed(2);
  fields['m-hash'].textContent = (state.rpm * 1.85).toFixed(2);
  fields['m-revolutions'].textContent = state.totalRevolutions.toFixed(1);
  fields['m-blocks'].textContent = String(state.simulatedBlocks);
  fields['m-block-progress'].textContent = `${Math.floor(state.currentBlockRevs / state.blockThreshold * 100)}%`;
  fields['session-status'].textContent = state.isTurbo ? 'Auto turbo running' : state.rpm > 0 ? 'Spinning' : 'Ready';
  blockProgress.value = state.currentBlockRevs;
  recordBtn.disabled = state.points < .01 || Math.floor(state.points * 100) <= Math.floor(lastRecordedPoints * 100);
  fields['user-aura'].textContent = String(state.userAura);
  fields['completed-missions'].textContent = String(Object.values(state.quests).filter(Boolean).length);
  questProgress[0].value = Math.min(500, state.totalRevolutions);
  questProgress[1].value = Math.min(300, state.maxRpm);
  questProgress[2].value = Math.min(120, state.totalRevolutions);
  fields['q1-status'].textContent = state.quests.run500 ? 'Complete (demo)' : `${Math.floor(state.totalRevolutions)} / 500`;
  fields['q2-status'].textContent = state.quests.reach300rpm ? 'Complete (demo)' : `${state.maxRpm} / 300`;
  fields['q3-status'].textContent = state.quests.mineFirstBlock ? 'Complete (demo)' : `${Math.floor(state.totalRevolutions)} / 120 revolutions`;
}

let lastTime = performance.now(), lastPaint = 0;
function stopTurbo() {
  state.isTurbo = false;
  turboBtn.setAttribute('aria-pressed', 'false');
  turboBtn.textContent = 'Start auto turbo';
}
/** @param {number} now */
function engineLoop(now) {
  // Cap elapsed time, so background tabs cannot generate phantom progress.
  const dt = document.hidden ? 0 : Math.min(.1, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  const wasSpinning = state.rpm > 0;
  if (state.isTurbo) state.rpm = Math.min(650, state.rpm + 280 * dt);
  state.rpm = Math.max(0, state.rpm - 65 * dt);
  state.maxRpm = Math.max(state.maxRpm, Math.floor(state.rpm));
  const revolutions = state.rpm / 60 * dt;
  state.rotation = (state.rotation + revolutions * Math.PI * 2) % (Math.PI * 2);
  state.totalRevolutions += revolutions;
  state.points = state.totalRevolutions * .5;
  state.currentBlockRevs += revolutions;
  while (state.currentBlockRevs >= state.blockThreshold) {
    state.currentBlockRevs -= state.blockThreshold;
    state.simulatedBlocks++;
    addLog(`Simulated block ${state.simulatedBlocks} completed after 120 revolutions. No chain activity.`, 'block');
  }
  checkMissions();
  if (now - lastPaint > 80) { updateTelemetry(); updateAudioMotor(); lastPaint = now; }
  if (!reducedMotion.matches && (state.rpm > 0 || wasSpinning || particles.length)) drawWheel();
  requestAnimationFrame(engineLoop);
}

function spinImpulse() {
  state.rpm = Math.min(850, state.rpm + 48);
  state.maxRpm = Math.max(state.maxRpm, Math.floor(state.rpm));
  checkMissions(); updateTelemetry();
}
runBtn.addEventListener('click', spinImpulse);
window.addEventListener('keydown', event => {
  if (event.code === 'Space' && event.target === document.body && !document.querySelector('dialog[open]')) {
    event.preventDefault(); spinImpulse();
  }
});
turboBtn.addEventListener('click', () => {
  if (state.isTurbo) {
    stopTurbo(); state.rpm = 0;
    addLog('Auto turbo paused.');
  } else {
    state.isTurbo = true;
    turboBtn.setAttribute('aria-pressed', 'true');
    turboBtn.textContent = 'Pause auto turbo';
    addLog('Auto turbo started. All metrics are simulated.');
  }
  updateTelemetry(); updateAudioMotor();
});
soundBtn.addEventListener('click', async () => {
  state.soundEnabled = !state.soundEnabled;
  soundBtn.setAttribute('aria-pressed', String(state.soundEnabled));
  soundBtn.textContent = state.soundEnabled ? 'Sound on' : 'Sound off';
  if (state.soundEnabled) await initAudio();
  updateAudioMotor();
});
element('terminal-clear', HTMLButtonElement).addEventListener('click', () => {
  logs.replaceChildren(); addLog('Demo log cleared.');
});
recordBtn.addEventListener('click', () => {
  if (recordBtn.disabled || state.points < .01) return;
  /** @type {DemoRecord} */
  const record = { version: 1, points: Number(state.points.toFixed(2)), revolutions: Number(state.totalRevolutions.toFixed(2)), peakRpm: state.maxRpm, simulatedBlocks: state.simulatedBlocks, recordedAt: new Date().toISOString() };
  let persistent = true;
  try { localStorage.setItem(storageKey, JSON.stringify(record)); } catch { persistent = false; }
  lastRecordedPoints = state.points;
  describeRecord(record, persistent);
  addLog(`Recorded ${record.points.toFixed(2)} demo points ${persistent ? 'on this browser' : 'in this tab'}. No tokens or wallet activity.`);
  updateTelemetry();
});
element('reset-session-btn', HTMLButtonElement).addEventListener('click', () => {
  stopTurbo();
  Object.assign(state, { rpm: 0, maxRpm: 0, rotation: 0, totalRevolutions: 0, simulatedBlocks: 0, currentBlockRevs: 0, points: 0, userAura: 0, quests: { run500: false, reach300rpm: false, mineFirstBlock: false } });
  lastRecordedPoints = 0; particles.length = 0;
  updateTelemetry(); updateAudioMotor(); drawWheel();
  addLog('Session reset. Existing demo records are unchanged.');
});
document.addEventListener('visibilitychange', () => {
  lastTime = performance.now();
  if (document.hidden) { stopTurbo(); state.rpm = 0; updateTelemetry(); updateAudioMotor(); }
});
reducedMotion.addEventListener('change', () => { particles.length = 0; drawWheel(); });

// Preserve the concept cards' pointer tilt; reduced motion keeps them still.
for (const card of document.querySelectorAll('[data-tilt]')) {
  if (!(card instanceof HTMLElement)) continue;
  const inner = card.querySelector('.card-inner');
  if (!(inner instanceof HTMLElement)) continue;
  card.addEventListener('mousemove', event => {
    if (reducedMotion.matches || !matchMedia('(hover: hover)').matches) return;
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left - rect.width / 2) / (rect.width / 2);
    const y = (event.clientY - rect.top - rect.height / 2) / (rect.height / 2);
    inner.style.transform = `rotateX(${-y * 5}deg) rotateY(${x * 5}deg)`;
  });
  card.addEventListener('mouseleave', () => { inner.style.transform = ''; });
  reducedMotion.addEventListener('change', () => { inner.style.transform = ''; });
}

setupWallet(addLog);
addLog('WHEELY9000 calibrated. Demo Mode ready; spin the wheel to begin.');
updateTelemetry(); drawWheel(); requestAnimationFrame(engineLoop);

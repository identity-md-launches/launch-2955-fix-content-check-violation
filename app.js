// Squeekchain Genesis — Interactive Engine
// Proof-of-Hamster-Work (PoHW) Simulation & WHEELY9000 Rig

(function() {
  'use strict';

  // --- STATE ---
  const state = {
    rpm: 0,
    maxRpm: 0,
    targetRpm: 0,
    rotation: 0,
    totalRevolutions: 0,
    minedSqk: 0,
    minedBlocks: 849203,
    blockThreshold: 120, // revs to mine 1 block
    currentBlockRevs: 0,
    stamina: 100,
    isTurbo: false,
    soundEnabled: true,
    walletConnected: false,
    walletAddress: null,
    userAura: 250,
    userRank: 412,
    quests: {
      run500: { done: false, progress: 225, target: 500 },
      reach300rpm: { done: false },
      mineFirstBlock: { done: false },
      shareX: { done: false }
    }
  };

  // --- AUDIO SYNTHESIZER (Web Audio API) ---
  let audioCtx = null;
  let wheelOsc = null;
  let wheelGain = null;

  function initAudio() {
    if (audioCtx) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContext();

      // Continuous wheel hum oscillator
      wheelOsc = audioCtx.createOscillator();
      wheelGain = audioCtx.createGain();

      wheelOsc.type = 'sawtooth';
      wheelOsc.frequency.setValueAtTime(60, audioCtx.currentTime);
      wheelGain.gain.setValueAtTime(0, audioCtx.currentTime);

      // Lowpass filter for smooth mechanical sound
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(320, audioCtx.currentTime);

      wheelOsc.connect(filter);
      filter.connect(wheelGain);
      wheelGain.connect(audioCtx.destination);
      wheelOsc.start();
    } catch (e) {
      console.warn('Web Audio API not supported', e);
    }
  }

  function playSqueek() {
    if (!state.soundEnabled || !audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      
      const now = audioCtx.currentTime;
      // High pitch mouse squeak modulation
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(2400, now + 0.06);
      osc.frequency.exponentialRampToValueAtTime(1400, now + 0.12);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    } catch (e) {}
  }

  function playBlockMinedChime() {
    if (!state.soundEnabled || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 arpeggio
      notes.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.07);

        gain.gain.setValueAtTime(0.2, now + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.35);

        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + idx * 0.07);
        osc.stop(now + idx * 0.07 + 0.38);
      });
    } catch (e) {}
  }

  function updateAudioMotor() {
    if (!audioCtx || !wheelGain) return;
    if (!state.soundEnabled || state.rpm < 5) {
      wheelGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
      return;
    }
    // Frequency scales with RPM (60Hz to 280Hz)
    const targetFreq = 50 + (state.rpm / 800) * 220;
    const targetVolume = Math.min(0.12, (state.rpm / 600) * 0.12);

    wheelOsc.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.05);
    wheelGain.gain.setTargetAtTime(targetVolume, audioCtx.currentTime, 0.05);
  }

  // --- CANVAS VISUALIZER ---
  const canvas = document.getElementById('wheel-canvas');
  const ctx = canvas.getContext('2d');
  const particles = [];

  class SparkParticle {
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

    // 1. Outer Chassis / Stator Ring
    ctx.save();
    ctx.strokeStyle = '#262A34';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 12, 0, Math.PI * 2);
    ctx.stroke();

    // Chassis Telemetry Tick marks
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

    // 2. Rotating Rotor Wheel
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(state.rotation);

    // Outer Neon Rim
    ctx.strokeStyle = state.rpm > 350 ? '#FFE600' : '#35D07F';
    ctx.lineWidth = 8;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = state.rpm > 100 ? 15 : 6;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Spokes / Bars
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

      // Running tread rungs on perimeter
      ctx.fillStyle = s % 2 === 0 ? '#35D07F' : '#FFE600';
      ctx.beginPath();
      ctx.arc(Math.cos(a) * (radius - 8), Math.sin(a) * (radius - 8), 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Center Telemetry Rotor Core
    ctx.fillStyle = '#17171B';
    ctx.strokeStyle = '#35D07F';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Center Gold Dot
    ctx.fillStyle = '#FFE600';
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // 3. Cyber Rebellious Hamster (Stays in bottom half of wheel running forward)
    drawHamster(cx, cy + radius * 0.62);

    // 4. Kinetic Particles / Sparks
    if (state.rpm > 180 && Math.random() < 0.6) {
      const tangent = Math.PI * 0.75;
      particles.push(new SparkParticle(cx - radius * 0.6, cy + radius * 0.6, tangent));
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      particles[i].update();
      particles[i].draw(ctx);
      if (particles[i].life <= 0) particles.splice(i, 1);
    }
  }

  function drawHamster(hx, hy) {
    ctx.save();
    ctx.translate(hx, hy);

    // Running bobbing offset based on RPM
    const legPhase = state.rotation * 8;
    const bob = Math.sin(legPhase) * (Math.min(state.rpm, 300) / 45);
    ctx.translate(0, bob);

    // Facing forward right
    // Back legs
    ctx.strokeStyle = '#D48622';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    
    // Back Leg 1
    const leg1Y = Math.sin(legPhase) * 12;
    ctx.beginPath();
    ctx.moveTo(-16, 12);
    ctx.lineTo(-24, 24 + leg1Y);
    ctx.stroke();

    // Back Leg 2
    const leg2Y = Math.sin(legPhase + Math.PI) * 12;
    ctx.beginPath();
    ctx.moveTo(-6, 12);
    ctx.lineTo(-14, 24 + leg2Y);
    ctx.stroke();

    // Hamster Chubby Body (Golden Brown)
    ctx.fillStyle = '#E89B35';
    ctx.beginPath();
    ctx.ellipse(0, 6, 26, 18, 0.15, 0, Math.PI * 2);
    ctx.fill();

    // Fluffy Belly Patch
    ctx.fillStyle = '#FFE6C4';
    ctx.beginPath();
    ctx.ellipse(4, 10, 16, 11, 0.15, 0, Math.PI * 2);
    ctx.fill();

    // Little Tail
    ctx.fillStyle = '#FFB9B9';
    ctx.beginPath();
    ctx.arc(-24, 2, 4, 0, Math.PI * 2);
    ctx.fill();

    // Hamster Head
    ctx.fillStyle = '#E89B35';
    ctx.beginPath();
    ctx.arc(20, -2, 16, 0, Math.PI * 2);
    ctx.fill();

    // Ears
    ctx.fillStyle = '#D48622';
    ctx.beginPath();
    ctx.arc(12, -18, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFB9B9';
    ctx.beginPath();
    ctx.arc(12, -18, 4, 0, Math.PI * 2);
    ctx.fill();

    // Cyberpunk Neon Visor / Eye Gear
    ctx.fillStyle = '#17171B';
    ctx.strokeStyle = state.rpm > 300 ? '#FFE600' : '#35D07F';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(16, -9, 17, 9, 3);
    ctx.fill();
    ctx.stroke();

    // Visor glow scanline
    ctx.strokeStyle = ctx.strokeStyle;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(18, -4);
    ctx.lineTo(30, -4);
    ctx.stroke();

    // Pink Snout / Nose
    ctx.fillStyle = '#FF8383';
    ctx.beginPath();
    ctx.arc(32, 4, 3, 0, Math.PI * 2);
    ctx.fill();

    // Whiskers
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(28, 4); ctx.lineTo(40, 2);
    ctx.moveTo(28, 6); ctx.lineTo(39, 8);
    ctx.stroke();

    // Front Paws
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

  // --- MINING & ENGINE LOOP ---
  let lastTime = performance.now();

  function engineLoop(now) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    // Turbo mode automatic injection
    if (state.isTurbo) {
      state.rpm = Math.min(650, state.rpm + 280 * dt);
    }

    // Natural friction / deceleration
    state.rpm = Math.max(0, state.rpm - 65 * dt);

    // Update max RPM
    if (state.rpm > state.maxRpm) {
      state.maxRpm = Math.floor(state.rpm);
      document.getElementById('display-max-rpm').textContent = state.maxRpm;
      checkQuest('reach300rpm', state.maxRpm >= 300);
    }

    // Update rotation angle
    const revsThisFrame = (state.rpm / 60) * dt;
    state.rotation += revsThisFrame * Math.PI * 2;
    state.totalRevolutions += revsThisFrame;
    state.currentBlockRevs += revsThisFrame;

    // Check quest 500 revs
    if (state.quests.run500.progress < 500) {
      state.quests.run500.progress = Math.min(500, 225 + Math.floor(state.totalRevolutions));
      const fill = document.getElementById('q1-fill');
      if (fill) fill.style.width = (state.quests.run500.progress / 500 * 100) + '%';
      if (state.quests.run500.progress >= 500) {
        checkQuest('run500', true);
      }
    }

    // Check block mining trigger
    if (state.currentBlockRevs >= state.blockThreshold) {
      solveBlock();
      state.currentBlockRevs = 0;
    }

    // Update UI Elements
    updateTelemetry();
    updateAudioMotor();

    // Render Canvas
    drawWheel();

    requestAnimationFrame(engineLoop);
  }

  function solveBlock() {
    state.minedBlocks++;
    const reward = 50.0;
    state.minedSqk += reward;

    playBlockMinedChime();
    checkQuest('mineFirstBlock', true);

    const hash = '0000sqk' + Math.random().toString(16).substring(2, 10) + Math.random().toString(16).substring(2, 6);
    addLog(`✨ BLOCK SOLVED! [#${state.minedBlocks}] Hash: ${hash} (+${reward} $SQK)`, 'block');

    document.getElementById('claim-mined-btn').removeAttribute('disabled');
    document.getElementById('net-block').textContent = '#' + state.minedBlocks.toLocaleString('en-US');
  }

  function addLog(text, type = 'info') {
    const logs = document.getElementById('terminal-logs');
    if (!logs) return;
    const line = document.createElement('div');
    line.className = 'log-line ' + type;
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    line.textContent = `[${time}] ${text}`;
    logs.appendChild(line);
    logs.scrollTop = logs.scrollHeight;
  }

  function updateTelemetry() {
    document.getElementById('display-rpm').textContent = Math.floor(state.rpm);

    const hashrate = (state.rpm * 1.85).toFixed(2);
    document.getElementById('m-hash').innerHTML = `${hashrate} <small>KH/s</small>`;
    document.getElementById('fill-hash').style.width = Math.min(100, (state.rpm / 600) * 100) + '%';

    document.getElementById('m-sqk').innerHTML = `${state.minedSqk.toFixed(3)} <small>$SQK</small>`;
    document.getElementById('fill-sqk').style.width = Math.min(100, (state.minedSqk / 200) * 100) + '%';

    const blockProgress = Math.min(100, Math.floor((state.currentBlockRevs / state.blockThreshold) * 100));
    document.getElementById('m-block-progress').textContent = `${blockProgress}%`;
    document.getElementById('fill-block').style.width = `${blockProgress}%`;
  }

  // --- USER INTERACTION ---
  function spinImpulse() {
    initAudio();
    playSqueek();
    state.rpm = Math.min(850, state.rpm + 48);

    const btn = document.getElementById('run-btn');
    btn.classList.add('active');
    setTimeout(() => btn.classList.remove('active'), 120);

    if (state.rpm > 400 && Math.random() < 0.3) {
      addLog(`⚡ High Cadence Surge: ${Math.floor(state.rpm)} RPM reached!`, 'speed');
    }
  }

  const runBtn = document.getElementById('run-btn');
  runBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    spinImpulse();
  });

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    spinImpulse();
  });

  // Spacebar binding
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target === document.body) {
      e.preventDefault();
      spinImpulse();
    }
  });

  // Turbo Toggle
  const turboBtn = document.getElementById('turbo-toggle-btn');
  turboBtn.addEventListener('click', () => {
    initAudio();
    state.isTurbo = !state.isTurbo;
    turboBtn.classList.toggle('active', state.isTurbo);
    addLog(state.isTurbo ? '🚀 AUTO-TURBO ENGAGED! Hamster entering overdrive.' : '⏸️ Auto-turbo disengaged.', state.isTurbo ? 'speed' : 'info');
  });

  // Clear Terminal
  document.getElementById('terminal-clear').addEventListener('click', () => {
    document.getElementById('terminal-logs').innerHTML = '<div class="log-line info">> Console cleared.</div>';
  });

  // Sound Toggle
  const soundBtn = document.getElementById('sound-toggle');
  soundBtn.addEventListener('click', () => {
    initAudio();
    state.soundEnabled = !state.soundEnabled;
    soundBtn.querySelector('.icon-sound').textContent = state.soundEnabled ? '🔊' : '🔇';
  });

  // Connect Wallet
  const connectBtn = document.getElementById('connect-wallet-btn');
  connectBtn.addEventListener('click', async () => {
    initAudio();
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        if (accounts && accounts.length > 0) {
          state.walletConnected = true;
          state.walletAddress = accounts[0];
          updateWalletUI();
          addLog(`🔑 Wallet connected: ${state.walletAddress.slice(0, 6)}...${state.walletAddress.slice(-4)}`, 'speed');
          return;
        }
      } catch (err) {
        console.warn('Wallet connection rejected:', err);
      }
    }
    // Fallback simulation
    state.walletConnected = true;
    state.walletAddress = '0x' + Array.from({length: 40}, () => Math.floor(Math.random()*16).toString(16)).join('');
    updateWalletUI();
    addLog(`🔑 SqueekID Wallet linked: ${state.walletAddress.slice(0, 6)}...${state.walletAddress.slice(-4)}`, 'speed');
  });

  function updateWalletUI() {
    const text = connectBtn.querySelector('.wallet-text');
    text.textContent = state.walletAddress.slice(0, 6) + '...' + state.walletAddress.slice(-4);
    connectBtn.style.background = '#1F242D';
    connectBtn.style.color = '#35D07F';
    connectBtn.style.borderColor = '#35D07F';
  }

  // Claim Mined $SQK
  const claimBtn = document.getElementById('claim-mined-btn');
  claimBtn.addEventListener('click', () => {
    initAudio();
    if (state.minedSqk <= 0) return;
    addLog(`💎 Successfully claimed ${state.minedSqk.toFixed(3)} $SQK to wallet!`, 'block');
    alert(`🎉 Successfully transferred ${state.minedSqk.toFixed(3)} $SQK to your Squeekchain Genesis wallet!`);
    state.minedSqk = 0;
    claimBtn.setAttribute('disabled', 'true');
  });

  // Quest Verification
  function checkQuest(questKey, isDone) {
    if (!isDone || state.quests[questKey].done) return;
    state.quests[questKey].done = true;

    if (questKey === 'run500') {
      const btn = document.getElementById('q1-btn');
      btn.textContent = 'Claimed';
      btn.classList.add('claim');
      addAura(100, 'Sprint 500 Revolutions');
    } else if (questKey === 'reach300rpm') {
      const btn = document.getElementById('q2-btn');
      btn.textContent = 'Completed';
      btn.classList.add('claim');
      btn.removeAttribute('disabled');
      const fill = document.getElementById('q2-fill');
      fill.style.width = '100%';
      addAura(150, 'Overclock Wheel past 300 RPM');
    } else if (questKey === 'mineFirstBlock') {
      const btn = document.getElementById('q3-btn');
      btn.textContent = 'Completed';
      btn.classList.add('claim');
      const fill = document.getElementById('q3-fill');
      fill.style.width = '100%';
      addAura(200, 'Mine First Squeek Block');
    }
  }

  function addAura(amount, reason) {
    state.userAura += amount;
    state.userRank = Math.max(1, state.userRank - Math.floor(amount / 4));
    document.getElementById('user-aura').innerHTML = `${state.userAura} <small>PTS</small>`;
    document.getElementById('user-rank').textContent = `#${state.userRank}`;
    addLog(`✨ +${amount} AURA Earned! (${reason})`, 'speed');
  }

  // Quest 4 Share on X
  const q4Btn = document.getElementById('q4-btn');
  q4Btn.addEventListener('click', () => {
    initAudio();
    const text = encodeURIComponent("I'm mining $SQK on the WHEELY9000 with the rebellious hamster of @squeekchain Genesis! 🐹⚡\n\nRun with us: https://squeekchain.com/genesis");
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
    if (!state.quests.shareX.done) {
      state.quests.shareX.done = true;
      q4Btn.textContent = 'Claimed';
      q4Btn.classList.remove('claim');
      addAura(300, 'Signal Rodent Revolution on X');
    }
  });

  // 3D Tilt Effect on NFT Cards
  const cards = document.querySelectorAll('[data-tilt]');
  cards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const midX = rect.width / 2;
      const midY = rect.height / 2;
      const rotX = ((y - midY) / midY) * -14;
      const rotY = ((x - midX) / midX) * 14;

      const inner = card.querySelector('.card-inner');
      if (inner) {
        inner.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg) scale3d(1.03, 1.03, 1.03)`;
      }
    });

    card.addEventListener('mouseleave', () => {
      const inner = card.querySelector('.card-inner');
      if (inner) {
        inner.style.transform = 'rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
      }
    });
  });

  // Start engine loop
  requestAnimationFrame(engineLoop);
  addLog('🐹 SqueekChain PoHW Node v1.0.0 initialized.');
})();

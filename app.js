// Squeekchain Genesis — Interactive Testnet Simulator
// Educational Showcase for Proof-of-Hamster-Work (PoHW) and WHEELY9000 Rig

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
    blockThreshold: 120, // revs to simulate mining 1 block
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
      const notes = [523.25, 659.25, 783.99, 1046.50];
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
    ctx.rotate(state.rotation);

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

    const legPhase = state.rotation * 8;
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

    ctx.strokeStyle = ctx.strokeStyle;
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

  // --- MINING & ENGINE LOOP ---
  let lastTime = performance.now();

  function engineLoop(now) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    if (state.isTurbo) {
      state.rpm = Math.min(650, state.rpm + 280 * dt);
    }

    state.rpm = Math.max(0, state.rpm - 65 * dt);

    if (state.rpm > state.maxRpm) {
      state.maxRpm = Math.floor(state.rpm);
      document.getElementById('display-max-rpm').textContent = state.maxRpm;
      checkQuest('reach300rpm', state.maxRpm >= 300);
    }

    const revsThisFrame = (state.rpm / 60) * dt;
    state.rotation += revsThisFrame * Math.PI * 2;
    state.totalRevolutions += revsThisFrame;
    state.currentBlockRevs += revsThisFrame;

    if (state.quests.run500.progress < 500) {
      state.quests.run500.progress = Math.min(500, 225 + Math.floor(state.totalRevolutions));
      const fill = document.getElementById('q1-fill');
      if (fill) fill.style.width = (state.quests.run500.progress / 500 * 100) + '%';
      if (state.quests.run500.progress >= 500) {
        checkQuest('run500', true);
      }
    }

    if (state.currentBlockRevs >= state.blockThreshold) {
      solveBlock();
      state.currentBlockRevs = 0;
    }

    updateTelemetry();
    updateAudioMotor();
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
    addLog(`✨ SIMULATED BLOCK SOLVED! [#${state.minedBlocks}] Hash: ${hash} (+${reward} PTS)`, 'block');

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

    document.getElementById('m-sqk').innerHTML = `${state.minedSqk.toFixed(3)} <small>PTS</small>`;
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

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target === document.body) {
      e.preventDefault();
      spinImpulse();
    }
  });

  const turboBtn = document.getElementById('turbo-toggle-btn');
  turboBtn.addEventListener('click', () => {
    initAudio();
    state.isTurbo = !state.isTurbo;
    turboBtn.classList.toggle('active', state.isTurbo);
    addLog(state.isTurbo ? '🚀 AUTO-TURBO ENGAGED! Hamster entering overdrive.' : '⏸️ Auto-turbo disengaged.', state.isTurbo ? 'speed' : 'info');
  });

  document.getElementById('terminal-clear').addEventListener('click', () => {
    document.getElementById('terminal-logs').innerHTML = '<div class="log-line info">> Console cleared.</div>';
  });

  const soundBtn = document.getElementById('sound-toggle');
  soundBtn.addEventListener('click', () => {
    initAudio();
    state.soundEnabled = !state.soundEnabled;
    soundBtn.querySelector('.icon-sound').textContent = state.soundEnabled ? '🔊' : '🔇';
  });

  // Connect Wallet (Read-Only Spectator)
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
          addLog(`🔑 Wallet connected (Read-Only): ${state.walletAddress.slice(0, 6)}...${state.walletAddress.slice(-4)}`, 'speed');
          return;
        }
      } catch (err) {
        addLog('ℹ️ Wallet connection prompt was closed.', 'info');
        return;
      }
    }
    // No wallet installed: do NOT fake an address
    addLog('ℹ️ No Web3 wallet found. Running in Guest Simulator mode.', 'info');
    connectBtn.querySelector('.wallet-text').textContent = 'Guest Mode (Simulator)';
  });

  function updateWalletUI() {
    const text = connectBtn.querySelector('.wallet-text');
    text.textContent = state.walletAddress.slice(0, 6) + '...' + state.walletAddress.slice(-4);
    connectBtn.style.background = '#1F242D';
    connectBtn.style.color = '#35D07F';
    connectBtn.style.borderColor = '#35D07F';
  }

  // Record Simulation Benchmark (Explicitly Non-Deceptive)
  const claimBtn = document.getElementById('claim-mined-btn');
  claimBtn.addEventListener('click', () => {
    initAudio();
    if (state.minedSqk <= 0) return;
    const score = state.minedSqk.toFixed(3);
    addLog(`📊 Benchmark session recorded: ${score} Simulated PTS.`, 'info');
    addLog(`ℹ️ [Simulation Notice] No tokens are transferred by this simulator. For real testnet $SQK, visit https://sepolia.squeekchain.com`, 'info');
    state.minedSqk = 0;
    claimBtn.setAttribute('disabled', 'true');
  });

  // Quest Verification
  function checkQuest(questKey, isDone) {
    if (!isDone || state.quests[questKey].done) return;
    state.quests[questKey].done = true;

    if (questKey === 'run500') {
      const btn = document.getElementById('q1-btn');
      btn.textContent = 'Mission Complete';
      btn.classList.add('claim');
      addAura(100, 'Sprint 500 Revolutions');
    } else if (questKey === 'reach300rpm') {
      const btn = document.getElementById('q2-btn');
      btn.textContent = 'Mission Complete';
      btn.classList.add('claim');
      btn.removeAttribute('disabled');
      const fill = document.getElementById('q2-fill');
      fill.style.width = '100%';
      addAura(150, 'Overclock Wheel past 300 RPM');
    } else if (questKey === 'mineFirstBlock') {
      const btn = document.getElementById('q3-btn');
      btn.textContent = 'Mission Complete';
      btn.classList.add('claim');
      const fill = document.getElementById('q3-fill');
      fill.style.width = '100%';
      addAura(200, 'Mine First Simulated Block');
    }
  }

  function addAura(amount, reason) {
    state.userAura += amount;
    state.userRank = Math.max(1, state.userRank - Math.floor(amount / 4));
    document.getElementById('user-aura').innerHTML = `${state.userAura} <small>PTS</small>`;
    document.getElementById('user-rank').textContent = `#${state.userRank}`;
    addLog(`✨ +${amount} Simulated Aura Points! (${reason})`, 'speed');
  }

  // Quest 4 Share on X
  const q4Btn = document.getElementById('q4-btn');
  q4Btn.addEventListener('click', () => {
    initAudio();
    const text = encodeURIComponent("Testing the WHEELY9000 kinetic mining simulator with the rebellious hamster of @squeekchain Genesis! 🐹⚡\n\nOfficial Portal: https://squeekchain.com/genesis");
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
    if (!state.quests.shareX.done) {
      state.quests.shareX.done = true;
      q4Btn.textContent = 'Completed';
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

  requestAnimationFrame(engineLoop);
  addLog('🐹 SqueekChain PoHW Testnet Simulator initialized (Educational Demo).');
})();

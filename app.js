/**
 * WinkPass Enterprise™ — Zero-Trust Ocular Biometrics
 * Core Logic: MediaPipe FaceMesh -> EAR Calculator -> Gesture State Machine -> SHA-256 Crypto
 */

// --- Global App State ---
const state = {
  activeTab: 'auth', // 'auth' | 'enroll'
  showMesh: true,
  audioEnabled: true,
  threshold: 0.19,
  
  // Master Password (default preset)
  masterSalt: '0xW1NK_S4LT_9901_MIL_SPEC',
  masterHash: '', // computed on init
  defaultKey: ['LEFT', 'RIGHT', 'LEFT', 'BOTH'],
  
  // Current Buffers
  authTokens: [],
  enrollTokens: [],
  
  // Wink Detection State Machine
  leftEarHistory: [],
  rightEarHistory: [],
  winkCandidate: null, // 'LEFT' | 'RIGHT' | 'BOTH' | null
  candidateStartTime: 0,
  isLockedOut: false,
  cooldownUntil: 0,
  
  // Stats
  fps: 0,
  lastFrameTime: performance.now(),
  frameCount: 0
};

// --- DOM Elements ---
const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('outputCanvas');
const canvasCtx = canvasElement.getContext('2d');
const cameraLoader = document.getElementById('cameraLoader');
const fpsDisplay = document.getElementById('fpsDisplay');

const leftEarVal = document.getElementById('leftEarVal');
const rightEarVal = document.getElementById('rightEarVal');
const leftEarMeter = document.getElementById('leftEarMeter');
const rightEarMeter = document.getElementById('rightEarMeter');
const leftEyeHud = document.getElementById('leftEyeHud');
const rightEyeHud = document.getElementById('rightEyeHud');
const leftEyeState = document.getElementById('leftEyeState');
const rightEyeState = document.getElementById('rightEyeState');

const thresholdSlider = document.getElementById('thresholdSlider');
const thresholdVal = document.getElementById('thresholdVal');
const toggleMeshBtn = document.getElementById('toggleMeshBtn');
const toggleAudioBtn = document.getElementById('toggleAudioBtn');

const tabAuth = document.getElementById('tabAuth');
const tabEnroll = document.getElementById('tabEnroll');
const authModePanel = document.getElementById('authModePanel');
const enrollModePanel = document.getElementById('enrollModePanel');

const tokenContainer = document.getElementById('tokenContainer');
const tokenCount = document.getElementById('tokenCount');
const clearTokensBtn = document.getElementById('clearTokensBtn');
const verifyBtn = document.getElementById('verifyBtn');

const enrollTokenContainer = document.getElementById('enrollTokenContainer');
const enrollTokenCount = document.getElementById('enrollTokenCount');
const clearEnrollBtn = document.getElementById('clearEnrollBtn');
const saveEnrollBtn = document.getElementById('saveEnrollBtn');

const resultBanner = document.getElementById('resultBanner');
const resultIcon = document.getElementById('resultIcon');
const resultTitle = document.getElementById('resultTitle');
const resultMsg = document.getElementById('resultMsg');
const terminalLogs = document.getElementById('terminalLogs');

// --- Web Audio Synthesizer (Sci-Fi Sound FX) ---
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) audioCtx = new AudioContext();
  }
}

function playTone(frequency, type = 'sine', duration = 0.15, volume = 0.2) {
  if (!state.audioEnabled) return;
  try {
    initAudio();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);

    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {
    console.warn('Audio playback inhibited:', e);
  }
}

function playSoundEffect(name) {
  if (!state.audioEnabled) return;
  if (name === 'WINK_LEFT') {
    playTone(720, 'sine', 0.12, 0.25);
  } else if (name === 'WINK_RIGHT') {
    playTone(940, 'sine', 0.12, 0.25);
  } else if (name === 'WINK_BOTH') {
    playTone(1200, 'triangle', 0.18, 0.3);
  } else if (name === 'ACCESS_GRANTED') {
    // Sci-Fi Arpeggio
    setTimeout(() => playTone(523.25, 'sine', 0.12, 0.3), 0);
    setTimeout(() => playTone(659.25, 'sine', 0.12, 0.3), 100);
    setTimeout(() => playTone(783.99, 'sine', 0.15, 0.3), 200);
    setTimeout(() => playTone(1046.50, 'sine', 0.35, 0.4), 300);
  } else if (name === 'ACCESS_DENIED') {
    // Error Buzz
    playTone(150, 'sawtooth', 0.25, 0.3);
    setTimeout(() => playTone(120, 'sawtooth', 0.35, 0.35), 200);
  }
}

// --- Cryptographic Hashing Utilities (Web Crypto SHA-256) ---
async function computeHash(tokens) {
  const message = state.masterSalt + '::' + tokens.join('-');
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function initMasterPassword() {
  const savedHash = localStorage.getItem('WINKPASS_MASTER_HASH');
  if (savedHash) {
    state.masterHash = savedHash;
    logTerminal(`[VAULT_KEY] Loaded existing master biometric key hash from encrypted storage.`, 'cyan');
  } else {
    state.masterHash = await computeHash(state.defaultKey);
    localStorage.setItem('WINKPASS_MASTER_HASH', state.masterHash);
    logTerminal(`[VAULT_KEY] Initialized default master key: SHA-256(${state.defaultKey.join('-')})`, 'cyan');
  }
}

// --- Terminal Logger ---
function logTerminal(msg, colorClass = '') {
  const line = document.createElement('div');
  line.className = `log-line ${colorClass}`;
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
  line.textContent = `[${timestamp}] ${msg}`;
  terminalLogs.appendChild(line);
  terminalLogs.scrollTop = terminalLogs.scrollHeight;

  // Keep terminal clean (max 80 lines)
  while (terminalLogs.children.length > 80) {
    terminalLogs.removeChild(terminalLogs.firstChild);
  }
}

// --- Eye Aspect Ratio (EAR) Math ---
function distance(p1, p2, w, h) {
  const dx = (p1.x - p2.x) * w;
  const dy = (p1.y - p2.y) * h;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculates Eye Aspect Ratio (EAR)
 * p1, p4: horizontal eye corners
 * p2, p6 & p3, p5: vertical top/bottom lid landmarks
 */
function calculateEAR(p1, p2, p3, p4, p5, p6, w, h) {
  const vertical1 = distance(p2, p6, w, h);
  const vertical2 = distance(p3, p5, w, h);
  const horizontal = distance(p1, p4, w, h);
  if (horizontal <= 0.001) return 0;
  return (vertical1 + vertical2) / (2.0 * horizontal);
}

// Landmark Indices from Google MediaPipe Face Mesh
// Left Eye (Anatomical Left):
// Corners: 362 (inner), 263 (outer)
// Upper: 386, 385 | Lower: 374, 380
// Right Eye (Anatomical Right):
// Corners: 33 (outer), 133 (inner)
// Upper: 159, 160 | Lower: 145, 144
const LEFT_EYE_LANDMARKS = {
  p1: 362, p2: 386, p3: 385,
  p4: 263, p5: 380, p6: 374
};

const RIGHT_EYE_LANDMARKS = {
  p1: 33,  p2: 159, p3: 160,
  p4: 133, p5: 144, p6: 145
};

// --- Gesture State Machine ---
function processOcularGestures(leftEAR, rightEAR) {
  const now = performance.now();
  const thresh = state.threshold;

  // Check eye states
  const leftClosed = leftEAR < thresh;
  const rightClosed = rightEAR < thresh;
  const bothOpen = leftEAR >= thresh + 0.02 && rightEAR >= thresh + 0.02;

  // Update Eye HUD Boxes
  if (leftClosed) {
    leftEyeHud.classList.add('closed');
    leftEyeState.textContent = 'WINK';
  } else {
    leftEyeHud.classList.remove('closed');
    leftEyeState.textContent = 'OPEN';
  }

  if (rightClosed) {
    rightEyeHud.classList.add('closed');
    rightEyeState.textContent = 'WINK';
  } else {
    rightEyeHud.classList.remove('closed');
    rightEyeState.textContent = 'OPEN';
  }

  // Handle Cooldown / Lockout: Must reopen both eyes before next gesture
  if (state.isLockedOut) {
    if (bothOpen) {
      if (now >= state.cooldownUntil) {
        state.isLockedOut = false;
        state.winkCandidate = null;
        logTerminal(`[STATE_MACHINE] Ocular sensor reset. Ready for next token.`, 'text-muted');
      }
    }
    return;
  }

  // Identify Current Gesture Candidate
  let currentGesture = null;
  if (leftClosed && rightClosed) {
    currentGesture = 'BOTH';
  } else if (leftClosed && rightEAR >= thresh + 0.03) {
    currentGesture = 'LEFT';
  } else if (rightClosed && leftEAR >= thresh + 0.03) {
    currentGesture = 'RIGHT';
  }

  if (currentGesture) {
    if (state.winkCandidate === currentGesture) {
      // Candidate held: verify duration (must hold for at least 110ms to debounce noise)
      const duration = now - state.candidateStartTime;
      if (duration >= 110) {
        // Confirmed Wink Event!
        triggerWinkEvent(currentGesture);
        state.isLockedOut = true;
        state.cooldownUntil = now + 240; // 240ms lockout
        state.winkCandidate = null;
      }
    } else {
      // New candidate observed
      state.winkCandidate = currentGesture;
      state.candidateStartTime = now;
    }
  } else {
    state.winkCandidate = null;
  }
}

// --- Trigger Wink Event ---
function triggerWinkEvent(gesture) {
  playSoundEffect(`WINK_${gesture}`);

  const gestureLabels = {
    'LEFT': '👁️ LEFT WINK',
    'RIGHT': 'RIGHT WINK 👁️',
    'BOTH': '🔒 DOUBLE WINK'
  };

  logTerminal(`[GESTURE_CAPTURED] Verified ${gesture} wink (EAR delta exceeded)`, 'cyan');

  if (state.activeTab === 'auth') {
    state.authTokens.push(gesture);
    renderTokens();
    logTerminal(`[BUFFER] Token appended: ${gesture}. Total: ${state.authTokens.length}`, 'yellow');
    
    // Auto-verify if buffer reaches 4 tokens
    if (state.authTokens.length === 4) {
      setTimeout(() => verifyPassword(), 300);
    }
  } else {
    state.enrollTokens.push(gesture);
    renderEnrollTokens();
    logTerminal(`[ENROLL_BUFFER] Master key candidate: ${gesture} (Total: ${state.enrollTokens.length})`, 'magenta');
  }
}

// --- Token Rendering ---
function renderTokens() {
  tokenContainer.innerHTML = '';
  if (state.authTokens.length === 0) {
    tokenContainer.innerHTML = '<span class="empty-prompt">Wink with your left or right eye to enter password...</span>';
    tokenCount.textContent = '0 / 4 INPUTS';
    return;
  }

  tokenCount.textContent = `${state.authTokens.length} / 4 INPUTS`;

  state.authTokens.forEach((token, index) => {
    const el = document.createElement('div');
    el.className = `wink-token ${token.toLowerCase()}`;
    const icon = token === 'LEFT' ? '👁️‍🗨️' : (token === 'RIGHT' ? '👁️' : '🕶️');
    el.innerHTML = `<span>${icon}</span> <span>${token}</span>`;
    tokenContainer.appendChild(el);
  });
}

function renderEnrollTokens() {
  enrollTokenContainer.innerHTML = '';
  if (state.enrollTokens.length === 0) {
    enrollTokenContainer.innerHTML = '<span class="empty-prompt">Wink with your eyes to build your custom key...</span>';
    enrollTokenCount.textContent = '0 TOKENS';
    return;
  }

  enrollTokenCount.textContent = `${state.enrollTokens.length} TOKENS`;

  state.enrollTokens.forEach((token) => {
    const el = document.createElement('div');
    el.className = `wink-token ${token.toLowerCase()}`;
    const icon = token === 'LEFT' ? '👁️‍🗨️' : (token === 'RIGHT' ? '👁️' : '🕶️');
    el.innerHTML = `<span>${icon}</span> <span>${token}</span>`;
    enrollTokenContainer.appendChild(el);
  });
}

// --- Authentication Verification ---
async function verifyPassword() {
  if (state.authTokens.length === 0) {
    logTerminal(`[AUTH_WARN] Input buffer is empty. Wink to register tokens.`, 'yellow');
    return;
  }

  logTerminal(`[AUTH_EXEC] Commencing SHA-256 biometric digest on token sequence...`, 'text-muted');
  const inputHash = await computeHash(state.authTokens);

  logTerminal(`[DIGEST] Calculated Hash: ${inputHash.slice(0, 16)}...`, 'text-muted');
  logTerminal(`[VAULT] Comparing against Master Hash: ${state.masterHash.slice(0, 16)}...`, 'text-muted');

  if (inputHash === state.masterHash) {
    // Access Granted
    playSoundEffect('ACCESS_GRANTED');
    resultBanner.className = 'result-banner success';
    resultIcon.textContent = '🔓';
    resultTitle.textContent = 'ACCESS GRANTED // VAULT UNLOCKED';
    resultMsg.textContent = `Zero-Knowledge Ocular Proof verified. Cryptographic match: ${inputHash.slice(0, 24)}...`;
    logTerminal(`[AUTH_SUCCESS] 256-BIT OCULAR KEY MATCH CONFIRMED. SESSION DECRYPTED!`, 'green');
  } else {
    // Access Denied
    playSoundEffect('ACCESS_DENIED');
    resultBanner.className = 'result-banner error';
    resultIcon.textContent = '🚫';
    resultTitle.textContent = 'ACCESS DENIED // CHECKSUM MISMATCH';
    resultMsg.textContent = 'Unauthorized ocular signature detected. Audit log recorded.';
    logTerminal(`[AUTH_FAIL] Cryptographic integrity verification failed. Access blocked.`, 'magenta');
  }
}

// --- Save New Master Key (Enrollment) ---
async function saveMasterKey() {
  if (state.enrollTokens.length < 3) {
    alert('Security requirement: Wink password must contain at least 3 gestures!');
    return;
  }

  const newHash = await computeHash(state.enrollTokens);
  state.masterHash = newHash;
  localStorage.setItem('WINKPASS_MASTER_HASH', newHash);

  logTerminal(`[ENROLL_SUCCESS] Master ocular key updated. New hash: ${newHash.slice(0, 24)}...`, 'green');
  alert(`Master Key Enrolled Successfully!\nSequence: ${state.enrollTokens.join(' -> ')}\nSHA-256 Hash stored to encrypted browser vault.`);

  // Switch back to Auth Tab
  tabAuth.click();
}

// --- MediaPipe Face Mesh Pipeline ---
function onResults(results) {
  // Hide initial loader
  if (!cameraLoader.classList.contains('hidden')) {
    cameraLoader.classList.add('hidden');
    logTerminal('[AI_READY] MediaPipe 468-point neural tensor online.', 'green');
  }

  // Calculate FPS
  state.frameCount++;
  const now = performance.now();
  if (now - state.lastFrameTime >= 1000) {
    state.fps = state.frameCount;
    state.frameCount = 0;
    state.lastFrameTime = now;
    fpsDisplay.textContent = `FPS: ${state.fps} | MESH: 468 PTS`;
  }

  const w = canvasElement.width;
  const h = canvasElement.height;

  // Draw camera video frame to canvas
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, w, h);
  canvasCtx.drawImage(results.image, 0, 0, w, h);

  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    const landmarks = results.multiFaceLandmarks[0];

    // Compute Left Eye EAR
    const leftEAR = calculateEAR(
      landmarks[LEFT_EYE_LANDMARKS.p1],
      landmarks[LEFT_EYE_LANDMARKS.p2],
      landmarks[LEFT_EYE_LANDMARKS.p3],
      landmarks[LEFT_EYE_LANDMARKS.p4],
      landmarks[LEFT_EYE_LANDMARKS.p5],
      landmarks[LEFT_EYE_LANDMARKS.p6],
      w, h
    );

    // Compute Right Eye EAR
    const rightEAR = calculateEAR(
      landmarks[RIGHT_EYE_LANDMARKS.p1],
      landmarks[RIGHT_EYE_LANDMARKS.p2],
      landmarks[RIGHT_EYE_LANDMARKS.p3],
      landmarks[RIGHT_EYE_LANDMARKS.p4],
      landmarks[RIGHT_EYE_LANDMARKS.p5],
      landmarks[RIGHT_EYE_LANDMARKS.p6],
      w, h
    );

    // Update Telemetry Display
    leftEarVal.textContent = `${leftEAR.toFixed(3)} EAR`;
    rightEarVal.textContent = `${rightEAR.toFixed(3)} EAR`;

    // Update Meter Fills (normalize ~0.10 to 0.35)
    const leftPct = Math.min(Math.max((leftEAR - 0.10) / (0.35 - 0.10) * 100, 0), 100);
    const rightPct = Math.min(Math.max((rightEAR - 0.10) / (0.35 - 0.10) * 100, 0), 100);
    leftEarMeter.style.width = `${leftPct}%`;
    rightEarMeter.style.width = `${rightPct}%`;

    // Process State Machine
    processOcularGestures(leftEAR, rightEAR);

    // Draw Visual HUD on Face (Cyber Crosshairs around eyes)
    if (state.showMesh) {
      drawCyberReticle(canvasCtx, landmarks, LEFT_EYE_LANDMARKS, '#00f0ff', leftEAR < state.threshold);
      drawCyberReticle(canvasCtx, landmarks, RIGHT_EYE_LANDMARKS, '#a855f7', rightEAR < state.threshold);
    }
  }

  canvasCtx.restore();
}

// Draw futuristic eye targeting reticle
function drawCyberReticle(ctx, landmarks, eyeIndices, color, isClosed) {
  const p1 = landmarks[eyeIndices.p1];
  const p4 = landmarks[eyeIndices.p4];
  const cx = ((p1.x + p4.x) / 2) * canvasElement.width;
  const cy = ((p1.y + p4.y) / 2) * canvasElement.height;
  const radius = Math.abs(p1.x - p4.x) * canvasElement.width * 0.8;

  ctx.beginPath();
  ctx.strokeStyle = isClosed ? '#f43f5e' : color;
  ctx.lineWidth = isClosed ? 3 : 1.5;
  ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
  ctx.stroke();

  // Crosshairs
  ctx.beginPath();
  ctx.moveTo(cx - radius - 5, cy);
  ctx.lineTo(cx + radius + 5, cy);
  ctx.moveTo(cx, cy - radius - 5);
  ctx.lineTo(cx, cy + radius + 5);
  ctx.stroke();
}

// --- Initialize MediaPipe & Webcam ---
async function startCamera() {
  logTerminal('[SYS_BOOT] Requesting hardware webcam access...', 'text-muted');

  const faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
  });

  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  faceMesh.onResults(onResults);

  const camera = new Camera(videoElement, {
    onFrame: async () => {
      await faceMesh.send({ image: videoElement });
    },
    width: 640,
    height: 480
  });

  // Set canvas dimensions
  canvasElement.width = 640;
  canvasElement.height = 480;

  try {
    await camera.start();
    logTerminal('[CAMERA] Optical sensor feed streaming at 640x480.', 'green');
  } catch (err) {
    console.error('Camera failed to initialize:', err);
    logTerminal(`[CAMERA_ERR] Unable to access webcam: ${err.message}`, 'magenta');
    cameraLoader.innerHTML = `<p style="color:#f43f5e">Camera Access Denied or Unavailable.</p><p style="font-size:0.75rem">Please allow camera permissions in your browser bar.</p>`;
  }
}

// --- Event Listeners ---
thresholdSlider.addEventListener('input', (e) => {
  state.threshold = parseFloat(e.target.value);
  thresholdVal.textContent = state.threshold.toFixed(2);
});

toggleMeshBtn.addEventListener('click', () => {
  state.showMesh = !state.showMesh;
  toggleMeshBtn.textContent = `FACEMESH: ${state.showMesh ? 'ON' : 'OFF'}`;
});

toggleAudioBtn.addEventListener('click', () => {
  state.audioEnabled = !state.audioEnabled;
  toggleAudioBtn.textContent = `AUDIO: ${state.audioEnabled ? 'ON' : 'OFF'}`;
});

clearTokensBtn.addEventListener('click', () => {
  state.authTokens = [];
  renderTokens();
  resultBanner.className = 'result-banner';
  resultIcon.textContent = '🔒';
  resultTitle.textContent = 'VAULT LOCKED';
  resultMsg.textContent = 'Awaiting encrypted sequence verification...';
  logTerminal('[BUFFER] Sequence cleared by operator.', 'text-muted');
});

verifyBtn.addEventListener('click', () => {
  verifyPassword();
});

clearEnrollBtn.addEventListener('click', () => {
  state.enrollTokens = [];
  renderEnrollTokens();
  logTerminal('[ENROLL] Enrollment buffer cleared.', 'text-muted');
});

saveEnrollBtn.addEventListener('click', () => {
  saveMasterKey();
});

tabAuth.addEventListener('click', () => {
  state.activeTab = 'auth';
  tabAuth.classList.add('active');
  tabEnroll.classList.remove('active');
  authModePanel.classList.remove('hidden');
  enrollModePanel.classList.add('hidden');
  logTerminal('[MODE] Switched to ACCESS TERMINAL mode.', 'text-muted');
});

tabEnroll.addEventListener('click', () => {
  state.activeTab = 'enroll';
  tabEnroll.classList.add('active');
  tabAuth.classList.remove('active');
  enrollModePanel.classList.remove('hidden');
  authModePanel.classList.add('hidden');
  state.enrollTokens = [];
  renderEnrollTokens();
  logTerminal('[MODE] Switched to KEY ENROLLMENT mode. Wink to build sequence.', 'yellow');
});

// Window startup
window.addEventListener('DOMContentLoaded', async () => {
  await initMasterPassword();
  startCamera();
});

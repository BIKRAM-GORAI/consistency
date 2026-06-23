// robot.js - Modular Focus Activity Robot
console.log("[Module] robot.js initializing...");

let robotActive = false;
let deviceOrientation = localStorage.getItem('consistency_robot_orientation') || 'portrait';
let trackingActive = false;
let stream = null;
let tracker = null;
let trackingLoopId = null;

// Gaze and Focus tracking state
let currentEmotion = 'sleeping';
let focusTimeSeconds = 0;
let distractionTimeSeconds = 0;
let faceLostFrames = 0;
let lastTickTime = Date.now();

// Calibration Offsets
let calibrated = false;
let offsetYaw = 0;
let offsetPitch = 0;
let offsetPupilX = 0;
let offsetPupilY = 0;

// Camera Preview Toggle
let showCameraPreview = false;

// Audio Synthesizer
let audioCtx = null;
let soundEnabled = true;

// Calibration sampling variables
let isCalibrating = false;
let calibrationSamples = [];

// Expose to window for HTML element event handlers
window.toggleFocusRobot = toggleFocusRobot;
window.setRobotOrientation = setRobotOrientation;
window.calibrateRobotGaze = calibrateRobotGaze;
window.toggleRobotCameraPreview = toggleRobotCameraPreview;
window.resetRobotOrientation = resetRobotOrientation;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function playGlitchSound() {
  try {
    initAudio();
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    
    // Quick burst of frequencies
    for (let i = 0; i < 4; i++) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150 + Math.random() * 600, now + i * 0.08);
      
      gain.gain.setValueAtTime(0.08, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.08 + 0.06);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.07);
    }
  } catch (e) {
    console.warn("Audio failed:", e);
  }
}

function playAlertSound() {
  if (!soundEnabled) return;
  try {
    initAudio();
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    
    // Angry low buzzer sound
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(110, now); // Low buzz
    
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(112, now); // Detuned for fatness
    
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc1.start(now);
    osc2.start(now);
    
    osc1.stop(now + 0.5);
    osc2.stop(now + 0.5);
  } catch (e) {}
}

function playSuccessChime() {
  if (!soundEnabled) return;
  try {
    initAudio();
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    
    // High arpeggio chime
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);
      
      gain.gain.setValueAtTime(0.1, now + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.4);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 0.5);
    });
  } catch (e) {}
}

function toggleFocusRobot(checked) {
  robotActive = checked;
  const overlay = document.getElementById('robot-glitch-overlay');
  
  if (overlay) {
    overlay.classList.add('active');
    playGlitchSound();
  }

  setTimeout(() => {
    if (overlay) overlay.classList.remove('active');
    
    const tabs = document.querySelector('.pomo-tabs');
    const timerBlock = document.getElementById('pomo-timer-block');
    const stopwatchBlock = document.getElementById('pomo-stopwatch-block');
    const wakeLock = document.querySelector('.pomo-wake-lock');
    const robotBlock = document.getElementById('pomo-robot-block');
    const card = document.querySelector('.pomo-card');
    
    if (checked) {
      if (card) card.classList.add('robot-active-card');
      // Hide standard UI
      if (tabs) tabs.style.display = 'none';
      if (timerBlock) timerBlock.style.display = 'none';
      if (stopwatchBlock) stopwatchBlock.style.display = 'none';
      if (wakeLock) wakeLock.style.display = 'none';
      
      // Show robot block
      if (robotBlock) robotBlock.style.display = 'block';
      
      const savedOrientation = localStorage.getItem('consistency_robot_orientation');
      if (savedOrientation) {
        deviceOrientation = savedOrientation;
        document.getElementById('robot-setup-screen').style.display = 'none';
        document.getElementById('robot-active-screen').style.display = 'block';
        applyOrientationStyles();
        startTracking();
      } else {
        document.getElementById('robot-setup-screen').style.display = 'block';
        document.getElementById('robot-active-screen').style.display = 'none';
      }
    } else {
      if (card) card.classList.remove('robot-active-card');
      // Deactivate tracking
      stopTracking();
      
      // Show standard UI
      if (robotBlock) robotBlock.style.display = 'none';
      if (tabs) tabs.style.display = 'flex';
      
      // Restore appropriate tab block
      const isStopwatchActive = document.getElementById('pomo-subtab-stopwatch')?.classList.contains('active');
      if (isStopwatchActive) {
        if (stopwatchBlock) stopwatchBlock.style.display = 'block';
      } else {
        if (timerBlock) timerBlock.style.display = 'block';
      }
      if (wakeLock) wakeLock.style.display = 'flex';
    }
  }, 800);
}

function setRobotOrientation(orientation) {
  deviceOrientation = orientation;
  localStorage.setItem('consistency_robot_orientation', orientation);
  
  document.getElementById('robot-setup-screen').style.display = 'none';
  document.getElementById('robot-active-screen').style.display = 'block';
  
  applyOrientationStyles();
  startTracking();
}

function resetRobotOrientation() {
  stopTracking();
  localStorage.removeItem('consistency_robot_orientation');
  document.getElementById('robot-setup-screen').style.display = 'block';
  document.getElementById('robot-active-screen').style.display = 'none';
}

function applyOrientationStyles() {
  const wrapper = document.getElementById('robot-layout-wrapper');
  const activeScreen = document.getElementById('robot-active-screen');
  
  if (deviceOrientation === 'landscape') {
    if (activeScreen) activeScreen.classList.add('layout-landscape');
    if (wrapper) wrapper.style.flexDirection = 'row';
  } else {
    if (activeScreen) activeScreen.classList.remove('layout-landscape');
    if (wrapper) wrapper.style.flexDirection = 'column';
  }
}

async function startTracking() {
  if (trackingActive) return;
  
  const video = document.getElementById('robot-video');
  const statusEl = document.getElementById('robot-tracking-status');
  updateEmotion('searching');
  setSpeechBubble("BEEP BOOP! Activating optical scanners...");
  
  try {
    initAudio(); // Warm up audio context
    
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 160 },
        height: { ideal: 120 }
      },
      audio: false
    });
    
    if (video) {
      video.srcObject = stream;
      
      let initTriggered = false;
      const attemptInit = () => {
        if (initTriggered) return;
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          initTriggered = true;
          initTracker();
        }
      };
      
      video.onloadedmetadata = () => {
        video.play().catch(e => console.warn("Video play failed:", e));
        attemptInit();
      };
      
      video.onplaying = () => {
        attemptInit();
      };
      
      // Fallback polling for slow loading streams
      const intervalId = setInterval(() => {
        if (initTriggered) {
          clearInterval(intervalId);
        } else if (stream && stream.active) {
          attemptInit();
        } else {
          clearInterval(intervalId);
        }
      }, 100);
    }
    
    trackingActive = true;
    if (statusEl) {
      statusEl.textContent = "ACTIVE";
      statusEl.style.color = "var(--teal)";
    }
  } catch (err) {
    console.error("Camera access failed:", err);
    setSpeechBubble("ERROR: Camera permission denied. Please allow camera access to use the robot!");
    if (statusEl) {
      statusEl.textContent = "BLOCKED";
      statusEl.style.color = "var(--coral)";
    }
    // Toggle the robot checkbox off after a short delay
    setTimeout(() => {
      const toggle = document.getElementById('pomo-robot-toggle');
      if (toggle) {
        toggle.checked = false;
        toggleFocusRobot(false);
      }
    }, 3000);
  }
}

function initTracker() {
  const video = document.getElementById('robot-video');
  if (!tracker && window.clm) {
    tracker = new clm.tracker({ scoreThreshold: 0.28 });
    tracker.init(window.pModel);
  }
  
  if (tracker && video) {
    // Explicitly set integer dimensions on the video element for clmtrackr compatibility
    video.width = 160;
    video.height = 120;
    
    // Also ensure canvas has matching dimensions
    const canvas = document.getElementById('robot-canvas');
    if (canvas) {
      canvas.width = 160;
      canvas.height = 120;
    }
    
    tracker.start(video);
    lastTickTime = Date.now();
    trackingLoopId = requestAnimationFrame(trackingLoop);
    setSpeechBubble("Optical stream acquired! Please click 'Calibrate' to set your screen angle!");
  }
}

function stopTracking() {
  trackingActive = false;
  calibrated = false;
  isCalibrating = false;
  calibrationSamples = [];
  
  if (trackingLoopId) {
    cancelAnimationFrame(trackingLoopId);
    trackingLoopId = null;
  }
  
  if (tracker) {
    tracker.stop();
  }
  
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  
  const video = document.getElementById('robot-video');
  if (video) video.srcObject = null;
  
  const canvas = document.getElementById('robot-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  
  const statusEl = document.getElementById('robot-tracking-status');
  if (statusEl) {
    statusEl.textContent = "OFFLINE";
    statusEl.style.color = "var(--coral)";
  }
  
  updateEmotion('sleeping');
  resetPupilTranslation();
}

function resetPupilTranslation() {
  const leftPupil = document.querySelector('#robot-eye-left .robot-pupil');
  const rightPupil = document.querySelector('#robot-eye-right .robot-pupil');
  if (leftPupil) leftPupil.style.transform = 'translate(0px, 0px)';
  if (rightPupil) rightPupil.style.transform = 'translate(0px, 0px)';
}

function calibrateRobotGaze() {
  if (!trackingActive) return;
  
  isCalibrating = true;
  calibrationSamples = [];
  setSpeechBubble("Stare at your focus screen. Calibrating baseline in 3s... Stay still!");
  
  let countdown = 3;
  playSuccessChime(); // soft cue
  
  const timer = setInterval(() => {
    countdown--;
    if (countdown > 0) {
      setSpeechBubble(`Calibrating... ${countdown}`);
    } else {
      clearInterval(timer);
      finishCalibration();
    }
  }, 1000);
}

function finishCalibration() {
  isCalibrating = false;
  if (calibrationSamples.length === 0) {
    setSpeechBubble("Calibration failed! No face detected. Try again in good lighting.");
    return;
  }
  
  // Average the samples
  let sumYaw = 0, sumPitch = 0, sumPupilX = 0, sumPupilY = 0;
  calibrationSamples.forEach(s => {
    sumYaw += s.yaw;
    sumPitch += s.pitch;
    sumPupilX += s.pupilX;
    sumPupilY += s.pupilY;
  });
  
  offsetYaw = sumYaw / calibrationSamples.length;
  offsetPitch = sumPitch / calibrationSamples.length;
  offsetPupilX = sumPupilX / calibrationSamples.length;
  offsetPupilY = sumPupilY / calibrationSamples.length;
  
  calibrated = true;
  focusTimeSeconds = 0;
  distractionTimeSeconds = 0;
  
  setSpeechBubble("BEEP! Calibration complete. Dynamic tracking active!");
  updateEmotion('focused');
  playSuccessChime();
}

function trackingLoop() {
  if (!trackingActive || !robotActive) return;
  
  const video = document.getElementById('robot-video');
  const canvas = document.getElementById('robot-canvas');
  let positions = null;
  
  if (tracker && video) {
    positions = tracker.getCurrentPosition();
  }
  
  const now = Date.now();
  const deltaSeconds = (now - lastTickTime) / 1000;
  lastTickTime = now;
  
  // Render canvas face lines if camera preview is open
  if (canvas && showCameraPreview) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (positions && tracker) {
      tracker.draw(canvas);
    }
  }
  
  const isPomoRunning = checkPomodoroRunning();
  
  if (positions && positions.length > 62) {
    faceLostFrames = 0;
    
    // Extract landmarks
    const cheekL = positions[1];
    const cheekR = positions[13];
    const nose = positions[62];
    
    const cheekWidth = cheekR[0] - cheekL[0];
    const noseRatioX = (nose[0] - cheekL[0]) / cheekWidth;
    const yaw = (noseRatioX - 0.5) * 2; // Face turn left/right (-1 to 1)
    
    // Vertical tilt
    const chin = positions[7];
    const bridge = positions[33];
    const faceHeight = chin[1] - bridge[1];
    const noseRatioY = (nose[1] - bridge[1]) / faceHeight;
    const pitch = (noseRatioY - 0.5) * 2; // Face tilt up/down
    
    // Eye landmarks to estimate scale-invariant pupil offsets:
    const eyeWidthL = positions[25][0] - positions[23][0];
    const eyeBoxL_X = (positions[23][0] + positions[25][0]) / 2;
    const eyeBoxL_Y = (positions[23][1] + positions[25][1]) / 2;
    
    // Normalize pupil offsets by eye width (distance-independent ratios)
    const pupilX = (positions[27][0] - eyeBoxL_X) / (eyeWidthL || 1);
    const pupilY = (positions[27][1] - eyeBoxL_Y) / (eyeWidthL || 1);
    
    if (isCalibrating) {
      calibrationSamples.push({ yaw, pitch, pupilX, pupilY });
    }
    
    // Compute calibrated values
    const correctedYaw = yaw - offsetYaw;
    const correctedPitch = pitch - offsetPitch;
    const correctedPupilX = pupilX - offsetPupilX;
    const correctedPupilY = pupilY - offsetPupilY;
    
    // Move robot pupils in direction of eye gaze
    translatePupils(correctedPupilX, correctedPupilY, correctedYaw, correctedPitch);
    
    if (!isPomoRunning) {
      // Passive tracking: keep eyes open and follow user, but do not show angry alerts
      updateEmotion('focused');
      setSpeechBubble("Pomodoro paused. Ready when you are, human.");
      focusTimeSeconds = 0;
      distractionTimeSeconds = 0;
    } else {
      // Active focus tracking with scale-invariant ratios
      const isLookingAway = 
        Math.abs(correctedYaw) > 0.32 || 
        Math.abs(correctedPitch) > 0.40 ||
        Math.abs(correctedPupilX) > 0.32;
        
      if (isLookingAway) {
        focusTimeSeconds = 0;
        distractionTimeSeconds += deltaSeconds;
        
        if (distractionTimeSeconds >= 5.0) {
          if (currentEmotion !== 'angry') {
            updateEmotion('angry');
            setSpeechBubble("HEY! Keep your eyes on the screen! Focus session is active!");
            playAlertSound();
          }
        } else if (distractionTimeSeconds >= 1.5) {
          if (currentEmotion !== 'suspicious' && currentEmotion !== 'angry') {
            updateEmotion('suspicious');
            setSpeechBubble("Target tracking lost... are you wandering off?");
          }
        }
      } else {
        // User is focusing
        distractionTimeSeconds = 0;
        focusTimeSeconds += deltaSeconds;
        
        if (focusTimeSeconds >= 60.0) {
          if (currentEmotion !== 'happy') {
            updateEmotion('happy');
            setSpeechBubble("Splendid! 1 minute of absolute focus! You're doing great!");
            playSuccessChime();
          }
        } else {
          if (currentEmotion !== 'focused' && currentEmotion !== 'happy') {
            updateEmotion('focused');
            setSpeechBubble("Scanning... focus target detected. Keep it up!");
          }
        }
      }
    }
  } else {
    // Face not detected
    faceLostFrames++;
    resetPupilTranslation();
    
    if (!isPomoRunning) {
      // Go to sleep if paused and no face detected
      updateEmotion('sleeping');
      setSpeechBubble("Pomodoro paused. Ready when you are, human.");
      focusTimeSeconds = 0;
      distractionTimeSeconds = 0;
    } else {
      // Active session face lost
      if (faceLostFrames > 12) {
        focusTimeSeconds = 0;
        distractionTimeSeconds += deltaSeconds;
        
        if (distractionTimeSeconds >= 5.0) {
          if (currentEmotion !== 'angry') {
            updateEmotion('angry');
            setSpeechBubble("ALARM! Focus target is missing or looking away!");
            playAlertSound();
          }
        } else if (distractionTimeSeconds >= 1.5) {
          if (currentEmotion !== 'suspicious' && currentEmotion !== 'angry') {
            updateEmotion('suspicious');
            setSpeechBubble("Target lost! Did you look away?");
          }
        }
      }
    }
  }
  
  trackingLoopId = requestAnimationFrame(trackingLoop);
}

function checkPomodoroRunning() {
  if (typeof window.pomoIsRunning !== 'undefined') {
    return window.pomoIsRunning;
  }
  
  // Fallback: check if start button is in 'paused' mode (which means timer is active)
  const btn = document.getElementById('pomo-start-btn');
  if (btn && btn.classList.contains('paused')) {
    return true;
  }
  return false;
}

function translatePupils(pupilX, pupilY, yaw, pitch) {
  const leftPupil = document.querySelector('#robot-eye-left .robot-pupil');
  const rightPupil = document.querySelector('#robot-eye-right .robot-pupil');
  
  // Since pupilX and pupilY are normalized ratios (around -0.5 to 0.5), we scale them up 
  // by multiplying by 30 to get dynamic pupil translations inside the eye SVGs.
  let translateX = (pupilX * 30) + (yaw * 12);
  let translateY = (pupilY * 30) + (pitch * 12);
  
  // Mirror pupil direction because camera is mirrored
  translateX = -translateX;
  
  // Clamp inside eye container boundaries
  translateX = Math.max(-18, Math.min(18, translateX));
  translateY = Math.max(-18, Math.min(18, translateY));
  
  if (leftPupil) leftPupil.style.transform = `translate(${translateX}px, ${translateY}px)`;
  if (rightPupil) rightPupil.style.transform = `translate(${translateX}px, ${translateY}px)`;
}

function updateEmotion(emotion) {
  currentEmotion = emotion;
  const face = document.getElementById('robot-face');
  const outer = document.getElementById('robot-face-outer');
  
  if (face) face.setAttribute('data-emotion', emotion);
  
  if (outer) {
    if (emotion === 'angry') {
      outer.classList.add('robot-shake-anim');
      outer.style.backgroundColor = '#fee2e2'; // Light red
      outer.style.borderColor = 'var(--coral)';
    } else if (emotion === 'happy') {
      outer.classList.remove('robot-shake-anim');
      outer.style.backgroundColor = '#fef3c7'; // Light gold
      outer.style.borderColor = 'var(--yellow)';
    } else if (emotion === 'focused') {
      outer.classList.remove('robot-shake-anim');
      outer.style.backgroundColor = '#ccfbf1'; // Light teal
      outer.style.borderColor = 'var(--teal)';
    } else if (emotion === 'suspicious') {
      outer.classList.remove('robot-shake-anim');
      outer.style.backgroundColor = '#ffedd5'; // Light orange
      outer.style.borderColor = 'var(--yellow)';
    } else if (emotion === 'searching') {
      outer.classList.remove('robot-shake-anim');
      outer.style.backgroundColor = '#f3e8ff'; // Light purple
      outer.style.borderColor = 'var(--purple)';
    } else {
      // Sleeping
      outer.classList.remove('robot-shake-anim');
      outer.style.backgroundColor = 'var(--bg-muted)';
      outer.style.borderColor = 'var(--black)';
    }
  }
}

function setSpeechBubble(text) {
  const bubble = document.getElementById('robot-speech-bubble');
  if (bubble) bubble.textContent = text;
}

function toggleRobotCameraPreview() {
  showCameraPreview = !showCameraPreview;
  const container = document.getElementById('robot-video-container');
  const btn = document.getElementById('btn-robot-toggle-cam');
  
  if (container) {
    container.style.display = showCameraPreview ? 'block' : 'none';
  }
  
  if (btn) {
    btn.innerHTML = showCameraPreview 
      ? '<i data-lucide="video-off"></i> Hide Cam' 
      : '<i data-lucide="video"></i> Show Cam';
    if (window.lucide) window.lucide.createIcons({ root: btn });
  }
}

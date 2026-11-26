// Skyreef Run: boot, the single animation loop and the five screens. The scene owns the visuals,
// flight.js owns the rules, hud.js the instruments, and this file connects them. A fixed 120 Hz
// simulation step keeps the handling identical at 60, 120 or an uneven frame rate.

import { Vector3 } from 'three';
import { BEST_KEY, COURSE_TIME, STEP } from './config.js';
import { createScene, terrainHeightAt } from './scene.js';
import { createFlight, EVENT_CRASH, EVENT_FINISH, EVENT_RING, EVENT_TIMEOUT } from './flight.js';
import { ACT_CONFIRM, ACT_MUTE, ACT_PAUSE, ACT_RESTART, ACT_VIEW, createInput } from './input.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createUi } from './ui.js';

const MAX_FRAME = 0.15;
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const shotMode = shotName !== null;

const canvas = document.getElementById('world');
const hudCanvas = document.getElementById('hud');
const statusLine = document.getElementById('status');
const telemetry = document.getElementById('telemetry');

const scene = createScene(canvas, { quality: shotMode ? 'high' : 'auto' });
const flight = createFlight();
const hud = createHud(hudCanvas, { scale: scene.lowQuality ? 0.65 : undefined });
const audio = createAudio();
const input = createInput(canvas);

let screen = 'title';
let view = 'chase';
let best = readBest();
let muted = false;
let notice = null;
let environmentTime = 0;
let titleTime = 0;
let propAngle = 0;
let accumulator = 0;
let lastFrame = performance.now();
let lastCountdown = 99;
let ready = false;
let frameCount = 0;
let shotFrames = 0;
let fontsReady = false;
const perf = { renderMs: 0, hudMs: 0, renderAcc: 0, hudAcc: 0, samples: 0 };

const guide = { x: 0, y: 0, inFront: false, distance: 0, index: null };
const cameraForward = new Vector3();
const toRing = new Vector3();
const projected = new Vector3();

function readBest() {
  try {
    const value = Number.parseFloat(window.localStorage.getItem(BEST_KEY) ?? '');
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // A private window just forgets the time; the current flight still counts.
  }
}

const ui = createUi({
  start: startGame,
  resume: resumeGame,
  restart: restartGame,
});

function announce(message) {
  statusLine.textContent = message;
}

function setNotice(text, detail, color, life = 2.2) {
  notice = { text, detail, color, life, maxLife: life };
}

function formatClock(seconds) {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

function updateGuide() {
  const ring = flight.currentRing();
  if (ring === null) {
    guide.index = null;
    return;
  }
  scene.camera.getWorldDirection(cameraForward);
  toRing.copy(ring.center).sub(scene.camera.position);
  const inFront = cameraForward.dot(toRing) > 0;
  projected.copy(ring.center).project(scene.camera);
  let x = (projected.x * 0.5 + 0.5) * window.innerWidth;
  let y = (-projected.y * 0.5 + 0.5) * window.innerHeight;
  if (!inFront) {
    x = window.innerWidth - x;
    y = window.innerHeight - y;
  }
  guide.x = x;
  guide.y = y;
  guide.inFront = inFront;
  guide.distance = flight.state.position.distanceTo(ring.center);
  guide.index = flight.state.ringsPassed;
}

function titlePose(time) {
  flight.setPose({
    x: -300,
    y: 300,
    z: 600,
    heading: 34 + Math.sin(time * 0.22) * 3.5,
    pitch: 0.035 + Math.sin(time * 0.31) * 0.008,
    roll: -0.21 + Math.sin(time * 0.18) * 0.035,
    speed: 150,
    throttle: 0.76,
  });
}

function snapCamera() {
  scene.updateAircraft({
    position: flight.state.position,
    quaternion: flight.state.quaternion,
    view,
    propAngle,
  });
  scene.updateCamera({
    mode: view,
    position: flight.state.position,
    quaternion: flight.state.quaternion,
    time: environmentTime,
    dt: 0,
    snap: true,
  });
}

function beginFlightState() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  flight.reset();
  view = 'chase';
  accumulator = 0;
  lastCountdown = 99;
  lastFrame = performance.now();
  input.resetMouse();
  ui.showPlay();
  audio.start();
  setNotice('COURSE LIVE', 'Five gates · three minutes · good hunting', '#7ef1ff', 2.6);
  snapCamera();
  screen = 'play';
  document.body.dataset.screen = 'play';
  announce('Flight started. Five gates. Course clock three minutes.');
}

function startGame() {
  if (shotMode) return;
  beginFlightState();
}

function restartGame() {
  if (shotMode) return;
  beginFlightState();
}

function pauseGame() {
  if (screen !== 'play') return;
  screen = 'paused';
  ui.showPause();
  audio.pause();
  document.body.dataset.screen = 'paused';
  announce('Paused. Press P to resume.');
}

function resumeGame() {
  if (screen !== 'paused') return;
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  accumulator = 0;
  lastFrame = performance.now();
  input.resetMouse();
  screen = 'play';
  ui.showPlay();
  document.body.dataset.screen = 'play';
  announce('Flight resumed.');
}

function toggleView() {
  if (screen !== 'play' && screen !== 'paused') return;
  view = view === 'chase' ? 'cockpit' : 'chase';
  flight.state.view = view;
  snapCamera();
  setNotice(view === 'cockpit' ? 'COCKPIT VIEW' : 'CHASE VIEW', 'C swaps back at any time', '#7ef1ff', 1.4);
}

function finishGame(reason) {
  screen = 'end';
  const elapsed = reason === 'win' ? flight.state.elapsed : reason === 'timeout' ? COURSE_TIME : flight.state.elapsed;
  let record = best;
  if (reason === 'win' && (best === null || elapsed < best)) {
    record = elapsed;
    best = elapsed;
    saveBest(best);
    ui.setBest(best);
  }
  if (reason === 'win') {
    audio.finish();
    announce(`Course complete. ${flight.state.ringsPassed} gates. Flight time ${formatClock(elapsed)}.`);
  } else if (reason === 'crash') {
    audio.crash();
    announce(`Airframe lost after ${flight.state.ringsPassed} gates.`);
  } else {
    audio.crash();
    announce(`Time expired after ${flight.state.ringsPassed} gates.`);
  }
  audio.pause();
  input.resetMouse();
  notice = null;
  ui.showEnd({
    reason,
    gates: flight.state.ringsPassed,
    total: flight.rings.length,
    flightTime: elapsed,
    best: record,
  });
  document.body.dataset.screen = 'end';
  hud.clear();
}

function handleEvents(events) {
  if (events & EVENT_FINISH) {
    finishGame('win');
    return;
  }
  if (events & EVENT_CRASH) {
    finishGame('crash');
    return;
  }
  if (events & EVENT_TIMEOUT) {
    finishGame('timeout');
    return;
  }
  if (events & EVENT_RING) {
    audio.chime();
    const cleared = flight.state.ringsPassed;
    const left = flight.rings.length - cleared;
    const detail = left === 0 ? 'All five gates cleared' : `${left} gate${left === 1 ? '' : 's'} to go · ${formatClock(flight.state.timeLeft)} left`;
    setNotice(`GATE ${cleared} CLEARED`, detail, '#8df7d0', 2.6);
    announce(`Gate ${cleared} cleared. ${left} to go.`);
    if (cleared === flight.rings.length - 1) lastCountdown = 99;
  }
}

function handleActions() {
  const actions = input.takeActions();
  if (actions & ACT_MUTE) {
    muted = audio.toggleMute();
    setNotice(muted ? 'SOUND OFF' : 'SOUND ON', 'M toggles the synthesised audio', muted ? '#ff6b5e' : '#7ef1ff', 1.4);
  }
  if (actions & ACT_PAUSE) {
    if (screen === 'play') pauseGame();
    else if (screen === 'paused') resumeGame();
  }
  if (actions & ACT_VIEW) toggleView();
  if (actions & ACT_CONFIRM) {
    if (screen === 'title') startGame();
    else if (screen === 'paused') resumeGame();
    else if (screen === 'end') restartGame();
  }
  if (actions & ACT_RESTART) {
    if (screen === 'end') restartGame();
  }
}

function updateTelemetry() {
  const state = flight.state;
  const speedKt = Math.round(state.speed * 1.94384);
  const altitudeFt = Math.round(state.altitude * 3.28084);
  const heading = Math.round(state.heading) % 360;
  const throttle = Math.round(state.throttle * 100);
  telemetry.textContent = `ALT ${altitudeFt} FT | SPD ${speedKt} KT | HDG ${heading} | THR ${throttle}% | RINGS ${state.ringsPassed}/${flight.rings.length} | TIME ${formatClock(state.timeLeft)}`;
}

function stepSimulation(dt) {
  accumulator += dt;
  let steps = 0;
  const axes = input.axes();
  while (accumulator >= STEP && steps < 24) {
    const events = flight.step(STEP, axes, terrainHeightAt);
    accumulator -= STEP;
    steps += 1;
    if (events !== 0) handleEvents(events);
    if (screen !== 'play') break;
  }
  if (steps === 24) accumulator = 0;
  if (screen !== 'play') return;
  if (flight.state.timeLeft <= 10 && flight.state.timeLeft > 0) {
    const second = Math.ceil(flight.state.timeLeft);
    if (second !== lastCountdown) {
      lastCountdown = second;
      audio.tick();
    }
  }
  audio.update({ speed: flight.state.speed, throttle: flight.state.throttle, paused: false });
}

function renderPlay(dt) {
  scene.updateAircraft({
    position: flight.state.position,
    quaternion: flight.state.quaternion,
    view,
    propAngle,
  });
  scene.updateCamera({
    mode: view,
    position: flight.state.position,
    quaternion: flight.state.quaternion,
    time: environmentTime,
    dt,
    snap: false,
  });
  scene.setRingStates(flight.state.ringsPassed, environmentTime);
  scene.updateEnvironment(environmentTime, scene.camera.position);
  const renderStart = performance.now();
  scene.render();
  const renderEnd = performance.now();
  updateGuide();
  hud.draw({
    state: flight.state,
    view,
    guide,
    notice,
    time: environmentTime,
    muted,
  });
  const hudEnd = performance.now();
  perf.renderAcc += renderEnd - renderStart;
  perf.hudAcc += hudEnd - renderEnd;
  perf.samples += 1;
  if (perf.samples >= 4) {
    perf.renderMs = perf.renderAcc / perf.samples;
    perf.hudMs = perf.hudAcc / perf.samples;
    perf.renderAcc = 0;
    perf.hudAcc = 0;
    perf.samples = 0;
  }
}

function renderTitle(dt) {
  titleTime += dt;
  titlePose(titleTime);
  propAngle += dt * 24;
  scene.updateAircraft({
    position: flight.state.position,
    quaternion: flight.state.quaternion,
    view: 'chase',
    propAngle,
  });
  scene.titleCamera(flight.state.position, titleTime);
  scene.setRingStates(0, environmentTime);
  scene.updateEnvironment(environmentTime, scene.camera.position);
  scene.render();
  hud.clear();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(Math.max(0, (now - lastFrame) / 1000), MAX_FRAME);
  lastFrame = now;
  environmentTime += dt;
  handleActions();

  if (screen === 'play') {
    stepSimulation(dt);
  }
  if (screen === 'play') {
    propAngle += dt * (18 + flight.state.throttle * 46);
    renderPlay(dt);
  } else if (screen === 'title') {
    renderTitle(dt);
  } else {
    // Pause and result screens keep the last rendered 3D frame under their panels.
    scene.updateEnvironment(environmentTime, scene.camera.position);
    scene.render();
    if (screen === 'paused') {
      updateGuide();
      hud.draw({ state: flight.state, view, guide, notice, time: environmentTime, muted });
    }
  }

  if (notice) {
    notice.life -= dt;
    if (notice.life <= 0) notice = null;
  }
  updateTelemetry();
  frameCount += 1;
  if (!ready && frameCount > 3) {
    ready = true;
    window.__skyreef.ready = true;
    document.documentElement.dataset.ready = 'true';
  }
}

// ---------------------------------------------------------------- staged screenshot frames

function stageFrame(name) {
  document.documentElement.classList.add('shot');
  environmentTime = 12.4;
  if (name === 'title' || name === '4-title') {
    screen = 'title';
    titlePose(9.5);
    propAngle = 2.1;
    ui.showTitle(best);
    view = 'chase';
    scene.titleCamera(flight.state.position, 9.5);
    hud.clear();
    document.body.dataset.screen = 'title';
  } else {
    const stage = name === 'cockpit' || name === '2-cockpit' ? 'cockpit' : name === 'runway' || name === '3-ring' ? 'runway' : name === 'ring' ? 'ring' : 'chase';
    screen = 'play';
    flight.stage(stage);
    view = flight.state.view;
    propAngle = 1.3;
    ui.showPlay();
    document.body.dataset.screen = 'play';
    snapCamera();
    scene.updateAircraft({ position: flight.state.position, quaternion: flight.state.quaternion, view, propAngle });
    scene.updateCamera({
      mode: view,
      position: flight.state.position,
      quaternion: flight.state.quaternion,
      time: environmentTime,
      dt: 0,
      snap: true,
    });
    scene.setRingStates(flight.state.ringsPassed, environmentTime);
    scene.updateEnvironment(environmentTime, scene.camera.position);
    scene.render();
    updateGuide();
    hud.draw({ state: flight.state, view, guide, notice: null, time: environmentTime, muted });
  }
  updateTelemetry();
}

function runShot(name) {
  stageFrame(name);
  document.fonts.ready.then(() => {
    fontsReady = true;
  });
  function shotFrame() {
    requestAnimationFrame(shotFrame);
    shotFrames += 1;
    if (name === 'title' || name === '4-title') {
      scene.titleCamera(flight.state.position, 9.5);
    } else {
      scene.updateAircraft({ position: flight.state.position, quaternion: flight.state.quaternion, view, propAngle });
      scene.updateCamera({
        mode: view,
        position: flight.state.position,
        quaternion: flight.state.quaternion,
        time: environmentTime,
        dt: 0,
        snap: true,
      });
    }
    scene.setRingStates(flight.state.ringsPassed, environmentTime);
    scene.updateEnvironment(environmentTime, scene.camera.position);
    scene.render();
    if (screen === 'play') {
      updateGuide();
      hud.draw({ state: flight.state, view, guide, notice: null, time: environmentTime, muted });
    } else {
      hud.clear();
    }
    if (shotFrames > 4 && fontsReady) window.__shotReady = true;
    updateTelemetry();
  }
  requestAnimationFrame(shotFrame);
}

// ---------------------------------------------------------------- public test hooks

window.__skyreef = {
  ready,
  get state() {
    return {
      screen,
      view,
      paused: screen === 'paused',
      altitudeFt: Math.round(flight.state.altitude * 3.28084),
      speedKt: Math.round(flight.state.speed * 1.94384),
      heading: Math.round(flight.state.heading) % 360,
      throttle: Math.round(flight.state.throttle * 100),
      ringsPassed: flight.state.ringsPassed,
      timeLeft: flight.state.timeLeft,
      phase: flight.state.phase,
      bankDeg: Math.round((flight.state.bank * 180) / Math.PI),
      brake: flight.state.brake,
      clearanceFt: Math.round(flight.state.clearance * 3.28084),
    };
  },
  telemetry() {
    return telemetry.textContent;
  },
  perf() {
    return { renderMs: perf.renderMs, hudMs: perf.hudMs };
  },
  stats() {
    return {
      calls: scene.renderer.info.render.calls,
      triangles: scene.renderer.info.render.triangles,
      points: scene.renderer.info.render.points,
      lines: scene.renderer.info.render.lines,
      memory: scene.renderer.info.memory,
    };
  },
  start: startGame,
  debug: {
    ringInfo(index) {
      const ring = flight.rings[index];
      return {
        center: [ring.center.x, ring.center.y, ring.center.z],
        normal: [ring.normal.x, ring.normal.y, ring.normal.z],
        radius: ring.radius,
        heading: ring.heading,
      };
    },
    setPose({ x, y, z, heading = 0, pitch = 0, roll = 0, speed = 140, throttle = 0.8 }) {
      flight.setPose({ x, y, z, heading, pitch, roll, speed, throttle });
      accumulator = 0;
      snapCamera();
    },
    setTimer(seconds) {
      flight.state.timeLeft = seconds;
    },
    placeBeforeRing(index, distance = 260) {
      const ring = flight.rings[index];
      flight.state.ringsPassed = index;
      flight.state.phase = 'flying';
      flight.setPose({
        x: ring.center.x - ring.normal.x * distance,
        y: ring.center.y,
        z: ring.center.z - ring.normal.z * distance,
        heading: ring.heading,
        pitch: 0,
        roll: 0,
        speed: 150,
        throttle: 0.82,
      });
      accumulator = 0;
      snapCamera();
      scene.setRingStates(index, environmentTime);
    },
    forceEnd(reason) {
      finishGame(reason);
    },
  },
};

// ---------------------------------------------------------------- boot

ui.showTitle(best);
document.body.dataset.screen = 'title';
titlePose(0);
scene.updateAircraft({ position: flight.state.position, quaternion: flight.state.quaternion, view: 'chase', propAngle: 0 });
scene.titleCamera(flight.state.position, 0);
scene.updateEnvironment(0, scene.camera.position);
scene.render();
hud.clear();
updateTelemetry();

if (shotMode) {
  runShot(shotName);
} else {
  requestAnimationFrame(frame);
}

// Living without focus should not cost a course; leaving the tab pauses play.
window.addEventListener('blur', () => {
  if (screen === 'play') pauseGame();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === 'play') pauseGame();
});

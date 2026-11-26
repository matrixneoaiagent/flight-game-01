// All sound is synthesised here with WebAudio: a turboprop drone, wind, gate chimes, warnings and
// impact noise. Nothing is fetched and no sample file exists. The graph is built on the first click
// or key press, as browsers require, and stays silent if WebAudio is unavailable.

export function createAudio() {
  let context = null;
  let master = null;
  let engineBus = null;
  let engineA = null;
  let engineB = null;
  let engineFilter = null;
  let windBus = null;
  let lfo = null;
  let lfoGain = null;
  let muted = false;
  let running = false;

  function ensure() {
    if (context !== null) return context;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try {
      context = new Ctor();
    } catch {
      return null;
    }
    master = context.createGain();
    master.gain.value = muted ? 0 : 0.55;
    master.connect(context.destination);

    // Turboprop: two detuned saws through a soft low-pass, plus a slow amplitude wobble.
    engineBus = context.createGain();
    engineBus.gain.value = 0;
    engineFilter = context.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 520;
    engineFilter.Q.value = 0.7;
    engineBus.connect(engineFilter);
    engineFilter.connect(master);

    engineA = context.createOscillator();
    engineA.type = 'sawtooth';
    engineA.frequency.value = 72;
    engineB = context.createOscillator();
    engineB.type = 'square';
    engineB.frequency.value = 36;
    const gainA = context.createGain();
    gainA.gain.value = 0.34;
    const gainB = context.createGain();
    gainB.gain.value = 0.16;
    engineA.connect(gainA);
    engineB.connect(gainB);
    gainA.connect(engineBus);
    gainB.connect(engineBus);

    lfo = context.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 24;
    lfoGain = context.createGain();
    lfoGain.gain.value = 0.07;
    lfo.connect(lfoGain);
    lfoGain.connect(engineBus.gain);

    // Wind: looped white noise through a band-pass, lifted with airspeed.
    const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = Math.random() * 2 - 1;
    }
    const noise = context.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    const windFilter = context.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 760;
    windFilter.Q.value = 0.45;
    windBus = context.createGain();
    windBus.gain.value = 0;
    noise.connect(windFilter);
    windFilter.connect(windBus);
    windBus.connect(master);

    engineA.start();
    engineB.start();
    lfo.start();
    noise.start();
    return context;
  }

  function ramp(param, value, time = 0.08) {
    if (context === null) return;
    try {
      param.setTargetAtTime(value, context.currentTime, time);
    } catch {
      param.value = value;
    }
  }

  function tone(frequency, when, duration, type, level, target = master) {
    if (context === null || target === null) return;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime + when);
    envelope.gain.setValueAtTime(0.0001, context.currentTime + when);
    envelope.gain.exponentialRampToValueAtTime(level, context.currentTime + when + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + when + duration);
    oscillator.connect(envelope);
    envelope.connect(target);
    oscillator.start(context.currentTime + when);
    oscillator.stop(context.currentTime + when + duration + 0.05);
  }

  function chime() {
    if (!running || context === null) return;
    tone(880, 0, 0.45, 'sine', 0.11);
    tone(1320, 0.06, 0.52, 'sine', 0.08);
    tone(1760, 0.12, 0.34, 'triangle', 0.035);
  }

  function finish() {
    if (!running || context === null) return;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((frequency, index) => tone(frequency, index * 0.11, 0.65, 'triangle', 0.09));
    tone(261.63, 0, 1.4, 'sine', 0.07);
  }

  function crash() {
    if (!running || context === null) return;
    const noise = context.createBufferSource();
    const buffer = context.createBuffer(1, context.sampleRate * 0.9, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / data.length) ** 2;
    }
    noise.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, context.currentTime);
    filter.frequency.exponentialRampToValueAtTime(120, context.currentTime + 0.8);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.3, context.currentTime);
    envelope.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.9);
    noise.connect(filter);
    filter.connect(envelope);
    envelope.connect(master);
    noise.start();
    tone(110, 0, 0.7, 'sawtooth', 0.13);
  }

  function click() {
    if (!running || context === null) return;
    tone(660, 0, 0.09, 'square', 0.025);
    tone(990, 0.045, 0.08, 'sine', 0.02);
  }

  function tick() {
    if (!running || context === null) return;
    tone(1200, 0, 0.06, 'square', 0.03);
  }

  function start() {
    const ctx = ensure();
    if (ctx === null) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    running = true;
    ramp(master.gain, muted ? 0 : 0.55, 0.15);
    click();
  }

  function update({ speed, throttle, paused }) {
    if (!running || context === null) return;
    const active = paused ? 0 : 1;
    const freq = 58 + throttle * 96;
    ramp(engineA.frequency, freq, 0.25);
    ramp(engineB.frequency, freq * 0.5, 0.25);
    ramp(engineFilter.frequency, 360 + throttle * 520, 0.25);
    ramp(lfo.frequency, 18 + throttle * 26, 0.3);
    ramp(engineBus.gain, active * (0.018 + throttle * 0.085), 0.2);
    ramp(windBus.gain, active * Math.max(0, Math.min(0.12, (speed - 45) / 1500)), 0.3);
  }

  function pause() {
    if (!running || context === null) return;
    ramp(engineBus.gain, 0.002, 0.12);
    ramp(windBus.gain, 0.002, 0.12);
  }

  function toggleMute() {
    muted = !muted;
    if (running && context !== null) ramp(master.gain, muted ? 0 : 0.55, 0.08);
    return muted;
  }

  return {
    start,
    update,
    pause,
    chime,
    finish,
    crash,
    click,
    tick,
    toggleMute,
    get muted() {
      return muted;
    },
  };
}

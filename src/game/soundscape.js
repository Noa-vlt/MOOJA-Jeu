const VOLUME_STORAGE_KEY = 'mooja-surf-audio-volume-v1';
const DEFAULT_VOLUME = 0.35;
const ROCK_BPM = 108;
const ROCK_STEP_SECONDS = 60 / ROCK_BPM / 2;
const CHORD_ROOTS = [110, 82.41, 98, 73.42];
const TRICK_NOTES = {
  air: [659.25, 880],
  rotation360: [440, 587.33, 783.99],
  cutback: [493.88, 659.25],
};

export function createSoundscape(onChange = () => {}) {
  const savedVolume = loadVolume();
  let volume = savedVolume.value;
  let context = null;
  let masterGain = null;
  let musicGain = null;
  let ambienceGain = null;
  let effectsGain = null;
  let waveGain = null;
  let waveLfoDepth = null;
  let noiseBuffer = null;
  let enabled = true;
  let unlocked = false;
  let sequencer = null;
  let musicStarted = false;
  let musicStep = 0;
  let waveIntensity = -1;

  function publish(message) {
    onChange({
      enabled,
      unlocked,
      volume,
      label: enabled ? (unlocked ? 'Couper le son' : 'Activer le son') : 'Activer le son',
      message,
    });
  }

  function initialize() {
    const AudioContextConstructor =
      window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) {
      publish('Le navigateur ne prend pas en charge l’audio Web.');
      return false;
    }

    try {
      context = new AudioContextConstructor();
      masterGain = context.createGain();
      musicGain = context.createGain();
      ambienceGain = context.createGain();
      effectsGain = context.createGain();
      musicGain.connect(masterGain);
      ambienceGain.connect(masterGain);
      effectsGain.connect(masterGain);
      masterGain.connect(context.destination);
      masterGain.gain.value = volume;
      musicGain.gain.value = 0.58;
      ambienceGain.gain.value = 0.74;
      effectsGain.gain.value = 0.8;
      noiseBuffer = createNoiseBuffer(context);
      createWaveAmbience();
      return true;
    } catch (error) {
      context?.close();
      context = null;
      publish('Impossible d’initialiser l’audio dans ce navigateur.');
      return false;
    }
  }

  function createWaveAmbience() {
    const source = context.createBufferSource();
    const lowPass = context.createBiquadFilter();
    const highPass = context.createBiquadFilter();
    waveGain = context.createGain();
    const lfo = context.createOscillator();
    waveLfoDepth = context.createGain();

    source.buffer = noiseBuffer;
    source.loop = true;
    highPass.type = 'highpass';
    highPass.frequency.value = 90;
    lowPass.type = 'lowpass';
    lowPass.frequency.value = 520;
    waveGain.gain.value = 0.035;
    lfo.type = 'sine';
    lfo.frequency.value = 0.075;
    waveLfoDepth.gain.value = 0.02;
    lfo.connect(waveLfoDepth);
    waveLfoDepth.connect(waveGain.gain);
    source.connect(highPass);
    highPass.connect(lowPass);
    lowPass.connect(waveGain);
    waveGain.connect(ambienceGain);
    source.start();
    lfo.start();
  }

  function startRockMusic() {
    const scheduleStep = () => {
      if (!context || context.state === 'closed') return;
      const time = context.currentTime + 0.04;
      const stepInBar = musicStep % 8;
      const chord = CHORD_ROOTS[Math.floor(musicStep / 8) % CHORD_ROOTS.length];

      if (stepInBar === 0) playRockChord(chord, time);
      if (musicStep % 2 === 0) {
        playBass(chord / (stepInBar === 4 ? 1.5 : 1), time);
        if (stepInBar === 0 || stepInBar === 4) playKick(time);
        else playSnare(time);
      }
      playHiHat(time, musicStep % 2 === 0 ? 0.024 : 0.015);
      musicStep = (musicStep + 1) % 32;
    };

    scheduleStep();
    sequencer = window.setInterval(scheduleStep, ROCK_STEP_SECONDS * 1000);
  }

  function playRockChord(root, time) {
    for (const [index, frequency] of [root, root * 1.5].entries()) {
      const oscillator = context.createOscillator();
      const shaper = context.createWaveShaper();
      const filter = context.createBiquadFilter();
      const envelope = context.createGain();
      oscillator.type = 'sawtooth';
      oscillator.frequency.value = frequency;
      oscillator.detune.value = index === 0 ? -4 : 5;
      shaper.curve = distortionCurve();
      shaper.oversample = '2x';
      filter.type = 'lowpass';
      filter.frequency.value = 1350;
      envelope.gain.setValueAtTime(0.0001, time);
      envelope.gain.linearRampToValueAtTime(0.075, time + 0.018 + index * 0.025);
      envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.42);
      oscillator.connect(shaper);
      shaper.connect(filter);
      filter.connect(envelope);
      envelope.connect(musicGain);
      oscillator.start(time);
      oscillator.stop(time + 0.44);
    }
  }

  function playBass(frequency, time) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.linearRampToValueAtTime(0.11, time + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.19);
    oscillator.connect(envelope);
    envelope.connect(musicGain);
    oscillator.start(time);
    oscillator.stop(time + 0.2);
  }

  function playKick(time) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(120, time);
    oscillator.frequency.exponentialRampToValueAtTime(42, time + 0.13);
    envelope.gain.setValueAtTime(0.18, time);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
    oscillator.connect(envelope);
    envelope.connect(musicGain);
    oscillator.start(time);
    oscillator.stop(time + 0.19);
  }

  function playSnare(time) {
    playNoiseHit(time, 0.1, 1500, 0.07);
  }

  function playHiHat(time, level) {
    playNoiseHit(time, 0.035, 7500, level);
  }

  function playNoiseHit(time, duration, cutoff, level, output = musicGain) {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = noiseBuffer;
    filter.type = 'highpass';
    filter.frequency.value = cutoff;
    envelope.gain.setValueAtTime(level, time);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(output);
    source.start(time, Math.random() * 0.4, duration);
  }

  function activate() {
    if (unlocked) return;
    if (!context && !initialize()) return;
    enabled = true;
    const activationContext = context;
    activationContext.resume().then(() => {
      if (activationContext !== context) return;
      unlocked = true;
      if (!musicStarted) {
        startRockMusic();
        musicStarted = true;
      }
      masterGain.gain.setTargetAtTime(volume, context.currentTime, 0.04);
      publish('Ambiance sonore activée.');
    }).catch(() => {
      publish('Le navigateur a refusé la lecture audio. Touchez l’écran pour réessayer.');
    });
  }

  function toggle() {
    if (!unlocked) {
      activate();
      return;
    }
    enabled = !enabled;
    masterGain.gain.setTargetAtTime(
      enabled ? volume : 0,
      context.currentTime,
      0.04,
    );
    publish(enabled ? 'Ambiance sonore activée.' : 'Ambiance sonore coupée.');
  }

  function setVolume(nextVolume) {
    if (!Number.isFinite(nextVolume) || nextVolume < 0 || nextVolume > 1) {
      throw new RangeError('Volume must be between 0 and 1.');
    }
    volume = nextVolume;
    let message = '';
    try {
      localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
    } catch {
      message = 'Volume réglé pour cette session, mais impossible à sauvegarder.';
    }
    if (masterGain && context) {
      masterGain.gain.setTargetAtTime(
        enabled ? volume : 0,
        context.currentTime,
        0.04,
      );
    }
    publish(message);
  }

  function setWaveIntensity(intensity) {
    if (!waveGain || !waveLfoDepth || !context) return;
    const strength = Math.min(1, Math.max(0, intensity));
    if (Math.abs(strength - waveIntensity) < 0.05) return;
    waveIntensity = strength;
    waveGain.gain.setTargetAtTime(
      0.018 + strength * 0.045,
      context.currentTime,
      0.35,
    );
    waveLfoDepth.gain.setTargetAtTime(
      0.008 + strength * 0.025,
      context.currentTime,
      0.35,
    );
  }

  function playCrash() {
    if (!unlocked || !enabled) return;
    const time = context.currentTime;
    playNoiseHit(time, 0.55, 180, 0.32, effectsGain);
    playNoiseHit(time + 0.015, 0.3, 900, 0.11, effectsGain);
  }

  function playTrick(name) {
    if (!unlocked || !enabled) return;
    const notes = TRICK_NOTES[name];
    if (!notes) return;
    const startTime = context.currentTime + 0.01;
    notes.forEach((frequency, index) => {
      const time = startTime + index * 0.075;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.value = frequency;
      envelope.gain.setValueAtTime(0.0001, time);
      envelope.gain.linearRampToValueAtTime(0.09, time + 0.015);
      envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
      oscillator.connect(envelope);
      envelope.connect(effectsGain);
      oscillator.start(time);
      oscillator.stop(time + 0.23);
    });
  }

  function dispose() {
    if (sequencer !== null) window.clearInterval(sequencer);
    if (context && context.state !== 'closed') context.close();
  }

  publish(savedVolume.warning);

  return {
    activate,
    dispose,
    playCrash,
    playTrick,
    setVolume,
    setWaveIntensity,
    toggle,
    get unlocked() {
      return unlocked;
    },
  };
}

function createNoiseBuffer(context) {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }
  return buffer;
}

function distortionCurve() {
  const curve = new Float32Array(256);
  for (let index = 0; index < curve.length; index += 1) {
    const x = (index * 2) / (curve.length - 1) - 1;
    curve[index] = Math.tanh(x * 2.8);
  }
  return curve;
}

function loadVolume() {
  try {
    const savedVolume = localStorage.getItem(VOLUME_STORAGE_KEY);
    if (savedVolume === null) return { value: DEFAULT_VOLUME, warning: '' };
    const parsedVolume = Number(savedVolume);
    if (!Number.isFinite(parsedVolume) || parsedVolume < 0 || parsedVolume > 1) {
      throw new Error('Invalid saved volume');
    }
    return { value: parsedVolume, warning: '' };
  } catch {
    return {
      value: DEFAULT_VOLUME,
      warning: 'Volume précédent invalide ou stockage local indisponible.',
    };
  }
}

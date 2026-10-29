import * as THREE from 'three';
import { createGameInput } from './controls/input.js';
import { createEnvironment } from './game/createEnvironment.js';
import { createFollowCamera } from './game/followCamera.js';
import { createWaves } from './game/waves.js';
import { createScoreSystem } from './game/score.js';
import { createTrickSystem } from './game/tricks.js';
import { createWeather } from './game/weather.js';
import { createStatistics } from './game/statistics.js';
import { createSoundscape } from './game/soundscape.js';
import {
  createCharacterProgress,
  SURF_CHARACTERS,
} from './game/characterProgress.js';
import { createSurfer } from './entities/surfer.js';
import { createSurfNpcs } from './entities/surfNpcs.js';
import './styles/main.css';

const mount = document.querySelector('#scene');
const mainMenu = document.querySelector('#main-menu');
const gameUI = document.querySelector('#game-ui');
const intro = document.querySelector('.intro');
const startGameButton = document.querySelector('#start-game');
const returnToMenuButton = document.querySelector('#return-to-menu');
const characterGrid = document.querySelector('#character-grid');
const walletBalance = document.querySelector('#wallet-balance');
const progressStatus = document.querySelector('#progress-status');
const toggleButton = document.querySelector('#player-toggle');
const toggleLabel = document.querySelector('#player-toggle-label');
const playerStatus = document.querySelector('#player-status');
const catchFeedback = document.querySelector('#catch-feedback');
const coinBalance = document.querySelector('#coin-balance');
const comboMultiplier = document.querySelector('#combo-multiplier');
const lastTrick = document.querySelector('#last-trick');
const trickPanelToggle = document.querySelector('#trick-panel-toggle');
const trickPanel = document.querySelector('#trick-panel');
const movementControls = document.querySelector('#movement-controls');
const weatherStatus = document.querySelector('#weather-status');
const longestRide = document.querySelector('#longest-ride');
const highestCombo = document.querySelector('#highest-combo');
const mostCoins = document.querySelector('#most-coins');
const totalTricks = document.querySelector('#total-tricks');
const statisticsStorageStatus = document.querySelector('#statistics-storage-status');
const soundToggle = document.querySelector('#sound-toggle');
const volumeControl = document.querySelector('#volume-control');
const volumeValue = document.querySelector('#volume-value');
const soundStatus = document.querySelector('#sound-status');

if (
  !(mount instanceof HTMLElement) ||
  !(mainMenu instanceof HTMLElement) ||
  !(gameUI instanceof HTMLElement) ||
  !(intro instanceof HTMLElement) ||
  !(startGameButton instanceof HTMLButtonElement) ||
  !(returnToMenuButton instanceof HTMLButtonElement) ||
  !(characterGrid instanceof HTMLElement) ||
  !(walletBalance instanceof HTMLElement) ||
  !(progressStatus instanceof HTMLElement) ||
  !(toggleButton instanceof HTMLButtonElement) ||
  !(toggleLabel instanceof HTMLElement) ||
  !(playerStatus instanceof HTMLElement) ||
  !(catchFeedback instanceof HTMLElement) ||
  !(coinBalance instanceof HTMLElement) ||
  !(comboMultiplier instanceof HTMLElement) ||
  !(lastTrick instanceof HTMLElement) ||
  !(trickPanelToggle instanceof HTMLButtonElement) ||
  !(trickPanel instanceof HTMLElement) ||
  !(movementControls instanceof HTMLElement) ||
  !(weatherStatus instanceof HTMLElement) ||
  !(longestRide instanceof HTMLElement) ||
  !(highestCombo instanceof HTMLElement) ||
  !(mostCoins instanceof HTMLElement) ||
  !(totalTricks instanceof HTMLElement) ||
  !(statisticsStorageStatus instanceof HTMLElement) ||
  !(soundToggle instanceof HTMLButtonElement) ||
  !(volumeControl instanceof HTMLInputElement) ||
  !(volumeValue instanceof HTMLElement) ||
  !(soundStatus instanceof HTMLElement)
) {
  throw new Error('Unable to find the game interface elements.');
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(54, 1, 0.1, 500);
let gameStarted = false;
let isMobile =
  window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 700;

const renderer = new THREE.WebGLRenderer({
  antialias: !isMobile,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.35 : 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = isMobile ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
if (!isMobile) renderer.toneMappingExposure = 1.1;
mount.appendChild(renderer.domElement);

const environment = createEnvironment(THREE, scene, { lowPower: isMobile });
const soundscape = createSoundscape((audio) => {
  soundToggle.textContent = audio.label;
  soundToggle.setAttribute('aria-pressed', String(audio.enabled && audio.unlocked));
  volumeControl.value = String(audio.volume);
  volumeValue.textContent = `${Math.round(audio.volume * 100)} %`;
  soundStatus.textContent = audio.message;
});
const weather = createWeather();
const waves = createWaves(
  THREE,
  scene,
  Math.random,
  () => weather.difficultyModifier,
);
const surfer = createSurfer(THREE, scene, { lowPower: isMobile });
const surfNpcs = createSurfNpcs(THREE, scene, { lowPower: isMobile });
const characterProgress = createCharacterProgress((state, message) => {
  walletBalance.textContent = String(state.totalCoins);
  progressStatus.textContent = message;
  renderCharacterCards(state);
  const selectedCharacter = SURF_CHARACTERS.find(
    ({ id }) => id === state.selectedCharacter,
  );
  if (selectedCharacter) surfer.setCharacter(selectedCharacter);
});
const statistics = createStatistics(
  (records) => {
    longestRide.textContent = `${records.longestRide.toFixed(1)} s`;
    highestCombo.textContent = `x${records.highestCombo}`;
    mostCoins.textContent = String(records.mostCoins);
    totalTricks.textContent = String(records.totalTricks);
  },
  (message) => {
    statisticsStorageStatus.textContent = message;
  },
);
const score = createScoreSystem(({ coins, combo, earned }) => {
  coinBalance.textContent = String(coins);
  comboMultiplier.textContent = `x${combo}`;
  statistics.recordCoins(coins);
  statistics.recordCombo(combo);
  characterProgress.addCoins(earned);
});
const tricks = createTrickSystem(surfer, score, ({ message, result, lastTrick: recentTrick }) => {
  showCatchFeedback(message, result);
  lastTrick.textContent = recentTrick;
  if (result === 'active') soundscape.playTrick(tricks.activeTrick);
  if (result === 'success') statistics.recordTrick();
});
const followCamera = createFollowCamera(THREE, camera, surfer.group);
let rideDuration = 0;
let rideActive = false;
let displayedWeather = '';
let readyToStand = false;
const readyPromptMessage = 'Vague prête : lève-toi pour la surfer !';

function finishRide() {
  if (!rideActive) return;
  statistics.recordRide(rideDuration);
  rideDuration = 0;
  rideActive = false;
}

function toggleSurferState() {
  if (surfer.state === 'standing') {
    surfer.lieDown();
    finishRide();
    waves.detachRider();
    playerStatus.textContent = 'Position : couché';
    toggleLabel.textContent = 'Se lever';
    showCatchFeedback('Retour en position couchée.', 'default');
    return;
  }

  readyToStand = false;
  delete toggleButton.dataset.ready;
  const result = waves.getCatchStatus(surfer.group.position, surfer.speed);
  if (result.success) {
    if (!waves.attachRider(surfer.group.position, surfer.speed)) {
      showCatchFeedback('La vague a changé de position. Réessaie au prochain passage.', 'failure');
      return;
    }
    surfer.stand();
    rideDuration = 0;
    rideActive = true;
    playerStatus.textContent = 'Position : debout';
    toggleLabel.textContent = 'Se coucher';
    delete toggleButton.dataset.ready;
    showCatchFeedback('Vague prise ! Maintiens ta vitesse.', 'success');
    return;
  }

  surfer.fall();
  finishRide();
  soundscape.playCrash();
  score.breakCombo();
  playerStatus.textContent = 'Position : couché · chute';
  toggleLabel.textContent = 'Réessayer';
  showCatchFeedback(result.reason, 'failure');
}

function showCatchFeedback(message, result) {
  catchFeedback.textContent = message;
  catchFeedback.dataset.result = result;
}

function updateCatchPrompt() {
  if (surfer.state !== 'prone') {
    readyToStand = false;
    delete toggleButton.dataset.ready;
    return;
  }

  const canStand = waves.getCatchStatus(surfer.group.position, surfer.speed).success;
  if (canStand && !readyToStand) {
    readyToStand = true;
    toggleLabel.textContent = 'Se lever maintenant !';
    toggleButton.dataset.ready = 'true';
    showCatchFeedback(readyPromptMessage, 'success');
  } else if (!canStand && readyToStand) {
    readyToStand = false;
    if (toggleLabel.textContent === 'Se lever maintenant !') {
      toggleLabel.textContent = 'Se lever';
    }
    delete toggleButton.dataset.ready;
    if (catchFeedback.textContent.trim() === readyPromptMessage) {
      showCatchFeedback('Pagaye, puis espace au bon moment.', 'default');
    }
  }
}

function renderCharacterCards(state) {
  const cards = SURF_CHARACTERS.map((character) => {
    const unlocked = state.unlockedCharacters.includes(character.id);
    const selected = state.selectedCharacter === character.id;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'character-card';
    card.dataset.character = character.id;
    card.dataset.unlocked = String(unlocked);
    card.dataset.selected = String(selected);
    card.setAttribute('aria-pressed', String(selected));

    const portrait = document.createElement('span');
    portrait.className = 'character-card__portrait';
    portrait.setAttribute('aria-hidden', 'true');

    const avatar = document.createElement('span');
    avatar.className = 'character-card__avatar';
    avatar.style.backgroundColor = `#${character.board.toString(16).padStart(6, '0')}`;
    portrait.append(avatar);

    const portraitImage = document.createElement('img');
    portraitImage.className = 'character-card__portrait-image';
    portraitImage.alt = '';
    portraitImage.loading = 'lazy';
    portraitImage.decoding = 'async';
    portraitImage.addEventListener(
      'error',
      () => {
        portraitImage.remove();
      },
      { once: true },
    );
    portraitImage.src = `${import.meta.env.BASE_URL}assets/characters/${character.portrait}`;
    portrait.append(portraitImage);

    const name = document.createElement('span');
    name.className = 'character-card__name';
    name.textContent = character.name;

    const description = document.createElement('span');
    description.className = 'character-card__description';
    description.textContent = character.description;

    const action = document.createElement('span');
    action.className = 'character-card__action';
    action.textContent = selected
      ? 'Sélectionné'
      : unlocked
        ? 'Choisir'
        : `${character.cost} pièces`;

    card.append(portrait, name, description, action);
    return card;
  });
  characterGrid.replaceChildren(...cards);
}

characterGrid.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const card = event.target.closest('.character-card');
  const characterId = card?.dataset.character;
  if (!characterId) return;

  const state = characterProgress.getState();
  if (state.unlockedCharacters.includes(characterId)) {
    characterProgress.selectCharacter(characterId);
  } else {
    characterProgress.unlockCharacter(characterId);
  }
});

startGameButton.addEventListener('click', () => {
  gameStarted = true;
  mainMenu.hidden = true;
  intro.hidden = true;
  gameUI.hidden = false;
  soundscape.activate();
  toggleButton.focus();
});

returnToMenuButton.addEventListener('click', () => {
  gameStarted = false;
  mainMenu.hidden = false;
  intro.hidden = true;
  gameUI.hidden = true;
  startGameButton.textContent = 'Reprendre la partie';
  startGameButton.focus();
});

toggleButton.addEventListener('click', toggleSurferState);
soundToggle.addEventListener('click', () => soundscape.toggle());
volumeControl.addEventListener('input', () => {
  soundscape.setVolume(Number(volumeControl.value));
});
trickPanelToggle.addEventListener('click', () => {
  const isExpanded = trickPanelToggle.getAttribute('aria-expanded') === 'true';
  trickPanelToggle.setAttribute('aria-expanded', String(!isExpanded));
  trickPanel.hidden = isExpanded;
});
const input = createGameInput(
  toggleSurferState,
  movementControls,
  (trick) => tricks.perform(trick),
  () => gameStarted,
);

const clock = new THREE.Clock();

function resize() {
  const { width, height } = mount.getBoundingClientRect();
  if (width === 0 || height === 0) return;

  const nextIsMobile =
    window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 700;
  if (nextIsMobile !== isMobile) {
    isMobile = nextIsMobile;
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, isMobile ? 1.35 : 1.75),
    );
    renderer.toneMapping = isMobile
      ? THREE.NoToneMapping
      : THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isMobile ? 1 : 1.1;
  }
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function animate() {
  const deltaTime = Math.min(clock.getDelta(), 0.05);
  if (gameStarted) {
    const conditions = weather.update(deltaTime);
    environment.update(clock.elapsedTime, conditions.condition);
    if (displayedWeather !== conditions.condition) {
      displayedWeather = conditions.condition;
      weatherStatus.textContent = conditions.label;
      weatherStatus.dataset.condition = conditions.condition;
    }
    waves.update(deltaTime);
    surfNpcs.update(deltaTime, clock.elapsedTime, waves);
    let movementResult = surfer.update(
      input.getMovement(),
      deltaTime,
      waves.getRideInfo(surfer.group.position),
    );
    if (!movementResult.fell && surfer.state === 'standing') {
      const riderInfo = waves.getRideInfo(surfer.group.position);
      if (!surfer.followWave(riderInfo)) {
        surfer.fall();
        waves.detachRider();
        movementResult = {
          fell: true,
          reason: 'La vague a perdu son énergie. Tu perds l’équilibre.',
        };
      }
    }
    if (rideActive && surfer.state === 'standing') {
      rideDuration += deltaTime;
    } else if (rideActive) {
      finishRide();
    }
    if (movementResult.fell) {
      finishRide();
      waves.detachRider();
      soundscape.playCrash();
      score.breakCombo();
      playerStatus.textContent = 'Position : couché · chute';
      toggleLabel.textContent = 'Réessayer';
      showCatchFeedback(movementResult.reason, 'failure');
    }
    updateCatchPrompt();
    const waveAudio = waves.getDebugInfo();
    soundscape.setWaveIntensity(
      waveAudio.phase === 'Déferlement' ? (waveAudio.power ?? 0) : 0.15,
    );
    tricks.update(deltaTime);
  }
  followCamera.update(deltaTime);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(mount);
resize();
animate();
const WAVE_INTERVAL = 2.5;
const WAVE_START_Z = -205;
const SURF_START_PROGRESS = 0.24;
const SURF_END_PROGRESS = 0.91;
const SHORE_FADE_DISTANCE = 36;
const SHORE_FALL_DISTANCE = 24;
const SURFACE_OFFSET = 0.15;
const BOARD_HALF_LENGTH = 1.8;
const BOARD_BOTTOM_OFFSET = 0.08;
const WAVE_HEIGHT_SCALE = 1.35;

export function createWaves(
  THREE,
  scene,
  random = Math.random,
  getWeatherDifficulty = () => 0,
) {
  let activeWave = null;
  let waveIndex = 0;
  let timeUntilNextWave = 0;
  const attachedRiders = new Map();

  function disposeWave(wave) {
    scene.remove(wave.group);
    wave.group.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) object.material.dispose();
    });
  }

  function spawnWave() {
    const profile = createWaveProfile(random, getWeatherDifficulty());
    const shoreZ = shorelineZ(profile.centerX);
    activeWave = {
      ...profile,
      id: ++waveIndex,
      age: 0,
      distanceToShore: shoreZ - WAVE_START_Z,
      shoreZ,
      group: createWaveMesh(THREE, profile),
    };
    activeWave.group.position.set(profile.centerX, 0, WAVE_START_Z);
    scene.add(activeWave.group);
  }

  spawnWave();

  function getWaveState(wave) {
    const centerZ = wave.group.position.z;
    const distanceToShore = wave.shoreZ - centerZ;
    const traveled = centerZ - WAVE_START_Z;
    const progress = THREEClamp(traveled / wave.distanceToShore, 0, 1);
    const growth = smoothstep(traveled / 38);
    const shoreFade = smoothstep(distanceToShore / SHORE_FADE_DISTANCE);
    const energy = growth * shoreFade;
    const surfable =
      progress >= SURF_START_PROGRESS &&
      progress < SURF_END_PROGRESS &&
      energy >= 0.34 &&
      distanceToShore > SHORE_FALL_DISTANCE;
    const phase =
      progress < SURF_START_PROGRESS
        ? 'Approche'
        : progress < SURF_END_PROGRESS
          ? 'Déferlement'
          : 'Dissipation';

    return {
      centerZ,
      distanceToShore,
      energy,
      phase,
      progress,
      surfable,
      traveled,
    };
  }

  function getSurfaceHeight(wave, position, state) {
    const localX = position.x - wave.centerX;
    const localZ = position.z - state.centerZ;
    return (
      SURFACE_OFFSET * state.energy +
      surfaceHeightAt(wave, localX, localZ, state.energy)
    );
  }

  function getBoardSupportHeight(wave, position, state) {
    let highestPoint = 0;
    for (const xOffset of [-0.55, 0, 0.55]) {
      for (let step = 0; step <= 8; step += 1) {
        const zOffset = -BOARD_HALF_LENGTH + (step / 8) * BOARD_HALF_LENGTH * 2;
        highestPoint = Math.max(
          highestPoint,
          getSurfaceHeight(
            wave,
            { x: position.x + xOffset, z: position.z + zOffset },
            state,
          ),
        );
      }
    }
    return highestPoint;
  }

  function getRideInfo(position, riderId = 'player') {
    const wave = activeWave;
    const attachedRider = attachedRiders.get(riderId);
    if (!wave) {
      return {
        active: false,
        attached: attachedRider !== undefined,
        surfable: false,
        speed: 0,
        power: 0,
        influence: 0,
        slope: 0,
        difficulty: 0,
        surfaceHeight: 0,
        distanceToShore: 0,
      };
    }

    const state = getWaveState(wave);
    const isAttached = attachedRider?.waveId === wave.id;
    const riderZ = isAttached
      ? state.centerZ + attachedRider.offsetZ
      : position.z;
    const relativePosition = { x: position.x, z: riderZ };
    const lateralDistance = Math.abs(position.x - wave.centerX);
    const localZ = riderZ - state.centerZ;
    const lateralTolerance = getLateralTolerance(wave.difficulty);
    const withinSurface =
      lateralDistance <= lateralTolerance &&
      localZ >= wave.crestWidth * 0.25 &&
      localZ <= wave.crestWidth * 2.1;
    const surfable =
      state.surfable &&
      withinSurface &&
      (!isAttached || attachedRider.waveId === wave.id);
    const height = getSurfaceHeight(wave, relativePosition, state);
    const boardSupportHeight = getBoardSupportHeight(
      wave,
      relativePosition,
      state,
    );
    const surfacePitch = getSurfaceSlope(
      wave,
      position.x - wave.centerX,
      localZ,
      state.energy,
    );

    return {
      active: surfable,
      attached: isAttached,
      surfable,
      riderZ: isAttached ? riderZ : null,
      speed: wave.speed,
      power: wave.power * state.energy,
      wavePower: wave.power,
      influence: surfable ? state.energy : 0,
      slope: Math.abs(surfacePitch),
      surfacePitch,
      difficulty: wave.difficulty,
      surfaceHeight: height,
      boardSupportHeight,
      distanceToShore: Math.max(0, state.distanceToShore),
      waveId: wave.id,
      centerZ: state.centerZ,
    };
  }

  return {
    update(deltaTime) {
      if (!activeWave) {
        timeUntilNextWave -= deltaTime;
        if (timeUntilNextWave <= 0) spawnWave();
        return;
      }

      const wave = activeWave;
      wave.age += deltaTime;
      wave.group.position.z = Math.min(
        wave.shoreZ + 1,
        wave.group.position.z + wave.speed * deltaTime,
      );
      const state = getWaveState(wave);
      wave.group.scale.y = state.energy;
      wave.group.userData.surfaceMaterial.uniforms.uOpacity.value =
        state.energy * (0.78 + wave.power * 0.22);
      wave.group.userData.foam.material.opacity =
        state.energy *
        (state.phase === 'Déferlement' ? 0.96 : 0.62) *
        (0.65 + wave.power * 0.35);
      wave.group.userData.surfaceMaterial.uniforms.uEnergy.value = state.energy;
      wave.group.userData.surfaceMaterial.uniforms.uTime.value = wave.age;

      if (state.distanceToShore <= 0) {
        disposeWave(wave);
        activeWave = null;
        attachedRiders.clear();
        timeUntilNextWave = WAVE_INTERVAL;
      }
    },
    getDebugInfo(position = { x: 0, z: 0 }, surferSpeed = 0) {
      if (!activeWave) {
        return {
          id: waveIndex + 1,
          phase: 'En attente',
          progress: 0,
          height: 0,
          surfaceHeight: 0,
          boardSupportHeight: 0,
          speed: 0,
          power: 0,
          difficulty: null,
          surfable: false,
          distanceToShore: 0,
          surferSpeed,
        };
      }

      const wave = activeWave;
      const state = getWaveState(wave);
      const rideInfo = getRideInfo(position, 'player');
      return {
        id: wave.id,
        phase: state.phase,
        progress: state.progress,
        centerX: wave.centerX,
        centerZ: state.centerZ,
        crestWidth: wave.crestWidth,
        height: wave.height * state.energy * WAVE_HEIGHT_SCALE,
        surfaceHeight: rideInfo.surfaceHeight,
        boardSupportHeight: rideInfo.boardSupportHeight,
        speed: wave.speed,
        power: wave.power * state.energy,
        difficulty: wave.difficulty,
        surfable: state.surfable,
        riderOnSurface: rideInfo.surfable,
        distanceToShore: Math.max(0, state.distanceToShore),
        surferSpeed,
      };
    },
    getWaveInfo() {
      if (!activeWave) return null;
      const state = getWaveState(activeWave);
      return {
        id: activeWave.id,
        centerX: activeWave.centerX,
        centerZ: state.centerZ,
        crestWidth: activeWave.crestWidth,
        speed: activeWave.speed,
        surfable: state.surfable,
        phase: state.phase,
      };
    },
    getRideInfo,
    attachRider(position, surferSpeed, riderId = 'player') {
      const status = this.getCatchStatus(position, surferSpeed);
      if (!status.success) return false;
      const state = getWaveState(activeWave);
      attachedRiders.set(riderId, {
        waveId: activeWave.id,
        offsetZ: position.z - state.centerZ,
      });
      return true;
    },
    detachRider(riderId = 'player') {
      attachedRiders.delete(riderId);
    },
    getCatchStatus(position, surferSpeed) {
      if (!activeWave) {
        return { success: false, reason: 'Attends la prochaine vague.', phase: 'En attente' };
      }

      const wave = activeWave;
      const state = getWaveState(wave);
      if (!state.surfable || state.phase !== 'Déferlement') {
        return {
          success: false,
          reason: 'Attends une vague surfable au large.',
          phase: state.phase,
        };
      }

      const lateralDistance = Math.abs(position.x - wave.centerX);
      if (lateralDistance > getLateralTolerance(wave.difficulty)) {
        return { success: false, reason: 'Replace-toi dans l’axe de cette vague.', phase: state.phase };
      }

      const localZ = position.z - state.centerZ;
      const minOffset = wave.crestWidth * 0.25;
      const maxOffset = wave.crestWidth * 2.1;
      if (localZ > maxOffset) {
        return { success: false, reason: 'La vague approche : continue de pagayer.', phase: state.phase };
      }
      if (localZ < minOffset) {
        return { success: false, reason: 'Le pic est passé. Attends la prochaine vague.', phase: state.phase };
      }

      const requiredSpeed = Math.max(1.8, wave.speed * (0.34 + wave.difficulty * 0.025));
      if (surferSpeed < requiredSpeed) {
        return { success: false, reason: 'Pas assez de vitesse : pagaye avant de te lever.', phase: state.phase };
      }

      if (wave.power * state.energy < 0.24) {
        return { success: false, reason: 'Cette vague manque de puissance.', phase: state.phase };
      }

      return { success: true, reason: 'Bonne position et bonne vitesse !', phase: state.phase };
    },
  };
}

function createWaveProfile(random, weatherDifficulty = 0) {
  const difficulty = THREEClamp(
    randomInteger(random, 1, 5) + weatherDifficulty,
    1,
    5,
  );
  return {
    height: randomBetween(random, 2.8, 6.2),
    speed: randomBetween(random, 5.2, 7.2),
    power: randomBetween(random, 0.58, 1),
    difficulty,
    centerX: randomBetween(random, -12, 12),
    width: 220 - difficulty * 12,
    crestWidth: 13 - difficulty * 0.65,
  };
}

function createWaveMesh(THREE, { height, width, power, crestWidth }) {
  const widthSegments = 96;
  const depthSegments = 40;
  const halfWidth = width / 2;
  const halfDepth = crestWidth * 3.2;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let row = 0; row <= depthSegments; row += 1) {
    const z = (row / depthSegments) * halfDepth * 2 - halfDepth;
    for (let column = 0; column <= widthSegments; column += 1) {
      const x = (column / widthSegments) * halfWidth * 2 - halfWidth;
      positions.push(
        x,
        surfaceHeightAt({ height, crestWidth }, x, z, 1),
        z,
      );
      uvs.push(column / widthSegments, row / depthSegments);
    }
  }

  for (let row = 0; row < depthSegments; row += 1) {
    for (let column = 0; column < widthSegments; column += 1) {
      const a = row * (widthSegments + 1) + column;
      const b = a + 1;
      const c = a + widthSegments + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const surfaceMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
    uniforms: {
      uOpacity: { value: 0 },
      uCrestStart: { value: height * WAVE_HEIGHT_SCALE * 0.25 },
      uCrestEnd: { value: height * WAVE_HEIGHT_SCALE * 0.82 },
      uPower: { value: power },
      uEnergy: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying float vHeight;
      void main() {
        vUv = uv;
        vHeight = position.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      uniform float uCrestStart;
      uniform float uCrestEnd;
      uniform float uPower;
      uniform float uEnergy;
      uniform float uTime;
      varying vec2 vUv;
      varying float vHeight;
      void main() {
        float depthFade = smoothstep(0.0, 0.12, vUv.y) *
          (1.0 - smoothstep(0.88, 1.0, vUv.y));
        float sideFade = smoothstep(0.0, 0.035, vUv.x) *
          (1.0 - smoothstep(0.965, 1.0, vUv.x));
        float crest = smoothstep(uCrestStart, uCrestEnd, vHeight) * uPower;
        float shoreBlend = smoothstep(0.0, 0.48, uEnergy);
        float crestBand = exp(-pow((vUv.y - 0.5) * 8.5, 2.0));
        float crestLine = exp(-pow((vUv.y - 0.5) * 21.0, 2.0));
        float foamFlicker = 0.92 + 0.08 * sin(vUv.x * 95.0 + uTime * 2.4);
        vec3 water = vec3(0.008, 0.13, 0.24);
        vec3 crestTint = vec3(0.025, 0.76, 0.77);
        vec3 foam = vec3(1.0, 1.0, 0.96);
        vec3 sandTint = vec3(0.73, 0.64, 0.48);
        vec3 color = mix(water, crestTint, smoothstep(0.12, 0.58, crest));
        float visibleCrest = smoothstep(0.12, 0.5, uEnergy);
        color = mix(color, crestTint, crestBand * visibleCrest * 0.72);
        color = mix(color, foam, crestLine * foamFlicker * visibleCrest);
        color = mix(sandTint, color, shoreBlend);
        float alpha = depthFade * sideFade * uOpacity * 0.94;
        if (alpha < 0.012) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
  const surface = new THREE.Mesh(geometry, surfaceMaterial);
  surface.position.y = SURFACE_OFFSET;

  const foam = createFoam(THREE, height, halfWidth, crestWidth, power);
  foam.position.y = SURFACE_OFFSET + 0.04;

  const group = new THREE.Group();
  group.name = 'wave';
  group.add(surface, foam);
  group.userData.surfaceMaterial = surfaceMaterial;
  group.userData.foam = foam;
  return group;
}

function createFoam(THREE, height, halfWidth, crestWidth, power) {
  const segments = 96;
  const positions = [];
  const indices = [];

  for (let row = 0; row <= 1; row += 1) {
    const z = row === 0 ? -0.8 : 0.8;
    for (let column = 0; column <= segments; column += 1) {
      const x = (column / segments) * halfWidth * 2 - halfWidth;
      const crestOffset = Math.sin(x * 0.035) * crestWidth * 0.28;
      const crestVariation = 0.86 + Math.sin(x * 0.035) * 0.1;
      positions.push(
        x,
        height *
          WAVE_HEIGHT_SCALE *
          crestVariation *
          (0.65 + power * 0.35),
        z + crestOffset,
      );
    }
  }

  for (let column = 0; column < segments; column += 1) {
    const a = column;
    const b = a + 1;
    const c = segments + 1 + column;
    indices.push(a, c, b, b, c, c + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: 0xf1fff2,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
}

function surfaceHeightAt(wave, localX, localZ, energy) {
  const crestOffset = Math.sin(localX * 0.035) * wave.crestWidth * 0.28;
  const crestVariation = 0.86 + Math.sin(localX * 0.035) * 0.1;
  const distanceFromCrest = (localZ - crestOffset) / wave.crestWidth;
  return (
    wave.height *
    WAVE_HEIGHT_SCALE *
    energy *
    Math.exp(-(distanceFromCrest ** 2)) *
    crestVariation
  );
}

function getSurfaceSlope(wave, localX, localZ, energy) {
  const step = 0.1;
  const forward = surfaceHeightAt(wave, localX, localZ + step, energy);
  const backward = surfaceHeightAt(wave, localX, localZ - step, energy);
  return THREEClamp((forward - backward) / (step * 2), -1, 1);
}

function shorelineZ(x) {
  return 3 + Math.sin(x * 0.035) * 1.4 + Math.sin(x * 0.09) * 0.45;
}

function getLateralTolerance(difficulty) {
  return Math.max(8, 24 - difficulty * 3);
}

function randomBetween(random, min, max) {
  return min + random() * (max - min);
}

function randomInteger(random, min, max) {
  return Math.floor(randomBetween(random, min, max + 1));
}

function THREEClamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function smoothstep(value) {
  const clamped = THREEClamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

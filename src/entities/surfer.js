export function createSurfer(THREE, scene, { lowPower = false } = {}) {
  const surfer = new THREE.Group();
  surfer.name = 'surfer';
  surfer.position.set(0, 0, -88);
  scene.add(surfer);
  const model = new THREE.Group();
  surfer.add(model);
  let forwardSpeed = 0;
  let turnInput = 0;
  let fallTime = 0;
  let lowSpeedTime = 0;
  let speedFactors = { wave: 0, slope: 0, trajectory: 0 };

  const boardMaterial = lowPower
    ? new THREE.MeshPhongMaterial({
        color: 0xf0a66f,
        specular: 0x5d4637,
        shininess: 12,
      })
    : new THREE.MeshStandardMaterial({
        color: 0xf0a66f,
        roughness: 0.62,
      });
  const board = new THREE.Mesh(
    new THREE.SphereGeometry(1, lowPower ? 16 : 24, lowPower ? 10 : 16),
    boardMaterial,
  );
  board.name = 'surfboard';
  board.scale.set(0.55, 0.12, 1.8);
  board.position.y = 0.2;
  model.add(board);

  const prone = createProneSurfer(THREE, lowPower);
  const standing = createStandingSurfer(THREE, lowPower);
  prone.visible = true;
  standing.visible = false;
  model.add(prone, standing);

  let state = 'prone';

  function setPosture(nextState) {
    state = nextState;
    prone.visible = state === 'prone';
    standing.visible = state === 'standing';
  }

  return {
    group: surfer,
    setCharacter(character) {
      boardMaterial.color.setHex(character.board);
      for (const posture of [prone, standing]) {
        posture.userData.characterMaterials.skin.color.setHex(character.skin);
        posture.userData.characterMaterials.wetsuit.color.setHex(character.wetsuit);
      }
    },
    get state() {
      return state;
    },
    get speed() {
      return Math.max(0, forwardSpeed);
    },
    get speedFactors() {
      return speedFactors;
    },
    setTrickPose(name, progress) {
      model.position.y = name === 'air' ? Math.sin(progress * Math.PI) * 1.5 : 0;
      model.rotation.set(0, 0, 0);

      if (name === 'rotation360') {
        model.rotation.y = Math.PI * 2 * progress;
      } else if (name === 'cutback') {
        model.rotation.y = Math.sin(progress * Math.PI * 2) * 0.65;
        model.rotation.z = Math.sin(progress * Math.PI) * 0.35;
      }
    },
    stand() {
      setPosture('standing');
      surfer.rotation.y = Math.PI;
      fallTime = 0;
    },
    lieDown() {
      setPosture('prone');
      fallTime = 0;
    },
    fall() {
      setPosture('prone');
      forwardSpeed = 0;
      lowSpeedTime = 0;
      fallTime = 0.85;
    },
    followWave(rideInfo) {
      if (state !== 'standing' || !rideInfo.attached || !rideInfo.surfable) {
        return false;
      }
      surfer.position.z = rideInfo.riderZ;
      surfer.position.y =
        rideInfo.boardSupportHeight - 0.08 + Math.abs(rideInfo.surfacePitch) * 1.8 + 0.05;
      model.rotation.x = -rideInfo.surfacePitch;
      return true;
    },
    toggleState() {
      setPosture(state === 'prone' ? 'standing' : 'prone');
      return state;
    },
    update(movement, deltaTime, rideInfo) {
      const isStanding = state === 'standing';
      const maxSpeed = isStanding ? 12 : 3.6;
      const turnSpeed = isStanding ? 0.95 : 1.25;
      turnInput = THREE.MathUtils.damp(
        turnInput,
        movement.turn,
        isStanding ? 14 : 9,
        deltaTime,
      );
      const headingAlignment = Math.max(0, Math.cos(surfer.rotation.y));
      const turnEfficiency = 1 - Math.abs(turnInput) * 0.4;
      const difficultyControl = 1 - Math.max(0, rideInfo.difficulty - 1) * 0.035;
      speedFactors = {
        wave: rideInfo.speed * rideInfo.power * rideInfo.influence,
        slope: rideInfo.slope,
        trajectory: headingAlignment * turnEfficiency * difficultyControl,
      };
      const waveAcceleration =
        speedFactors.wave * speedFactors.slope * speedFactors.trajectory * 1.4;
      const paddleAcceleration = isStanding ? 3.5 : 4.8;
      const brakingAcceleration = isStanding ? 7 : 0;
      const drag = isStanding ? 0.65 : 1.1;
      const inputAcceleration =
        movement.forward > 0
          ? movement.forward * paddleAcceleration
          : movement.forward < 0
            ? movement.forward * brakingAcceleration
            : 0;

      forwardSpeed = THREE.MathUtils.clamp(
        forwardSpeed +
          (inputAcceleration + waveAcceleration - drag) * deltaTime,
        0,
        maxSpeed,
      );
      surfer.rotation.y -= turnInput * turnSpeed * deltaTime;
      if (fallTime > 0) {
        fallTime = Math.max(0, fallTime - deltaTime);
        const fallProgress = 1 - fallTime / 0.85;
        surfer.rotation.z = Math.sin(fallProgress * Math.PI) * 0.75;
      } else {
        surfer.rotation.z = THREE.MathUtils.damp(
          surfer.rotation.z,
          0,
          8,
          deltaTime,
        );
      }
      surfer.position.x = THREE.MathUtils.clamp(
        surfer.position.x -
          Math.sin(surfer.rotation.y) * forwardSpeed * deltaTime,
        -90,
        90,
      );
      surfer.position.z = THREE.MathUtils.clamp(
        surfer.position.z -
          Math.cos(surfer.rotation.y) * forwardSpeed * deltaTime,
        -205,
        1,
      );

      if (isStanding && forwardSpeed < 1.2) {
        lowSpeedTime += deltaTime;
        if (!rideInfo.attached && lowSpeedTime >= 1.1) {
          this.fall();
          return {
            fell: true,
            reason: 'Tu as perdu ta vitesse. Pagaye avant de reprendre la vague.',
          };
        }
      } else {
        lowSpeedTime = 0;
      }

      if (isStanding && rideInfo.attached && rideInfo.surfable) {
        surfer.position.z = rideInfo.riderZ;
        surfer.position.y =
          rideInfo.boardSupportHeight -
          0.08 +
          Math.abs(rideInfo.surfacePitch) * 1.8 +
          0.05;
        model.rotation.x = -rideInfo.surfacePitch;
      } else if (!isStanding) {
        surfer.position.y = THREE.MathUtils.damp(
          surfer.position.y,
          0,
          5,
          deltaTime,
        );
        model.rotation.x = THREE.MathUtils.damp(model.rotation.x, 0, 5, deltaTime);
      }

      return { fell: false };
    },
  };
}

function createProneSurfer(THREE, lowPower) {
  const surfer = new THREE.Group();
  const skin = createMaterial(THREE, 0xc98d68, lowPower);
  const wetsuit = createMaterial(THREE, 0x254f59, lowPower);
  surfer.userData.characterMaterials = { skin, wetsuit };

  addEllipsoid(THREE, surfer, wetsuit, [0.27, 0.17, 0.55], [0, 0.43, 0.1]);
  addEllipsoid(THREE, surfer, skin, [0.19, 0.19, 0.19], [0, 0.45, -0.62]);
  addLimb(THREE, surfer, skin, [-0.19, 0.38, -0.05], [-0.48, 0.28, -0.48], 0.075);
  addLimb(THREE, surfer, skin, [0.19, 0.38, -0.05], [0.48, 0.28, -0.48], 0.075);
  addLimb(THREE, surfer, wetsuit, [-0.14, 0.4, 0.48], [-0.14, 0.29, 0.91], 0.09);
  addLimb(THREE, surfer, wetsuit, [0.14, 0.4, 0.48], [0.14, 0.29, 0.91], 0.09);

  return surfer;
}

function createStandingSurfer(THREE, lowPower) {
  const surfer = new THREE.Group();
  const skin = createMaterial(THREE, 0xc98d68, lowPower);
  const wetsuit = createMaterial(THREE, 0x254f59, lowPower);
  surfer.userData.characterMaterials = { skin, wetsuit };

  addEllipsoid(THREE, surfer, wetsuit, [0.25, 0.4, 0.2], [0, 1.04, 0.1]);
  addEllipsoid(THREE, surfer, skin, [0.18, 0.18, 0.18], [0, 1.66, 0.07]);
  addLimb(THREE, surfer, wetsuit, [-0.12, 0.82, 0.1], [-0.18, 0.31, -0.14], 0.11);
  addLimb(THREE, surfer, wetsuit, [0.12, 0.82, 0.1], [0.18, 0.31, 0.34], 0.11);
  addLimb(THREE, surfer, skin, [-0.2, 1.32, 0.1], [-0.6, 1.08, -0.03], 0.075);
  addLimb(THREE, surfer, skin, [0.2, 1.32, 0.1], [0.58, 1.17, 0.24], 0.075);

  return surfer;
}

function createMaterial(THREE, color, lowPower) {
  return lowPower
    ? new THREE.MeshLambertMaterial({ color })
    : new THREE.MeshStandardMaterial({ color, roughness: 0.82 });
}

function addEllipsoid(THREE, parent, material, scale, position) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 12, 8),
    material,
  );
  mesh.scale.set(...scale);
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function addLimb(THREE, parent, material, start, end, radius) {
  const startPoint = new THREE.Vector3(...start);
  const endPoint = new THREE.Vector3(...end);
  const direction = new THREE.Vector3().subVectors(endPoint, startPoint);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.8, radius, direction.length(), 8),
    material,
  );
  mesh.position.copy(startPoint).add(endPoint).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  parent.add(mesh);
  return mesh;
}
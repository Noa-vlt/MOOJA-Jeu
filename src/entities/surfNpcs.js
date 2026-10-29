export function createSurfNpcs(THREE, scene, { lowPower = false } = {}) {
  const boardGeometry = new THREE.SphereGeometry(
    1,
    lowPower ? 10 : 14,
    lowPower ? 6 : 8,
  );
  const bodyGeometry = new THREE.SphereGeometry(
    1,
    lowPower ? 8 : 10,
    lowPower ? 6 : 8,
  );
  const limbGeometry = new THREE.CylinderGeometry(
    0.075,
    0.09,
    1,
    lowPower ? 5 : 7,
  );
  const profiles = [
    { x: -4, z: -108, board: 0xf0a66f, suit: 0x315e67, skin: 0xc98d68 },
    { x: 0, z: -117, board: 0xf0d66d, suit: 0x3f6288, skin: 0xe0aa80 },
    { x: 4, z: -105, board: 0x75b8b0, suit: 0x6d4669, skin: 0x9e664b },
  ];
  const npcs = profiles.map((profile, index) => {
    const surfer = new THREE.Group();
    surfer.name = `surf-npc-${index + 1}`;
    surfer.position.set(profile.x, 0, profile.z);
    surfer.rotation.y = Math.PI;
    scene.add(surfer);

    const board = new THREE.Mesh(
      boardGeometry,
      new THREE.MeshLambertMaterial({ color: profile.board }),
    );
    board.scale.set(0.58, 0.12, 1.9);
    board.position.y = 0.2;
    surfer.add(board);

    const skin = new THREE.MeshLambertMaterial({ color: profile.skin });
    const suit = new THREE.MeshLambertMaterial({ color: profile.suit });
    const pronePose = createPose(
      THREE,
      surfer,
      bodyGeometry,
      limbGeometry,
      suit,
      skin,
      false,
    );
    const standingPose = createPose(
      THREE,
      surfer,
      bodyGeometry,
      limbGeometry,
      suit,
      skin,
      true,
    );
    standingPose.group.visible = false;

    return {
      group: surfer,
      baseX: profile.x,
      baseZ: profile.z,
      phase: index * 2.1,
      board,
      pronePose,
      standingPose,
      riderId: surfer.name,
      laneOffset: (index - 1) * 4,
      speed: 0,
      state: 'paddling',
      fallTimer: 0,
      skippedWaveId: null,
    };
  });

  function setPose(npc, standing) {
    npc.pronePose.group.visible = !standing;
    npc.standingPose.group.visible = standing;
  }

  function startFall(npc, waves, waveId) {
    waves.detachRider(npc.riderId);
    npc.state = 'falling';
    npc.fallTimer = 0.85;
    npc.skippedWaveId = waveId ?? npc.skippedWaveId;
    npc.group.rotation.x = -0.45;
    npc.group.rotation.z = npc.laneOffset <= 0 ? 0.5 : -0.5;
    setPose(npc, false);
  }

  function followWave(npc, rideInfo) {
    npc.group.position.z = rideInfo.riderZ;
    npc.group.position.y =
      rideInfo.boardSupportHeight -
      0.08 +
      Math.abs(rideInfo.surfacePitch) * 1.8 +
      0.05;
    npc.group.rotation.set(-rideInfo.surfacePitch, Math.PI, 0);
    npc.speed = rideInfo.speed;
  }

  return {
    update(deltaTime, time, waves) {
      const step = Math.min(deltaTime, 0.05);
      const wave = waves.getWaveInfo();

      for (const npc of npcs) {
        const phase = time * 0.7 + npc.phase;
        const group = npc.group;

        if (npc.state === 'falling') {
          npc.fallTimer -= step;
          group.position.y = Math.max(0, group.position.y - step * 1.8);
          if (npc.fallTimer <= 0) {
            group.position.set(npc.baseX, 0, npc.baseZ);
            group.rotation.set(0, Math.PI, 0);
            npc.speed = 0;
            npc.state = 'paddling';
          }
          group.userData.surfState = npc.state;
          continue;
        }

        if (npc.state === 'riding') {
          const rideInfo = waves.getRideInfo(group.position, npc.riderId);
          if (!rideInfo.attached || !rideInfo.surfable) {
            startFall(npc, waves, rideInfo.waveId ?? npc.skippedWaveId);
            group.userData.surfState = npc.state;
            continue;
          }

          followWave(npc, rideInfo);
          group.userData.surfState = npc.state;
          continue;
        }

        npc.speed = Math.min(4.3, npc.speed + step * 3.2);
        group.position.y = 0.06 + Math.sin(phase) * 0.08;
        npc.board.rotation.z = Math.sin(phase) * 0.035;

        if (wave) {
          const targetX = wave.centerX + npc.laneOffset;
          group.position.x += THREE.MathUtils.clamp(
            targetX - group.position.x,
            -step * 3.5,
            step * 3.5,
          );

          if (npc.skippedWaveId !== wave.id) {
            const catchStatus = waves.getCatchStatus(
              group.position,
              npc.speed,
            );
            if (
              catchStatus.success &&
              waves.attachRider(group.position, npc.speed, npc.riderId)
            ) {
              npc.state = 'riding';
              npc.skippedWaveId = wave.id;
              setPose(npc, true);
              followWave(npc, waves.getRideInfo(group.position, npc.riderId));
              group.userData.surfState = npc.state;
              continue;
            }

            const localZ = group.position.z - wave.centerZ;
            if (wave.surfable && localZ < wave.crestWidth * 0.25) {
              npc.skippedWaveId = wave.id;
            }
          }
        } else {
          group.position.x += THREE.MathUtils.clamp(
            npc.baseX - group.position.x,
            -step * 1.5,
            step * 1.5,
          );
        }

        group.rotation.set(
          0,
          Math.PI + Math.sin(phase * 0.3) * 0.08,
          0,
        );
        const paddleStroke = Math.sin(time * 7 + npc.phase);
        npc.pronePose.arms[0].rotation.x = paddleStroke * 0.35;
        npc.pronePose.arms[1].rotation.x = -paddleStroke * 0.35;
        group.userData.surfState = npc.state;
      }
    },
  };
}

function createPose(
  THREE,
  parent,
  bodyGeometry,
  limbGeometry,
  suit,
  skin,
  standing,
) {
  const group = new THREE.Group();
  parent.add(group);

  function addBody(material, scale, position) {
    const mesh = new THREE.Mesh(bodyGeometry, material);
    mesh.scale.set(...scale);
    mesh.position.set(...position);
    group.add(mesh);
    return mesh;
  }

  function addLimb(material, position, scale, rotation) {
    const mesh = new THREE.Mesh(limbGeometry, material);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.rotation.set(...rotation);
    group.add(mesh);
    return mesh;
  }

  if (standing) {
    addBody(suit, [0.25, 0.4, 0.2], [0, 1.04, 0.04]);
    addBody(skin, [0.18, 0.18, 0.18], [0, 1.63, 0.02]);
    for (const side of [-1, 1]) {
      addLimb(suit, [side * 0.14, 0.49, side * 0.2], [0.9, 0.38, 0.9], [side * 0.12, 0, 0]);
      addLimb(skin, [side * 0.34, 1.08, 0], [0.72, 0.39, 0.72], [0, 0, side * -0.75]);
    }
    return { group, arms: [] };
  }

  addBody(suit, [0.25, 0.15, 0.58], [0, 0.44, 0.08]);
  addBody(skin, [0.16, 0.16, 0.18], [0, 0.48, -0.55]);
  const arms = [
    addLimb(skin, [-0.29, 0.38, -0.2], [0.72, 0.3, 0.7], [0, 0, 0.9]),
    addLimb(skin, [0.29, 0.38, -0.2], [0.72, 0.3, 0.7], [0, 0, -0.9]),
  ];
  addLimb(suit, [-0.12, 0.37, 0.62], [0.8, 0.3, 0.8], [0.2, 0, 0]);
  addLimb(suit, [0.12, 0.37, 0.62], [0.8, 0.3, 0.8], [-0.2, 0, 0]);
  return { group, arms };
}

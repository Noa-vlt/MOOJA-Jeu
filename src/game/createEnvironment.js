export function createEnvironment(THREE, scene, { lowPower = false } = {}) {
  const weatherPresets = createWeatherPresets(THREE);
  const oceanGeometry = createSurfaceGeometry(THREE, {
    widthSegments: 96,
    depthSegments: 64,
    shoreline: true,
    depth: -220,
    height: 0,
  });
  const oceanMaterial = lowPower
    ? new THREE.MeshPhongMaterial({
        color: 0x168c99,
        specular: 0x4c9fa0,
        shininess: 42,
      })
    : new THREE.MeshPhysicalMaterial({
        color: 0x168c99,
        roughness: 0.32,
        metalness: 0.04,
        clearcoat: 0.55,
        clearcoatRoughness: 0.28,
      });
  oceanMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uWaveScale = { value: 1 };
    oceanMaterial.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uTime;\nuniform float uWaveScale;\nvarying vec3 vOceanPosition;',
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        float waveX = position.x * 0.12 + uTime * 0.8;
        float waveZ = position.z * 0.1 - uTime * 0.55 + position.x * 0.035;
        float waveDx = cos(waveX) * 0.0156 + cos(waveZ) * 0.0035;
        float waveDz = cos(waveZ) * 0.01;
        objectNormal = normalize(vec3(-waveDx, 1.0, -waveDz));`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed.y += (
          sin(waveX) * 0.13 + sin(waveZ) * 0.1
        ) * uWaveScale;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvOceanPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uTime;\nvarying vec3 vOceanPosition;',
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float ripple = sin(
          vOceanPosition.z * 0.22 +
          sin(vOceanPosition.x * 0.045 + uTime * 0.25) * 1.7 +
          uTime * 0.6
        );
        float shimmer = smoothstep(0.94, 0.995, ripple);
        diffuseColor.rgb = mix(
          diffuseColor.rgb,
          vec3(0.34, 0.78, 0.72),
          shimmer * 0.14
        );`,
      );
  };
  const ocean = new THREE.Mesh(oceanGeometry, oceanMaterial);
  ocean.name = 'ocean';
  scene.add(ocean);

  const beachGeometry = createSurfaceGeometry(THREE, {
    widthSegments: 96,
    depthSegments: 24,
    shoreline: false,
    depth: 110,
    height: 0,
  });
  const beachMaterial = lowPower
    ? new THREE.MeshLambertMaterial({ color: 0xd8bd8c })
    : new THREE.MeshStandardMaterial({
        color: 0xd8bd8c,
        roughness: 1,
      });
  const beach = new THREE.Mesh(beachGeometry, beachMaterial);
  beach.name = 'beach';
  scene.add(beach);

  addBeachDecorations(THREE, scene, lowPower);

  const shoreFoam = createShoreFoam(THREE);
  scene.add(shoreFoam);

  const sky = createSky(THREE);
  scene.add(sky);

  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(5.5, 24, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffe6ad,
      transparent: true,
      depthWrite: false,
    }),
  );
  sun.position.set(-46, 34, -150);
  scene.add(sun);

  const clouds = addClouds(THREE, scene, lowPower);
  const { skyLight, sunlight } = addLighting(THREE, scene);
  const rain = createRain(THREE, scene, lowPower ? 160 : 320);
  const fogColor = new THREE.Color(0x9dcbd0);
  scene.fog = new THREE.FogExp2(fogColor, 0);

  let currentWeather = 'sunny';
  let lastTime = 0;
  let oceanWaveScale = 1;
  const skyMaterial = sky.material;

  return {
    update(time, condition = currentWeather) {
      if (weatherPresets[condition]) currentWeather = condition;
      const preset = weatherPresets[currentWeather];
      const deltaTime = Math.max(0, time - lastTime);
      const blend = 1 - Math.exp(-0.65 * deltaTime);
      lastTime = time;

      skyMaterial.uniforms.uHorizon.value.lerp(preset.horizon, blend);
      skyMaterial.uniforms.uZenith.value.lerp(preset.zenith, blend);
      fogColor.lerp(preset.fogColor, blend);
      scene.fog.color.copy(fogColor);
      scene.fog.density += (preset.fogDensity - scene.fog.density) * blend;
      sunlight.intensity += (preset.sunIntensity - sunlight.intensity) * blend;
      skyLight.intensity += (preset.skyIntensity - skyLight.intensity) * blend;
      sunlight.color.lerp(preset.sunColor, blend);
      skyLight.color.lerp(preset.skyLightColor, blend);
      oceanMaterial.color.lerp(preset.oceanColor, blend);
      clouds.material.opacity += (preset.cloudOpacity - clouds.material.opacity) * blend;
      sun.material.opacity += (preset.sunOpacity - sun.material.opacity) * blend;
      rain.material.opacity += (preset.rainOpacity - rain.material.opacity) * blend;
      oceanWaveScale += (preset.oceanWaveScale - oceanWaveScale) * blend;

      for (const [index, cloud] of clouds.groups.entries()) {
        cloud.position.x =
          clouds.basePositions[index].x + Math.sin(time * 0.035 + index) * 2.5;
      }

      const oceanShader = oceanMaterial.userData.shader;
      if (oceanShader) {
        oceanShader.uniforms.uTime.value = time;
        oceanShader.uniforms.uWaveScale.value = oceanWaveScale;
      }
      shoreFoam.material.opacity = 0.48 + Math.sin(time * 1.3) * 0.08;
      updateRain(rain, deltaTime, time);
    },
  };
}

function addBeachDecorations(THREE, scene, lowPower) {
  const group = new THREE.Group();
  group.name = 'saint-gilles-beach-decorations';
  scene.add(group);

  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, lowPower ? 6 : 8);
  const personGeometry = new THREE.SphereGeometry(
    1,
    lowPower ? 7 : 10,
    lowPower ? 5 : 7,
  );
  const postGeometry = new THREE.CylinderGeometry(
    0.075,
    0.09,
    3.8,
    lowPower ? 5 : 7,
  );
  const seatMaterial = new THREE.MeshLambertMaterial({ color: 0xf2eee3 });
  const frameMaterial = new THREE.MeshLambertMaterial({ color: 0x87908a });
  const towelMaterials = [
    new THREE.MeshLambertMaterial({ color: 0xf0a66f }),
    new THREE.MeshLambertMaterial({ color: 0x75b8b0 }),
    new THREE.MeshLambertMaterial({ color: 0xf0d66d }),
    new THREE.MeshLambertMaterial({ color: 0xd88787 }),
  ];
  const canopyMaterials = [
    new THREE.MeshLambertMaterial({ color: 0xfff0cc }),
    new THREE.MeshLambertMaterial({ color: 0xe89977 }),
    new THREE.MeshLambertMaterial({ color: 0x79aaa0 }),
  ];
  const skinMaterials = [
    new THREE.MeshLambertMaterial({ color: 0xc98d68 }),
    new THREE.MeshLambertMaterial({ color: 0xe0aa80 }),
    new THREE.MeshLambertMaterial({ color: 0x9e664b }),
  ];
  const clothingMaterials = [
    new THREE.MeshLambertMaterial({ color: 0x315e67 }),
    new THREE.MeshLambertMaterial({ color: 0xe6a66f }),
    new THREE.MeshLambertMaterial({ color: 0x697d9a }),
    new THREE.MeshLambertMaterial({ color: 0xd7d0b1 }),
  ];
  const shopWallMaterials = [
    new THREE.MeshLambertMaterial({ color: 0xf0dfbb }),
    new THREE.MeshLambertMaterial({ color: 0xe7d4ae }),
    new THREE.MeshLambertMaterial({ color: 0xe8caa1 }),
  ];
  const shopTrimMaterials = [
    new THREE.MeshLambertMaterial({ color: 0x39716b }),
    new THREE.MeshLambertMaterial({ color: 0xe47e59 }),
    new THREE.MeshLambertMaterial({ color: 0x638caa }),
  ];
  const shopShadeMaterial = new THREE.MeshLambertMaterial({ color: 0x554b41 });

  function addBox(parent, material, position, size, rotationZ = 0) {
    const mesh = new THREE.Mesh(boxGeometry, material);
    mesh.position.set(...position);
    mesh.scale.set(...size);
    mesh.rotation.z = rotationZ;
    parent.add(mesh);
    return mesh;
  }

  function addCylinder(parent, material, position, radius, height) {
    const mesh = new THREE.Mesh(cylinderGeometry, material);
    mesh.position.set(...position);
    mesh.scale.set(radius, height, radius);
    parent.add(mesh);
    return mesh;
  }

  function addTowel(parent, material, position, rotation = 0) {
    const towel = addBox(
      parent,
      material,
      [position[0], position[1] + 0.025, position[2]],
      [1.65, 0.05, 3.1],
      rotation,
    );
    towel.rotation.y = rotation;
  }

  function addLounger(parent, position, rotation, fabricMaterial) {
    const lounger = new THREE.Group();
    lounger.position.set(...position);
    lounger.rotation.y = rotation;
    parent.add(lounger);

    addBox(lounger, fabricMaterial, [0, 0.43, 0.2], [0.9, 0.1, 1.55]);
    addBox(
      lounger,
      fabricMaterial,
      [0, 0.72, -0.75],
      [0.9, 0.1, 0.9],
      -0.28,
    );
    for (const x of [-0.36, 0.36]) {
      addBox(lounger, frameMaterial, [x, 0.21, -0.35], [0.065, 0.42, 0.08]);
      addBox(lounger, frameMaterial, [x, 0.21, 0.8], [0.065, 0.42, 0.08]);
    }
  }

  function addUmbrella(parent, material, position) {
    const umbrella = new THREE.Group();
    umbrella.position.set(...position);
    parent.add(umbrella);

    const pole = addCylinder(
      umbrella,
      frameMaterial,
      [0, 1.12, 0],
      0.045,
      2.2,
    );
    pole.rotation.z = -0.035;

    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(1.25, 0.62, lowPower ? 9 : 12),
      material,
    );
    canopy.position.y = 2.12;
    canopy.scale.y = 0.55;
    umbrella.add(canopy);
  }

  function addBeachPerson(parent, position, clothing, skin, lyingDown = false) {
    const person = new THREE.Group();
    person.position.set(...position);
    if (lyingDown) person.rotation.x = Math.PI / 2;
    parent.add(person);

    const torso = new THREE.Mesh(personGeometry, clothing);
    torso.position.set(0, lyingDown ? 0.5 : 0.86, 0);
    torso.scale.set(0.25, lyingDown ? 0.48 : 0.42, 0.19);
    person.add(torso);

    const head = new THREE.Mesh(personGeometry, skin);
    head.position.set(0, lyingDown ? 0.48 : 1.48, lyingDown ? -0.47 : 0);
    head.scale.setScalar(0.19);
    person.add(head);

    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(cylinderGeometry, skin);
      arm.position.set(side * 0.31, lyingDown ? 0.48 : 0.92, 0.03);
      arm.scale.set(0.07, lyingDown ? 0.55 : 0.48, 0.07);
      arm.rotation.z = side * (lyingDown ? 1.05 : 0.22);
      person.add(arm);

      const leg = new THREE.Mesh(cylinderGeometry, clothing);
      leg.position.set(side * 0.12, lyingDown ? 0.52 : 0.29, 0.34);
      leg.scale.set(0.09, lyingDown ? 0.55 : 0.57, 0.09);
      leg.rotation.x = lyingDown ? Math.PI / 2 : 0.12;
      person.add(leg);
    }
  }

  const beachColumns = lowPower
    ? [-42, -28, -14, 14, 28, 42]
    : [-48, -36, -24, -12, 24, 36, 48];
  const beachRows = [14, 30, 46, 62];
  const beachSpots = beachRows.flatMap((z, row) =>
    beachColumns.map((x, column) => ({
      x,
      z,
      rotation: Math.sin(row * 2 + column) * 0.28,
    })),
  );

  for (const [index, spot] of beachSpots.entries()) {
    const spotGroup = new THREE.Group();
    spotGroup.position.set(
      spot.x,
      Math.sin(spot.x * 0.045) * 0.12 + Math.sin(spot.z * 0.08) * 0.07,
      spot.z,
    );
    spotGroup.rotation.y = spot.rotation;
    group.add(spotGroup);

    const fabric = towelMaterials[index % towelMaterials.length];
    addTowel(spotGroup, fabric, [0, 0, 0]);
    if (index % (lowPower ? 5 : 4) === 0) {
      addLounger(spotGroup, [1.55, 0, 0.15], -0.12, seatMaterial);
    }
    if (index % (lowPower ? 6 : 5) === 1) {
      addUmbrella(
        spotGroup,
        canopyMaterials[index % canopyMaterials.length],
        [-1.4, 0, -0.1],
      );
    }
    if (index % (lowPower ? 7 : 5) === 2) {
      addBeachPerson(
        spotGroup,
        [index % 2 === 0 ? 1.55 : -1.3, 0, -0.25],
        clothingMaterials[index % clothingMaterials.length],
        skinMaterials[index % skinMaterials.length],
        true,
      );
    }
  }

  const shopData = [
    { x: -52, name: 'LE COMPTOIR', subline: 'CAFÉ & SNACKS' },
    { x: 0, name: 'LES GLACES', subline: 'DOUCEUR DE L’ÉTÉ' },
    { x: 52, name: 'SURF SHOP', subline: 'LOCATION & CONSEILS' },
  ];
  for (const [index, shop] of shopData.entries()) {
    const shopY = Math.sin(shop.x * 0.045) * 0.12 + Math.sin(83 * 0.08) * 0.07;
    const shopGroup = new THREE.Group();
    shopGroup.name = `beach-shop-${index + 1}`;
    shopGroup.position.set(shop.x, shopY, 77);
    shopGroup.scale.setScalar(1.3);
    group.add(shopGroup);

    addBeachShop(
      THREE,
      shopGroup,
      boxGeometry,
      shopWallMaterials[index],
      shopTrimMaterials[index],
      shopShadeMaterial,
      shop.name,
      shop.subline,
      index,
      lowPower,
    );
  }

  const signX = 12;
  const signZ = 23;
  const signY = Math.sin(signX * 0.045) * 0.12 + Math.sin(signZ * 0.08) * 0.07;
  for (const xOffset of [-3.35, 3.35]) {
    const post = new THREE.Mesh(postGeometry, frameMaterial);
    post.position.set(signX + xOffset, signY + 1.85, signZ);
    group.add(post);
  }

  const signBacking = addBox(
    group,
    new THREE.MeshLambertMaterial({ color: 0x174d50 }),
    [signX, signY + 3.05, signZ],
    [7.6, 1.65, 0.22],
  );
  signBacking.rotation.y = Math.PI;

  const signCanvas = document.createElement('canvas');
  signCanvas.width = 1024;
  signCanvas.height = 256;
  const context = signCanvas.getContext('2d');
  if (!context) throw new Error('Unable to render the beach welcome sign.');
  context.fillStyle = '#174d50';
  context.fillRect(0, 0, signCanvas.width, signCanvas.height);
  context.strokeStyle = '#f1d8a2';
  context.lineWidth = 12;
  context.strokeRect(12, 12, signCanvas.width - 24, signCanvas.height - 24);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#fff4d7';
  context.font = '600 52px -apple-system, BlinkMacSystemFont, sans-serif';
  context.fillText('Bienvenue à', signCanvas.width / 2, 82);
  context.font = '700 58px -apple-system, BlinkMacSystemFont, sans-serif';
  context.fillText('Saint-Gilles-Croix-de-Vie', signCanvas.width / 2, 168);
  const signTexture = new THREE.CanvasTexture(signCanvas);
  signTexture.colorSpace = THREE.SRGBColorSpace;
  const signFace = new THREE.Mesh(
    new THREE.PlaneGeometry(7.4, 1.45),
    new THREE.MeshBasicMaterial({ map: signTexture }),
  );
  signFace.position.set(signX, signY + 3.05, signZ - 0.13);
  signFace.rotation.y = Math.PI;
  group.add(signFace);
}

function addBeachShop(
  THREE,
  group,
  boxGeometry,
  wallMaterial,
  trimMaterial,
  shadeMaterial,
  name,
  subline,
  variant,
  lowPower,
) {
  function addBox(material, position, size) {
    const mesh = new THREE.Mesh(boxGeometry, material);
    mesh.position.set(...position);
    mesh.scale.set(...size);
    group.add(mesh);
    return mesh;
  }

  addBox(wallMaterial, [0, 2.6, 0], [14, 5.2, 6]);
  addBox(trimMaterial, [0, 2.9, -3.08], [10.5, 2.25, 0.14]);
  addBox(shadeMaterial, [0, 2.9, -3.18], [8.4, 1.65, 0.08]);
  addBox(trimMaterial, [0, 1.05, -3.48], [10.8, 0.95, 0.85]);
  addBox(wallMaterial, [-6.25, 2.65, -3.1], [1.2, 3.2, 0.25]);
  addBox(wallMaterial, [6.25, 2.65, -3.1], [1.2, 3.2, 0.25]);
  addBox(wallMaterial, [0, 5.25, -3.12], [13.4, 0.38, 6.35]);
  addBox(trimMaterial, [0, 5.12, -3.85], [11.8, 0.38, 1.55]);

  const stripeCount = lowPower ? 6 : 10;
  for (let stripe = 0; stripe < stripeCount; stripe += 1) {
    const stripeWidth = 11.8 / stripeCount;
    const stripeMaterial = stripe % 2 === 0 ? wallMaterial : trimMaterial;
    const awningStripe = new THREE.Mesh(boxGeometry, stripeMaterial);
    awningStripe.position.set(
      -5.9 + stripeWidth * (stripe + 0.5),
      4.9,
      -4.18,
    );
    awningStripe.scale.set(stripeWidth + 0.015, 0.12, 0.72);
    group.add(awningStripe);
  }

  const signCanvas = document.createElement('canvas');
  signCanvas.width = 768;
  signCanvas.height = 192;
  const context = signCanvas.getContext('2d');
  if (!context) throw new Error('Unable to render a beach shop sign.');
  context.fillStyle = '#f6edda';
  context.fillRect(0, 0, signCanvas.width, signCanvas.height);
  context.fillStyle = variant === 1 ? '#554b41' : '#244d50';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '700 58px -apple-system, BlinkMacSystemFont, sans-serif';
  context.fillText(name, signCanvas.width / 2, 76);
  context.font = '600 26px -apple-system, BlinkMacSystemFont, sans-serif';
  context.fillText(subline, signCanvas.width / 2, 139);
  const signTexture = new THREE.CanvasTexture(signCanvas);
  signTexture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(9.2, 2.3),
    new THREE.MeshBasicMaterial({ map: signTexture }),
  );
  sign.position.set(0, 2.92, -3.27);
  sign.rotation.y = Math.PI;
  group.add(sign);
}

function createSurfaceGeometry(
  THREE,
  { widthSegments, depthSegments, shoreline, depth, height },
) {
  const width = 240;
  const vertices = [];
  const indices = [];

  for (let row = 0; row <= depthSegments; row += 1) {
    const depthRatio = row / depthSegments;

    for (let column = 0; column <= widthSegments; column += 1) {
      const x = ((column / widthSegments) - 0.5) * width;
      const shoreZ = shorelineZ(x);
      const z = shoreline
        ? -220 + depthRatio * (shoreZ + 220)
        : shoreZ + depthRatio * depth;
      const sandHeight =
        shoreline ? 0 : Math.sin(x * 0.045) * 0.12 + Math.sin(z * 0.08) * 0.07;

      vertices.push(x, height + sandHeight, z);
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
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createShoreFoam(THREE) {
  const widthSegments = 180;
  const depthSegments = 2;
  const vertices = [];
  const indices = [];

  for (let row = 0; row <= depthSegments; row += 1) {
    const offset = -0.75 + (row / depthSegments) * 1.2;
    for (let column = 0; column <= widthSegments; column += 1) {
      const x = ((column / widthSegments) - 0.5) * 240;
      const z = shorelineZ(x) + offset;
      vertices.push(x, 0.13, z);
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
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: 0xe9f5e8,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
}

function shorelineZ(x) {
  return 3 + Math.sin(x * 0.035) * 1.4 + Math.sin(x * 0.09) * 0.45;
}

function createSky(THREE) {
  const geometry = new THREE.SphereGeometry(300, 32, 24);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uHorizon: { value: new THREE.Color(0xC7E0DF) },
      uZenith: { value: new THREE.Color(0x4D9FB8) },
    },
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uHorizon;
      uniform vec3 uZenith;
      varying vec3 vDirection;
      void main() {
        float height = normalize(vDirection).y;
        float gradient = smoothstep(-0.12, 0.72, height);
        vec3 sky = mix(uHorizon, uZenith, gradient);
        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });
  return new THREE.Mesh(geometry, material);
}

function addClouds(THREE, scene, lowPower) {
  const geometry = new THREE.SphereGeometry(
    1,
    lowPower ? 10 : 16,
    lowPower ? 7 : 10,
  );
  const material = lowPower
    ? new THREE.MeshLambertMaterial({
        color: 0xf6f5ee,
        transparent: true,
        opacity: 0.8,
      })
    : new THREE.MeshStandardMaterial({
        color: 0xf6f5ee,
        roughness: 1,
        transparent: true,
        opacity: 0.8,
      });
  const cloudPositions = [
    [-68, 34, -105, 1.2],
    [6, 43, -145, 0.85],
    [68, 32, -115, 1.05],
  ];
  const groups = [];
  const basePositions = [];

  for (const [x, y, z, scale] of cloudPositions) {
    const cloud = new THREE.Group();
    cloud.position.set(x, y, z);
    cloud.scale.setScalar(scale);

    for (const [offsetX, offsetY, offsetZ, puffScale] of [
      [-5, 0, 0, [5, 2, 2.4]],
      [-1, 1.4, 0, [6, 3, 3]],
      [4, 0.3, 0.5, [5, 2.2, 2.5]],
      [0, -0.6, 0.4, [7, 1.5, 2.4]],
    ]) {
      const puff = new THREE.Mesh(geometry, material);
      puff.position.set(offsetX, offsetY, offsetZ);
      puff.scale.set(...puffScale);
      cloud.add(puff);
    }

    scene.add(cloud);
    groups.push(cloud);
    basePositions.push({ x, y, z });
  }

  return { groups, basePositions, material };
}

function addLighting(THREE, scene) {
  const skyLight = new THREE.HemisphereLight(0xd8f3f4, 0xd7b98b, 2.1);
  scene.add(skyLight);

  const sunlight = new THREE.DirectionalLight(0xffe1ad, 2.2);
  sunlight.position.set(-55, 75, 35);
  scene.add(sunlight);
  return { skyLight, sunlight };
}

function createWeatherPresets(THREE) {
  return {
    sunny: {
      horizon: new THREE.Color(0xc7e0df),
      zenith: new THREE.Color(0x4d9fb8),
      fogColor: new THREE.Color(0xc7e0df),
      fogDensity: 0,
      sunIntensity: 2.2,
      skyIntensity: 2.1,
      sunColor: new THREE.Color(0xffe1ad),
      skyLightColor: new THREE.Color(0xd8f3f4),
      oceanColor: new THREE.Color(0x168c99),
      cloudOpacity: 0.8,
      sunOpacity: 1,
      rainOpacity: 0,
      oceanWaveScale: 1,
    },
    cloudy: {
      horizon: new THREE.Color(0xb7c9ca),
      zenith: new THREE.Color(0x718f9a),
      fogColor: new THREE.Color(0xb7c9ca),
      fogDensity: 0.0015,
      sunIntensity: 1.45,
      skyIntensity: 1.8,
      sunColor: new THREE.Color(0xe4e4dc),
      skyLightColor: new THREE.Color(0xc4d1d2),
      oceanColor: new THREE.Color(0x287d87),
      cloudOpacity: 0.96,
      sunOpacity: 0.45,
      rainOpacity: 0,
      oceanWaveScale: 1.06,
    },
    fog: {
      horizon: new THREE.Color(0xc4cfcd),
      zenith: new THREE.Color(0xa6b8b8),
      fogColor: new THREE.Color(0xc4cfcd),
      fogDensity: 0.011,
      sunIntensity: 0.9,
      skyIntensity: 1.7,
      sunColor: new THREE.Color(0xe3e0d4),
      skyLightColor: new THREE.Color(0xcbd6d2),
      oceanColor: new THREE.Color(0x4b8587),
      cloudOpacity: 0.72,
      sunOpacity: 0.2,
      rainOpacity: 0,
      oceanWaveScale: 0.97,
    },
    storm: {
      horizon: new THREE.Color(0x65777b),
      zenith: new THREE.Color(0x394e5b),
      fogColor: new THREE.Color(0x65777b),
      fogDensity: 0.004,
      sunIntensity: 0.72,
      skyIntensity: 1.15,
      sunColor: new THREE.Color(0xaebec2),
      skyLightColor: new THREE.Color(0x9eafb5),
      oceanColor: new THREE.Color(0x145762),
      cloudOpacity: 1,
      sunOpacity: 0.04,
      rainOpacity: 0.62,
      oceanWaveScale: 1.18,
    },
    sunset: {
      horizon: new THREE.Color(0xf0a27f),
      zenith: new THREE.Color(0x705b83),
      fogColor: new THREE.Color(0xe7a18a),
      fogDensity: 0.001,
      sunIntensity: 1.8,
      skyIntensity: 1.75,
      sunColor: new THREE.Color(0xffa66f),
      skyLightColor: new THREE.Color(0xf1c0a3),
      oceanColor: new THREE.Color(0x9a6c68),
      cloudOpacity: 0.86,
      sunOpacity: 1,
      rainOpacity: 0,
      oceanWaveScale: 0.98,
    },
  };
}

function createRain(THREE, scene, count) {
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (Math.random() - 0.5) * 140;
    positions[index * 3 + 1] = Math.random() * 65;
    positions[index * 3 + 2] = (Math.random() - 0.5) * 140;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xc3e0e5,
    size: 0.16,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);
  return { geometry, material, positions };
}

function updateRain(rain, deltaTime, time) {
  if (rain.material.opacity <= 0.01 || deltaTime === 0) return;

  for (let index = 0; index < rain.positions.length / 3; index += 1) {
    const heightIndex = index * 3 + 1;
    rain.positions[heightIndex] -= deltaTime * 24;
    rain.positions[index * 3] -= deltaTime * 3;
    if (rain.positions[heightIndex] < 0) {
      rain.positions[heightIndex] = 45 + ((index * 17 + time * 11) % 20);
      rain.positions[index * 3] =
        Math.sin(index * 12.9898 + time) * 70;
    }
  }

  rain.geometry.attributes.position.needsUpdate = true;
}

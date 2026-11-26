// The Three.js world: a procedural archipelago, an animated ocean, a cirrus-dusted sky, a working
// airstrip, five gate hoops and the Kestrel KR-7 itself. Nothing is loaded from disk except the
// vendored Three.js module; every texture below is drawn into an offscreen canvas at boot.

import * as THREE from 'three';
import { ISLANDS, RINGS, RUNWAY, START, SUN_DIR } from './config.js';
import { clamp, createRandom, fbm, smoothstep } from './noise.js';

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const LOCAL_FORWARD = new THREE.Vector3(0, 0, -1);

const sunDirection = new THREE.Vector3(SUN_DIR.x, SUN_DIR.y, SUN_DIR.z).normalize();

// ------------------------------------------------------------------ terrain height

function islandHeight(island, x, z) {
  const dx = (x - island.x) / island.rx;
  const dz = (z - island.z) / island.rz;
  const distance = Math.sqrt(dx * dx + dz * dz);
  if (island.flat) {
    if (distance >= 1.06) return 0;
    const shelf = 1 - smoothstep(0.78, 1.06, distance);
    const ripple = (fbm(x * 0.045, z * 0.045, island.seed + 3, 2) - 0.5) * 2.4;
    return Math.max(0, (island.height + ripple) * shelf);
  }
  if (distance >= 1.04) return 0;
  const falloff = 1 - smoothstep(0.2, 1.04, distance);
  const coarse = fbm((x - island.x) * 0.0056 + 12.7, (z - island.z) * 0.0056 - 6.1, island.seed, 4);
  const ridge = Math.pow(1 - Math.abs(coarse * 2 - 1), 1.55);
  const detail = fbm((x - island.x) * 0.026 + 2.2, (z - island.z) * 0.026 + 8.8, island.seed + 9, 3);
  let height = falloff * (island.height * (0.18 + 0.82 * ridge) + 14);
  height += (detail - 0.5) * 15 * falloff;
  return Math.max(0, height);
}

export function terrainHeightAt(x, z) {
  let height = 0;
  for (let index = 0; index < ISLANDS.length; index += 1) {
    const value = islandHeight(ISLANDS[index], x, z);
    if (value > height) height = value;
  }
  if (Math.abs(x - RUNWAY.x) <= RUNWAY.width * 0.5 + 4 && Math.abs(z - RUNWAY.z) <= RUNWAY.length * 0.5 + 8) {
    height = Math.max(height, RUNWAY.deck);
  }
  return height;
}

// ------------------------------------------------------------------ small canvas textures

function canvasTexture(width, height, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  paint(context, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function makeRunwayTexture() {
  return canvasTexture(256, 2048, (context, width, height) => {
    context.fillStyle = '#2d3236';
    context.fillRect(0, 0, width, height);
    context.fillStyle = 'rgba(255,255,255,0.07)';
    for (let y = 0; y < height; y += 7) context.fillRect(0, y, width, 1);

    // Edges.
    context.fillStyle = '#d7ddd6';
    context.fillRect(10, 0, 8, height);
    context.fillRect(width - 18, 0, 8, height);

    // Dashed centreline.
    context.fillStyle = '#efe9d8';
    for (let y = 86; y < height - 86; y += 118) {
      context.fillRect(width * 0.5 - 5, y, 10, 62);
    }

    // Threshold piano keys, one set at each end.
    function keys(top) {
      for (let index = 0; index < 6; index += 1) {
        const x = 32 + index * 34;
        context.fillRect(x, top, 18, 58);
      }
      context.fillRect(width * 0.5 - 28, top + 78, 56, 10);
      context.fillRect(width * 0.5 - 28, top + 118, 56, 10);
    }
    context.fillStyle = '#e8e3d4';
    keys(24);
    keys(height - 82);

    // Runway designators: 36 for the northbound approach, 18 for the opposite.
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#e8e3d4';
    context.font = '700 118px system-ui, sans-serif';
    context.save();
    context.translate(width / 2, height - 190);
    context.fillText('36', 0, 0);
    context.restore();
    context.save();
    context.translate(width / 2, 190);
    context.rotate(Math.PI);
    context.fillText('18', 0, 0);
    context.restore();

    // Scuffs and touchdown marks.
    context.fillStyle = 'rgba(12,14,16,0.4)';
    for (let index = 0; index < 20; index += 1) {
      const x = 24 + ((index * 71) % (width - 48));
      const y = 380 + ((index * 233) % 1300);
      context.fillRect(x, y, 3 + (index % 4) * 2, 14 + (index % 5) * 4);
    }
    context.fillStyle = 'rgba(238,232,214,0.75)';
    for (let index = 0; index < 4; index += 1) {
      context.fillRect(width * 0.5 - 52, height - 320 + index * 16, 12, 8);
      context.fillRect(width * 0.5 + 40, height - 320 + index * 16, 12, 8);
    }
  });
}

function makeRingLabel(number) {
  return canvasTexture(256, 128, (context, width, height) => {
    context.clearRect(0, 0, width, height);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.shadowColor = 'rgba(126,241,255,0.9)';
    context.shadowBlur = 22;
    context.fillStyle = '#d5fbff';
    context.font = '700 78px system-ui, sans-serif';
    context.fillText(String(number).padStart(2, '0'), width / 2, height / 2 - 4);
  });
}

function makeSunTexture() {
  return canvasTexture(256, 256, (context, width, height) => {
    const gradient = context.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 2);
    gradient.addColorStop(0, 'rgba(255,250,226,1)');
    gradient.addColorStop(0.12, 'rgba(255,242,202,0.98)');
    gradient.addColorStop(0.3, 'rgba(255,209,137,0.45)');
    gradient.addColorStop(0.62, 'rgba(255,188,110,0.12)');
    gradient.addColorStop(1, 'rgba(255,178,96,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  });
}

function makeRegistrationTexture() {
  return canvasTexture(256, 128, (context, width, height) => {
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#eef8fb';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '700 62px system-ui, sans-serif';
    context.fillText('KR-7', width / 2, height / 2 + 1);
    context.fillStyle = '#ff8a3d';
    context.fillRect(width / 2 - 58, height / 2 + 38, 116, 5);
  });
}

function makeGlowTexture() {
  return canvasTexture(256, 256, (context, width, height) => {
    const gradient = context.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 2);
    gradient.addColorStop(0, 'rgba(126,241,255,0.62)');
    gradient.addColorStop(0.22, 'rgba(100,222,255,0.26)');
    gradient.addColorStop(0.55, 'rgba(78,194,255,0.075)');
    gradient.addColorStop(1, 'rgba(78,194,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  });
}

function makeCloudTexture(seed) {
  return canvasTexture(256, 128, (context, width, height) => {
    context.clearRect(0, 0, width, height);
    const random = createRandom(seed);
    const blobs = 7 + Math.floor(random() * 4);
    for (let index = 0; index < blobs; index += 1) {
      const x = width * (0.18 + random() * 0.64);
      const y = height * (0.36 + random() * 0.32);
      const radius = 22 + random() * 34;
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      const warm = 248 + Math.floor(random() * 7);
      gradient.addColorStop(0, `rgba(255, ${warm}, ${238 + Math.floor(random() * 10)}, 0.82)`);
      gradient.addColorStop(0.46, `rgba(255, ${warm - 4}, 235, 0.52)`);
      gradient.addColorStop(0.78, 'rgba(250, 244, 232, 0.16)');
      gradient.addColorStop(1, 'rgba(250, 244, 232, 0)');
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
  });
}

// ------------------------------------------------------------------ scene

function detectSoftwareRenderer() {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return false;
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    const name = extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : '';
    const software = /swiftshader|llvmpipe|software/i.test(name);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return software;
  } catch {
    return false;
  }
}

export function createScene(worldCanvas, { quality = 'auto' } = {}) {
  // Screenshots always render at full quality. A live game on a software rasteriser (a headless
  // CI box, for instance) drops MSAA and internal resolution so the flight stays responsive.
  const lowQuality = quality === 'auto' && detectSoftwareRenderer();
  const renderer = new THREE.WebGLRenderer({
    canvas: worldCanvas,
    antialias: !lowQuality,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(lowQuality ? 0.55 : Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xc5d8de, 2300, 10000);
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.08, 26000);
  camera.position.set(0, 180, 2100);
  scene.add(camera);

  // Lights.
  const hemisphere = new THREE.HemisphereLight(0xd8ebff, 0x69724f, 1.55);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xfff2d8, 3.05);
  sun.position.copy(sunDirection).multiplyScalar(6000);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xaad4f2, 0.42);
  fill.position.set(3000, 1200, -2400);
  scene.add(fill);

  // Sky dome, attached to the camera position each frame so it never gets closer.
  const skyGroup = new THREE.Group();
  const skyGeometry = new THREE.SphereGeometry(17000, lowQuality ? 22 : 40, lowQuality ? 12 : 24);
  const skyPositions = skyGeometry.attributes.position;
  const skyColors = new Float32Array(skyPositions.count * 3);
  const horizonColor = new THREE.Color('#f1c78f');
  const midColor = new THREE.Color('#77a8d2');
  const zenithColor = new THREE.Color('#1d4a84');
  const belowColor = new THREE.Color('#91aab6');
  const skyColor = new THREE.Color();
  for (let index = 0; index < skyPositions.count; index += 1) {
    const y = skyPositions.getY(index) / 17000;
    if (y >= 0) {
      if (y < 0.15) skyColor.copy(horizonColor).lerp(midColor, smoothstep(0, 0.15, y));
      else skyColor.copy(midColor).lerp(zenithColor, smoothstep(0.15, 0.95, y));
    } else {
      skyColor.copy(horizonColor).lerp(belowColor, clamp(-y * 6, 0, 1));
    }
    skyColors[index * 3] = skyColor.r;
    skyColors[index * 3 + 1] = skyColor.g;
    skyColors[index * 3 + 2] = skyColor.b;
  }
  skyGeometry.setAttribute('color', new THREE.BufferAttribute(skyColors, 3));
  const skyMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  sky.frustumCulled = false;
  sky.renderOrder = -20;
  skyGroup.add(sky);

  const sunTexture = makeSunTexture();
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunTexture,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
  }));
  sunSprite.position.copy(sunDirection).multiplyScalar(15000);
  sunSprite.scale.set(2900, 2900, 1);
  sunSprite.renderOrder = -19;
  skyGroup.add(sunSprite);
  scene.add(skyGroup);

  // Ocean: one very large plane with a procedural normal glint and aerial fog in the shader.
  const oceanUniforms = {
    uTime: { value: 0 },
    uCam: { value: new THREE.Vector3() },
    uSun: { value: sunDirection.clone() },
    uDeep: { value: new THREE.Color(0x0a4256) },
    uHorizon: { value: new THREE.Color(0x9fcbd6) },
    uFog: { value: new THREE.Color(0xc5d8de) },
  };
  const oceanMaterial = new THREE.ShaderMaterial({
    uniforms: oceanUniforms,
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uCam;
      uniform vec3 uSun;
      uniform vec3 uDeep;
      uniform vec3 uHorizon;
      uniform vec3 uFog;
      varying vec3 vWorld;
      void main() {
        vec2 p = vWorld.xz;
        float t = uTime;
        float distance = length(uCam - vWorld);
        #ifdef LOW_QUALITY
          float a = sin(p.x * 0.058 + t * 1.05) + sin(p.y * 0.081 - t * 0.78);
          vec3 normal = normalize(vec3(a * 0.021, 1.0, a * 0.017));
          vec3 viewDir = normalize(uCam - vWorld);
          float fresnel = clamp(1.0 - viewDir.y, 0.0, 1.0);
          vec3 colour = mix(uDeep, uHorizon, clamp(fresnel * fresnel * 1.3, 0.0, 1.0));
          vec3 halfVector = normalize(uSun + viewDir);
          float glint = max(dot(normal, halfVector), 0.0);
          colour += vec3(1.0, 0.82, 0.53) * (glint * glint * glint * 0.12);
          float fog = clamp(distance * 0.00011, 0.0, 1.0);
          colour = mix(colour, uFog, fog * fog);
        #else
          float detail = exp(-distance * 0.00022);
          float a = sin(p.x * 0.062 + t * 1.05) + sin(p.y * 0.088 - t * 0.78) + sin((p.x + p.y) * 0.036 + t * 0.4);
          float b = sin(p.x * 0.19 - t * 1.5) + sin(p.y * 0.165 + t * 1.2);
          vec3 normal = normalize(vec3((a * 0.03 + b * 0.012) * detail, 1.0, (a * 0.026 - b * 0.014) * detail));
          vec3 viewDir = normalize(uCam - vWorld);
          float fresnel = pow(1.0 - clamp(dot(normal, viewDir), 0.0, 1.0), 4.0);
          vec3 colour = mix(uDeep, uHorizon, clamp(fresnel * 1.4, 0.0, 1.0));
          vec3 halfVector = normalize(uSun + viewDir);
          float glint = pow(max(dot(normal, halfVector), 0.0), 150.0) * 2.4 * detail;
          float sheen = pow(max(dot(normal, halfVector), 0.0), 20.0) * 0.04 * detail;
          colour += vec3(1.0, 0.82, 0.53) * (glint + sheen);
          float fog = 1.0 - exp(-pow(distance * 0.00011, 2.0) * 1.8);
          colour = mix(colour, uFog, clamp(fog, 0.0, 1.0));
        #endif
        gl_FragColor = vec4(colour, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    defines: lowQuality ? { LOW_QUALITY: 1 } : {},
    fog: false,
  });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000, 1, 1), oceanMaterial);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = 0;
  scene.add(ocean);

  // ---------------------------------------------------------------- islands
  const terrainGroup = new THREE.Group();
  scene.add(terrainGroup);

  const colors = {
    wetSand: new THREE.Color('#8e936b'),
    sand: new THREE.Color('#e3ce97'),
    grass: new THREE.Color('#7c9852'),
    forest: new THREE.Color('#527040'),
    highland: new THREE.Color('#777c5b'),
    rock: new THREE.Color('#8b8478'),
    snow: new THREE.Color('#eef3f4'),
  };

  function terrainColor(island, height, slope, shade, macro) {
    const color = new THREE.Color();
    if (height < 2) color.copy(colors.wetSand);
    else if (height < 8) color.copy(colors.sand);
    else if (height < 54) color.copy(colors.grass);
    else if (height < 165) color.copy(colors.grass).lerp(colors.forest, smoothstep(54, 165, height));
    else if (height < 245) color.copy(colors.forest).lerp(colors.highland, smoothstep(165, 245, height));
    else color.copy(colors.highland).lerp(colors.rock, smoothstep(245, 310, height));
    if (island.snow && height > 258) color.lerp(colors.snow, smoothstep(258, 355, height) * 0.9);
    if (height < 17) color.lerp(colors.sand, 0.28 * (1 - smoothstep(4, 16, height)));
    color.multiplyScalar(0.93 + shade * 0.2);
    if (island.flat) {
      color.lerp(colors.grass, 0.08);
      color.lerp(colors.forest, clamp((macro - 0.36) * 0.9, 0, 0.42));
      color.multiplyScalar(0.87 + macro * 0.24);
    }
    if (slope > 0.72) color.multiplyScalar(0.87);
    return color;
  }

  for (const island of ISLANDS) {
    const segments = lowQuality ? (island.flat ? 30 : 36) : island.flat ? 62 : island.height > 300 ? 100 : 86;
    const extent = 1.08;
    const positions = [];
    const vertexColors = [];
    const indices = [];
    const width = island.rx * 2 * extent;
    const depth = island.rz * 2 * extent;
    for (let iz = 0; iz <= segments; iz += 1) {
      for (let ix = 0; ix <= segments; ix += 1) {
        const u = ix / segments;
        const v = iz / segments;
        const x = island.x - width * 0.5 + u * width;
        const z = island.z - depth * 0.5 + v * depth;
        const height = islandHeight(island, x, z);
        const hx = islandHeight(island, x + 12, z);
        const hz = islandHeight(island, x, z + 12);
        const slope = clamp(Math.hypot(hx - height, hz - height) / 9, 0, 1);
        const shade = fbm(x * 0.05, z * 0.05, island.seed + 12, 2);
        const macro = fbm(x * 0.0055, z * 0.0055, island.seed + 31, 2);
        const color = terrainColor(island, height, slope, shade, macro);
        positions.push(x, height < 1.2 ? -2.4 : height, z);
        vertexColors.push(color.r, color.g, color.b);
      }
    }
    const row = segments + 1;
    for (let iz = 0; iz < segments; iz += 1) {
      for (let ix = 0; ix < segments; ix += 1) {
        const a = iz * row + ix;
        const b = a + 1;
        const c = a + row;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.96,
      metalness: 0,
      flatShading: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.matrixAutoUpdate = false;
    terrainGroup.add(mesh);
  }

  // Trees and rocks are instanced so the whole forest costs two draw calls.
  const treePlacements = [];
  const rockPlacements = [];
  const random = createRandom(20261126);
  for (const island of ISLANDS) {
    let placed = 0;
    let attempts = 0;
    const treeTarget = Math.round((island.trees || 0) * (lowQuality ? 0.3 : 1));
    while (placed < treeTarget && attempts < treeTarget * 10 + 40) {
      attempts += 1;
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * 0.84;
      const x = island.x + Math.cos(angle) * radius * island.rx;
      const z = island.z + Math.sin(angle) * radius * island.rz;
      if (island.flat && Math.abs(x - RUNWAY.x) < 44 && Math.abs(z - RUNWAY.z) < RUNWAY.length * 0.5 + 18) continue;
      if (island.flat && Math.abs(x + 70) < 74 && Math.abs(z - 1580) < 95) continue;
      const height = islandHeight(island, x, z);
      if (height < 5 || height > (island.snow ? 235 : 175)) continue;
      treePlacements.push({
        x, y: height, z,
        scale: 0.65 + random() * 1.25,
        rotation: random() * Math.PI * 2,
        tint: 0.78 + random() * 0.32,
      });
      placed += 1;
    }
    for (let index = 0; index < (lowQuality ? 8 : 22); index += 1) {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * 0.72;
      const x = island.x + Math.cos(angle) * radius * island.rx;
      const z = island.z + Math.sin(angle) * radius * island.rz;
      const height = islandHeight(island, x, z);
      if (height > 90) {
        rockPlacements.push({
          x, y: height, z,
          scale: 1.2 + random() * 4.2,
          rotation: random() * Math.PI * 2,
        });
      }
    }
  }

  const treeGeometry = new THREE.ConeGeometry(1.55, 9.5, 5, 1);
  treeGeometry.translate(0, 4, 0);
  const treeMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
  const trees = new THREE.InstancedMesh(treeGeometry, treeMaterial, treePlacements.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const treeColor = new THREE.Color();
  const baseTreeColor = new THREE.Color('#2f5034');
  treePlacements.forEach((tree, index) => {
    quaternion.setFromAxisAngle(Y_AXIS, tree.rotation);
    scale.set(tree.scale, tree.scale * (0.9 + (index % 5) * 0.06), tree.scale);
    matrix.compose(new THREE.Vector3(tree.x, tree.y - 0.6, tree.z), quaternion, scale);
    trees.setMatrixAt(index, matrix);
    treeColor.copy(baseTreeColor).multiplyScalar(tree.tint);
    trees.setColorAt(index, treeColor);
  });
  trees.instanceMatrix.needsUpdate = true;
  if (trees.instanceColor) trees.instanceColor.needsUpdate = true;
  terrainGroup.add(trees);

  const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
  const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x6b675f, roughness: 1, flatShading: true });
  const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, rockPlacements.length);
  rockPlacements.forEach((rock, index) => {
    quaternion.setFromEuler(new THREE.Euler(rock.rotation, rock.rotation * 0.7, rock.rotation * 0.3));
    scale.set(rock.scale, rock.scale * 0.6, rock.scale * 0.85);
    matrix.compose(new THREE.Vector3(rock.x, rock.y - 0.4, rock.z), quaternion, scale);
    rocks.setMatrixAt(index, matrix);
  });
  rocks.instanceMatrix.needsUpdate = true;
  terrainGroup.add(rocks);

  // ---------------------------------------------------------------- airstrip
  const runwayGroup = new THREE.Group();
  scene.add(runwayGroup);
  const runwayTexture = makeRunwayTexture();
  runwayTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const runwayTop = new THREE.Mesh(
    new THREE.PlaneGeometry(RUNWAY.width, RUNWAY.length),
    new THREE.MeshStandardMaterial({ map: runwayTexture, roughness: 0.92, metalness: 0.02 }),
  );
  runwayTop.rotation.x = -Math.PI / 2;
  runwayTop.position.set(RUNWAY.x, RUNWAY.deck + 0.06, RUNWAY.z);
  runwayGroup.add(runwayTop);

  const runwayBase = new THREE.Mesh(
    new THREE.BoxGeometry(RUNWAY.width + 4, 1.1, RUNWAY.length + 5),
    new THREE.MeshStandardMaterial({ color: 0x252b2f, roughness: 0.95 }),
  );
  runwayBase.position.set(RUNWAY.x, RUNWAY.deck - 0.7, RUNWAY.z);
  runwayGroup.add(runwayBase);

  const lightPositions = [];
  const lightColors = [];
  const white = new THREE.Color('#fff4d6');
  const amber = new THREE.Color('#ffb454');
  for (let index = 0; index <= 22; index += 1) {
    const z = RUNWAY.z - RUNWAY.length * 0.5 + 12 + index * ((RUNWAY.length - 24) / 22);
    for (const side of [-1, 1]) {
      lightPositions.push(new THREE.Vector3(RUNWAY.x + side * (RUNWAY.width * 0.5 + 2), RUNWAY.deck + 0.5, z));
      lightColors.push(index % 3 === 0 ? amber : white);
    }
  }
  const lightGeometry = new THREE.SphereGeometry(0.34, 6, 5);
  const lightMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });
  const edgeLights = new THREE.InstancedMesh(lightGeometry, lightMaterial, lightPositions.length);
  lightPositions.forEach((position, index) => {
    matrix.makeTranslation(position.x, position.y, position.z);
    edgeLights.setMatrixAt(index, matrix);
    edgeLights.setColorAt(index, lightColors[index]);
  });
  edgeLights.instanceMatrix.needsUpdate = true;
  if (edgeLights.instanceColor) edgeLights.instanceColor.needsUpdate = true;
  runwayGroup.add(edgeLights);

  // Lead-in lights south of the threshold, plus green threshold bars.
  const approachGeometry = new THREE.SphereGeometry(0.32, 6, 5);
  const approachMaterial = new THREE.MeshBasicMaterial({ color: 0xfff1c8, toneMapped: false });
  const approachCount = 10;
  const approachLights = new THREE.InstancedMesh(approachGeometry, approachMaterial, approachCount * 2);
  let approachIndex = 0;
  for (let index = 0; index < approachCount; index += 1) {
    const z = RUNWAY.z + RUNWAY.length * 0.5 + 24 + index * 18;
    for (const side of [-1, 1]) {
      matrix.makeTranslation(RUNWAY.x + side * 9, RUNWAY.deck + 0.4, z);
      approachLights.setMatrixAt(approachIndex, matrix);
      approachIndex += 1;
    }
  }
  approachLights.instanceMatrix.needsUpdate = true;
  runwayGroup.add(approachLights);

  const thresholdMaterial = new THREE.MeshBasicMaterial({ color: 0x50ff9c, toneMapped: false });
  const thresholdLights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.32, 6, 5), thresholdMaterial, 8);
  for (let index = 0; index < 4; index += 1) {
    for (const side of [-1, 1]) {
      matrix.makeTranslation(RUNWAY.x + side * (4 + index * 4), RUNWAY.deck + 0.42, RUNWAY.z + RUNWAY.length * 0.5 - 2);
      thresholdLights.setMatrixAt(index * 2 + (side > 0 ? 1 : 0), matrix);
    }
  }
  thresholdLights.instanceMatrix.needsUpdate = true;
  runwayGroup.add(thresholdLights);

  // Four PAPI boxes on the west side of the approach.
  for (let index = 0; index < 4; index += 1) {
    const papi = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.8, 1.4),
      new THREE.MeshBasicMaterial({ color: index < 2 ? 0xff5b44 : 0xfff0cf, toneMapped: false }),
    );
    papi.position.set(-30, RUNWAY.deck + 0.9, RUNWAY.z + RUNWAY.length * 0.5 - 16 - index * 3.2);
    runwayGroup.add(papi);
  }

  // Tower and hangar.
  const towerGroup = new THREE.Group();
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb9b5a8, roughness: 0.85 });
  const darkGlass = new THREE.MeshStandardMaterial({ color: 0x173848, roughness: 0.18, metalness: 0.5, emissive: 0x0d3547, emissiveIntensity: 0.6 });
  const towerBody = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.2, 20, 10), concrete);
  towerBody.position.y = 10;
  towerGroup.add(towerBody);
  const towerCab = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 4.6, 4.4, 10), darkGlass);
  towerCab.position.y = 22;
  towerGroup.add(towerCab);
  const towerRoof = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 5.8, 0.6, 10), new THREE.MeshStandardMaterial({ color: 0x22333b, roughness: 0.7 }));
  towerRoof.position.y = 24.5;
  towerGroup.add(towerRoof);
  towerGroup.position.set(116, RUNWAY.deck, 1535);
  runwayGroup.add(towerGroup);

  // Apron, taxiway and hangar front: the strip reads as a working airfield, not a painted line.
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x31383b, roughness: 0.94, metalness: 0.03 });
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(142, 88), asphalt);
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(-63, RUNWAY.deck + 0.08, 1588);
  runwayGroup.add(apron);
  const taxiway = new THREE.Mesh(new THREE.PlaneGeometry(14, 220), asphalt);
  taxiway.rotation.x = -Math.PI / 2;
  taxiway.position.set(-34, RUNWAY.deck + 0.08, 1470);
  runwayGroup.add(taxiway);
  const taxiLine = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 210),
    new THREE.MeshBasicMaterial({ color: 0xd8bc54, toneMapped: false }),
  );
  taxiLine.rotation.x = -Math.PI / 2;
  taxiLine.position.set(-34, RUNWAY.deck + 0.12, 1470);
  runwayGroup.add(taxiLine);

  const hangar = new THREE.Mesh(
    new THREE.BoxGeometry(42, 13, 30),
    new THREE.MeshStandardMaterial({ color: 0x8b918c, roughness: 0.8, metalness: 0.15 }),
  );
  hangar.position.set(-84, RUNWAY.deck + 6.5, 1610);
  runwayGroup.add(hangar);
  const hangarDoor = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 10),
    new THREE.MeshStandardMaterial({ color: 0x3a4a50, roughness: 0.65, metalness: 0.35 }),
  );
  hangarDoor.position.set(-84, RUNWAY.deck + 6, 1594.9);
  hangarDoor.rotation.y = 0;
  runwayGroup.add(hangarDoor);
  const terminal = new THREE.Mesh(
    new THREE.BoxGeometry(34, 9, 18),
    new THREE.MeshStandardMaterial({ color: 0xc5c0af, roughness: 0.9 }),
  );
  terminal.position.set(-94, RUNWAY.deck + 4.5, 1300);
  runwayGroup.add(terminal);
  const terminalGlass = new THREE.Mesh(
    new THREE.BoxGeometry(30, 2.2, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x183a49, emissive: 0x0c2d3b, emissiveIntensity: 0.5, roughness: 0.2 }),
  );
  terminalGlass.position.set(-94, RUNWAY.deck + 6, 1290.8);
  runwayGroup.add(terminalGlass);
  for (const z of [1650, 1690]) {
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(5, 5, 9, 12),
      new THREE.MeshStandardMaterial({ color: 0xcfcabb, roughness: 0.55, metalness: 0.2 }),
    );
    tank.position.set(-124, RUNWAY.deck + 4.5, z);
    runwayGroup.add(tank);
  }
  const hangarRoof = new THREE.Mesh(
    new THREE.CylinderGeometry(15.5, 15.5, 42, 12, 1, false, 0, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x7a807b, roughness: 0.8 }),
  );
  hangarRoof.rotation.z = Math.PI / 2;
  hangarRoof.rotation.y = Math.PI;
  hangarRoof.position.set(-84, RUNWAY.deck + 13, 1610);
  runwayGroup.add(hangarRoof);

  // Windsock at the north end.
  const windsockMast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 9, 6), new THREE.MeshStandardMaterial({ color: 0xd7d2c2 }));
  windsockMast.position.set(-38, RUNWAY.deck + 4.5, 1752);
  runwayGroup.add(windsockMast);
  const windsock = new THREE.Mesh(
    new THREE.ConeGeometry(1.35, 5.2, 8, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xff7a3d, side: THREE.DoubleSide, roughness: 0.8 }),
  );
  windsock.rotation.z = -Math.PI / 2;
  windsock.position.set(-34.8, RUNWAY.deck + 8.4, 1752);
  runwayGroup.add(windsock);

  // ---------------------------------------------------------------- lighthouse and boats
  function buildLighthouse(x, z) {
    const ground = terrainHeightAt(x, z);
    const group = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(5, 6.5, 4, 8), new THREE.MeshStandardMaterial({ color: 0x8b8477, roughness: 1 }));
    base.position.y = 2;
    group.add(base);
    for (let index = 0; index < 4; index += 1) {
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(2.6 - index * 0.22, 2.9 - index * 0.22, 5.4, 10),
        new THREE.MeshStandardMaterial({ color: index % 2 === 0 ? 0xe9e4d7 : 0xc44738, roughness: 0.65 }),
      );
      band.position.y = 6.6 + index * 5.3;
      group.add(band);
    }
    const lantern = new THREE.Mesh(
      new THREE.CylinderGeometry(1.55, 1.55, 2.2, 8),
      new THREE.MeshStandardMaterial({ color: 0xfff0bd, emissive: 0xffcb63, emissiveIntensity: 2.4, roughness: 0.2 }),
    );
    lantern.position.y = 28.6;
    group.add(lantern);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.6, 8), new THREE.MeshStandardMaterial({ color: 0x263840 }));
    cap.position.y = 30.4;
    group.add(cap);
    group.position.set(x, ground, z);
    scene.add(group);
  }
  buildLighthouse(508, 692);

  function buildSailboat(x, z, heading, scaleFactor) {
    const group = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.CapsuleGeometry(1.6, 7, 5, 8),
      new THREE.MeshStandardMaterial({ color: 0xe9e5d9, roughness: 0.6 }),
    );
    hull.rotation.x = Math.PI / 2;
    hull.scale.set(1, 1, 0.62);
    hull.position.y = 0.8;
    group.add(hull);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 8.4), new THREE.MeshStandardMaterial({ color: 0x2b5b75, roughness: 0.7 }));
    stripe.position.y = 1.0;
    group.add(stripe);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 11, 6), new THREE.MeshStandardMaterial({ color: 0xddd8c7 }));
    mast.position.set(0, 6, 0.6);
    group.add(mast);
    const sailShape = new THREE.BufferGeometry();
    sailShape.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 1.2, 1.1,
      0, 11.2, 1.1,
      0, 1.8, -4.2,
    ], 3));
    sailShape.computeVertexNormals();
    const sail = new THREE.Mesh(sailShape, new THREE.MeshStandardMaterial({ color: 0xf1eee3, side: THREE.DoubleSide, roughness: 0.9 }));
    group.add(sail);
    group.position.set(x, 0, z);
    group.rotation.y = heading;
    group.scale.setScalar(scaleFactor);
    scene.add(group);
  }
  buildSailboat(-260, 930, 0.7, 1.2);
  buildSailboat(650, 900, -0.4, 0.9);
  buildSailboat(-900, -500, 2.1, 1.0);

  // ---------------------------------------------------------------- clouds
  // Billboards with hand-painted radial puffs: soft from a distance and much cheaper than volumes.
  const cloudTextures = Array.from({ length: 6 }, (_, index) => makeCloudTexture(9100 + index * 37));
  const cloudRandom = createRandom(7711);
  const cloudCentres = [
    { x: -1250, y: 880, z: -1450, w: 690 },
    { x: 1150, y: 1040, z: -1500, w: 780 },
    { x: -1950, y: 730, z: 250, w: 560 },
    { x: 1900, y: 900, z: 780, w: 700 },
    { x: 300, y: 1160, z: -2700, w: 850 },
    { x: -300, y: 620, z: 2400, w: 520 },
  ];
  for (let cluster = 0; cluster < 16; cluster += 1) {
    const angle = (cluster / 16) * Math.PI * 2 + cloudRandom() * 0.3;
    const radius = 1300 + cloudRandom() * 3800;
    cloudCentres.push({
      x: Math.cos(angle) * radius,
      y: 480 + cloudRandom() * 850,
      z: Math.sin(angle) * radius,
      w: 360 + cloudRandom() * 500,
    });
  }
  const activeClouds = lowQuality ? cloudCentres.slice(0, 6) : cloudCentres;
  activeClouds.forEach((centre, index) => {
    const texture = cloudTextures[index % cloudTextures.length];
    for (let layer = 0; layer < (lowQuality ? 1 : 3); layer += 1) {
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.62 + layer * 0.11,
        depthWrite: false,
        depthTest: true,
        toneMapped: false,
        fog: true,
      });
      const sprite = new THREE.Sprite(material);
      const width = centre.w * (0.72 + layer * 0.18);
      sprite.position.set(
        centre.x + (cloudRandom() - 0.5) * centre.w * 0.45,
        centre.y + (cloudRandom() - 0.5) * 45,
        centre.z + (cloudRandom() - 0.5) * centre.w * 0.35,
      );
      sprite.scale.set(width, width * (0.36 + cloudRandom() * 0.08), 1);
      sprite.renderOrder = 1;
      scene.add(sprite);
    }
  });

  // ---------------------------------------------------------------- the Kestrel
  const aircraft = new THREE.Group();
  scene.add(aircraft);

  const bodyWhite = new THREE.MeshStandardMaterial({ color: 0xe8ecef, metalness: 0.28, roughness: 0.42 });
  const bodyNavy = new THREE.MeshStandardMaterial({ color: 0x17334a, metalness: 0.35, roughness: 0.42 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xff7a34, metalness: 0.2, roughness: 0.5 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x182127, metalness: 0.6, roughness: 0.35 });
  const canopyMaterial = new THREE.MeshStandardMaterial({
    color: 0x173c4c,
    metalness: 0.45,
    roughness: 0.08,
    transparent: true,
    opacity: 0.82,
    emissive: 0x0a2a36,
    emissiveIntensity: 0.6,
  });

  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.88, 7.6, 18, 1), bodyWhite);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.z = 0.0;
  aircraft.add(fuselage);
  const noseCone = new THREE.Mesh(new THREE.ConeGeometry(0.86, 1.2, 18), bodyWhite);
  noseCone.rotation.x = -Math.PI / 2;
  noseCone.position.z = -4.35;
  aircraft.add(noseCone);
  const tailFairing = new THREE.Mesh(new THREE.SphereGeometry(0.56, 18, 12), bodyWhite);
  tailFairing.scale.set(1, 0.9, 1.78);
  tailFairing.position.set(0, 0, 3.3);
  aircraft.add(tailFairing);
  const tailChine = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.1, 1.8), orange);
  tailChine.position.set(0.56, 0.06, 3.5);
  aircraft.add(tailChine);
  const tailChineLeft = tailChine.clone();
  tailChineLeft.position.x = -0.56;
  aircraft.add(tailChineLeft);
  const bellyStripe = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.12, 5.9), orange);
  bellyStripe.position.set(0.79, 0.02, 0.1);
  aircraft.add(bellyStripe);
  const bellyStripeLeft = bellyStripe.clone();
  bellyStripeLeft.position.x = -0.79;
  aircraft.add(bellyStripeLeft);
  const blueStripe = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 5.2), bodyNavy);
  blueStripe.position.set(0.8, -0.17, 0.05);
  aircraft.add(blueStripe);
  const blueStripeLeft = blueStripe.clone();
  blueStripeLeft.position.x = -0.8;
  aircraft.add(blueStripeLeft);

  // Wings, built as tapered extruded planforms. The left wing is the same mesh mirrored.
  function wingMesh(span, rootLeading, tipLeading, rootTrailing, tipTrailing, offsetZ, dihedral, thickness) {
    const shape = new THREE.Shape();
    shape.moveTo(0.7, rootLeading);
    shape.lineTo(span, tipLeading);
    shape.lineTo(span, tipTrailing);
    shape.lineTo(0.7, rootTrailing);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: true,
      bevelSize: 0.03,
      bevelThickness: 0.025,
      bevelSegments: 1,
    });
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, thickness, offsetZ);
    geometry.rotateZ(dihedral);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, bodyWhite);
    mesh.material = bodyWhite;
    return mesh;
  }

  const rightWing = wingMesh(5.4, -1.35, -0.65, 1.6, 0.5, 0.35, 0.055, 0.16);
  rightWing.material = new THREE.MeshStandardMaterial({ color: 0xe8ecef, metalness: 0.28, roughness: 0.42, side: THREE.DoubleSide });
  aircraft.add(rightWing);
  const leftWing = rightWing.clone();
  leftWing.scale.x = -1;
  leftWing.material = rightWing.material;
  aircraft.add(leftWing);

  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.62, 1.0), orange);
    tip.position.set(side * 5.32, 0.12, 0.22);
    aircraft.add(tip);
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 8, 6),
      new THREE.MeshBasicMaterial({ color: side < 0 ? 0xff4438 : 0x57ff9b, toneMapped: false }),
    );
    light.position.set(side * 5.4, 0.23, -0.05);
    aircraft.add(light);
  }

  const stabiliser = wingMesh(2.35, -0.55, -0.28, 0.55, 0.22, 3.86, 0.015, 0.1);
  stabiliser.material = new THREE.MeshStandardMaterial({ color: 0xe8ecef, metalness: 0.28, roughness: 0.42, side: THREE.DoubleSide });
  aircraft.add(stabiliser);
  const stabiliserLeft = stabiliser.clone();
  stabiliserLeft.scale.x = -1;
  stabiliserLeft.material = stabiliser.material;
  aircraft.add(stabiliserLeft);

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.65, 1.05), bodyNavy);
  fin.position.set(0, 1.03, 3.98);
  fin.rotation.x = -0.16;
  aircraft.add(fin);
  const finTip = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.32, 0.95), orange);
  finTip.position.set(0, 1.86, 4.07);
  finTip.rotation.x = -0.16;
  aircraft.add(finTip);
  const finLeading = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.3, 0.12), bodyWhite);
  finLeading.position.set(0, 1.02, 3.47);
  finLeading.rotation.x = -0.16;
  aircraft.add(finLeading);

  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), canopyMaterial);
  canopy.scale.set(0.62, 0.62, 1.5);
  canopy.position.set(0, 0.58, -0.75);
  aircraft.add(canopy);
  const canopyFrame = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 6, 20, Math.PI), darkMetal);
  canopyFrame.rotation.y = Math.PI / 2;
  canopyFrame.rotation.z = Math.PI;
  canopyFrame.position.set(0, 0.58, -0.35);
  canopyFrame.scale.set(1, 1.03, 1);
  aircraft.add(canopyFrame);

  const cowling = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.86, 1.2, 16), bodyNavy);
  cowling.rotation.x = Math.PI / 2;
  cowling.position.z = -3.45;
  aircraft.add(cowling);
  const cowlingRing = new THREE.Mesh(new THREE.TorusGeometry(0.77, 0.08, 6, 20), orange);
  cowlingRing.position.z = -4.04;
  aircraft.add(cowlingRing);

  const propeller = new THREE.Group();
  propeller.position.z = -4.35;
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.9, 12), orange);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -0.45;
  propeller.add(spinner);
  for (let index = 0; index < 3; index += 1) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.7, 0.06), darkMetal);
    blade.rotation.z = (index / 3) * Math.PI * 2;
    blade.position.y = 0;
    propeller.add(blade);
  }
  const propellerDisc = new THREE.Mesh(
    new THREE.CircleGeometry(1.42, 28),
    new THREE.MeshBasicMaterial({ color: 0xcdd5d8, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
  );
  propellerDisc.position.z = -0.04;
  propeller.add(propellerDisc);
  aircraft.add(propeller);

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff4c3d, toneMapped: false }),
  );
  beacon.position.set(0, 1.98, 4.0);
  aircraft.add(beacon);

  const registration = makeRegistrationTexture();
  const registrationMaterial = new THREE.MeshBasicMaterial({ map: registration, transparent: true, side: THREE.DoubleSide, toneMapped: false });
  for (const side of [-1, 1]) {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.43), registrationMaterial);
    plate.position.set(side * 0.075, 1.2, 3.98);
    plate.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    plate.rotation.x = -0.16;
    aircraft.add(plate);
  }

  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.6, 6), darkMetal);
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(0.45, -0.35, 2.4);
  aircraft.add(exhaust);
  const exhaustLeft = exhaust.clone();
  exhaustLeft.position.x = -0.45;
  aircraft.add(exhaustLeft);

  // Cockpit interior, attached to the camera and shown only in cockpit view.
  const cockpit = new THREE.Group();
  cockpit.visible = false;
  const cockpitDark = new THREE.MeshStandardMaterial({ color: 0x111a20, roughness: 0.55, metalness: 0.35 });
  const cockpitTrim = new THREE.MeshStandardMaterial({ color: 0x23333b, roughness: 0.4, metalness: 0.55 });
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.2, 0.28), cockpitDark);
  dash.position.set(0, -0.57, -1.25);
  cockpit.add(dash);
  const glareShield = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.05, 0.22), cockpitTrim);
  glareShield.position.set(0, -0.4, -1.2);
  cockpit.add(glareShield);
  for (const side of [-1, 1]) {
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.9), cockpitTrim);
    sill.position.set(side * 0.82, -0.34, -1.05);
    cockpit.add(sill);
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.84, 0.045), cockpitDark);
    pillar.position.set(side * 0.61, 0.2, -1.0);
    pillar.rotation.z = side * 0.3;
    cockpit.add(pillar);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 6, 5),
      new THREE.MeshBasicMaterial({ color: side < 0 ? 0xff6a4a : 0x6fffe1, toneMapped: false }),
    );
    lamp.position.set(side * 0.32, -0.36, -1.2);
    cockpit.add(lamp);
  }
  const canopyBow = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.05), cockpitTrim);
  canopyBow.position.set(0, 0.4, -1.0);
  cockpit.add(canopyBow);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, 0.32, 6), cockpitDark);
  stick.position.set(0, -0.72, -0.9);
  stick.rotation.x = -0.28;
  cockpit.add(stick);
  for (const x of [-0.42, 0, 0.42]) {
    const display = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.065, 0.012),
      new THREE.MeshBasicMaterial({ color: x === 0 ? 0x9df6ff : 0x3fd4ee, toneMapped: false }),
    );
    display.position.set(x, -0.49, -1.394);
    cockpit.add(display);
  }
  camera.add(cockpit);

  // ---------------------------------------------------------------- gate rings
  const ringGroup = new THREE.Group();
  scene.add(ringGroup);
  const glowTexture = makeGlowTexture();
  const ringObjects = [];
  const previousPoints = [
    new THREE.Vector3(START.x, START.y, START.z),
    ...RINGS.slice(0, -1).map((ring) => new THREE.Vector3(ring.x, ring.y, ring.z)),
  ];
  RINGS.forEach((definition, index) => {
    const previous = previousPoints[index];
    const normal = new THREE.Vector3(definition.x - previous.x, 0, definition.z - previous.z).normalize();
    const group = new THREE.Group();
    group.position.set(definition.x, definition.y, definition.z);
    group.quaternion.setFromUnitVectors(Z_AXIS, normal);
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0x3ce9ff,
      toneMapped: false,
    });
    const core = new THREE.Mesh(new THREE.TorusGeometry(definition.radius, 1.8, lowQuality ? 7 : 12, lowQuality ? 24 : 64), coreMaterial);
    group.add(core);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x7ef1ff,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const glow = new THREE.Mesh(new THREE.TorusGeometry(definition.radius + 0.8, 2.7, lowQuality ? 5 : 8, lowQuality ? 20 : 64), glowMaterial);
    group.add(glow);
    const haloMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: false,
    });
    const halo = new THREE.Sprite(haloMaterial);
    halo.scale.set(definition.radius * 3.1, definition.radius * 3.1, 1);
    group.add(halo);
    const labelMaterial = new THREE.SpriteMaterial({
      map: makeRingLabel(index + 1),
      transparent: true,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      fog: false,
    });
    const label = new THREE.Sprite(labelMaterial);
    label.position.set(0, definition.radius + 9, 0);
    label.scale.set(20, 10, 1);
    group.add(label);
    ringGroup.add(group);
    ringObjects.push({
      group,
      core,
      coreMaterial,
      glow,
      glowMaterial,
      halo,
      haloMaterial,
      label,
      labelMaterial,
      radius: definition.radius,
      center: new THREE.Vector3(definition.x, definition.y, definition.z),
    });
  });

  function setRingStates(passed, time) {
    ringObjects.forEach((ring, index) => {
      if (index < passed) {
        ring.coreMaterial.color.setHex(0x30565f);
        ring.glowMaterial.opacity = 0.02;
        ring.haloMaterial.opacity = 0.005;
        ring.labelMaterial.opacity = 0.18;
        ring.group.scale.setScalar(1);
      } else if (index === passed) {
        const pulse = 0.5 + 0.5 * Math.sin(time * 2.4);
        ring.coreMaterial.color.setHex(0x4beeff);
        ring.glowMaterial.opacity = 0.2 + pulse * 0.15;
        ring.haloMaterial.opacity = 0.15 + pulse * 0.09;
        ring.labelMaterial.opacity = 1;
        ring.group.scale.setScalar(1 + pulse * 0.018);
      } else {
        ring.coreMaterial.color.setHex(0x2dc3db);
        ring.glowMaterial.opacity = 0.08;
        ring.haloMaterial.opacity = 0.045;
        ring.labelMaterial.opacity = 0.55;
        ring.group.scale.setScalar(1);
      }
    });
  }
  setRingStates(0, 0);

  // ---------------------------------------------------------------- camera helpers
  const chaseOffset = new THREE.Vector3(3.8, 3.1, 14.8);
  const cockpitOffset = new THREE.Vector3(0, 0.72, -0.38);
  const desiredPosition = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const lookUp = new THREE.Vector3();
  const cameraTarget = new THREE.PerspectiveCamera();
  const titleTarget = new THREE.Vector3();
  const scratchForward = new THREE.Vector3();
  const scratchUp = new THREE.Vector3();

  function updateCamera({ mode, position, quaternion, time, dt, snap = false }) {
    if (mode === 'cockpit') {
      desiredPosition.copy(cockpitOffset).applyQuaternion(quaternion).add(position);
      const ease = snap ? 1 : 1 - Math.exp(-26 * dt);
      camera.position.lerp(desiredPosition, ease);
      if (snap) camera.position.copy(desiredPosition);
      if (snap) camera.quaternion.copy(quaternion);
      else camera.quaternion.slerp(quaternion, 1 - Math.exp(-22 * dt));
      const shake = Math.sin(time * 33) * 0.0006;
      camera.rotateZ(shake);
      if (camera.fov !== 72) {
        camera.fov = 72;
        camera.updateProjectionMatrix();
      }
    } else {
      desiredPosition.copy(chaseOffset).applyQuaternion(quaternion).add(position);
      const ease = snap ? 1 : 1 - Math.exp(-5.6 * dt);
      camera.position.lerp(desiredPosition, ease);
      if (snap) camera.position.copy(desiredPosition);
      const ground = terrainHeightAt(camera.position.x, camera.position.z);
      if (camera.position.y < ground + 3.2) camera.position.y = ground + 3.2;
      if (camera.position.y < 2.2) camera.position.y = 2.2;
      lookTarget.copy(position).addScaledVector(scratchForward.copy(LOCAL_FORWARD).applyQuaternion(quaternion), 24).addScaledVector(WORLD_UP, 1.15);
      lookUp.copy(WORLD_UP).lerp(scratchUp.set(0, 1, 0).applyQuaternion(quaternion), 0.28).normalize();
      cameraTarget.position.copy(camera.position);
      cameraTarget.up.copy(lookUp);
      cameraTarget.lookAt(lookTarget);
      if (snap) camera.quaternion.copy(cameraTarget.quaternion);
      else camera.quaternion.slerp(cameraTarget.quaternion, 1 - Math.exp(-8 * dt));
      const speed = Math.abs(camera.position.distanceTo(desiredPosition));
      camera.rotateZ(Math.sin(time * 37) * (0.00035 + speed * 0.00006));
      if (camera.fov !== 62) {
        camera.fov = 62;
        camera.updateProjectionMatrix();
      }
    }
  }

  function titleCamera(position, time) {
    const drift = Math.sin(time * 0.18) * 1.2;
    camera.position.set(position.x - 24 + drift, position.y + 11, position.z + 31);
    camera.up.set(0, 1, 0);
    titleTarget.set(position.x - 9, position.y + 1, position.z - 14);
    camera.lookAt(titleTarget);
    if (camera.fov !== 58) {
      camera.fov = 58;
      camera.updateProjectionMatrix();
    }
  }

  function updateAircraft({ position, quaternion, view, propAngle }) {
    aircraft.position.copy(position);
    aircraft.quaternion.copy(quaternion);
    aircraft.visible = view !== 'cockpit';
    cockpit.visible = view === 'cockpit';
    propeller.rotation.z = propAngle;
  }

  function setEnvironment(time, cameraPosition) {
    oceanUniforms.uTime.value = time;
    oceanUniforms.uCam.value.copy(cameraPosition);
    skyGroup.position.copy(cameraPosition);
  }

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setPixelRatio(lowQuality ? 0.55 : Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function render() {
    renderer.render(scene, camera);
  }

  window.addEventListener('resize', resize);

  return {
    renderer,
    scene,
    camera,
    ringObjects,
    updateCamera,
    titleCamera,
    updateAircraft,
    updateEnvironment: setEnvironment,
    setEnvironment,
    setRingStates,
    resize,
    render,
    lowQuality,
  };
}

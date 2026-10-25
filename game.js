import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createHero, animateHero } from './hero.js';

const MODEL_URL = './assets/bad-bad-boy.glb';
const ARENA_RADIUS = 8.4;
const keys = new Set();
const STREAM_LENGTH = 1.9;

const canvas = document.querySelector('#game');
const status = document.querySelector('#load-status');
const startScreen = document.querySelector('#start-screen');
const endScreen = document.querySelector('#end-screen');
const startButton = document.querySelector('#start');
const restartButton = document.querySelector('#restart');
const healthFill = document.querySelector('#health-fill');
const scoreLabel = document.querySelector('#score');
const waveLabel = document.querySelector('#wave');
const finalScore = document.querySelector('#final-score');
const toast = document.querySelector('#toast');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#171925');
scene.fog = new THREE.Fog('#171925', 13, 28);

const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 60);
camera.position.set(0, 8, 10);

scene.add(new THREE.HemisphereLight(0xcfdcff, 0x35303e, 2.2));
const keyLight = new THREE.DirectionalLight(0xffe6bb, 3.2);
keyLight.position.set(-5, 10, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.left = -12;
keyLight.shadow.camera.right = 12;
keyLight.shadow.camera.top = 12;
keyLight.shadow.camera.bottom = -12;
scene.add(keyLight);
const rimLight = new THREE.PointLight(0xa66bff, 24, 18, 2);
rimLight.position.set(5, 5, -3);
scene.add(rimLight);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(ARENA_RADIUS, 72),
  new THREE.MeshStandardMaterial({ color: '#222431', roughness: 0.88, metalness: 0.05 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(ARENA_RADIUS * 2, 24, '#514a68', '#333344');
grid.position.y = 0.006;
grid.material.transparent = true;
grid.material.opacity = 0.25;
scene.add(grid);

const arenaRing = new THREE.Mesh(
  new THREE.TorusGeometry(ARENA_RADIUS, 0.055, 8, 120),
  new THREE.MeshStandardMaterial({ color: '#7556a9', emissive: '#291942', emissiveIntensity: 0.8, roughness: 0.45 })
);
arenaRing.rotation.x = Math.PI / 2;
arenaRing.position.y = 0.035;
scene.add(arenaRing);

const pedestal = new THREE.Group();
const edgeRing = new THREE.Mesh(
  new THREE.TorusGeometry(ARENA_RADIUS + 0.14, 0.16, 8, 120),
  new THREE.MeshStandardMaterial({ color: '#333447', roughness: 0.72, metalness: 0.16 })
);
edgeRing.rotation.x = Math.PI / 2;
edgeRing.position.y = -0.12;
pedestal.add(edgeRing);
scene.add(pedestal);

const player = {
  root: new THREE.Group(),
  body: new THREE.Group(),
  model: null,
  rig: null,
  x: 0,
  z: 0,
  dx: 0,
  dz: 1,
  hp: 5,
  maxHp: 5,
  speed: 3.6,
  invulnerable: 0,
  fireTimer: 0,
  runTime: 0,
  runBlend: 0
};
player.root.add(player.body);
scene.add(player.root);

const streamOrigin = new THREE.Vector3();
const streamDirection = new THREE.Vector3();
const streamAxis = new THREE.Vector3();
const worldUp = new THREE.Vector3(0, 1, 0);
const stream = new THREE.Mesh(
  new THREE.CylinderGeometry(0.009, 0.027, 1, 10, 1, true),
  new THREE.MeshBasicMaterial({ color: '#ffe56d', transparent: true, opacity: 0.82, side: THREE.DoubleSide, depthWrite: false })
);
stream.visible = false;
stream.renderOrder = 2;
scene.add(stream);

const enemies = [];
const effects = [];
let playing = false;
let gameTime = 0;
let score = 0;
let wave = 1;
let pendingWave = 0;
let soundEnabled = false;
let audioContext = null;
let frameTime = 0;

function loadHero() {
  const loader = new GLTFLoader();
  loader.load(MODEL_URL, (gltf) => {
    player.rig = createHero(gltf.scene);
    player.model = player.rig.mesh;
    player.body.add(player.model);
    status.classList.add('hidden');
    startButton.disabled = false;
    startButton.textContent = 'НАЧАТЬ ИГРУ';
  }, (event) => {
    if (event.lengthComputable) {
      status.textContent = `Загружаю фигурку… ${Math.round(event.loaded / event.total * 100)}%`;
    }
  }, (error) => {
    console.error('Could not load the player GLB:', error);
    status.textContent = 'Не загрузилась фигурка. Запусти игру через локальный сервер.';
  });
}

function makeEnemy(x, z, level) {
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  const color = ['#b949e8', '#ff5a76', '#55c6bb', '#ed8a45'][(Math.random() * 4) | 0];
  const size = 0.37 + Math.random() * 0.1 + Math.min(level, 5) * 0.012;
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(size, 18, 14),
    new THREE.MeshStandardMaterial({ color, roughness: 0.43, metalness: 0.02, emissive: color, emissiveIntensity: 0.08 })
  );
  body.scale.set(1, 0.8, 0.9);
  body.position.y = size * 0.8;
  body.castShadow = true;
  body.receiveShadow = true;
  root.add(body);

  const eyeMaterial = new THREE.MeshStandardMaterial({ color: '#211729', roughness: 0.38 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(size * 0.105, 10, 8), eyeMaterial);
    eye.position.set(side * size * 0.22, size * 0.94, size * 0.78);
    root.add(eye);
  }
  const shine = new THREE.Mesh(
    new THREE.SphereGeometry(size * 0.1, 10, 8),
    new THREE.MeshBasicMaterial({ color: '#fff4c4' })
  );
  shine.position.set(-size * 0.3, size * 1.21, size * 0.48);
  root.add(shine);
  scene.add(root);
  enemies.push({ root, body, x, z, size, hp: 1 + Math.floor((level - 1) / 3), speed: 0.85 + Math.random() * 0.25 + level * 0.035, hit: 0, attack: Math.random() * 0.5, alive: true, wobble: Math.random() * 6 });
}

function spawnWave(level) {
  wave = level;
  waveLabel.textContent = String(wave).padStart(2, '0');
  const count = Math.min(3 + level * 2, 15);
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const radius = 5.8 + Math.random() * 1.7;
    makeEnemy(Math.cos(angle) * radius, Math.sin(angle) * radius, level);
  }
  if (level > 1) showToast(`ВОЛНА ${level}`);
}

function removeEnemy(enemy, pop = false) {
  if (!enemy.alive) return;
  enemy.alive = false;
  scene.remove(enemy.root);
  if (pop) {
    score += 100;
    scoreLabel.textContent = String(score).padStart(4, '0');
    burst(enemy.x, enemy.size * 0.7, enemy.z, 0xffd34e, 10);
    blip(440 + Math.random() * 280, 0.045);
  }
}

function updateStream(firing) {
  stream.visible = firing;
  if (!firing) return;
  player.rig.emitter.getWorldPosition(streamOrigin);
  streamDirection.set(player.dx, 0, player.dz).normalize();
  streamAxis.copy(streamDirection).multiplyScalar(STREAM_LENGTH);
  streamAxis.y = -0.09;
  stream.position.copy(streamOrigin).addScaledVector(streamAxis, 0.5);
  stream.scale.y = streamAxis.length();
  stream.quaternion.setFromUnitVectors(worldUp, streamAxis.clone().normalize());
  stream.material.opacity = 0.78 + Math.sin(gameTime * 32) * 0.06;
}

function shoot() {
  const dir = streamDirection;
  const origin = streamOrigin;
  const ray = streamAxis.clone().normalize();
  const length = streamAxis.length();
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const target = new THREE.Vector3(enemy.x, enemy.size * 0.75, enemy.z);
    const relative = target.clone().sub(origin);
    const along = relative.dot(ray);
    if (along < 0.1 || along > length + enemy.size * 0.5) continue;
    const closest = origin.clone().addScaledVector(ray, along);
    if (closest.distanceTo(target) > enemy.size + 0.13) continue;
    enemy.hp--;
    enemy.hit = 0.14;
    enemy.x += dir.x * 0.23;
    enemy.z += dir.z * 0.23;
    enemy.root.position.set(enemy.x, 0, enemy.z);
    if (enemy.hp <= 0) removeEnemy(enemy, true);
    else {
      const impact = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 8, 6),
        new THREE.MeshBasicMaterial({ color: '#fff19a', transparent: true, opacity: 0.85 })
      );
      impact.position.copy(target);
      scene.add(impact);
      effects.push({ object: impact, velocity: new THREE.Vector3(), life: 0.1, maxLife: 0.1 });
    }
  }
  blip(210 + Math.random() * 60, 0.025);
}

function burst(x, y, z, color, count = 8, forward = null) {
  for (let i = 0; i < count; i++) {
    const radius = 0.025 + Math.random() * 0.045;
    const object = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 7, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })
    );
    object.position.set(x, y, z);
    scene.add(object);
    const spread = forward ? new THREE.Vector3(forward.x * (1.8 + Math.random() * 2) + (Math.random() - 0.5) * 1.5, Math.random() * 1.2, forward.z * (1.8 + Math.random() * 2) + (Math.random() - 0.5) * 1.5) : new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.8, (Math.random() - 0.5) * 2);
    effects.push({ object, velocity: spread, life: 0.32 + Math.random() * 0.28, maxLife: 0.6, gravity: 2.5 });
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('visible'), 1000);
}

function blip(frequency, duration) {
  if (!soundEnabled) return;
  audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === 'suspended') audioContext.resume();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.035, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
}

function update(dt) {
  gameTime += dt;
  if (!playing) return;

  const xAxis = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  const zAxis = Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp'));
  const length = Math.hypot(xAxis, zAxis);
  let moving = length > 0;
  if (moving) {
    const vx = xAxis / length;
    const vz = zAxis / length;
    player.x += vx * player.speed * dt;
    player.z += vz * player.speed * dt;
    player.dx = vx;
    player.dz = vz;
    player.root.rotation.y = Math.atan2(vx, vz);
    player.runTime += dt * 11;
  }

  const radius = Math.hypot(player.x, player.z);
  if (radius > ARENA_RADIUS - 0.55) {
    const factor = (ARENA_RADIUS - 0.55) / radius;
    player.x *= factor;
    player.z *= factor;
  }
  player.root.position.set(player.x, 0, player.z);
  player.runBlend = THREE.MathUtils.damp(player.runBlend, moving ? 1 : 0, 18, dt);
  player.body.position.y = Math.abs(Math.sin(player.runTime)) * 0.035 * player.runBlend + Math.sin(gameTime * 1.5) * 0.008 * (1 - player.runBlend);
  player.body.rotation.z = Math.cos(player.runTime) * 0.025 * player.runBlend;
  player.body.rotation.x = 0.07 * player.runBlend;
  animateHero(player.rig, player.runTime, player.runBlend);

  const firing = keys.has('Space') || keys.has('Fire');
  // Keep the visible stream attached to the hands every frame, including turns.
  updateStream(firing);
  player.fireTimer -= dt;
  if (firing && player.fireTimer <= 0) {
    shoot();
    player.fireTimer = 0.12;
  }

  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    enemy.attack -= dt;
    enemy.hit = Math.max(0, enemy.hit - dt);
    enemy.body.material.emissiveIntensity = enemy.hit > 0 ? 0.7 : 0.08;
    enemy.body.scale.y = 0.8 + Math.sin(gameTime * 5 + enemy.wobble) * 0.035;
    const vx = player.x - enemy.x;
    const vz = player.z - enemy.z;
    const dist = Math.hypot(vx, vz) || 0.001;
    if (dist > enemy.size + 0.48) {
      enemy.x += vx / dist * enemy.speed * dt;
      enemy.z += vz / dist * enemy.speed * dt;
      enemy.root.position.set(enemy.x, 0, enemy.z);
    } else if (enemy.attack <= 0 && player.invulnerable <= 0) {
      player.hp--;
      player.invulnerable = 0.85;
      enemy.attack = 0.85;
      updateHealth();
      burst(player.x, 0.35, player.z, 0xff6681, 5);
      blip(115, 0.12);
      if (player.hp <= 0) endGame();
    }
  }

  player.invulnerable = Math.max(0, player.invulnerable - dt);
  player.model.material.opacity = player.invulnerable > 0 && Math.floor(gameTime * 18) % 2 === 0 ? 0.45 : 1;
  player.model.material.transparent = player.invulnerable > 0;

  for (let i = effects.length - 1; i >= 0; i--) {
    const effect = effects[i];
    effect.life -= dt;
    effect.object.position.addScaledVector(effect.velocity, dt);
    effect.velocity.y -= (effect.gravity || 0) * dt;
    effect.object.material.opacity = Math.max(0, effect.life / effect.maxLife);
    effect.object.scale.setScalar(Math.max(0.01, effect.life / effect.maxLife));
    if (effect.life <= 0) {
      scene.remove(effect.object);
      effect.object.geometry.dispose();
      effect.object.material.dispose();
      effects.splice(i, 1);
    }
  }

  for (let i = enemies.length - 1; i >= 0; i--) {
    if (!enemies[i].alive) enemies.splice(i, 1);
  }
  if (enemies.length === 0) {
    pendingWave += dt;
    if (pendingWave > 1.4) {
      pendingWave = 0;
      spawnWave(wave + 1);
    }
  } else pendingWave = 0;

  const cameraTarget = new THREE.Vector3(player.x, 0, player.z + 1.1);
  camera.position.lerp(new THREE.Vector3(player.x, 8, player.z + 10), 1 - Math.exp(-2.5 * dt));
  camera.lookAt(cameraTarget);
}

function updateHealth() {
  const ratio = Math.max(0, player.hp / player.maxHp);
  healthFill.style.width = `${ratio * 100}%`;
  if (ratio < 0.4) healthFill.style.background = 'linear-gradient(90deg, #f04559, #ff7952)';
}

function startGame() {
  if (!player.model) return;
  clearArena();
  score = 0;
  wave = 0;
  pendingWave = 0;
  player.hp = player.maxHp;
  player.x = 0;
  player.z = 0;
  player.dx = 0;
  player.dz = 1;
  player.runTime = 0;
  player.runBlend = 0;
  player.invulnerable = 0;
  player.fireTimer = 0;
  player.root.rotation.y = 0;
  animateHero(player.rig, 0, 0);
  scoreLabel.textContent = '0000';
  updateHealth();
  spawnWave(1);
  playing = true;
  startScreen.classList.add('hidden');
  endScreen.classList.add('hidden');
  keys.clear();
}

function clearArena() {
  stream.visible = false;
  for (const enemy of enemies) scene.remove(enemy.root);
  for (const effect of effects) {
    scene.remove(effect.object);
    effect.object.geometry.dispose();
    effect.object.material.dispose();
  }
  enemies.length = 0;
  effects.length = 0;
}

function endGame() {
  playing = false;
  stream.visible = false;
  finalScore.textContent = String(score).padStart(4, '0');
  endScreen.classList.remove('hidden');
  blip(80, 0.25);
  keys.clear();
}

function resize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, frameTime ? (now - frameTime) / 1000 : 0);
  frameTime = now;
  update(dt);
  renderer.render(scene, camera);
}

window.addEventListener('keydown', (event) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (event.code === 'Enter' && !playing && !startScreen.classList.contains('hidden') && player.model) startGame();
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());
window.addEventListener('resize', resize);
canvas.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'mouse' && event.button === 0 && playing) keys.add('Fire');
});
window.addEventListener('pointerup', () => keys.delete('Fire'));
startButton.addEventListener('click', startGame);
restartButton.addEventListener('click', startGame);
document.querySelector('#sound').addEventListener('click', (event) => {
  soundEnabled = !soundEnabled;
  event.currentTarget.textContent = soundEnabled ? '♫' : '♪';
  event.currentTarget.classList.toggle('sound-on', soundEnabled);
  if (soundEnabled) blip(520, 0.05);
});

for (const button of document.querySelectorAll('[data-key]')) {
  const code = button.dataset.key;
  button.addEventListener('pointerdown', (event) => { event.preventDefault(); keys.add(code); button.setPointerCapture(event.pointerId); });
  const release = () => keys.delete(code);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
}
const fireButton = document.querySelector('#mobile-fire');
fireButton.addEventListener('pointerdown', (event) => { event.preventDefault(); keys.add('Fire'); fireButton.setPointerCapture(event.pointerId); });
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) fireButton.addEventListener(name, () => keys.delete('Fire'));

resize();
loadHero();
requestAnimationFrame(animate);

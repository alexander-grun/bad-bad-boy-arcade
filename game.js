import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createHero, animateHero } from './hero.js';
import { createCity } from './city.js';
import { loadEnemyModels, createEnemy, animateEnemy, disposeEnemy } from './enemies.js';

const MODEL_URL = './assets/bad-bad-boy.glb';
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
scene.background = new THREE.Color('#7c929f');
scene.fog = new THREE.Fog('#7c929f', 25, 65);

const camera = new THREE.PerspectiveCamera(47, 1, 0.1, 100);
camera.position.set(0, 10, 12);
camera.lookAt(0, 0, 0);

scene.add(new THREE.HemisphereLight(0xd8e9ff, 0x757264, 2.3));
const keyLight = new THREE.DirectionalLight(0xffdfad, 2.6);
keyLight.position.set(-12, 25, 10);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -28;
keyLight.shadow.camera.right = 28;
keyLight.shadow.camera.top = 28;
keyLight.shadow.camera.bottom = -28;
keyLight.shadow.normalBias = 0.035;
keyLight.shadow.camera.far = 70;
scene.add(keyLight);
const city = createCity(scene);

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

async function loadModels() {
  try {
    status.textContent = 'Загружаю героя, слизней и улиток…';
    const [gltf] = await Promise.all([
      new GLTFLoader().loadAsync(MODEL_URL),
      loadEnemyModels(),
    ]);
    player.rig = createHero(gltf.scene);
    player.model = player.rig.mesh;
    player.body.add(player.model);
    status.classList.add('hidden');
    startButton.disabled = false;
    startButton.textContent = 'НАЧАТЬ ИГРУ';
  } catch (error) {
    console.error('Could not load game models:', error);
    status.textContent = 'Не загрузились модели. Обнови страницу с запущенным локальным сервером.';
  }
}

function makeEnemy(x, z, level, kind) {
  const enemy = createEnemy(kind, level);
  enemy.x = x;
  enemy.z = z;
  enemy.root.position.set(x, 0, z);
  scene.add(enemy.root);
  enemies.push(enemy);
}

function spawnWave(level) {
  wave = level;
  waveLabel.textContent = String(wave).padStart(2, '0');
  city.routeTo(player.x, player.z);
  const count = Math.min(3 + level * 2, 18);
  for (let i = 0; i < count; i++) {
    const point = city.spawnPoint(player, i, count);
    makeEnemy(point.x, point.z, level, i % 3 === 0 ? 'snail' : 'slime');
  }
  if (level > 1) showToast(`ВОЛНА ${level}`);
}

function removeEnemy(enemy, pop = false) {
  if (!enemy.alive) return;
  enemy.alive = false;
  disposeEnemy(enemy);
  if (pop) {
    score += enemy.kind === 'snail' ? 150 : 100;
    scoreLabel.textContent = String(score).padStart(4, '0');
    burst(enemy.x, enemy.hitHeight, enemy.z, 0xffd34e, 10);
    blip(440 + Math.random() * 280, 0.045);
  }
}

function updateStream(firing) {
  stream.visible = firing;
  if (!firing) return;
  player.rig.emitter.getWorldPosition(streamOrigin);
  streamDirection.set(player.dx, 0, player.dz).normalize();
  let reach = STREAM_LENGTH;
  while (reach > 0.1 && !city.lineClear(streamOrigin.x, streamOrigin.z, streamOrigin.x + streamDirection.x * reach, streamOrigin.z + streamDirection.z * reach, 0)) reach -= 0.1;
  streamAxis.copy(streamDirection).multiplyScalar(reach);
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
    const target = new THREE.Vector3(enemy.x, enemy.hitHeight, enemy.z);
    const relative = target.clone().sub(origin);
    const along = relative.dot(ray);
    if (along < 0.1 || along > length + enemy.size * 0.5) continue;
    const closest = origin.clone().addScaledVector(ray, along);
    if (closest.distanceTo(target) > enemy.size + 0.13) continue;
    if (!city.lineClear(origin.x, origin.z, enemy.x, enemy.z, 0)) continue;
    enemy.hp--;
    enemy.hit = 0.14;
    city.move(enemy, dir.x * 0.23, dir.z * 0.23, enemy.size);
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
    const oldX = player.x, oldZ = player.z;
    city.move(player, vx * player.speed * dt, vz * player.speed * dt, 0.32);
    moving = Math.hypot(player.x - oldX, player.z - oldZ) > 0.001;
    player.dx = vx;
    player.dz = vz;
    player.root.rotation.y = Math.atan2(vx, vz);
    player.runTime += dt * 11;
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

  city.routeTo(player.x, player.z);
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    enemy.attack -= dt;
    enemy.hit = Math.max(0, enemy.hit - dt);
    const vx = player.x - enemy.x;
    const vz = player.z - enemy.z;
    const dist = Math.hypot(vx, vz) || 0.001;
    const attacking = dist <= enemy.size + 0.38 && city.lineClear(enemy.x, enemy.z, player.x, player.z, 0.1);
    enemy.root.rotation.y = Math.atan2(vx, vz);
    if (!attacking) {
      const direction = city.chase(enemy.x, enemy.z, player.x, player.z);
      // Soft separation keeps a pack of snails from collapsing into one shell.
      for (const other of enemies) {
        if (other === enemy || !other.alive) continue;
        const sx = enemy.x - other.x, sz = enemy.z - other.z;
        const distance = Math.hypot(sx, sz);
        const spacing = (enemy.size + other.size) * 0.88;
        if (distance > 0.001 && distance < spacing) {
          direction.x += sx / distance * (spacing - distance) * 1.8;
          direction.z += sz / distance * (spacing - distance) * 1.8;
        }
      }
      const step = Math.hypot(direction.x, direction.z);
      if (step > 0.01) {
        city.move(enemy, direction.x / step * enemy.speed * dt, direction.z / step * enemy.speed * dt, enemy.size);
        enemy.root.rotation.y = Math.atan2(direction.x, direction.z);
      }
      enemy.root.position.set(enemy.x, 0, enemy.z);
    } else if (enemy.attack <= 0 && player.invulnerable <= 0) {
      player.hp--;
      player.invulnerable = 0.85;
      enemy.attack = enemy.kind === 'snail' ? 1.2 : 0.85;
      updateHealth();
      burst(player.x, 0.35, player.z, 0xff6681, 5);
      blip(115, 0.12);
      if (player.hp <= 0) endGame();
    }
    animateEnemy(enemy, dt, gameTime, attacking);
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

  const cameraTarget = new THREE.Vector3(player.x, 0, player.z);
  camera.position.lerp(new THREE.Vector3(player.x, 10, player.z + 12), 1 - Math.exp(-2.5 * dt));
  camera.lookAt(cameraTarget);
}

function updateHealth() {
  const ratio = Math.max(0, player.hp / player.maxHp);
  healthFill.style.width = `${ratio * 100}%`;
  healthFill.style.background = ratio < 0.4 ? 'linear-gradient(90deg, #f04559, #ff7952)' : 'linear-gradient(90deg, #ff8b54, #ffd34e)';
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
  player.root.position.set(0, 0, 0);
  player.model.material.opacity = 1;
  player.model.material.transparent = false;
  camera.position.set(0, 10, 12);
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
  for (const enemy of enemies) disposeEnemy(enemy);
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
window.addEventListener('pointerup', event => { if (event.pointerType === 'mouse') keys.delete('Fire'); });
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
loadModels();
requestAnimationFrame(animate);

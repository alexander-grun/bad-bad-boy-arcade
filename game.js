import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createHero, animateHero, HERO_BASE_HEIGHT } from './hero.js';
import { createCity, CITY_STOREY_HEIGHT } from './city.js';
import { loadEnemyModels, createEnemy, animateEnemy, disposeEnemy } from './enemies.js';
import { createLiquidStream } from './liquid.js';
import { createBiteEffects } from './bites.js';
import { createMedkits } from './medkits.js';
import { createTouchControls } from './touch-controls.js';

const MODEL_URL = './assets/bad-bad-boy.glb?v=20261025-opt1';
// Match the map's third-floor windows rather than the sculpture's real size.
const HERO_HEIGHT = CITY_STOREY_HEIGHT * 3;
const HERO_SCALE = HERO_HEIGHT / HERO_BASE_HEIGHT;
const CAMERA_HEIGHT = 10;
const CAMERA_DISTANCE = 12;
const CAMERA_LOOK_HEIGHT = HERO_HEIGHT * 0.4;
const keys = new Set();

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
const sprayRange = document.querySelector('#spray-range');
const pressureFill = document.querySelector('#pressure-fill');
const touchControls = createTouchControls({
  zone: document.querySelector('#joystick-zone'),
  stick: document.querySelector('#joystick'),
  thumb: document.querySelector('#joystick-thumb'),
  fireButton: document.querySelector('#mobile-fire'),
  onFireStart: beginSpray
});

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
camera.position.set(0, CAMERA_HEIGHT, CAMERA_DISTANCE);
camera.lookAt(0, CAMERA_LOOK_HEIGHT, 0);

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
  heading: 0,
  moveSpeed: 0,
  turnSpeed: 0,
  hp: 5,
  maxHp: 5,
  speed: 3.6,
  radius: 0.32 * HERO_SCALE,
  invulnerable: 0,
  fireTimer: 0,
  tapTimer: 0,
  runTime: 0,
  runBlend: 0
};
player.root.add(player.body);
scene.add(player.root);

const stream = createLiquidStream(scene, city, (enemy, direction) => {
  enemy.hp -= 2;
  enemy.hit = 0.18;
  city.move(enemy, direction.x * 0.38, direction.z * 0.38, enemy.size);
  enemy.root.position.set(enemy.x, 0, enemy.z);
  if (enemy.hp <= 0) removeEnemy(enemy, true);
}, { scale: HERO_HEIGHT / 2.25 });

const enemies = [];
const effects = [];
const biteEffects = createBiteEffects(scene);
const medkits = createMedkits(scene, city);
let playing = false;
let gameTime = 0;
let score = 0;
let wave = 1;
let pendingWave = 0;
let soundEnabled = false;
let audioContext = null;
let frameTime = 0;

async function loadHero() {
  const url = new URL(MODEL_URL, import.meta.url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Hero download failed: HTTP ${response.status}`);
  let bytes;
  if (response.body) {
    const reader = response.body.getReader();
    const chunks = [], header = new Uint8Array(12);
    let loaded = 0, headerLength = 0, total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); loaded += value.byteLength;
        if (headerLength < header.length) {
          const part = value.subarray(0, header.length - headerLength);
          header.set(part, headerLength); headerLength += part.length;
          if (headerLength === header.length) {
            const view = new DataView(header.buffer);
            if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) throw new Error('Invalid hero GLB header');
            // GLB stores the decoded size. HTTP Content-Length can describe
            // compressed bytes, while fetch streams already decoded bytes.
            total = view.getUint32(8, true);
            if (total < 20) throw new Error('Invalid hero GLB length');
          }
        }
        if (total) {
          if (loaded > total) throw new Error('Hero GLB exceeds its declared length');
          const percent = Math.max(0, Math.min(99, Math.floor(loaded / total * 100)));
          status.textContent = `Loading the hero… ${percent}%`;
        }
      }
    } finally {
      reader.releaseLock();
    }
    if (!total || loaded !== total) throw new Error('Hero GLB download is incomplete');
    bytes = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  } else {
    bytes = new Uint8Array(await response.arrayBuffer());
  }
  status.textContent = 'Preparing the models…';
  return new GLTFLoader().parseAsync(bytes.buffer, new URL('.', url).href);
}

async function loadModels() {
  try {
    status.textContent = 'Loading the hero, slimes, and snails…';
    const [gltf] = await Promise.all([
      loadHero(),
      loadEnemyModels(),
    ]);
    player.rig = createHero(gltf.scene);
    player.model = player.rig.mesh;
    player.model.scale.setScalar(HERO_SCALE);
    player.body.add(player.model);
    status.classList.add('hidden');
    startButton.disabled = false;
    startButton.textContent = 'START GAME';
    window.dispatchEvent(new Event('game:ready'));
  } catch (error) {
    console.error('Could not load game models:', error);
    status.textContent = 'Could not load the models. Start the local server, then refresh the page.';
    window.dispatchEvent(new CustomEvent('game:load-error', { detail: error }));
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
  if (level > 1) showToast(`WAVE ${level}`);
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

function showBite(enemy) {
  const attacker = new THREE.Vector3(enemy.x, THREE.MathUtils.clamp(enemy.hitHeight, .18, .48), enemy.z);
  const contact = new THREE.Vector3();
  let nearest = Infinity;
  // Use the animated shin closest to the attacker, including during a stride.
  for (const leg of player.rig.legs) {
    const ankle = leg.ankle.getWorldPosition(new THREE.Vector3());
    const knee = leg.knee.getWorldPosition(new THREE.Vector3());
    const height = knee.y - ankle.y;
    const t = Math.abs(height) > .001 ? THREE.MathUtils.clamp((attacker.y - ankle.y) / height, 0, 1) : 0;
    const point = ankle.lerp(knee, t);
    const distance = point.distanceToSquared(attacker);
    if (distance < nearest) { nearest = distance; contact.copy(point); }
  }
  const outward = new THREE.Vector3(attacker.x - contact.x, 0, attacker.z - contact.z);
  if (outward.lengthSq() < .0001) outward.set(-player.dx, 0, -player.dz);
  outward.normalize();
  contact.addScaledVector(outward, .055 * HERO_SCALE);
  biteEffects.burst(contact, outward, HERO_SCALE);
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

function updateMovement(dt, firing) {
  const forward = Number(keys.has('ArrowUp')) - Number(keys.has('ArrowDown'));
  const turn = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
  const usingArrows = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].some(key => keys.has(key));
  const touch = touchControls.input;
  const touchStrength = Math.hypot(touch.x, touch.z);
  const worldX = touchStrength ? touch.x : Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  const worldZ = touchStrength ? touch.z : Number(keys.has('KeyS')) - Number(keys.has('KeyW'));
  const precise = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const maxSpeed = player.speed * (precise ? 0.4 : firing ? 0.7 : 1);
  const turnRate = precise ? 0.65 : firing ? 1.7 : 3.2;
  let throttle = 0, targetTurnSpeed = 0, angleRemaining = null;

  if (usingArrows) {
    // Steering is continuous: releasing left/right preserves this exact angle.
    throttle = forward;
    targetTurnSpeed = -turn * turnRate;
  } else if (worldX || worldZ) {
    const targetHeading = Math.atan2(worldX, worldZ);
    angleRemaining = Math.atan2(Math.sin(targetHeading - player.heading), Math.cos(targetHeading - player.heading));
    targetTurnSpeed = THREE.MathUtils.clamp(angleRemaining * 14, -turnRate * 2, turnRate * 2);
    // Finish facing the requested direction before accelerating into a U-turn.
    throttle = Math.max(0, Math.cos(angleRemaining)) * (touchStrength || 1);
  }

  if (targetTurnSpeed) {
    const decay = Math.exp(-18 * dt);
    const angleStep = targetTurnSpeed * dt + (player.turnSpeed - targetTurnSpeed) * (1 - decay) / 18;
    player.turnSpeed = targetTurnSpeed + (player.turnSpeed - targetTurnSpeed) * decay;
    player.heading += angleRemaining === null ? angleStep : THREE.MathUtils.clamp(angleStep, -Math.abs(angleRemaining), Math.abs(angleRemaining));
  } else player.turnSpeed = 0;
  player.heading = Math.atan2(Math.sin(player.heading), Math.cos(player.heading));
  player.dx = Math.sin(player.heading);
  player.dz = Math.cos(player.heading);
  player.root.rotation.y = player.heading;

  const targetSpeed = throttle * maxSpeed;
  const damping = throttle ? 14 : 24;
  const decay = Math.exp(-damping * dt);
  const distance = targetSpeed * dt + (player.moveSpeed - targetSpeed) * (1 - decay) / damping;
  player.moveSpeed = targetSpeed + (player.moveSpeed - targetSpeed) * decay;
  if (!throttle && Math.abs(player.moveSpeed) < 0.015) player.moveSpeed = 0;
  const oldX = player.x, oldZ = player.z;
  city.move(player, player.dx * distance, player.dz * distance, player.radius);
  const travelled = Math.hypot(player.x - oldX, player.z - oldZ);
  if (Math.abs(distance) > 0.0001 && travelled < Math.abs(distance) * 0.1) player.moveSpeed = 0;
  // Both movement and the stream use the actual facing direction; no strafing.
  player.runTime += Math.sign(distance) * travelled * Math.PI * 2 / (HERO_HEIGHT * 0.45);
  return travelled > 0.0001;
}

function update(dt) {
  gameTime += dt;
  // Finish the final bite's splash even after the round ends.
  biteEffects.update(dt);
  if (!playing) return;

  const firing = keys.has('Space') || keys.has('Fire') || touchControls.input.firing || player.tapTimer > 0;
  const moving = updateMovement(dt, firing);

  player.root.position.set(player.x, 0, player.z);
  player.runBlend = THREE.MathUtils.damp(player.runBlend, moving ? 1 : 0, 18, dt);
  player.body.position.y = (Math.abs(Math.sin(player.runTime)) * 0.035 * player.runBlend + Math.sin(gameTime * 1.5) * 0.008 * (1 - player.runBlend)) * HERO_SCALE;
  player.body.rotation.z = Math.cos(player.runTime) * 0.025 * player.runBlend;
  player.body.rotation.x = 0.07 * player.runBlend * THREE.MathUtils.clamp(player.moveSpeed / player.speed, -1, 1);
  animateHero(player.rig, player.runTime, player.runBlend);
  medkits.update(dt, player, collectMedkit);

  player.tapTimer = Math.max(0, player.tapTimer - dt);
  // Each parcel starts at the hands, then follows its own ballistic trajectory.
  const spray = stream.update(dt, firing, player.rig.emitter, player, enemies);
  pressureFill.style.transform = `scaleX(${spray.charge})`;
  sprayRange.textContent = spray.blocked ? 'BLOCKED' : `${spray.range.toFixed(1)} m`;
  player.fireTimer -= dt;
  if (firing && player.fireTimer <= 0) {
    blip(180 + Math.random() * 35, 0.035);
    player.fireTimer = 0.1;
  }

  city.routeTo(player.x, player.z);
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    enemy.attack -= dt;
    enemy.hit = Math.max(0, enemy.hit - dt);
    const vx = player.x - enemy.x;
    const vz = player.z - enemy.z;
    const dist = Math.hypot(vx, vz) || 0.001;
    const attacking = dist <= enemy.size + player.radius + 0.06 && city.lineClear(enemy.x, enemy.z, player.x, player.z, 0.1);
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
      showBite(enemy);
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

  camera.position.lerp(new THREE.Vector3(player.x, CAMERA_HEIGHT, player.z + CAMERA_DISTANCE), 1 - Math.exp(-2.5 * dt));
  // Pan with a fixed viewing angle so movement does not swing the aiming view.
  camera.lookAt(camera.position.x, CAMERA_LOOK_HEIGHT, camera.position.z - CAMERA_DISTANCE);
}

function updateHealth() {
  const ratio = Math.max(0, player.hp / player.maxHp);
  healthFill.style.width = `${ratio * 100}%`;
  healthFill.style.background = ratio < 0.4 ? 'linear-gradient(90deg, #f04559, #ff7952)' : 'linear-gradient(90deg, #ff8b54, #ffd34e)';
}

function collectMedkit(amount) {
  player.hp = Math.min(player.maxHp, player.hp + amount);
  updateHealth();
  showToast(`HEALTH +${amount}`);
  blip(740, .12);
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
  player.dz = -1;
  player.heading = Math.PI;
  player.moveSpeed = 0;
  player.turnSpeed = 0;
  player.runTime = 0;
  player.runBlend = 0;
  player.invulnerable = 0;
  player.fireTimer = 0;
  player.tapTimer = 0;
  player.root.rotation.y = player.heading;
  player.root.position.set(0, 0, 0);
  player.model.material.opacity = 1;
  player.model.material.transparent = false;
  camera.position.set(0, CAMERA_HEIGHT, CAMERA_DISTANCE);
  camera.lookAt(0, CAMERA_LOOK_HEIGHT, 0);
  animateHero(player.rig, 0, 0);
  scoreLabel.textContent = '0000';
  updateHealth();
  medkits.reset(player);
  spawnWave(1);
  playing = true;
  touchControls.setEnabled(true);
  startScreen.classList.add('hidden');
  endScreen.classList.add('hidden');
  keys.clear();
}

function clearArena() {
  stream.clear();
  biteEffects.clear();
  medkits.clear();
  player.tapTimer = 0;
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
  touchControls.setEnabled(false);
  stream.clear();
  player.tapTimer = 0;
  player.moveSpeed = 0;
  player.turnSpeed = 0;
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
  if (player.model) city.updateVisibility(camera, player.root, HERO_HEIGHT, dt);
  renderer.render(scene, camera);
}

function beginSpray() {
  player.tapTimer = 0.075;
  stream.resetPressure();
}

window.addEventListener('keydown', (event) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (event.code === 'Space' && !event.repeat && playing) beginSpray();
  if (event.code === 'Enter' && !playing && !startScreen.classList.contains('hidden') && player.model) startGame();
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => { keys.clear(); player.tapTimer = 0; player.moveSpeed = 0; player.turnSpeed = 0; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { keys.clear(); player.tapTimer = 0; player.moveSpeed = 0; player.turnSpeed = 0; }
});
window.addEventListener('resize', resize);
canvas.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'mouse' && event.button === 0 && playing) { keys.add('Fire'); beginSpray(); }
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

resize();
loadModels();
requestAnimationFrame(animate);

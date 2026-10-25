import * as THREE from 'three';

const STEP = 1 / 120;
const FLOW_RATE = 180;
const MIN_SPEED = 2.4;
const MAX_SPEED = 9;
const MIN_LIFT = -2.3;
const MAX_LIFT = 1.1;
const CHARGE_TIME = 1.2;
const GRAVITY = 5.2;
const RADIUS = 0.035;
const SPLASH_RADIUS = 0.45;
const HIT_INTERVAL = 0.1;
const MAX_PARCELS = 360;
const MAX_DROPS = 160;
const SIDES = 8;
const UP = new THREE.Vector3(0, 1, 0);

// Flight, rendering, and damage all use the same parcels of liquid. Once a
// parcel leaves the emitter, turning the character cannot redirect it.
export function createLiquidStream(scene, city, onHit, { scale = 1 } = {}) {
  const radius = RADIUS * scale;
  const groundHeight = radius + 0.005;
  const parcels = [];
  const splashes = [];
  const origin = new THREE.Vector3();
  const previousOrigin = new THREE.Vector3();
  const direction = new THREE.Vector3(0, 0, 1);
  const emissionOrigin = new THREE.Vector3();
  const impact = new THREE.Vector3();
  const delta = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const radial = new THREE.Vector3();
  const launchVelocity = new THREE.Vector3();
  const predicted = new THREE.Vector3();
  const previousPrediction = new THREE.Vector3();
  const targetPosition = new THREE.Vector3();
  const state = { charge: 0, range: 0, blocked: false };
  const dummy = new THREE.Object3D();
  let time = 0, accumulator = 0, emission = 0, sequence = 0, batch = 0;
  let heldTime = 0, speed = MIN_SPEED, lift = MIN_LIFT;
  let wasFiring = false, nextSplash = 0, nextRipple = 0;

  const material = new THREE.MeshPhysicalMaterial({
    color: '#ffd34c', roughness: 0.12, metalness: 0,
    transmission: 0.16, thickness: radius * 2, ior: 1.333,
    clearcoat: 1, clearcoatRoughness: 0.06,
    transparent: true, opacity: 0.86, depthWrite: false,
  });
  const vertices = new Float32Array((MAX_PARCELS + 1) * SIDES * 3);
  const normals = new Float32Array(vertices.length);
  const indices = new Uint16Array(MAX_PARCELS * SIDES * 6);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0, 0);
  const surface = new THREE.Mesh(geometry, material);
  surface.frustumCulled = false;
  scene.add(surface);

  const droplets = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), material, MAX_DROPS + MAX_PARCELS);
  droplets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  droplets.frustumCulled = false;
  droplets.count = 0;
  scene.add(droplets);

  const landingMarker = new THREE.Mesh(
    new THREE.RingGeometry(0.24, 0.3, 32),
    new THREE.MeshBasicMaterial({ color: '#fff0a1', transparent: true, opacity: 0.65, depthWrite: false, side: THREE.DoubleSide }),
  );
  landingMarker.rotation.x = -Math.PI / 2;
  landingMarker.visible = false;
  scene.add(landingMarker);

  function flightTime(height, verticalSpeed) {
    return (verticalSpeed + Math.sqrt(verticalSpeed * verticalSpeed + 2 * GRAVITY * Math.max(0, height - groundHeight))) / GRAVITY;
  }

  function setPressure() {
    state.charge = THREE.MathUtils.clamp(heldTime / CHARGE_TIME, 0, 1);
    const pressure = THREE.MathUtils.smoothstep(state.charge, 0, 1);
    speed = THREE.MathUtils.lerp(MIN_SPEED, MAX_SPEED, pressure);
    lift = THREE.MathUtils.lerp(MIN_LIFT, MAX_LIFT, pressure);
    launchVelocity.copy(direction).multiplyScalar(speed).setY(lift);
  }

  function updateLandingMarker(firing) {
    const duration = flightTime(origin.y, lift);
    state.range = speed * duration;
    state.blocked = false;
    previousPrediction.copy(origin);
    for (let i = 1; i <= 32; i++) {
      const t = duration * i / 32;
      predicted.copy(origin).addScaledVector(launchVelocity, t);
      predicted.y -= 0.5 * GRAVITY * t * t;
      if (!city.lineClear3D(previousPrediction, predicted, radius)) {
        state.blocked = true;
        break;
      }
      previousPrediction.copy(predicted);
    }
    landingMarker.visible = !state.blocked;
    landingMarker.position.set(predicted.x, 0.02, predicted.z);
    landingMarker.material.opacity = firing ? 0.8 : 0.4;
    landingMarker.scale.setScalar(1 + state.charge * 0.25);
  }

  const ripples = Array.from({ length: 12 }, () => {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.78, 1, 24),
      new THREE.MeshBasicMaterial({ color: '#e8bf39', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, age: 1 };
  });
  let rippleCursor = 0;

  function splash(position, velocity, ground) {
    if (time >= nextSplash) {
      nextSplash = time + 0.035;
      for (let i = 0; i < 5; i++) {
        if (splashes.length >= MAX_DROPS) break;
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.4 + Math.random() * 1.4;
        splashes.push({
          position: position.clone(),
          velocity: new THREE.Vector3(Math.cos(angle) * speed + velocity.x * 0.08, 0.6 + Math.random() * 1.5, Math.sin(angle) * speed + velocity.z * 0.08),
          age: 0, life: 0.25 + Math.random() * 0.32, radius: (0.014 + Math.random() * 0.017) * scale,
        });
      }
    }
    if (ground && time >= nextRipple) {
      nextRipple = time + 0.08;
      const ripple = ripples[rippleCursor++ % ripples.length];
      ripple.age = 0;
      ripple.mesh.position.set(position.x, 0.016, position.z);
      ripple.mesh.visible = true;
    }
  }

  // First intersection with the enemy's collision sphere along this time step.
  function enemyContact(from, to, enemy) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const rx = from.x - enemy.x, ry = from.y - enemy.hitHeight, rz = from.z - enemy.z;
    const hitRadius = enemy.size + radius;
    const c = rx * rx + ry * ry + rz * rz - hitRadius * hitRadius;
    if (c <= 0) return 0;
    const a = dx * dx + dy * dy + dz * dz;
    const b = rx * dx + ry * dy + rz * dz;
    const discriminant = b * b - a * c;
    if (a < 1e-10 || discriminant < 0) return Infinity;
    const t = (-b - Math.sqrt(discriminant)) / a;
    return t >= 0 && t <= 1 ? t : Infinity;
  }

  function damageEnemy(enemy, velocity) {
    if (!enemy.alive || time < (enemy.nextJetHit ?? 0)) return;
    enemy.nextJetHit = time + HIT_INTERVAL;
    delta.copy(velocity).setY(0).normalize();
    onHit(enemy, delta);
  }

  function damageGroundSplash(point, velocity, enemies) {
    for (const enemy of enemies) {
      if (!enemy.alive || time < (enemy.nextJetHit ?? 0)) continue;
      const reach = SPLASH_RADIUS + radius + enemy.size;
      if ((enemy.x - point.x) ** 2 + (enemy.z - point.z) ** 2 > reach * reach) continue;
      targetPosition.set(enemy.x, enemy.hitHeight, enemy.z);
      if (!city.lineClear3D(point, targetPosition, 0.02)) continue;
      damageEnemy(enemy, velocity);
    }
  }

  function simulate(enemies) {
    time += STEP;
    for (let i = parcels.length - 1; i >= 0; i--) {
      const parcel = parcels[i];
      parcel.previous.copy(parcel.position);
      parcel.position.addScaledVector(parcel.velocity, STEP);
      parcel.position.y -= 0.5 * GRAVITY * STEP * STEP;
      parcel.velocity.y -= GRAVITY * STEP;
      parcel.age += STEP;
      let contact = Infinity, target = null, ground = false;
      if (parcel.position.y <= groundHeight) {
        contact = THREE.MathUtils.clamp((parcel.previous.y - groundHeight) / (parcel.previous.y - parcel.position.y), 0, 1);
        ground = true;
      }
      if (!city.lineClear3D(parcel.previous, parcel.position, radius)) {
        let lo = 0, hi = 1;
        for (let n = 0; n < 7; n++) {
          const mid = (lo + hi) / 2;
          impact.lerpVectors(parcel.previous, parcel.position, mid);
          if (city.lineClear3D(parcel.previous, impact, radius)) lo = mid;
          else hi = mid;
        }
        if (hi < contact) { contact = hi; ground = false; }
      }
      for (const enemy of enemies) {
        if (!enemy.alive) continue;
        const t = enemyContact(parcel.previous, parcel.position, enemy);
        if (t < contact) { contact = t; target = enemy; ground = false; }
      }
      if (contact !== Infinity) {
        impact.lerpVectors(parcel.previous, parcel.position, contact);
        splash(impact, parcel.velocity, ground);
        if (target) damageEnemy(target, parcel.velocity);
        else if (ground) damageGroundSplash(impact, parcel.velocity, enemies);
        parcels.splice(i, 1);
      } else if (parcel.age > 2) parcels.splice(i, 1);
    }
    for (let i = splashes.length - 1; i >= 0; i--) {
      const drop = splashes[i];
      drop.age += STEP;
      drop.position.addScaledVector(drop.velocity, STEP);
      drop.position.y -= 0.5 * GRAVITY * STEP * STEP;
      drop.velocity.y -= GRAVITY * STEP;
      if (drop.age > drop.life || drop.position.y < 0.02) splashes.splice(i, 1);
    }
  }

  function drawDrop(position, velocity, radius, index, stretch = 1.6) {
    dummy.position.copy(position);
    tangent.copy(velocity).normalize();
    dummy.quaternion.setFromUnitVectors(UP, tangent);
    dummy.scale.set(radius, radius * stretch, radius);
    dummy.updateMatrix();
    droplets.setMatrixAt(index, dummy.matrix);
  }

  function render(firing) {
    let ring = 0, indexCount = 0, dropCount = 0, previous = null;
    function addRing(position, velocity, age, id, batchId) {
      tangent.copy(velocity).normalize();
      side.crossVectors(tangent, UP).normalize();
      normal.crossVectors(side, tangent).normalize();
      const pulse = 1 + 0.12 * Math.sin(id * 1.8 - time * 9) + 0.07 * Math.sin(id * 0.6 + time * 17);
      const ringRadius = radius * pulse * (1 + age * 0.3);
      for (let j = 0; j < SIDES; j++) {
        const angle = j / SIDES * Math.PI * 2;
        radial.copy(side).multiplyScalar(Math.cos(angle)).addScaledVector(normal, Math.sin(angle));
        const offset = (ring * SIDES + j) * 3;
        vertices[offset] = position.x + radial.x * ringRadius;
        vertices[offset + 1] = position.y + radial.y * ringRadius;
        vertices[offset + 2] = position.z + radial.z * ringRadius;
        normals[offset] = radial.x; normals[offset + 1] = radial.y; normals[offset + 2] = radial.z;
      }
      if (previous && previous.batch === batchId && id === previous.id + 1 && previous.position.distanceToSquared(position) < 0.26 ** 2) {
        for (let j = 0; j < SIDES; j++) {
          const a = (ring - 1) * SIDES + j, b = (ring - 1) * SIDES + (j + 1) % SIDES;
          const c = ring * SIDES + j, d = ring * SIDES + (j + 1) % SIDES;
          indices[indexCount++] = a; indices[indexCount++] = b; indices[indexCount++] = c;
          indices[indexCount++] = b; indices[indexCount++] = d; indices[indexCount++] = c;
        }
      }
      previous = { position, id, batch: batchId };
      ring++;
    }
    for (const parcel of parcels) {
      if (parcel.age < parcel.breakupTime) addRing(parcel.position, parcel.velocity, parcel.age, parcel.id, parcel.batch);
      else {
        const dropRadius = radius * (0.7 + Math.sin(parcel.id * 2.1) * 0.18);
        drawDrop(parcel.position, parcel.velocity, dropRadius, dropCount++, 1.9);
      }
    }
    // The newest ring follows the actual emitter, even between physics steps.
    if (firing) {
      addRing(origin, launchVelocity, 0, sequence + 1, batch);
    }
    for (const drop of splashes) drawDrop(drop.position, drop.velocity, drop.radius * (1 - drop.age / drop.life * 0.5), dropCount++);
    geometry.setDrawRange(0, indexCount);
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.normal.needsUpdate = true;
    geometry.index.needsUpdate = true;
    surface.visible = indexCount > 0;
    droplets.count = dropCount;
    droplets.instanceMatrix.needsUpdate = true;
    for (const ripple of ripples) {
      const progress = ripple.age / 0.55;
      ripple.mesh.visible = progress < 1;
      if (progress < 1) {
        ripple.mesh.scale.setScalar((0.07 + progress * 0.35) * scale);
        ripple.mesh.material.opacity = 0.4 * (1 - progress);
      }
    }
  }

  function update(dt, firing, emitter, facing, enemies) {
    emitter.getWorldPosition(origin);
    direction.set(facing.dx, 0, facing.dz).normalize();
    if (firing && !wasFiring) { batch++; heldTime = 0; emission = 0; previousOrigin.copy(origin); }
    if (!firing) { heldTime = 0; emission = 0; }
    setPressure();
    accumulator += dt;
    const steps = Math.floor(accumulator / STEP);
    for (let n = 0; n < steps; n++) {
      simulate(enemies);
      if (firing) {
        heldTime = Math.min(CHARGE_TIME, heldTime + STEP);
        setPressure();
        emissionOrigin.lerpVectors(previousOrigin, origin, (n + 1) / steps);
        emission += FLOW_RATE * STEP;
        while (emission >= 1) {
          emission--;
          const age = emission / FLOW_RATE;
          const velocity = launchVelocity.clone();
          const position = emissionOrigin.clone().addScaledVector(velocity, age);
          position.y -= 0.5 * GRAVITY * age * age;
          velocity.y -= GRAVITY * age;
          if (parcels.length >= MAX_PARCELS) parcels.shift();
          const breakupTime = Math.max(0.18, flightTime(emissionOrigin.y, lift) * 0.78);
          parcels.push({ position, previous: position.clone(), velocity, age, id: ++sequence, batch, breakupTime });
        }
      }
      accumulator -= STEP;
    }
    for (const ripple of ripples) ripple.age += dt;
    render(firing);
    updateLandingMarker(firing);
    previousOrigin.copy(origin);
    wasFiring = firing;
    return state;
  }

  function clear() {
    parcels.length = splashes.length = 0;
    accumulator = emission = 0; wasFiring = false;
    heldTime = 0; state.charge = 0; state.blocked = false;
    surface.visible = false; droplets.count = 0;
    landingMarker.visible = false;
    for (const ripple of ripples) { ripple.age = 1; ripple.mesh.visible = false; }
  }
  function resetPressure() {
    heldTime = 0;
    wasFiring = false;
  }
  return { update, clear, resetPressure };
}

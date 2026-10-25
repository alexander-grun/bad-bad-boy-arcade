import * as THREE from 'three';

const STEP = 1 / 120;
const FLOW_RATE = 180;
const SPEED = 9;
const LIFT = 1.1;
const GRAVITY = 5.2;
const RADIUS = 0.035;
const BREAKUP_TIME = 0.54;
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
  const dummy = new THREE.Object3D();
  let time = 0, accumulator = 0, emission = 0, sequence = 0, batch = 0;
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
        if (target && time >= (target.nextJetHit ?? 0)) {
          target.nextJetHit = time + HIT_INTERVAL;
          delta.copy(parcel.velocity).setY(0).normalize();
          onHit(target, delta);
        }
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
    const flightTime = (LIFT + Math.sqrt(LIFT * LIFT + 2 * GRAVITY * Math.max(0, origin.y - groundHeight))) / GRAVITY;
    const breakupTime = Math.max(BREAKUP_TIME, flightTime * 0.78);
    for (const parcel of parcels) {
      if (parcel.age < breakupTime) addRing(parcel.position, parcel.velocity, parcel.age, parcel.id, parcel.batch);
      else {
        const dropRadius = radius * (0.7 + Math.sin(parcel.id * 2.1) * 0.18);
        drawDrop(parcel.position, parcel.velocity, dropRadius, dropCount++, 1.9);
      }
    }
    // The newest ring follows the actual emitter, even between physics steps.
    if (firing) {
      delta.copy(direction).multiplyScalar(SPEED).setY(LIFT);
      addRing(origin, delta, 0, sequence + 1, batch);
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
    if (firing && !wasFiring) { batch++; emission = 0; previousOrigin.copy(origin); }
    accumulator += dt;
    const steps = Math.floor(accumulator / STEP);
    for (let n = 0; n < steps; n++) {
      simulate(enemies);
      if (firing) {
        emissionOrigin.lerpVectors(previousOrigin, origin, (n + 1) / steps);
        emission += FLOW_RATE * STEP;
        while (emission >= 1) {
          emission--;
          const age = emission / FLOW_RATE;
          const velocity = direction.clone().multiplyScalar(SPEED).setY(LIFT);
          const position = emissionOrigin.clone().addScaledVector(velocity, age);
          position.y -= 0.5 * GRAVITY * age * age;
          velocity.y -= GRAVITY * age;
          if (parcels.length >= MAX_PARCELS) parcels.shift();
          parcels.push({ position, previous: position.clone(), velocity, age, id: ++sequence, batch });
        }
      }
      accumulator -= STEP;
    }
    for (const ripple of ripples) ripple.age += dt;
    render(firing);
    previousOrigin.copy(origin);
    wasFiring = firing;
  }

  function clear() {
    parcels.length = splashes.length = 0;
    accumulator = emission = 0; wasFiring = false;
    surface.visible = false; droplets.count = 0;
    for (const ripple of ripples) { ripple.age = 1; ripple.mesh.visible = false; }
  }
  return { update, clear };
}

import * as THREE from 'three';

export function createBiteEffects(scene) {
  // All droplets share one geometry, material, and draw call.
  const capacity = 64;
  const mesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 7, 5),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .95, depthWrite: false, toneMapped: false }),
    capacity
  );
  mesh.name = 'red-bite-splashes';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color(0xffffff));
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);
  const particles = [];
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
  const colours = [0xff253b, 0xe81730, 0xb90d25];

  function update(dt) {
    if (!particles.length) { mesh.count = 0; return; }
    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i];
      particle.life -= dt;
      if (particle.life <= 0) { particles.splice(i, 1); continue; }
      if (!particle.landed) {
        particle.velocity.y -= 6 * dt;
        particle.position.addScaledVector(particle.velocity, dt);
        if (particle.position.y <= .025) {
          particle.position.y = .025;
          particle.landed = true;
          particle.life = Math.min(particle.life, .25);
        }
      }
    }
    mesh.count = particles.length;
    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      const size = particle.radius * Math.min(1, particle.life / .25);
      dummy.position.copy(particle.position);
      if (particle.landed) {
        dummy.quaternion.identity();
        dummy.scale.set(size * 1.8, size * .18, size * 1.8);
      } else {
        direction.copy(particle.velocity).normalize();
        dummy.quaternion.setFromUnitVectors(up, direction);
        dummy.scale.set(size, size * 1.65, size);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, particle.colour);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  function burst(origin, outward, scale) {
    const count = 18;
    // A fixed pool also bounds the effect if attack rates change later.
    particles.splice(0, Math.max(0, particles.length + count - capacity));
    for (let i = 0; i < count; i++) {
      const sideways = (Math.random() - .5) * 2.4;
      const speed = .8 + Math.random() * 1.9;
      particles.push({
        position: origin.clone(),
        velocity: new THREE.Vector3(
          outward.x * speed - outward.z * sideways,
          1.3 + Math.random() * 1.9,
          outward.z * speed + outward.x * sideways
        ),
        radius: (.024 + Math.random() * .023) * scale,
        colour: new THREE.Color(colours[i % colours.length]),
        life: 1.4 + Math.random() * .15,
        landed: false
      });
    }
    update(0);
  }

  function clear() {
    particles.length = 0;
    mesh.count = 0;
  }

  return { burst, update, clear };
}

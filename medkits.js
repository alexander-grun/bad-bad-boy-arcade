import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const ANCHORS = [[3.2, -3.8], [-13, -1.6], [13, -1.6], [-1.6, -15], [1.6, 15]];

export function createMedkits(scene, city) {
  function boxes(parts) {
    const pieces = parts.map(([x, y, z, w, h, d]) => new THREE.BoxGeometry(w, h, d).translate(x, y, z));
    const geometry = mergeGeometries(pieces);
    for (const piece of pieces) piece.dispose();
    return geometry;
  }
  const cases = new THREE.InstancedMesh(
    boxes([
      [0, 0, 0, .72, .46, .36],
      [-.14, .28, 0, .07, .14, .12], [.14, .28, 0, .07, .14, .12],
      [0, .36, 0, .35, .07, .12]
    ]),
    new THREE.MeshStandardMaterial({ color: '#f4f3e9', roughness: .55 }),
    ANCHORS.length
  );
  const crosses = new THREE.InstancedMesh(
    boxes([
      [0, 0, .187, .12, .30, .018], [0, 0, .187, .34, .11, .018],
      [0, 0, -.187, .12, .30, .018], [0, 0, -.187, .34, .11, .018],
      [0, .237, 0, .12, .018, .28], [0, .237, 0, .34, .018, .10]
    ]),
    new THREE.MeshStandardMaterial({ color: '#2eaa78', emissive: '#187448', emissiveIntensity: .4, roughness: .6 }),
    ANCHORS.length
  );
  const halos = new THREE.InstancedMesh(
    new THREE.RingGeometry(.47, .56, 32),
    new THREE.MeshBasicMaterial({ color: '#75e3a8', transparent: true, opacity: .5, depthWrite: false, side: THREE.DoubleSide }),
    ANCHORS.length
  );
  const meshes = [cases, crosses, halos];
  for (const mesh of meshes) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
  }
  cases.castShadow = crosses.castShadow = true;
  const dummy = new THREE.Object3D();
  const kits = [];
  let time = 0;

  function render() {
    let count = 0;
    for (const kit of kits) {
      if (!kit.active) continue;
      dummy.position.set(kit.x, .43 + Math.sin(time * 2.5 + kit.phase) * .055, kit.z);
      dummy.rotation.set(0, time * .55 + kit.phase, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      cases.setMatrixAt(count, dummy.matrix);
      crosses.setMatrixAt(count, dummy.matrix);
      dummy.position.y = .018;
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(1 + Math.sin(time * 3 + kit.phase) * .08);
      dummy.updateMatrix();
      halos.setMatrixAt(count++, dummy.matrix);
    }
    for (const mesh of meshes) { mesh.count = count; mesh.instanceMatrix.needsUpdate = true; }
  }

  function reset(player) {
    kits.length = 0;
    time = 0;
    for (const [anchorX, anchorZ] of ANCHORS) {
      let x = anchorX, z = anchorZ;
      for (let attempt = 0; attempt < 12; attempt++) {
        const candidateX = anchorX + (Math.random() - .5);
        const candidateZ = anchorZ + (Math.random() - .5);
        if (city.canStandAt(candidateX, candidateZ, player.radius + .12)) {
          x = candidateX; z = candidateZ; break;
        }
      }
      if (city.canStandAt(x, z, player.radius + .12)) kits.push({ x, z, active: true, phase: Math.random() * Math.PI * 2 });
    }
    render();
  }

  function update(dt, player, onPickup) {
    time += dt;
    for (const kit of kits) {
      if (!kit.active || player.hp >= player.maxHp) continue;
      if (Math.hypot(player.x - kit.x, player.z - kit.z) > player.radius + .45) continue;
      if (!city.lineClear(player.x, player.z, kit.x, kit.z, .12)) continue;
      kit.active = false;
      onPickup(Math.min(2, player.maxHp - player.hp));
    }
    render();
  }

  function clear() {
    kits.length = 0;
    for (const mesh of meshes) mesh.count = 0;
  }

  return { reset, update, clear };
}

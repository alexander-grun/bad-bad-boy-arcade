import * as THREE from 'three';

// A small, walkable Nordic neighbourhood. Dimensions are in game metres.
export function createCity(scene) {
  const colliders = [];
  const batches = new Map();
  const buildings = [];
  let activeBuilding = null;
  const geometries = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
    sphere: new THREE.IcosahedronGeometry(0.5, 1),
  };
  const dummy = new THREE.Object3D();
  let seed = 37;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  function part(shape, color, x, y, z, sx, sy, sz, ry = 0, glow = false) {
    const target = activeBuilding?.batches ?? batches;
    if (activeBuilding) { x -= activeBuilding.x; z -= activeBuilding.z; }
    const key = `${shape}:${color}:${glow}`;
    if (!target.has(key)) target.set(key, { shape, color, glow, transforms: [] });
    target.get(key).transforms.push([x, y, z, sx, sy, sz, ry]);
  }
  function obstacle(x, z, w, d) {
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }
  function surface(w, d, x, z, color, y = -0.035, texture = null) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color, map: texture, roughness: 0.94 }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  const paving = document.createElement('canvas');
  paving.width = paving.height = 256;
  const ctx = paving.getContext('2d');
  ctx.fillStyle = '#6f7779'; ctx.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 16; row++) for (let col = -1; col < 17; col++) {
    const shade = 135 + Math.floor(random() * 29);
    ctx.fillStyle = `rgb(${shade},${shade + 3},${shade + 2})`;
    ctx.fillRect(col * 16 + (row % 2) * 8 + 1, row * 16 + 1, 14, 14);
  }
  const texture = new THREE.CanvasTexture(paving);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(12, 12);
  texture.anisotropy = 4;
  surface(64, 64, 0, 0, '#b5b2a6', -0.045, texture);
  surface(6.5, 60, 0, 0, '#414b53', -0.025);
  surface(60, 6.5, 0, 0, '#414b53', -0.024);
  const plazaTexture = texture.clone();
  plazaTexture.repeat.set(3.6, 3);
  surface(14, 12, 0, 0, '#d0c4af', 0.002, plazaTexture);
  // Pale granite border around the central square, with openings onto streets.
  for (const s of [-1, 1]) {
    for (const offset of [-5.2, 5.2]) {
      part('box', '#c4c7c1', offset, 0.035, s * 6.12, 3.5, 0.07, 0.22);
      part('box', '#c4c7c1', s * 7.12, 0.035, offset * 0.85, 0.22, 0.07, 2.8);
    }
    // Zebra crossings and the tram rails leading into the square.
    for (let n = -2; n <= 2; n++) {
      part('box', '#e6dfc8', n * 1.05, -0.014, s * 8, 0.58, 0.012, 1.6);
      part('box', '#e6dfc8', s * 9, -0.014, n * 1.05, 1.6, 0.012, 0.58);
    }
    for (let n = 11; n <= 27; n += 3.5) {
      part('box', '#d4c9a3', 0, -0.014, s * n, 0.1, 0.012, 1.6);
      part('box', '#d4c9a3', s * n, -0.014, 0, 1.6, 0.012, 0.1);
    }
    for (const x of [-1.2, 1.2]) part('box', '#8b9c9e', x, -0.012, s * 17.5, 0.055, 0.014, 16);
  }
  function sign(text, x, y, z, width, color = '#254e50') {
    const c = document.createElement('canvas'); c.width = 512; c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = color; g.fillRect(0, 0, 512, 96);
    g.strokeStyle = '#dcd2ac'; g.lineWidth = 4; g.strokeRect(7, 7, 498, 82);
    g.fillStyle = '#fff0c2'; g.font = 'bold 43px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 50);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 96 / 512), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }));
    mesh.position.set(x - (activeBuilding?.x ?? 0), y, z - (activeBuilding?.z ?? 0));
    (activeBuilding?.group ?? scene).add(mesh);
    if (activeBuilding) { activeBuilding.materials.push(mesh.material); activeBuilding.meshes.push(mesh); }
    return mesh;
  }
  const colors = ['#cd9a7f', '#d5c590', '#8fa9a4', '#ceb7a4', '#b38b84', '#a6b2be'];
  let buildingIndex = 0;
  function building(x, z, w, d, h) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    activeBuilding = {
      group, x, z, batches: new Map(), materials: [], meshes: [], opacity: 1, hiddenUntil: 0,
      bounds: new THREE.Box3(),
    };
    const color = colors[buildingIndex++ % colors.length];
    obstacle(x, z, w + 0.12, d + 0.12);
    part('box', color, x, h / 2, z, w, h, d);
    part('box', '#87877e', x, 0.16, z, w + 0.08, 0.32, d + 0.08);
    part('box', '#e0d6c0', x, h - 0.14, z, w + 0.23, 0.22, d + 0.23);
    part('box', '#48565d', x, h + 0.17, z, w + 0.1, 0.35, d + 0.1);
    part('box', '#6e7370', x + w * 0.23, h + 0.6, z + d * 0.2, 0.45, 0.8, 0.5);
    const floors = Math.floor(h / 1.18);
    const columns = Math.floor(w / 1.2);
    for (const side of [-1, 1]) {
      for (let row = 0; row < floors; row++) for (let col = 0; col < columns; col++) {
        const wx = x + (col - (columns - 1) / 2) * 1.15;
        const wy = 0.85 + row * 1.15;
        part('box', '#e2d7bd', wx, wy, z + side * (d / 2 + 0.025), 0.67, 0.85, 0.07);
        part('box', random() > 0.42 ? '#edce87' : '#536f79', wx, wy, z + side * (d / 2 + 0.07), 0.49, 0.66, 0.05, 0, true);
        part('box', '#c8bfa8', wx, wy, z + side * (d / 2 + 0.11), 0.04, 0.67, 0.035);
      }
      for (let row = 0; row < floors; row++) for (let col = 0; col < Math.floor(d / 1.3); col++) {
        part('box', '#dfcda3', x + side * (w / 2 + 0.03), 0.85 + row * 1.15, z + (col - (Math.floor(d / 1.3) - 1) / 2) * 1.2, 0.07, 0.78, 0.55);
      }
    }
    const front = z + d / 2;
    part('box', '#31434a', x, 0.6, front + 0.1, 0.8, 1.2, 0.15);
    if (buildingIndex % 3 === 0) {
      part('box', '#385f5a', x, 1.3, front + 0.45, w * 0.75, 0.18, 0.9);
      sign(['CAFE', 'KIOSK', 'BAKERY'][Math.floor(buildingIndex / 3) % 3], x, 1.65, front + 0.12, w * 0.7);
    }
    buildings.push(activeBuilding);
    scene.add(group);
    activeBuilding = null;
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    building(sx * 10.2, sz * 10, 4.5, 4.7, 3.5 + random() * 1.7);
    building(sx * 16, sz * 9.7, 4.7, 4.4, 3.2 + random() * 2.5);
    building(sx * 10, sz * 16.3, 4.8, 4.5, 4 + random() * 2);
    building(sx * 16, sz * 16.3, 4.4, 4.7, 3.5 + random() * 2.5);
    building(sx * 25, sz * 10, 5.5, 5, 5 + random() * 3);
    building(sx * 10, sz * 25, 5, 5, 6 + random() * 3);
  }
  function lamp(x, z) {
    part('cylinder', '#33454b', x, 1.25, z, 0.09, 2.5, 0.09);
    part('cylinder', '#33454b', x, 0.1, z, 0.3, 0.2, 0.3);
    part('box', '#33454b', x, 2.52, z, 0.4, 0.08, 0.4);
    part('box', '#ffe5a2', x, 2.7, z, 0.24, 0.3, 0.24, 0, true);
    part('box', '#33454b', x, 2.9, z, 0.4, 0.09, 0.4);
    obstacle(x, z, 0.28, 0.28);
  }
  function planter(x, z) {
    part('box', '#727a77', x, 0.22, z, 1.3, 0.44, 1.3);
    part('box', '#433e33', x, 0.45, z, 1.15, 0.05, 1.15);
    part('cylinder', '#75513b', x, 1.1, z, 0.16, 1.4, 0.16);
    part('sphere', '#67845b', x, 2.15, z, 1.7, 2.1, 1.7);
    part('sphere', '#7d985f', x - 0.3, 2.65, z, 1.25, 1.2, 1.25);
    obstacle(x, z, 1.3, 1.3);
  }
  for (const s of [-1, 1]) {
    for (const x of [-5.7, 5.7]) lamp(x, s * 4.9);
    planter(s * 5.4, -2.7); planter(s * 5.4, 3);
    for (const z of [-14, 14]) { lamp(s * 4.2, z); planter(s * 6, z); }
    // Benches flank the square; the centre stays open for running and turning.
    part('box', '#a57c4d', s * 4.9, 0.44, 0, 0.55, 0.12, 1.6);
    part('box', '#a57c4d', s * 5.17, 0.74, 0, 0.08, 0.65, 1.6);
    for (const z of [-0.6, 0.6]) part('box', '#3b4849', s * 4.9, 0.2, z, 0.45, 0.4, 0.09);
    obstacle(s * 4.95, 0, 0.7, 1.7);
    // Parked cars along the east–west street.
    for (const x of [12, 17]) {
      const px = s * x, pz = 4.1;
      part('box', s > 0 ? '#cc8058' : '#6593a0', px, 0.46, pz, 1.8, 0.52, 0.85);
      part('box', '#384e59', px - 0.08, 0.86, pz, 0.95, 0.42, 0.7);
      for (const wheel of [-0.6, 0.6]) for (const side of [-1, 1]) part('sphere', '#30393e', px + wheel, 0.23, pz + side * 0.43, 0.4, 0.4, 0.18);
      obstacle(px, pz, 1.9, 1);
    }
  }
  const squareSign = sign('BAD BAD BOY  /  HELSINKI', 0, 0.011, -5.1, 3.5, '#4b6267');
  squareSign.rotation.x = -Math.PI / 2;
  // Physical bollards and painted edges communicate the playable boundary.
  for (let n = -20; n <= 20; n += 2) for (const s of [-1, 1]) {
    part('cylinder', '#697c7d', n, 0.28, s * 22.2, 0.13, 0.56, 0.13);
    part('cylinder', '#697c7d', s * 22.2, 0.28, n, 0.13, 0.56, 0.13);
  }
  for (const batch of batches.values()) {
    const material = new THREE.MeshStandardMaterial({ color: batch.color, roughness: 0.85, emissive: batch.glow ? batch.color : '#000000', emissiveIntensity: batch.glow ? 0.22 : 0 });
    const mesh = new THREE.InstancedMesh(geometries[batch.shape], material, batch.transforms.length);
    batch.transforms.forEach(([x, y, z, sx, sy, sz, ry], i) => {
      dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz); dummy.rotation.set(0, ry, 0); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.computeBoundingSphere(); scene.add(mesh);
  }

  // Merge each house into a few coloured meshes, so it can fade independently
  // without adding a draw call for every window or affecting other houses.
  const position = new THREE.Vector3(), vertexNormal = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  for (const house of buildings) {
    for (const glow of [false, true]) {
      const parts = [...house.batches.values()].filter(batch => batch.glow === glow);
      const vertexCount = parts.reduce((count, batch) => count + geometries[batch.shape].attributes.position.count * batch.transforms.length, 0);
      const indexCount = parts.reduce((count, batch) => count + geometries[batch.shape].index.count * batch.transforms.length, 0);
      if (!vertexCount) continue;
      const positions = new Float32Array(vertexCount * 3), normals = new Float32Array(vertexCount * 3), colors = new Float32Array(vertexCount * 3);
      const indices = new Uint32Array(indexCount);
      let vertexOffset = 0, indexOffset = 0;
      for (const batch of parts) {
        const source = geometries[batch.shape], color = new THREE.Color(batch.color);
        for (const [x, y, z, sx, sy, sz, ry] of batch.transforms) {
          dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz); dummy.rotation.set(0, ry, 0); dummy.updateMatrix();
          normalMatrix.getNormalMatrix(dummy.matrix);
          for (let i = 0; i < source.attributes.position.count; i++) {
            position.fromBufferAttribute(source.attributes.position, i).applyMatrix4(dummy.matrix);
            vertexNormal.fromBufferAttribute(source.attributes.normal, i).applyNormalMatrix(normalMatrix);
            const offset = (vertexOffset + i) * 3;
            position.toArray(positions, offset); vertexNormal.toArray(normals, offset); color.toArray(colors, offset);
          }
          for (let i = 0; i < source.index.count; i++) indices[indexOffset++] = vertexOffset + source.index.getX(i);
          vertexOffset += source.attributes.position.count;
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      geometry.computeBoundingSphere();
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, emissive: glow ? '#ebce96' : '#000000', emissiveIntensity: glow ? 0.16 : 0 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = mesh.receiveShadow = true;
      house.group.add(mesh); house.meshes.push(mesh); house.materials.push(material);
    }
    house.batches.clear();
    house.bounds.setFromObject(house.group).expandByScalar(0.06);
  }

  const sightRay = new THREE.Ray();
  const intersection = new THREE.Vector3();
  const cameraRight = new THREE.Vector3();
  const heroPosition = new THREE.Vector3();
  const sightTargets = Array.from({ length: 5 }, () => new THREE.Vector3());
  let visibilityTime = 0;
  function updateVisibility(camera, hero, height, dt) {
    visibilityTime += dt;
    camera.updateMatrixWorld();
    hero.getWorldPosition(heroPosition);
    cameraRight.setFromMatrixColumn(camera.matrixWorld, 0);
    const samples = [[0, 0.12], [0, 0.5], [0, 0.9], [-0.19, 0.6], [0.19, 0.6]];
    samples.forEach(([side, y], i) => {
      sightTargets[i].copy(heroPosition).addScaledVector(cameraRight, side * height);
      sightTargets[i].y += y * height;
    });
    for (const house of buildings) {
      const occluded = sightTargets.some(target => {
        sightRay.origin.copy(camera.position);
        sightRay.direction.copy(target).sub(camera.position).normalize();
        return sightRay.intersectBox(house.bounds, intersection) !== null && intersection.distanceToSquared(camera.position) < target.distanceToSquared(camera.position) - 0.01;
      });
      if (occluded) house.hiddenUntil = visibilityTime + 0.15;
      const target = occluded || visibilityTime < house.hiddenUntil ? 0.12 : 1;
      let opacity = THREE.MathUtils.damp(house.opacity, target, 14, dt);
      if (Math.abs(opacity - target) < 0.003) opacity = target;
      if (Math.abs(opacity - house.opacity) < 0.00001) continue;
      house.opacity = opacity;
      for (const material of house.materials) {
        const transparent = opacity < 1;
        if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true; }
        material.opacity = opacity;
        material.depthWrite = !transparent;
      }
      for (const mesh of house.meshes) mesh.castShadow = opacity > 0.98;
    }
  }

  const limit = 21.8;
  function blocked(x, z, r = 0.4) {
    return Math.abs(x) + r > limit || Math.abs(z) + r > limit || colliders.some(c => x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ);
  }
  function move(entity, dx, dz, r) {
    const x = THREE.MathUtils.clamp(entity.x + dx, -limit + r, limit - r);
    if (!blocked(x, entity.z, r)) entity.x = x;
    const z = THREE.MathUtils.clamp(entity.z + dz, -limit + r, limit - r);
    if (!blocked(entity.x, z, r)) entity.z = z;
  }
  function lineClear(x, z, tx, tz, r = 0.5) {
    const steps = Math.ceil(Math.hypot(tx - x, tz - z) / 0.25);
    for (let i = 1; i <= steps; i++) if (blocked(x + (tx - x) * i / steps, z + (tz - z) * i / steps, r)) return false;
    return true;
  }
  // A shared flood field routes all enemies around buildings and street furniture.
  const width = 44, cells = width * width;
  const distances = new Int16Array(cells);
  const open = new Uint8Array(cells);
  const queue = new Int16Array(cells);
  const cell = (x, z) => Math.max(0, Math.min(43, Math.floor(z + 22))) * width + Math.max(0, Math.min(43, Math.floor(x + 22)));
  const coords = i => ({ x: i % width - 21.5, z: Math.floor(i / width) - 21.5 });
  const neighbours = i => [i % width > 0 ? i - 1 : -1, i % width < 43 ? i + 1 : -1, i >= width ? i - width : -1, i < cells - width ? i + width : -1].filter(n => n >= 0);
  for (let i = 0; i < cells; i++) { const p = coords(i); open[i] = Number(!blocked(p.x, p.z, 0.56)); }
  let lastCell = -1;
  function routeTo(x, z) {
    let target = cell(x, z);
    if (!open[target]) {
      let best = Infinity;
      for (let i = 0; i < cells; i++) if (open[i]) { const p = coords(i), d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < best) { best = d; target = i; } }
    }
    if (target === lastCell) return;
    lastCell = target; distances.fill(-1);
    let head = 0, tail = 1; queue[0] = target; distances[target] = 0;
    while (head < tail) { const i = queue[head++]; for (const n of neighbours(i)) if (open[n] && distances[n] < 0) { distances[n] = distances[i] + 1; queue[tail++] = n; } }
  }
  function chase(x, z, tx, tz) {
    if (lineClear(x, z, tx, tz, 0.54)) return { x: tx - x, z: tz - z };
    const here = cell(x, z);
    let next = -1, best = Infinity;
    for (const i of [here, ...neighbours(here)]) if (open[i] && distances[i] >= 0) {
      const p = coords(i);
      const value = distances[i] + Math.hypot(p.x - x, p.z - z) * 0.2;
      if (value < best && lineClear(x, z, p.x, p.z, 0.5)) { best = value; next = i; }
    }
    const p = next < 0 ? { x, z } : coords(next);
    return { x: p.x - x, z: p.z - z };
  }
  function spawnPoint(player, index, count) {
    for (let tries = 0; tries < 100; tries++) {
      const angle = index / count * Math.PI * 2 + tries * 0.41;
      const distance = 7 + Math.random() * 4;
      const x = player.x + Math.cos(angle) * distance, z = player.z + Math.sin(angle) * distance;
      if (!blocked(x, z, 0.75) && distances[cell(x, z)] >= 0) return { x, z };
    }
    // The navigation field always contains a reachable cell near the player.
    for (let i = 0; i < cells; i++) if (distances[i] >= 5 && distances[i] <= 12) return coords(i);
    return { x: 0, z: 4 };
  }
  return { move, routeTo, chase, spawnPoint, lineClear, updateVisibility };
}

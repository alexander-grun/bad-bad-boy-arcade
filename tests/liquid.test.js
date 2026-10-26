import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

// Resolve the browser import map's Three.js entry to the same bundled module.
registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === 'three'
      ? new URL('../vendor/three-0.180.0/build/three.module.min.js', import.meta.url).href
      : specifier, context);
  }
});
const THREE = await import('three');
const { createLiquidStream } = await import('../liquid.js');

function setup(refraction = true) {
  const scene = new THREE.Scene();
  const hits = [];
  const stream = createLiquidStream(scene, { lineClear3D: () => true }, (_, direction) => hits.push(direction.clone()), { refraction });
  const emitter = new THREE.Object3D();
  emitter.position.set(0, 1.23, 0);
  const facing = { dx: 0, dz: 1 };
  const surface = scene.children.find(mesh => mesh.material?.isMeshPhysicalMaterial && !mesh.isInstancedMesh);
  const droplets = scene.children.find(mesh => mesh.isInstancedMesh);
  const advance = (frames, firing, enemies = []) => {
    let state;
    for (let i = 0; i < frames; i++) state = stream.update(1 / 60, firing, emitter, facing, enemies);
    return { ...state };
  };
  return { stream, surface, droplets, advance, hits };
}

test('empty liquid stays hidden without scheduling empty buffer uploads', () => {
  const { surface, droplets, advance } = setup();
  assert.equal(surface.visible, false);
  assert.equal(droplets.visible, false);
  const versions = [surface.geometry.attributes.position.version, droplets.instanceMatrix.version];
  advance(60, false);
  assert.equal(surface.visible, false);
  assert.equal(droplets.visible, false);
  assert.deepEqual([surface.geometry.attributes.position.version, droplets.instanceMatrix.version], versions);
});

test('stream and drops appear, finish falling after release, and reset for another burst', () => {
  const { stream, surface, droplets, advance } = setup();
  advance(90, true);
  assert.equal(surface.visible, true);
  assert.ok(surface.geometry.drawRange.count > 0);
  assert.equal(droplets.visible, true);
  assert.ok(droplets.count > 0);
  advance(1, false);
  assert.ok(surface.visible || droplets.visible, 'Released liquid remains in flight');
  advance(180, false);
  assert.equal(surface.visible, false);
  assert.equal(droplets.visible, false);
  advance(90, true);
  stream.clear();
  assert.equal(surface.visible, false);
  assert.equal(droplets.visible, false);
  assert.equal(droplets.count, 0);
  advance(90, true);
  assert.equal(surface.visible, true);
  assert.equal(droplets.visible, true);
});

test('disabling refraction preserves gloss, pressure, range, and collision damage', () => {
  const desktop = setup(), mobile = setup(false);
  assert.equal(desktop.surface.material.transmission, .16);
  assert.equal(mobile.surface.material.transmission, 0);
  for (const property of ['clearcoat', 'roughness', 'opacity', 'transparent']) {
    assert.equal(mobile.surface.material[property], desktop.surface.material[property]);
  }
  const enemy = () => ({ alive: true, x: 0, z: 1, hitHeight: .3, size: .43 });
  assert.deepEqual(mobile.advance(90, true, [enemy()]), desktop.advance(90, true, [enemy()]));
  assert.ok(mobile.hits.length > 0);
  assert.deepEqual(mobile.hits, desktop.hits);
});

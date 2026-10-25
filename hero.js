import * as THREE from 'three';

// The prepared GLB is 1.5 units tall: +Z is forward, X separates the legs,
// and Y is up. Its original UVs and colour material stay on the skinned mesh.
const STREAM_SOURCE = new THREE.Vector3(-0.036, 0.534, 0.155);

const LEG_JOINTS = [
  { hip: [-0.085, 0.50, 0.004], knee: [-0.119, 0.265, 0], ankle: [-0.140, 0.050, 0.016] },
  { hip: [0.095, 0.50, 0.004], knee: [0.119, 0.265, 0], ankle: [0.121, 0.050, 0.013] }
];

export function createHero(scene) {
  const original = scene.getObjectByName('BadBadBoy');
  if (!original?.isMesh) throw new Error('Prepared GLB does not contain the character mesh');
  const geometry = original.geometry;

  const root = new THREE.Bone();
  root.name = 'body';
  const bones = [root];
  const legs = LEG_JOINTS.map((joints, side) => {
    const hip = new THREE.Bone(), knee = new THREE.Bone(), ankle = new THREE.Bone();
    hip.name = `hip-${side}`;
    knee.name = `knee-${side}`;
    ankle.name = `ankle-${side}`;
    hip.position.fromArray(joints.hip);
    knee.position.fromArray(joints.knee).sub(new THREE.Vector3(...joints.hip));
    ankle.position.fromArray(joints.ankle).sub(new THREE.Vector3(...joints.knee));
    root.add(hip);
    hip.add(knee);
    knee.add(ankle);
    bones.push(hip, knee, ankle);
    return { hip, knee, ankle, phaseOffset: side * Math.PI };
  });

  const positions = geometry.getAttribute('position');
  const indices = new Uint16Array(positions.count * 4);
  const weights = new Float32Array(positions.count * 4);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), offset = i * 4;
    const firstBone = x < 0 ? 1 : 4;
    const leg = 1 - THREE.MathUtils.smoothstep(y, 0.43, 0.515);
    const shin = 1 - THREE.MathUtils.smoothstep(y, 0.22, 0.305);
    const foot = 1 - THREE.MathUtils.smoothstep(y, 0.03, 0.09);
    indices.set([0, firstBone, firstBone + 1, firstBone + 2], offset);
    weights[offset] = 1 - leg;
    weights[offset + 1] = leg * (1 - shin);
    weights[offset + 2] = leg * shin * (1 - foot);
    weights[offset + 3] = leg * shin * foot;
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));

  const mesh = new THREE.SkinnedMesh(geometry, original.material);
  mesh.add(root);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // Bent knees can extend beyond the bind-pose bounds during the run cycle.
  mesh.frustumCulled = false;

  const emitter = new THREE.Object3D();
  emitter.name = 'stream-source-under-hands';
  emitter.position.copy(STREAM_SOURCE);
  mesh.add(emitter);
  return { mesh, emitter, legs };
}

export function animateHero(rig, time, strength) {
  for (const leg of rig.legs) {
    const phase = time + leg.phaseOffset;
    const hip = -0.72 * Math.sin(phase);
    const knee = 0.08 + 1.08 * Math.max(0, Math.cos(phase - 0.15));
    // All rotations use the lateral X axis: the legs swing forward/backward
    // in the YZ plane, and the recovery leg folds at the knee.
    leg.hip.rotation.x = hip * strength;
    leg.knee.rotation.x = knee * strength;
    leg.ankle.rotation.x = (-(hip + knee) * 0.65 + 0.12 * Math.sin(phase - 0.5)) * strength;
  }
}

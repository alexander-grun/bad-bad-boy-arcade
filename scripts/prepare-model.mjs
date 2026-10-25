import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const input = process.argv[2];
if (!input) throw new Error('Usage: npm run prepare-model -- /path/to/bc222867938641be8050f747614e5d34.glb');
const output = fileURLToPath(new URL('../assets/bad-bad-boy.glb', import.meta.url));
const bytes = await fs.readFile(input);
if (bytes.readUInt32LE(0) !== 0x46546c67) throw new Error('Expected a GLB file');
const jsonLength = bytes.readUInt32LE(12);
const source = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
const binStart = 28 + jsonLength;

function accessor(id) {
  const a = source.accessors[id], view = source.bufferViews[a.bufferView];
  if (view.byteStride) throw new Error('Interleaved source attributes are not supported');
  const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const Type = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }[a.componentType];
  return { ...a, size, data: new Type(bytes.buffer, bytes.byteOffset + binStart + (view.byteOffset || 0) + (a.byteOffset || 0), a.count * size) };
}

// The figure's five chunks share local scan coordinates. Drop the separate
// Plane node, bake a canonical +Z-facing pose, and cut the scanned floor away.
const FLOOR_Z = 505;
const YAW = 1.1213316994321585 + Math.PI;
const chunks = source.meshes.filter(mesh => mesh.name.startsWith('Model_')).flatMap(mesh => mesh.primitives);
if (!chunks.length) throw new Error('No character geometry in this GLB');
const allPositions = chunks.map(p => accessor(p.attributes.POSITION));
let top = -Infinity;
for (const p of allPositions) for (let i = 2; i < p.data.length; i += 3) top = Math.max(top, p.data[i]);
const scale = 1.5 / (top - FLOOR_Z), c = Math.cos(YAW), s = Math.sin(YAW);
function rotate(x, y, z) { return [c * x - s * y, z, -s * x - c * y]; }
const positions = [], normals = [], uvs = [], triangles = [];
for (const primitive of chunks) {
  const p = accessor(primitive.attributes.POSITION), n = accessor(primitive.attributes.NORMAL);
  const uv = accessor(primitive.attributes.TEXCOORD_0), indices = accessor(primitive.indices);
  const offset = positions.length / 3;
  for (let i = 0; i < p.count; i++) {
    const point = rotate(p.data[i * 3], p.data[i * 3 + 1], p.data[i * 3 + 2] - FLOOR_Z);
    positions.push(...point.map(v => v * scale));
    normals.push(...rotate(n.data[i * 3], n.data[i * 3 + 1], n.data[i * 3 + 2]));
    uvs.push(uv.data[i * 2], uv.data[i * 2 + 1]);
  }
  for (let i = 0; i < indices.count; i += 3) {
    const face = [indices.data[i], indices.data[i + 1], indices.data[i + 2]];
    if (face.every(index => p.data[index * 3 + 2] >= FLOOR_Z)) triangles.push(...face.map(index => index + offset));
  }
}

// Weld only for connectivity. Keep the original UV-seam vertices in the asset.
const welded = new Map(), ids = [], parents = [];
function find(i) { while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; } return i; }
for (let i = 0; i < positions.length; i += 3) {
  const key = positions.slice(i, i + 3).map(v => Math.round(v * 100000)).join(',');
  if (!welded.has(key)) { welded.set(key, parents.length); parents.push(parents.length); }
  ids.push(welded.get(key));
}
for (let i = 0; i < triangles.length; i += 3) {
  const a = find(ids[triangles[i]]);
  parents[find(ids[triangles[i + 1]])] = a;
  parents[find(ids[triangles[i + 2]])] = a;
}
const sizes = new Map();
for (let i = 0; i < triangles.length; i += 3) { const root = find(ids[triangles[i]]); sizes.set(root, (sizes.get(root) || 0) + 1); }
const mainComponent = [...sizes].sort((a, b) => b[1] - a[1])[0][0];
const kept = [], remap = new Map(), pOut = [], nOut = [], uvOut = [];
for (let i = 0; i < triangles.length; i += 3) {
  if (find(ids[triangles[i]]) !== mainComponent) continue;
  for (const old of triangles.slice(i, i + 3)) {
    if (!remap.has(old)) {
      remap.set(old, pOut.length / 3);
      pOut.push(...positions.slice(old * 3, old * 3 + 3));
      nOut.push(...normals.slice(old * 3, old * 3 + 3));
      uvOut.push(...uvs.slice(old * 2, old * 2 + 2));
    }
    kept.push(remap.get(old));
  }
}

// Centre the two shins so the run rig, heading and stream use the same frame.
let clusters = [[Infinity, 0], [-Infinity, 0]];
const shins = [];
for (let i = 0; i < pOut.length; i += 3) if (pOut[i + 1] > .15 && pOut[i + 1] < .32) {
  shins.push([pOut[i], pOut[i + 2]]);
  if (pOut[i] < clusters[0][0]) clusters[0] = [pOut[i], pOut[i + 2]];
  if (pOut[i] > clusters[1][0]) clusters[1] = [pOut[i], pOut[i + 2]];
}
for (let pass = 0; pass < 20; pass++) {
  const sums = [[0, 0, 0], [0, 0, 0]];
  for (const point of shins) {
    const distance = clusters.map(v => (point[0] - v[0]) ** 2 + (point[1] - v[1]) ** 2);
    const bucket = distance[0] < distance[1] ? sums[0] : sums[1];
    bucket[0] += point[0]; bucket[1] += point[1]; bucket[2]++;
  }
  clusters = sums.map(v => [v[0] / v[2], v[1] / v[2]]);
}
const centre = [(clusters[0][0] + clusters[1][0]) / 2, (clusters[0][1] + clusters[1][1]) / 2];
for (let i = 0; i < pOut.length; i += 3) { pOut[i] -= centre[0]; pOut[i + 2] -= centre[1]; }

// This file calls its colour photograph a normal map. Repair the binding;
// retain its UVs and use a 2048px atlas instead of uploading an 8000px texture.
const originalMaterial = source.materials[chunks[0].material];
const colourTexture = originalMaterial.pbrMetallicRoughness.baseColorTexture || originalMaterial.normalTexture;
if (!colourTexture) throw new Error('No embedded colour atlas');
const image = source.images[source.textures[colourTexture.index].source], view = source.bufferViews[image.bufferView];
const png = await sharp(bytes.subarray(binStart + (view.byteOffset || 0), binStart + (view.byteOffset || 0) + view.byteLength)).resize({ width: 2048, withoutEnlargement: true }).png().toBuffer();
const material = {
  name: 'BadBadBoy_colour',
  pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: .92 }
};

const gltf = { asset: { version: '2.0', generator: 'Bad Bad Boy arcade asset preparation' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'BadBadBoy', mesh: 0 }], meshes: [], materials: [material], textures: [{ source: 0, sampler: 0 }], images: [], samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }], buffers: [], bufferViews: [], accessors: [] };
const buffers = []; let byteOffset = 0;
function addBuffer(data, target) {
  const index = gltf.bufferViews.length;
  const padded = Buffer.alloc(Math.ceil(data.length / 4) * 4); data.copy(padded);
  gltf.bufferViews.push({ buffer: 0, byteOffset, byteLength: data.length, ...(target ? { target } : {}) });
  buffers.push(padded); byteOffset += padded.length;
  return index;
}
function addAccessor(values, size, componentType, target) {
  const typed = componentType === 5125 ? new Uint32Array(values) : new Float32Array(values);
  const bufferView = addBuffer(Buffer.from(typed.buffer), target);
  const min = Array(size).fill(Infinity), max = Array(size).fill(-Infinity);
  for (let i = 0; i < typed.length; i++) { const n = i % size; min[n] = Math.min(min[n], typed[i]); max[n] = Math.max(max[n], typed[i]); }
  const index = gltf.accessors.length;
  gltf.accessors.push({ bufferView, componentType, count: values.length / size, type: { 1: 'SCALAR', 2: 'VEC2', 3: 'VEC3' }[size], min, max });
  return index;
}
const primitive = { attributes: { POSITION: addAccessor(pOut, 3, 5126, 34962), NORMAL: addAccessor(nOut, 3, 5126, 34962), TEXCOORD_0: addAccessor(uvOut, 2, 5126, 34962) }, indices: addAccessor(kept, 1, 5125, 34963), material: 0 };
gltf.meshes.push({ name: 'BadBadBoy', primitives: [primitive] });
gltf.images.push({ bufferView: addBuffer(png), mimeType: 'image/png' });
gltf.buffers.push({ byteLength: byteOffset });
const jsonBytes = Buffer.from(JSON.stringify(gltf));
const json = Buffer.alloc(Math.ceil(jsonBytes.length / 4) * 4, 0x20); jsonBytes.copy(json);
const bin = Buffer.concat(buffers), header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + bin.length, 8);
header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
binHeader.writeUInt32LE(bin.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, Buffer.concat([header, json, binHeader, bin]));
console.log({ output, vertices: pOut.length / 3, triangles: kept.length / 3, componentsRemoved: sizes.size - 1, bytes: 28 + json.length + bin.length });

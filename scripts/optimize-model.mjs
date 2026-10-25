import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

// Input is the canonical, single-mesh hero produced by prepare-model.mjs.
// Keep ordinary glTF attributes so the game needs no compression decoder.
export async function optimizeHero(bytes) {
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const binStart = 28 + jsonLength;
  const primitive = gltf.meshes[0].primitives[0];
  function read(id) {
    const accessor = gltf.accessors[id], view = gltf.bufferViews[accessor.bufferView];
    const size = { SCALAR: 1, VEC2: 2, VEC3: 3 }[accessor.type];
    const Type = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }[accessor.componentType];
    const start = binStart + (view.byteOffset || 0) + (accessor.byteOffset || 0);
    if (view.byteStride || !size || !Type) throw new Error('Unsupported canonical hero attribute');
    return new Type(bytes.buffer.slice(bytes.byteOffset + start, bytes.byteOffset + start + accessor.count * size * Type.BYTES_PER_ELEMENT));
  }
  const positions = read(primitive.attributes.POSITION);
  const normals = read(primitive.attributes.NORMAL);
  const uvs = read(primitive.attributes.TEXCOORD_0);
  const indices = new Uint32Array(read(primitive.indices));
  const vertexCount = positions.length / 3;
  const attributes = new Float32Array(vertexCount * 8);
  const smoothstep = (value, low, high) => {
    const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
    return t * t * (3 - 2 * t);
  };
  for (let i = 0; i < vertexCount; i++) {
    attributes.set(normals.subarray(i * 3, i * 3 + 3), i * 8);
    attributes.set(uvs.subarray(i * 2, i * 2 + 2), i * 8 + 3);
    // Preserve the same hip/knee/ankle transitions used by the runtime rig.
    const y = positions[i * 3 + 1];
    attributes[i * 8 + 5] = smoothstep(y, .43, .515);
    attributes[i * 8 + 6] = smoothstep(y, .22, .305);
    attributes[i * 8 + 7] = smoothstep(y, .03, .09);
  }
  await Promise.all([MeshoptSimplifier.ready, MeshoptEncoder.ready]);
  const [simplified, error] = MeshoptSimplifier.simplifyWithAttributes(
    indices, positions, 3, attributes, 8,
    [.25, .25, .25, 2, 2, .5, .5, .5], null,
    30000 * 3, .008, ['RegularizeLight']
  );
  // Optimise vertex-cache locality and remove unused vertices in every stream.
  const [remap, count] = MeshoptEncoder.reorderMesh(simplified, true, false);
  function compact(source, size) {
    const output = new Float32Array(count * size);
    for (let i = 0; i < remap.length; i++) if (remap[i] !== 0xffffffff) {
      output.set(source.subarray(i * size, i * size + size), remap[i] * size);
    }
    return output;
  }
  const imageView = gltf.bufferViews[gltf.images[0].bufferView];
  const imageStart = binStart + (imageView.byteOffset || 0);
  const jpeg = await sharp(bytes.subarray(imageStart, imageStart + imageView.byteLength))
    .resize({ width: 1024, withoutEnlargement: true }).jpeg({ quality: 85, mozjpeg: true }).toBuffer();

  gltf.asset.generator = 'Bad Bad Boy arcade: meshoptimizer + Sharp';
  gltf.bufferViews = []; gltf.accessors = [];
  const chunks = []; let byteOffset = 0;
  function addBuffer(data, target) {
    const index = gltf.bufferViews.length;
    const padded = Buffer.alloc(Math.ceil(data.length / 4) * 4); data.copy(padded);
    gltf.bufferViews.push({ buffer: 0, byteOffset, byteLength: data.length, ...(target ? { target } : {}) });
    chunks.push(padded); byteOffset += padded.length;
    return index;
  }
  function addAccessor(typed, size, componentType, target) {
    const bufferView = addBuffer(Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength), target);
    const min = Array(size).fill(Infinity), max = Array(size).fill(-Infinity);
    for (let i = 0; i < typed.length; i++) {
      const axis = i % size;
      min[axis] = Math.min(min[axis], typed[i]); max[axis] = Math.max(max[axis], typed[i]);
    }
    const index = gltf.accessors.length;
    gltf.accessors.push({ bufferView, componentType, count: typed.length / size, type: { 1: 'SCALAR', 2: 'VEC2', 3: 'VEC3' }[size], min, max });
    return index;
  }
  primitive.attributes = {
    POSITION: addAccessor(compact(positions, 3), 3, 5126, 34962),
    NORMAL: addAccessor(compact(normals, 3), 3, 5126, 34962),
    TEXCOORD_0: addAccessor(compact(uvs, 2), 2, 5126, 34962)
  };
  primitive.indices = addAccessor(count < 65536 ? new Uint16Array(simplified) : simplified, 1, count < 65536 ? 5123 : 5125, 34963);
  gltf.images = [{ bufferView: addBuffer(jpeg), mimeType: 'image/jpeg' }];
  gltf.buffers = [{ byteLength: byteOffset }];
  const jsonBytes = Buffer.from(JSON.stringify(gltf));
  const json = Buffer.alloc(Math.ceil(jsonBytes.length / 4) * 4, 0x20); jsonBytes.copy(json);
  const bin = Buffer.concat(chunks), header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + bin.length, 8);
  header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  binHeader.writeUInt32LE(bin.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
  return {
    bytes: Buffer.concat([header, json, binHeader, bin]),
    stats: { verticesBefore: vertexCount, vertices: count, trianglesBefore: indices.length / 3, triangles: simplified.length / 3, relativeError: error, textureBytes: jpeg.length }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , input, output] = process.argv;
  if (!input || !output || input === output) throw new Error('Usage: node scripts/optimize-model.mjs input.glb output.glb (different paths)');
  const source = await fs.readFile(input);
  const result = await optimizeHero(source);
  await fs.writeFile(output, result.bytes);
  console.log({ ...result.stats, bytesBefore: source.length, bytes: result.bytes.length, output });
}

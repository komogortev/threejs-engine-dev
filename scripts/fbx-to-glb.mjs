/**
 * fbx-to-glb.mjs — Headless Mixamo FBX → GLB converter + rig inspector.
 *
 * Converts a Mixamo character FBX to a binary GLB using three's FBXLoader +
 * GLTFExporter (no WebGL / no Blender / no FBX2glTF needed), and prints a
 * full inspection report: mesh/triangle counts, animation clips, and the
 * SkinnedMesh skeleton bone list so the rig can be validated against the
 * platform's canonical Mixamo humanoid contract.
 *
 * Scale: Mixamo authors characters in CENTIMETRES (~180 units tall). The
 * platform works in metres, so the root node is scaled ×0.01 by default
 * (uniform scale is safe for skinned meshes — bind matrices stay consistent)
 * so the exported GLB is ~1.8 m. Override with `--scale=<n>` (`--scale=1`
 * keeps native units).
 *
 * Minification is a separate @gltf-transform pass (skin-safe recipe — Draco,
 * NOT meshopt, whose KHR_mesh_quantization renormalizes POSITION and breaks
 * GPU skinning). After conversion, minify with:
 *
 *   GT="npx @gltf-transform/cli@4"
 *   $GT weld     "<raw>.glb" tmp.weld.glb
 *   $GT simplify tmp.weld.glb tmp.simp.glb --ratio 0.5 --error 0.005
 *   $GT draco    tmp.simp.glb "<final>.glb"
 *
 * Proven on Mixamo "X Bot" (2026-07-16): 49,112→24,556 tris, 8.37 MB→197 KB,
 * ~181 units → 1.81 m, 65-bone mixamorig hierarchy preserved.
 *
 * Usage:
 *   node scripts/fbx-to-glb.mjs "<input.fbx>" "[output.glb]" [--scale=0.01]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

// GLTFExporter's binary path uses browser globals not present in Node.
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer()
        .then((ab) => { this.result = ab; this.onloadend?.(); })
        .catch((err) => { this.error = err; this.onerror?.(err); });
    }
  };
}
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// --- args -------------------------------------------------------------------
const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = Object.fromEntries(
  process.argv.slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v ?? true];
    }),
);

const input = positional[0];
if (!input) {
  console.error('Usage: node scripts/fbx-to-glb.mjs "<input.fbx>" "[output.glb]" [--scale=0.01]');
  process.exit(1);
}
const output =
  positional[1] ?? join(dirname(input), basename(input).replace(/\.fbx$/i, '.glb'));
const scale = flags.scale != null ? Number(flags.scale) : 0.01; // Mixamo cm→m

// --- load FBX (binary) -------------------------------------------------------
const buf = readFileSync(input);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const loader = new FBXLoader();
const group = loader.parse(ab, dirname(input) + '/');

const heightOf = (obj) =>
  new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3()).y;
const nativeHeight = heightOf(group);

// --- inspect ----------------------------------------------------------------
let triangles = 0;
let meshes = 0;
const skinnedMeshes = [];
group.traverse((o) => {
  if (o.isMesh) {
    meshes++;
    const g = o.geometry;
    const idx = g.index ? g.index.count : g.attributes.position.count;
    triangles += idx / 3;
    if (o.isSkinnedMesh) skinnedMeshes.push(o);
  }
});

console.log('\n=== FBX INSPECTION ===');
console.log('input          :', input);
console.log('meshes         :', meshes, '(skinned:', skinnedMeshes.length + ')');
console.log('triangles      :', triangles.toLocaleString());
console.log('native height  :', nativeHeight.toFixed(2), 'units');
console.log('animations     :', group.animations.length,
  group.animations.map((a) => `${a.name}(${a.duration.toFixed(2)}s)`).join(', '));

for (const sm of skinnedMeshes) {
  const bones = sm.skeleton.bones;
  const hasSkinWeight = !!sm.geometry.attributes.skinWeight;
  const hasSkinIndex = !!sm.geometry.attributes.skinIndex;
  console.log(`\n--- SkinnedMesh "${sm.name}" ---`);
  console.log('bones          :', bones.length);
  console.log('skinWeight attr :', hasSkinWeight, '| skinIndex attr:', hasSkinIndex);
  console.log('bone names     :');
  bones.forEach((b, i) => console.log(`  [${String(i).padStart(2)}] ${b.name}`));
}

// --- normalize scale (Mixamo cm → platform m) -------------------------------
if (scale !== 1) {
  group.scale.setScalar(scale);
  group.updateMatrixWorld(true);
  console.log('\n=== SCALE ===');
  console.log('scale factor   :', scale);
  console.log('fitted height  :', heightOf(group).toFixed(3), 'm');
}

// --- export GLB -------------------------------------------------------------
const exporter = new GLTFExporter();
const glb = await new Promise((resolve, reject) => {
  exporter.parse(
    group,
    (result) => resolve(result),
    (err) => reject(err),
    { binary: true, animations: group.animations },
  );
});

const outBuf = Buffer.from(glb);
writeFileSync(output, outBuf);
console.log('\n=== EXPORT ===');
console.log('output         :', output);
console.log('size           :', (outBuf.byteLength / 1024).toFixed(1), 'KB');
console.log('done.');

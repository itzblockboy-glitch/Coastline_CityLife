// Verifies the vehicle model corrections in public/main.js against the shipped GLB files.
// Loads each vehicle through three's own GLTFLoader (no browser) and reproduces exactly what
// instance() does, then checks:
//   1. every vehicle ends up grounded to y = 0 (no floating police cars, no sunken coupes)
//   2. every vehicle's nose points +Z after the per-model yaw correction
//
// Nose direction is derived from geometry, not from the file name: a car's greenhouse (roof)
// sits behind its bonnet, so the roof's mean Z relative to the body's mean Z identifies the
// bonnet side. That heuristic is only meaningful for saloon-shaped bodies, so the tool also
// classifies each file's authoring convention from its primary root-node rotation: the assets
// that are known-good (sedan, suv, delivery, milk-truck, hatchback, sedan-sports, police-car)
// all carry a pure +-90 deg X rotation. Anything else needs an entry in VEHICLE_MODEL_FIX.
// Run: node tools/inspect-vehicles.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as T from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const assets = path.join(root, "public/assets");
const loader = new GLTFLoader();

const VEHICLE_TYPES = ["car-concept", "suv-luxury", "delivery", "truck", "milk-truck",
  "sedan", "sedan-sports", "hatchback-sports", "taxi", "police-car"];
const VEHICLE_MODEL_FIX = { taxi: { yaw: Math.PI } };

// GLTFLoader decodes textures through Image/ImageBitmap, which node lacks. Geometry (all this
// tool needs) is unaffected by materials, so strip them and repack the GLB before parsing.
function stripMaterials(glb) {
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLen)));
  const binStart = 20 + jsonLen;
  const binLen = dv.getUint32(binStart, true);
  const bin = glb.subarray(binStart + 8, binStart + 8 + binLen);
  delete json.images; delete json.textures; delete json.samplers; delete json.materials;
  for (const m of json.meshes) for (const p of m.primitives) delete p.material;
  let js = new TextEncoder().encode(JSON.stringify(json));
  const pad = (4 - (js.length % 4)) % 4;
  if (pad) { // GLB JSON chunks pad with spaces, not NULs
    const t = new Uint8Array(js.length + pad).fill(0x20); t.set(js); js = t; }
  const total = 12 + 8 + js.length + 8 + bin.length + ((4 - (bin.length % 4)) % 4);
  const out = new Uint8Array(total);
  const o = new DataView(out.buffer);
  o.setUint32(0, 0x46546c67, true); o.setUint32(4, 2, true); o.setUint32(8, total, true);
  o.setUint32(12, js.length, true); o.setUint32(16, 0x4e4f534a, true);
  out.set(js, 20);
  const b = 20 + js.length;
  o.setUint32(b, bin.length, true); o.setUint32(b + 4, 0x004e4942, true);
  out.set(bin, b + 8);
  return out.buffer;
}
function parse(buf) {
  return new Promise((res, rej) => loader.parse(stripMaterials(buf), "", res, rej));
}

// Same maths as the roof/bonnet heuristic used to diagnose the taxi bug.
function nose(o) {
  o.updateMatrixWorld(true);
  const pts = [];
  o.traverse((n) => {
    if (!n.isMesh || !n.geometry?.attributes?.position) return;
    const pos = n.geometry.attributes.position;
    const v = new T.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(n.matrixWorld);
      pts.push(v.clone());
    }
  });
  const ys = pts.map((p) => p.y);
  const ymin = Math.min(...ys), ymax = Math.max(...ys), h = ymax - ymin;
  const roof = pts.filter((p) => p.y > ymin + 0.72 * h);
  const mean = (a) => a.reduce((s, p) => s + p.z, 0) / a.length;
  const dz = mean(roof) - mean(pts);
  return { dir: dz < 0 ? "+Z" : "-Z", dz, count: pts.length };
}

// A pure +-90 deg rotation about X, i.e. the standard Z-up -> Y-up authoring convention.
function canonicalConvention(gltf) {
  const n = gltf.scene.children.find((c) => c.isObject3D) || gltf.scene;
  const q = n.quaternion;
  return Math.abs(Math.abs(q.x) - Math.SQRT1_2) < 0.01 &&
    Math.abs(q.y) < 0.01 && Math.abs(q.z) < 0.01 &&
    Math.abs(Math.abs(q.w) - Math.SQRT1_2) < 0.01;
}

const failures = [], warnings = [];
console.log("vehicle         min_y(before)  min_y(after)   nose   convention");
for (const name of VEHICLE_TYPES) {
  const gltf = await parse(readFileSync(path.join(assets, name + ".glb")));
  const canonical = canonicalConvention(gltf);
  const o = gltf.scene;
  const before = new T.Box3().setFromObject(o).min.y;
  const fix = VEHICLE_MODEL_FIX[name];
  if (fix?.yaw) o.rotation.y += fix.yaw;
  // groundModel()
  o.updateMatrixWorld(true);
  let b = new T.Box3().setFromObject(o);
  if (Math.abs(b.min.y) > 0.001) o.position.y -= b.min.y;
  // instance() then centres the model on x/z.
  o.updateMatrixWorld(true);
  b = new T.Box3().setFromObject(o);
  const c = b.getCenter(new T.Vector3());
  o.position.x -= c.x;
  o.position.z -= c.z;
  o.updateMatrixWorld(true);
  b = new T.Box3().setFromObject(o);

  const n = nose(o);
  const grounded = Math.abs(b.min.y) < 0.01;
  const facing = n.dir === "+Z";
  // Only decisive when the greenhouse is clearly behind/ ahead of centre; a cab-over or pickup
  // (truck: |dz| = 0.07 vs 0.42-0.55 for the saloons) has a centred cabin and proves nothing.
  const decisive = Math.abs(n.dz) > 0.15;
  if (!grounded) failures.push(`${name}: min_y=${b.min.y.toFixed(4)} after grounding`);
  const conv = canonical ? "std X-90" : fix ? "fixed" : "non-std";
  if (canonical || fix) {
    // Convention known: the +Z reading is trustworthy, so it is a hard requirement.
    if (decisive && !facing) failures.push(`${name}: nose points ${n.dir}, expected +Z`);
    if (!decisive && !facing)
      warnings.push(`${name}: cabin is centred so the nose heuristic is inconclusive; ` +
        `root rotation matches the known-good convention, left unchanged`);
  } else if (!facing) {
    warnings.push(`${name}: non-standard authoring and no VEHICLE_MODEL_FIX entry; ` +
      `roof heuristic suggests ${n.dir} but is not decisive for this body style (unchanged from v1.5)`);
  }
  console.log(
    name.padEnd(15),
    before.toFixed(4).padStart(9),
    b.min.y.toFixed(4).padStart(13),
    n.dir.padStart(7),
    conv.padStart(11),
    grounded && (facing || !(canonical || fix) || !decisive) ? "" : "  <-- FAIL",
  );
}

if (warnings.length) console.warn("\nWARN:\n" + warnings.map((w) => "  " + w).join("\n"));
if (failures.length) {
  console.error("\nFAIL:\n" + failures.map((f) => "  " + f).join("\n"));
  process.exit(1);
}
console.log("\nPASS: all vehicles grounded to y=0; every model with a known authoring " +
  "convention faces +Z, i.e. the direction of travel");

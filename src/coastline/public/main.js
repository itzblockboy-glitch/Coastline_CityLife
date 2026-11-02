import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { createSFX } from "./sfx.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { io } from "socket.io-client";
import { createMusic } from "./music.js";
import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as skeletonClone } from "three/addons/utils/SkeletonUtils.js";
const $ = (id) => document.getElementById(id),
  canvas = $("game");
const sfx = createSFX();
document.addEventListener("pointerdown", () => sfx.unlock(), {once:true});
let cameraMode = "third", civilianShots = 0;
const npcClipSets = {};
const mobile =
  matchMedia("(pointer:coarse)").matches ||
  location.hostname === "appassets.androidplatform.net";
const renderer = new T.WebGLRenderer({
  canvas,
  antialias: !mobile,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.15 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFShadowMap;
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.88;
const scene = new T.Scene();
scene.background = new T.Color("#adb9c2");
scene.fog = new T.Fog("#adb9c2", 155, 460);
const camera = new T.PerspectiveCamera(56, innerWidth / innerHeight, 0.2, 1300);
const ambient = new T.HemisphereLight(0xdce9fc, 0x78664f, 1.0);
scene.add(ambient);
const sun = new T.DirectionalLight(0xffecd5, 2.3);
sun.position.set(-80, 140, 50);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, {
  left: -45,
  right: 45,
  top: 45,
  bottom: -45,
  near: 1,
  far: 360,
});
sun.shadow.bias = -0.001;
sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);
const staticProps = [],
  staticBatches = [];
const staticBoxes = [],
  unitBox = new T.BoxGeometry(1, 1, 1);
const mats = {};
function mat(c) {
  return (mats[c] ??= new T.MeshStandardMaterial({
    color: c,
    roughness: 0.86,
  }));
}
function box(x, y, z, w, h, d, c, cast = false) {
  let m = new T.Mesh(unitBox, mat(c));
  m.scale.set(w, h, d);
  if (cast) m.userData.cast = true;
  staticBoxes.push(m);
  m.position.set(x, y + h / 2, z);
  m.receiveShadow = true;
  scene.add(m);
  return m;
}
// A box that also blocks movement and camera. Used sparingly: every entry is walked by blocked().
function solid(x, y, z, w, h, d, c, cast = true) {
  box(x, y, z, w, h, d, c, cast);
  obstacles.push(new T.Box3(
    new T.Vector3(x - w / 2, 0, z - d / 2),
    new T.Vector3(x + w / 2, h, z + d / 2),
  ));
}
// Terrain and road surfaces are generated; all placed buildings, vehicles and characters are downloaded GLBs.
box(90, -1, 0, 400, 1, 760, "#b9b99e");
box(-105, -0.4, 0, 45, 0.4, 690, "#e5d2a1");
box(-75, 0, 0, 12, 0.17, 660, "#d9cfb7");
const roadsX = [-57, 5, 67, 129, 191, 253],
  roadsZ = [-310, -248, -186, -124, -62, 0, 62, 124, 186, 248, 310];
const WORLD = { xMin: -120, xMax: 305, zMin: -375, zMax: 375 };
// Which city blocks become industrial land, keyed "xi:zi" against the road grid.
const DISTRICTS = new Map([
  ["4:2", "factories"], ["4:6", "factories"],
  ["1:9", "construction"], ["4:8", "construction"],
]);
for (const x of roadsX) {
  box(x, 0.01, 0, 17, 0.04, 740, "#4f5f62");
  for (let z = -370; z < 372; z += 13)
    box(x, 0.065, z, 0.16, 0.015, 5, "#e3d9ac");
  for (let a of [-1, 1]) box(x + a * 8, 0.06, 0, 0.13, 0.02, 740, "#c3cdc2");
}
for (const z of roadsZ) {
  box(100, 0.025, z, 420, 0.04, 15, "#4f5f62");
  for (let x = -95; x < 304; x += 13)
    box(x, 0.08, z, 5, 0.015, 0.15, "#e3d9ac");
  for (let x of roadsX)
    for (let dir of [-1, 1])
      for (let j = -5; j < 6; j += 2)
        box(x + j, 0.09, z + dir * 10, 1, 0.015, 3, "#dadccc");
}
// Wave shader: all water animation is local and requires no downloads.
const water = new T.Mesh(
  new T.PlaneGeometry(950, 1800, 1, 1),
  new T.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      deep: { value: new T.Color("#197c9c") },
      shallow: { value: new T.Color("#51c4c4") },
    },
    vertexShader: `varying vec3 v;void main(){v=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float time;uniform vec3 deep;uniform vec3 shallow;varying vec3 v;void main(){float n=sin(v.x*.15+v.y*.12+time*.8)*sin(v.y*.3-time*.65);float n2=sin(v.x*.8+v.y*.15-time)*.5+.5;float f=smoothstep(-475.,-370.,v.x);vec3 c=mix(shallow,deep,f*.6+.2);c+=n*.028+pow(n2,25.)*.10;gl_FragColor=vec4(c,1.);}`,
  }),
);
water.rotation.x = -Math.PI / 2;
water.position.set(-600, -0.16, 0);
scene.add(water);
for (let i = 0; i < 3; i++) {
  let foam = box(
    -125 - i * 3,
    -0.1 + i * 0.012,
    0,
    0.25,
    0.025,
    690,
    "#b0e0d8",
  );
  foam.material = new T.MeshBasicMaterial({
    color: "#d2ece0",
    transparent: true,
    opacity: 0.25,
  });
}
const manager = new T.LoadingManager();
manager.onProgress = (u, n, total) => {
  $("loadprogress").style.width = `${(n / total) * 100}%`;
  $("loadtext").textContent = `Building Santa Palma · ${n} / ${total}`;
};
const loader = new GLTFLoader(manager);
loader.setMeshoptDecoder(MeshoptDecoder);
const assets = {};
const names = [
  "car-concept",
  "motorcycle",
  "suv-luxury",
  "delivery",
  "truck",
  "milk-truck",
  "blaster-d",
  "blaster-g",
  "real-palm",
  "real-human",
  "npc-male_adult_01", "npc-male_adult_10", "npc-male_adult_16", "npc-female_adult_07", "npc-police", "police-car",
  "real-city",
  "street-lamp",
  "sedan",
  "sedan-sports",
  "hatchback-sports",
  "taxi",
];
let seed = 413;
function rand() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
function normalize(obj, height) {
  const b = new T.Box3().setFromObject(obj),
    s = new T.Vector3();
  b.getSize(s);
  obj.scale.multiplyScalar(height / s.y);
  const q = new T.Box3().setFromObject(obj);
  obj.position.y -= q.min.y;
  return obj;
}
const VEHICLE_TYPES = ["car-concept", "suv-luxury", "delivery", "truck", "milk-truck",
  "sedan", "sedan-sports", "hatchback-sports", "taxi", "police-car"];
// Per-model corrections measured from the shipped GLBs (tools/inspect-vehicles.mjs).
// The taxi is authored facing -Z: its cabin sits forward of centre and its root nodes carry a
// 180° Y rotation the other cars do not have, so it reversed and steered the wrong way.
const VEHICLE_MODEL_FIX = { taxi: { yaw: Math.PI } };
// Facade variety: the generator reuses three building models, so every block looked identical.
// Tinting multiplies the existing texture; clones are cached per material+tint, which keeps the
// instancing groups bounded (materials still batch) instead of exploding per building.
const TINTS = [0xffffff, 0xe6d8c4, 0xd2c2ae, 0xc3cdd2, 0xb9c2ac, 0xd8c9bb];
const tintCache = new Map();
function tintBuilding(root, hex) {
  if (hex === 0xffffff) return root;
  root.traverse((n) => {
    if (!n.isMesh || Array.isArray(n.material)) return;
    const key = n.material.uuid + "|" + hex;
    let m = tintCache.get(key);
    if (!m) {
      m = n.material.clone();
      m.color = n.material.color.clone().multiply(new T.Color(hex));
      tintCache.set(key, m);
    }
    n.material = m;
  });
  return root;
}
function groundModel(o) {
  o.updateMatrixWorld(true);
  const b = new T.Box3().setFromObject(o);
  if (Math.abs(b.min.y) > 0.001) o.position.y -= b.min.y;
}
function instance(name, x, z, height, rot = 0) {
  let o = assets[name].scene.clone();
  const fix = VEHICLE_MODEL_FIX[name];
  if (name === "motorcycle") o.rotation.y = -Math.PI / 2;
  if (VEHICLE_TYPES.includes(name)) {
    // Vehicle GLBs are pre-normalized to real-world meter dimensions, but their pivots are not
    // at ground level (police-car floats 0.80 m, car-concept sinks 0.15 m), so ground every one.
    if (fix?.yaw) o.rotation.y += fix.yaw;
    groundModel(o);
  } else if (name === "motorcycle") {
    const b = new T.Box3().setFromObject(o), size = b.getSize(new T.Vector3());
    o.scale.multiplyScalar(2.22 / Math.max(size.x, size.z));
    o.position.y -= new T.Box3().setFromObject(o).min.y;
  } else normalize(o, height);
  let bound = new T.Box3().setFromObject(o),
    center = bound.getCenter(new T.Vector3());
  o.position.x -= center.x;
  o.position.z -= center.z;
  let root = new T.Group();
  root.add(o);
  if (name.startsWith("building-real-") && !name.endsWith("-low")) {
    o.traverse(n => { if (n.isMesh) n.userData.cityLevel = "near"; });
    const low = assets[name + "-low"].scene.clone();
    normalize(low, height);
    const lowCenter = new T.Box3().setFromObject(low).getCenter(new T.Vector3());
    low.position.x -= lowCenter.x; low.position.z -= lowCenter.z;
    low.traverse(n => { if (n.isMesh) n.userData.cityLevel = "far"; });
    root.add(low);
  }
  root.position.set(x, 0.12, z);
  root.rotation.y = rot;
  root.traverse((n) => {
    if (n.isMesh) {
      n.castShadow =
        name === "car-concept"
          ? n.geometry.attributes.position.count > 1000
          : true;
      n.receiveShadow = true;
    }
  });
  scene.add(root);
  if (/^(building-|tree-|palm)/.test(name)) staticProps.push(root);
  return root;
}
const obstacles = [],
  buildings = [],
  cars = [],
  mixers = [],
  npcs = [];
const treeColliders = [],
  cops = [];
let transition = null,
  jumpTime = 0,
  shotAnimTime = 0,
  wanted = 0,
  crimeHeat = 0,
  lastCrime = -100,
  health = 100,
  invulnerable = 0,
  policeShots = 0,
  mapHeading = Math.PI;
let actorClips = [];
let player,
  playerModel,
  mixer,
  actions = {},
  activeAction = "",
  driving = null;
const pos = new T.Vector3(-57, 0, 76);
let heading = Math.PI,
  speed = 0,
  vy = 0,
  yaw = -0.18,
  pitch = 0.05,
  zoom = 7,
  orbitUntil = 0,
  checkpoint = 0,
  started = false,
  punchTime = 0,
  elapsed = 0,
  cycle = 0;
const keys = {};
const checkpoints = [
  new T.Vector3(-57, 0, -115),
  new T.Vector3(129, 0, -186),
  new T.Vector3(-57, 0, 186),
];
let ring;
let toastTimer;
let weaponIndex = 0,
  fireTimer = 0,
  reloadTimer = 0;
const weapons = [],
  tracers = [],
  ammo = [0, 12, 24],
  maxAmmo = [0, 12, 24];
let skyHDR;
try {
  await Promise.all(
    names.map(async (n) => {
      assets[n] = await loader.loadAsync("/assets/" + n + ".glb");
    }),
  );
  skyHDR = await new HDRLoader(manager).loadAsync("/assets/coast-sky.hdr");
  skyHDR.mapping = T.EquirectangularReflectionMapping;
  scene.environment = skyHDR;
  scene.background = skyHDR;
  scene.environmentIntensity = 0.65;
  scene.backgroundIntensity = 0.85;
  assets.palm = assets["real-palm"];
  for (const c of "abcdef") {
    for (const suffix of ["", "-low"]) {
      const model = assets["real-city"].scene.getObjectByName("city-" + c + suffix);
      assets["building-real-" + c + suffix] = { scene: model };
    }
  }
  await prepareMaterials();
  // Grazing-angle texture quality without extra draw cost; matters more once renderScale drops.
  const aniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  scene.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material)) return;
    for (const m of [o.material]) {
      for (const k of ["map", "normalMap", "roughnessMap"]) {
        if (m[k] && m[k].anisotropy !== aniso) { m[k].anisotropy = aniso; m[k].needsUpdate = true; }
      }
    }
  });
  for (let xi = 0; xi < roadsX.length - 1; xi++)
    for (let zi = 0; zi < roadsZ.length - 1; zi++) {
      let cx = (roadsX[xi] + roadsX[xi + 1]) / 2,
        cz = (roadsZ[zi] + roadsZ[zi + 1]) / 2;
      box(cx, 0.02, cz, 44, 0.22, 44, "#d4cfbc");
      // Outer blocks carry the industrial districts instead of residential towers.
      const district = DISTRICTS.get(xi + ":" + zi);
      if (district === "factories") { buildFactory(cx, cz); continue; }
      if (district === "construction") { buildConstructionSite(cx, cz); continue; }
      for (let a of [-1, 1])
        for (let b of [-1, 1]) {
          const downtown = zi < 4 && xi > 0;
          const letter = downtown ? "bcd"[(xi + zi + (a > 0 ? 1 : 0)) % 3] : "aef"[(xi + zi + (b > 0 ? 1 : 0)) % 3];
          const heights = { a: 9.9, b: 12.9, c: 18.9, d: 24.9, e: 6.9, f: 9.9 };
          const h = heights[letter], x = cx + a * 10, z = cz + b * 10;
          const o = instance("building-real-" + letter, x, z, h, (Math.floor(rand() * 4) * Math.PI) / 2);
          tintBuilding(o, TINTS[Math.floor(rand() * TINTS.length)]);
          // Keep footprints inside city blocks even for the taller skyline variants.
          const bb = new T.Box3().setFromObject(o),
            sz = bb.getSize(new T.Vector3());
          o.scale.x = Math.min(1, 17 / sz.x);
          o.scale.z = Math.min(1, 17 / sz.z);
          o.updateMatrixWorld(true);
          const bound = new T.Box3().setFromObject(o);
          obstacles.push(bound);
          buildings.push(o);
        }
    }
  for (let z = -360; z < 370; z += 19) {
    plantTree("palm", -72, z, 8 + rand() * 2, rand() * 6.28);
    plantTree("palm", -43, z, 6.5);
  }
  for (let i = 0; i < 95; i++) {
    const x = roadsX[1 + Math.floor(rand() * (roadsX.length - 2))] + (rand() > 0.5 ? 11 : -11),
      z = -350 + rand() * 700;
    plantTree("palm", x, z, 6 + rand() * 2);
  }
  const carPlaces = [
    [-61, 72, "car-concept"],
    [-51, 86, "motorcycle"],
    [-51, 102, "motorcycle"],
    [-62, -25, "suv-luxury"],
    [0.5, 30, "delivery"],
    [72, 135, "truck"],
    [134, -100, "milk-truck"],
    [-52, -165, "hatchback-sports"],
    [190, 200, "taxi"],
    [9, 82, "car-concept"],
    [-61, 128, "sedan-sports"],
  ];
  for (let i = 0; i < carPlaces.length; i++) {
    let [x, z, n] = carPlaces[i];
    let h =
      n === "motorcycle"
        ? 1.18
        : n === "car-concept"
          ? 1.25
          : n === "milk-truck"
            ? 2.7
            : n === "delivery"
              ? 2.2
              : n === "truck"
                ? 2
                : 1.6;
    let o = instance(n, x, z, h, i % 2 ? 0 : Math.PI);
    if (n === "car-concept" && i > 0) tintCar(o, 0x294b5b);
    cars.push({
      obj: o,
      id: i,
      speed: 0,
      angle: o.rotation.y,
      type: n,
      bike: n === "motorcycle",
      traffic: false,
      max: n === "motorcycle" ? 36 : n === "car-concept" ? 48 : 30,
    });
  }
  for (let i = 0; i < 10; i++) {
    let x = roadsX[i % 5] + 3,
      z = -250 + i * 53,
      n = ["sedan", "taxi", "suv-luxury", "delivery"][i % 4];
    let o = instance(n, x, z, n === "delivery" ? 2.1 : 1.5);
    cars.push({
      obj: o,
      id: cars.length,
      speed: 6 + (i % 3),
      angle: 0,
      type: n,
      bike: false,
      traffic: true,
      max: 30,
    });
  }
  player = new T.Group();
  playerModel = makeActor(1.85);
  playerModel.traverse((n) => {
    if (n.isMesh) {
      n.castShadow = true;
      n.receiveShadow = true;
    }
  });
  player.add(playerModel);
  scene.add(player);
  player.position.copy(pos);
  mixer = new T.AnimationMixer(playerModel.userData.rig);
  mixers.push(mixer);
  actorClips = buildHumanClips();
  for (const name of ["npc-male_adult_01", "npc-male_adult_10", "npc-male_adult_16", "npc-female_adult_07", "npc-police"]) npcClipSets[name] = buildHumanClips(name);
  const clips = actorClips;
  for (const c of clips) actions[c.name.toLowerCase()] = mixer.clipAction(c);
  const recoil = clips.find((c) => c.name === "Gun_Shoot");
  if (recoil) {
    const upper = recoil.clone();
    upper.name = "UpperBodyFire";
    upper.tracks = upper.tracks.filter((t) =>
      /Chest|Shoulder|Arm|Wrist|Index|Middle|Ring|Pinky|Thumb/.test(t.name),
    );
    actions.upperfire = mixer.clipAction(upper);
  }
  initWeapons();
  for (let i = 0; i < 24; i++) spawnCitizen(i);
  initPolice();
  initPoliceCars();
  for (const c of cars) {
    c.max = ({"car-concept":48,"motorcycle":43,"suv-luxury":36,"delivery":28,"truck":31,"milk-truck":26,"sedan":39,"sedan-sports":44,"hatchback-sports":37,"taxi":35,"police-car":46}[c.type] || 32) + c.id * .31;
    if (c.bike) c.max = c.id === 1 ? 38 : 51;
    c.accel = (c.bike ? 22 : 12) + (c.id % 7) * 1.1;
    c.soundId = sfx.signature(c.id,c.type).id;
  }
  for (const c of cars) measureVehicle(c);
  ring = new T.Mesh(
    new T.TorusGeometry(5, 0.11, 6, 48),
    new T.MeshBasicMaterial({
      color: 0xd9fc79,
      transparent: true,
      opacity: 0.85,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.copy(checkpoints[0]);
  ring.position.y = 0.3;
  scene.add(ring);
  ring.visible = false;
  for (let z = -340; z < 350; z += 62) {
    for (const x of [-68.5, 16.5, 140.5, 202.5, 264.5]) {
      if (blocked(new T.Vector3(x, 0, z), .3)) continue;
      const light = instance("street-lamp", x, z, 6.5, Math.PI / 2);
      staticProps.push(light);
      treeColliders.push({ x, z, r: .22, prop: "lamp" });
    }
  }
  decorateCity();
  batchRoads();
  batchCity();
  if (mobile) {
    // Battery game mode (or an explicit low-power choice) wins; otherwise High stays the default.
    $("quality").value = gameModeHint() || "high";
    $("framerate").value = "30";
    $("locationhint").textContent = "DRAG RIGHT TO LOOK · LEFT STICK TO MOVE";
  }
  started = true;
  $("loading").style.display = "none";
  $("statuspill").textContent = "Santa Palma";
} catch (e) {
  console.error(e);
  $("loadtext").textContent = "Unable to load city assets. Please reload.";
}
// --- Construction sites and factories ------------------------------------------------------
// Built from instanced primitives (one draw call per colour after batchRoads), so the extra
// districts cost geometry, not state changes.
function buildConstructionSite(cx, cz) {
  box(cx, 0.03, cz, 42, 0.06, 42, "#8d7a5f"); // levelled dirt
  // hoarding: low enough to see over, no collider so you can walk onto the site
  for (let a of [-1, 1]) {
    box(cx + a * 20, 0.02, cz, 0.4, 1.5, 42, "#c9a227", true);
    box(cx, 0.02, cz + a * 20, 42, 1.5, 0.4, "#c9a227", true);
  }
  // half-finished concrete frame with exposed rebar
  solid(cx - 7, 0.05, cz - 5, 13, 9, 12, "#9aa0a6");
  box(cx - 7, 9.05, cz - 5, 13.4, 0.5, 12.4, "#8d9399", true);
  for (let i = -5; i <= 5; i += 2.5) {
    box(cx - 7 + i, 9.3, cz - 10.5, 0.16, 1.8, 0.16, "#6d5a4a", true);
    box(cx - 7 + i, 9.3, cz + 0.5, 0.16, 1.8, 0.16, "#6d5a4a", true);
  }
  // scaffolding around the frame
  for (let lvl = 1; lvl <= 3; lvl++) {
    box(cx - 7, lvl * 2.4, cz - 11.4, 13.6, 0.12, 0.12, "#8b949c", true);
    box(cx - 7, lvl * 2.4, cz + 1.4, 13.6, 0.12, 0.12, "#8b949c", true);
  }
  for (let p of [-13.6, -11.4, -0.6, 1.4])
    for (let lvl = 0; lvl < 3; lvl++)
      box(cx - 7 + p / 2, lvl * 2.4, cz - 5 + (p < 0 ? -6.4 : 6.4), 0.12, 2.4, 0.12, "#8b949c", true);
  // tower crane
  solid(cx + 12, 0.05, cz + 11, 1.6, 26, 1.6, "#d9862f");
  box(cx + 12, 26, cz + 11, 1.2, 1.4, 1.2, "#2f3a40", true); // cab
  box(cx + 2, 26.6, cz + 11, 21, 0.7, 1.1, "#d9862f", true); // jib
  box(cx + 18.5, 26.6, cz + 11, 7, 0.7, 1.1, "#d9862f", true); // counter-jib
  box(cx + 21.5, 25.6, cz + 11, 2.2, 1.6, 1.4, "#5d666d", true); // counterweight
  box(cx - 6, 12, cz + 11, 0.14, 26, 0.14, "#4a5257"); // hook cable
  box(cx - 6, 11.6, cz + 11, 1.1, 0.9, 1.1, "#2f3a40", true); // hook block
  // materials
  for (let i = 0; i < 4; i++) {
    box(cx + 4 + i * 2.6, 0.05, cz - 14, 2.2, 0.7, 3.2, "#7a4b2a", true);
    box(cx + 4 + i * 2.6, 0.75, cz - 14, 2.2, 0.7, 3.2, "#8a5a33", true);
  }
  for (let i = 0; i < 3; i++)
    box(cx - 16, 0.05 + i * 0.9, cz + 6, 5, 0.85, 1.6, "#b8bcc0", true); // pipe stack
  for (let i = 0; i < 6; i++)
    box(cx + 14 - i * 3.2, 0.05, cz - 2, 0.9, 1, 0.5, i % 2 ? "#e8e4dc" : "#d9862f", true); // barriers
}

function buildFactory(cx, cz) {
  box(cx, 0.03, cz, 44, 0.06, 42, "#3d4449"); // asphalt apron
  // two sheds with clerestory roofs
  for (let s of [-1, 1]) {
    const sz = cz + s * 10;
    solid(cx - 4, 0.05, sz, 30, 8, 13, "#8b9096");
    box(cx - 4, 8.05, sz, 31, 0.6, 14, "#5d666d", true);
    for (let i = 0; i < 5; i++) {
      box(cx - 18 + i * 6, 9.2, sz, 3.4, 1.8, 12, "#9aa0a6", true);
      box(cx - 18 + i * 6, 10.1, sz, 3.4, 0.2, 12.4, "#c9cfd4", true);
    }
    // loading doors
    for (let i = 0; i < 4; i++)
      box(cx - 17 + i * 7.5, 0.06, sz + 6.4, 5, 5.2, 0.35, "#2b3237", true);
  }
  // chimneys
  for (let i = 0; i < 3; i++) {
    solid(cx + 17, 0.05, cz - 12 + i * 9, 3, 22 + i * 3, 3, "#a8523f");
    box(cx + 17, 22 + i * 3, cz - 12 + i * 9, 3.4, 0.5, 3.4, "#c9c2b6", true);
  }
  // storage tanks
  for (let i = 0; i < 4; i++) {
    solid(cx - 17, 0.05, cz - 15 + i * 7, 6, 5.5, 6, "#b8bcc0");
    box(cx - 17, 5.55, cz - 15 + i * 7, 6.4, 0.4, 6.4, "#8b9096", true);
  }
  // shipping containers, stacked
  const cols = ["#3f6f8a", "#b7412f", "#5c7a4a", "#c9a227"];
  for (let i = 0; i < 6; i++) {
    const x = cx + 6 + (i % 3) * 6.4, z = cz + 15 - Math.floor(i / 3) * 3.2;
    box(x, 0.05, z, 6, 2.6, 2.8, cols[i % cols.length], true);
    if (i % 2 === 0) box(x, 2.7, z, 6, 2.6, 2.8, cols[(i + 1) % cols.length], true);
  }
  // pipe rack over the apron
  for (let i = 0; i < 5; i++)
    box(cx - 19 + i * 9.5, 0.05, cz + 20, 0.35, 5, 0.35, "#6d7b84", true);
  box(cx - 4, 5, cz + 20, 38, 0.35, 0.35, "#6d7b84", true);
}

// Street furniture and rooftop clutter: the cheap things that stop a block looking empty.
function decorateCity() {
  // traffic lights at alternating intersections
  for (let xi = 0; xi < roadsX.length; xi++)
    for (let zi = 0; zi < roadsZ.length; zi++) {
      if ((xi + zi) % 2) continue;
      const x = roadsX[xi] + 10, z = roadsZ[zi] + 10;
      if (blocked(new T.Vector3(x, 0, z), 0.4)) continue;
      box(x, 0.05, z, 0.22, 5.2, 0.22, "#3d4449", true);
      box(x, 5.25, z - 1.6, 0.16, 0.16, 3.4, "#3d4449", true);
      for (let l = 0; l < 3; l++)
        box(x, 4.15 - l * 0.42, z - 3.1, 0.3, 0.3, 0.14,
          ["#c0392b", "#d4a017", "#2e8b57"][l], true);
    }
  // benches and planters along block edges
  for (let xi = 0; xi < roadsX.length - 1; xi++)
    for (let zi = 0; zi < roadsZ.length - 1; zi++) {
      const cx = (roadsX[xi] + roadsX[xi + 1]) / 2,
        cz = (roadsZ[zi] + roadsZ[zi + 1]) / 2;
      if (blocked(new T.Vector3(cx + 18, 0, cz + 18), 0.6)) continue;
      box(cx + 18, 0.05, cz + 18, 2.2, 0.45, 0.7, "#7a4b2a", true);
      box(cx + 18, 0.5, cz + 18, 2.2, 0.7, 0.14, "#8a5a33", true);
      box(cx - 18, 0.05, cz + 18, 1.4, 0.6, 1.4, "#7d7f72", true);
      box(cx - 18, 0.65, cz + 18, 1.1, 0.5, 1.1, "#4a5a3a", true);
    }
  // Rooftops: the source buildings ship with a near-white roof surface, which under the sun reads
  // as snow. A thin tar/felt cap in one of two greys fixes the whole skyline for one instanced
  // draw call, and gives a place for the tanks and AC units to sit.
  const ROOFS = ["#6d7276", "#7c807f"];
  for (const b of buildings) {
    const bb = new T.Box3().setFromObject(b), top = bb.max.y, size = bb.getSize(new T.Vector3());
    if (top < 5 || size.x < 4) continue;
    const x = (bb.min.x + bb.max.x) / 2, z = (bb.min.z + bb.max.z) / 2;
    box(x, top, z, size.x * 0.94, 0.07, size.z * 0.94, ROOFS[Math.floor(rand() * ROOFS.length)], true);
    if (top < 7) continue;
    box(x + size.x * 0.24, top, z - size.z * 0.2, 1.7, 1.5, 1.7, "#8b9096", true);
    box(x - size.x * 0.26, top, z + size.z * 0.18, 1.5, 0.9, 1.2, "#b8bcc0", true);
    box(x, top + 1.5, z - size.z * 0.2, 0.1, 1.6, 0.1, "#6d7b84", true);
    // parapet, so the new cap does not look like a floating slab
    box(x, top, z, size.x * 0.96, 0.35, 0.16, "#5b5f63", true);
    box(x, top, z, 0.16, 0.35, size.z * 0.96, "#5b5f63", true);
  }
}
function batchCity() {
  const groups = new Map();
  for (let root of staticProps) {
    root.updateMatrixWorld(true);
    root.traverse((n) => {
      if (!n.isMesh || !n.visible || Array.isArray(n.material)) return;
      const band = Math.floor(root.position.z / 100) + ":" + Math.floor(root.position.x / 64),
        key = n.geometry.uuid + "|" + n.material.uuid + "|" + band;
      let g = groups.get(key);
      if (!g) {
        g = { geometry: n.geometry, material: n.material, matrices: [], level: n.userData.cityLevel, center: root.position.clone() };
        groups.set(key, g);
      }
      g.matrices.push(n.matrixWorld.clone());
    });
    scene.remove(root);
  }
  for (let g of groups.values()) {
    let mesh = new T.InstancedMesh(g.geometry, g.material, g.matrices.length);
    g.matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    mesh.userData.cityLevel = g.level; mesh.userData.cellCenter = g.center;
    if (g.level) mesh.visible = g.level === "far";
    scene.add(mesh);
    staticBatches.push(mesh);
  }
}
function batchRoads() {
  const groups = new Map();
  for (let m of staticBoxes) {
    if (m.material.transparent) continue;
    m.updateMatrixWorld(true);
    let g = groups.get(m.material);
    if (!g) {
      g = [];
      groups.set(m.material, g);
    }
    g.push(m);
  }
  for (let [material, list] of groups) {
    let mesh = new T.InstancedMesh(unitBox, material, list.length);
    let casts = false;
    for (let i = 0; i < list.length; i++) {
      mesh.setMatrixAt(i, list[i].matrixWorld);
      if (list[i].userData.cast) casts = true;
      scene.remove(list[i]);
    }
    mesh.receiveShadow = true;
    mesh.castShadow = casts;
    mesh.computeBoundingSphere();
    scene.add(mesh);
  }
  staticBoxes.length = 0;
}
function playAction(name, once = false) {
  let a = actions[name];
  if (!a) return;
  if (activeAction === name) return;
  const old = actions[activeAction];
  if (old && old !== a) {
    old.paused = false;
    old.fadeOut(0.14);
  }
  a.enabled = true;
  a.paused = false;
  a.reset()
    .setEffectiveWeight(1)
    .setEffectiveTimeScale(1)
    .setLoop(once ? T.LoopOnce : T.LoopRepeat, once ? 1 : Infinity);
  a.clampWhenFinished = once;
  a.fadeIn(0.14).play();
  activeAction = name;
}
function animatePlayer(moving, running, punching) {
  if (transition) {
    playAction("interact", false);
    return;
  }
  let name =
    pos.y > 0.03
      ? "p_jump"
      : punching
        ? "punch_right"
        : moving
          ? weaponIndex && running
            ? "run_shoot"
            : running
              ? "run"
              : "walk"
          : weaponIndex
            ? "idle_gun"
            : "idle";
  playAction(name, name === "p_jump" || name === "punch_right");
}
function blocked(p, r = 0.55, ignore = null, shape = null) {
  if (p.x < WORLD.xMin + r || p.x > WORLD.xMax - r ||
      p.z < WORLD.zMin + r || p.z > WORLD.zMax - r) return true;
  for (const b of obstacles) {
    if (shape) {
      if (
        rectOverlap(
          p,
          shape.angle,
          shape.hw,
          shape.hl,
          { x: (b.min.x + b.max.x) / 2, z: (b.min.z + b.max.z) / 2 },
          0,
          (b.max.x - b.min.x) / 2,
          (b.max.z - b.min.z) / 2,
        )
      )
        return true;
    } else {
      const x = T.MathUtils.clamp(p.x, b.min.x, b.max.x),
        z = T.MathUtils.clamp(p.z, b.min.z, b.max.z);
      if ((p.x - x) ** 2 + (p.z - z) ** 2 < r * r) return true;
    }
  }
  for (const t of treeColliders) {
    if (shape) {
      if (circleRect(t.x, t.z, t.r, p, shape.angle, shape.hw, shape.hl))
        return true;
    } else if ((p.x - t.x) ** 2 + (p.z - t.z) ** 2 < (r + t.r) ** 2)
      return true;
  }
  for (const c of cars) {
    if (c === ignore || !c.hw || (c.police && !c.deployed)) continue;
    if (shape) {
      if (
        rectOverlap(
          p,
          shape.angle,
          shape.hw,
          shape.hl,
          c.obj.position,
          c.angle,
          c.hw,
          c.hl,
        )
      )
        return true;
    } else if (circleRect(p.x, p.z, r, c.obj.position, c.angle, c.hw, c.hl))
      return true;
  }
  return false;
}
function move(p, dx, dz, r, ignore = null, shape = null) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.22)),
    test = p.clone();
  let hit = false;
  for (let i = 0; i < steps; i++) {
    test.copy(p);
    test.x += dx / steps;
    if (!blocked(test, r, ignore, shape)) p.x = test.x;
    else hit = true;
    test.copy(p);
    test.z += dz / steps;
    if (!blocked(test, r, ignore, shape)) p.z = test.z;
    else hit = true;
  }
  if (hit && p === pos && driving) speed *= 0.35;
  return !hit;
}
let nearest = null, freeCam = null, shadowFrame = 0;
const audioNear = [], dirVec = new T.Vector3(), rayHit = new T.Vector3(), EMPTY = [];
function enter(forced) {
  if (transition) return;
  if (driving) {
    if (Math.abs(speed) > 4) {
      toast("Brake before getting out");
      return;
    }
    const c = driving,
      exit = findExit(c);
    if (!exit) {
      toast("No safe room to exit here");
      return;
    }
    speed = c.speed = 0;
    player.visible = true;
    transition = {
      kind: "exit",
      car: c,
      from: playerSeat(c),
      to: exit,
      t: 0,
      duration: c.bike ? 0.7 : 0.9,
    };
    mixer.stopAllAction();
    activeAction = "";
    playAction("interact");
    resetInput();
    return;
  }
  let c = cars.includes(forced) ? forced : null;
  if (!c) {
    let best = 6;
    for (const car of cars) {
      const d = car.obj.position.distanceTo(pos);
      if (d < best && Math.abs(car.speed) < 3) {
        best = d;
        c = car;
      }
    }
  }
  if (!c) return;
  c.traffic = false;
  c.speed = 0;
  const side = findExit(c);
  if (!side) {
    toast("Approach from an open side");
    return;
  }
  transition = {
    kind: "enter",
    car: c,
    from: pos.clone(),
    side,
    to: playerSeat(c),
    t: 0,
    duration: c.bike ? 0.9 : 1.1,
  };
  if (c.police) recordCrime(2, 1);
  heading = c.angle;
  player.rotation.y = heading;
  resetInput();
  playAction("interact");
}
function jump() {
  if (driving || transition) return;
  if (pos.y < 0.02) {
    vy = 6.4;
    jumpTime = 0.8;
    activeAction = "";
    playAction("p_jump", true);
  }
}
function punch() {
  if (document.querySelector(".overlay.open")) return;
  if (!driving && !transition && punchTime <= 0) {
    punchTime = 0.6;
    sfx.punch();
    let hit = false;
    for (let n of [...npcs, ...cops.filter((c) => c.active)]) {
      if (n.g.position.distanceTo(pos) < 2.5) {
        n.stun = 1;
        n.walk.stop();
        n.hit.reset().setLoop(T.LoopOnce, 1).play();
        let d = n.g.position.clone().sub(pos).normalize();
        move(n.g.position, d.x * 0.45, d.z * 0.45, 0.35);
        if (!n.police) n.aggroUntil = elapsed + 24;
        recordCrime(n.police ? Math.max(2, Math.min(5, wanted + 1)) : 1, 1);
        hit = true;
      }
    }
    if (hit) toast("Easy, traveler. Keep the coast friendly.");
  }
}
function toast(s) {
  $("toast").textContent = s;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 3600);
}
addEventListener("keydown", (e) => {
  if (/INPUT|SELECT/.test(document.activeElement.tagName)) return;
  keys[e.code] = true;
  if (
    ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
      e.code,
    )
  )
    e.preventDefault();
  if (e.repeat) return;
  if (e.code === "KeyE") enter();
  if (e.code === "Space") jump();
  if (e.code === "KeyF") fireWeapon();
  if (e.code === "KeyQ") cycleWeapon();
  if (e.code === "KeyR") reloadWeapon();
  if (e.code === "Escape")
    document
      .querySelectorAll(".overlay")
      .forEach((o) => o.classList.remove("open"));
});
addEventListener("keyup", (e) => (keys[e.code] = false));
addEventListener("blur", () => {
  for (let k in keys) keys[k] = false;
});
function capture(el, id) {
  try {
    el.setPointerCapture(id);
  } catch {}
}
let drag = null,
  dragId = null;
canvas.addEventListener("pointerdown", (e) => {
  if (dragId !== null) return;
  dragId = e.pointerId;
  drag = { x: e.clientX, y: e.clientY };
  capture(canvas, e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== dragId) return;
  yaw -= (e.clientX - drag.x) * 0.005;
  pitch = T.MathUtils.clamp(pitch + (e.clientY - drag.y) * 0.004, -0.05, 1);
  drag = { x: e.clientX, y: e.clientY };
  orbitUntil = elapsed + 3;
});
function clearLook(e) {
  if (e.pointerId === dragId) {
    drag = null;
    dragId = null;
  }
}
canvas.addEventListener("pointerup", clearLook);
canvas.addEventListener("pointercancel", clearLook);
canvas.addEventListener("lostpointercapture", clearLook);
canvas.addEventListener(
  "wheel",
  (e) => {
    zoom = T.MathUtils.clamp(zoom + e.deltaY * 0.01, 5, 18);
  },
  { passive: true },
);
let joyX = 0,
  joyY = 0;
const joy = $("joystick");
function joystick(e) {
  let b = joy.getBoundingClientRect(),
    radius = b.width * 0.38,
    x = (e.clientX - b.left - b.width / 2) / radius,
    y = (e.clientY - b.top - b.height / 2) / radius,
    m = Math.max(1, Math.hypot(x, y));
  joyX = x / m;
  joyY = -y / m;
  $("stick").style.transform =
    `translate(${joyX * radius * 0.8}px,${-joyY * radius * 0.8}px)`;
}
function clearJoy() {
  joyX = joyY = 0;
  $("stick").style.transform = "";
}
joy.onpointerdown = (e) => {
  capture(joy, e.pointerId);
  joystick(e);
};
joy.onpointermove = (e) => {
  if (joy.hasPointerCapture(e.pointerId)) joystick(e);
};
joy.onpointerup = clearJoy;
joy.onpointercancel = clearJoy;
joy.onlostpointercapture = clearJoy;
function hold(id, key) {
  let b = $(id);
  b.onpointerdown = (e) => {
    e.preventDefault();
    keys[key] = true;
    b.classList.add("held");
    capture(b, e.pointerId);
  };
  let release = () => {
    keys[key] = false;
    b.classList.remove("held");
  };
  b.onpointerup = release;
  b.onpointercancel = release;
  b.onlostpointercapture = release;
}
hold("touchRun", "ShiftLeft");
hold("touchBrake", "Space");
$("touchEnter").onclick = enter;
$("interact").onclick = enter;
hold("touchPunch", "Fire");
$("weaponSwitch").onclick = cycleWeapon;
$("ammoCount").onclick = reloadWeapon;
hold("touchGas", "Gas");
hold("steerLeft", "SteerLeft");
hold("steerRight", "SteerRight");
$("touchJump").onclick = jump;
function resetInput() {
  clearJoy();
  drag = null;
  dragId = null;
  for (let k in keys) keys[k] = false;
  document.querySelectorAll(".held").forEach((b) => b.classList.remove("held"));
}
addEventListener("blur", resetInput);
document.addEventListener("visibilitychange", () => {
  resetInput();
  if (document.hidden) {
    stopVoice();
    music.pause();
    sfx.pause(true);
  } else { music.resume(); sfx.pause(false); }
});
const music = createMusic();
$("musicToggle").onclick = () => {
  music.toggle();
  $("musicToggle").textContent = music.enabled ? "♫ Music on" : "♫ Music off";
};
$("musicVolume").oninput = (e) => (music.volume = Number(e.target.value));
document.addEventListener("pointerdown", () => music.resume(), { once: true });
function modal(id) {
  resetInput();
  $(id).classList.add("open");
}
$("friends").onclick = () => modal("roommodal");
$("settings").onclick = () => modal("settingsmodal");
document
  .querySelectorAll(".close")
  .forEach(
    (b) => (b.onclick = () => b.closest(".overlay").classList.remove("open")),
  );
document.querySelectorAll(".overlay").forEach((o) =>
  o.addEventListener("click", (e) => {
    if (e.target === o) o.classList.remove("open");
  }),
);
$("reset").onclick = () => {
  respawnPlayer("Returned to Palm Beach");
  heading = Math.PI;
  yaw = 0;
  camera.position.set(-53, 5, 87);
  $("settingsmodal").classList.remove("open");
};
// Resolution and shadow budget. Phones get a much lower ceiling: a 2048px shadow map plus a
// 1.5x device pixel ratio is what made the WebView hot and stuttery on a handset.
let dprCap = 1.5;
function applyQuality() {
  const q = $("quality").value;
  dprCap = mobile
    ? q === "high" ? 1.0 : q === "balanced" ? 0.85 : 0.7
    : q === "high" ? 1.5 : q === "balanced" ? 1.25 : 1.0;
  const shadowSize = q === "high" ? (mobile ? 1024 : 2048) : 1024;
  renderer.shadowMap.enabled = q !== "low";
  if (sun.shadow.mapSize.x !== shadowSize) {
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  scene.environmentIntensity = q === "low" ? 0.4 : 0.65;
  applyPixelRatio();
  renderer.setSize(innerWidth, innerHeight);
}
// renderScale is the adaptive multiplier; applyPixelRatio folds it into the device ratio.
let renderScale = 1;
function applyPixelRatio() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, dprCap) * renderScale);
}
// Android 12+ Game Dashboard / Game Mode hint, injected by MainActivity as window.__coastlineGameMode.
// 2 = performance, 3 = battery saving; battery mode drops us to Low automatically.
function gameModeHint() {
  // MainActivity appends ?gm=<GameManager mode> and also exposes coastlinePlatform.mode().
  const fromUrl = Number(new URLSearchParams(location.search).get("gm") || 0);
  let fromBridge = 0;
  try { fromBridge = Number(window.coastlinePlatform?.mode?.() || 0); } catch (e) { /* no bridge */ }
  const gm = fromBridge || fromUrl || Number(window.__coastlineGameMode || 0);
  if (gm === 2) return "high"; // GAME_MODE_PERFORMANCE
  if (gm === 3) return "low"; // GAME_MODE_BATTERY
  return null;
}
$("quality").onchange = () => {
  applyQuality();
  renderer.setSize(innerWidth, innerHeight);
};
$("quality").value = gameModeHint() || "high";
$("quality").onchange();
let mode = "day";
$("time").onchange = () => {
  mode = $("time").value;
  updateLight();
};
function updateLight() {
  let night =
      mode === "night" ||
      (mode === "cycle" && Math.sin(elapsed * 0.012) < -0.5),
    sunset =
      mode === "sunset" ||
      (mode === "cycle" && !night && Math.sin(elapsed * 0.012) < 0);
  let col = night ? "#142039" : sunset ? "#c39d8e" : "#adb9c2";
  scene.background = !night && !sunset && skyHDR ? skyHDR : new T.Color(col);
  scene.fog.color.set(col);
  scene.environmentIntensity = night ? 0.15 : sunset ? 0.45 : 0.65;
  sun.color.set(sunset ? "#ffbb88" : "#ffecd5");
  sun.intensity = night ? 0.12 : sunset ? 1.9 : 2.3;
  ambient.intensity = night ? 0.35 : 1.0;
  $("clock").textContent = night ? "22:10" : sunset ? "18:42" : "14:32";
  $("weather").textContent = night ? " ☾ 21°" : sunset ? " ☀ 25°" : " ☀ 28°";
}
const map = $("map").getContext("2d"),
  mapNeedle = document.querySelector(".mapn");
let bigMap = false,
  mapNeedleRot = null,
  mapDrawnX = NaN,
  mapDrawnZ = NaN,
  mapDrawnHeading = NaN,
  mapStaticReady = false,
  mapLastDraw = -1e9;
// World rectangle covered by the cached map layer, in metres (1 px per metre).
const MAP_X0 = -140, MAP_Z0 = -330, MAP_W = 420, MAP_H = 700;
const mapStatic = document.createElement("canvas");
function buildMapStatic() {
  mapStatic.width = MAP_W;
  mapStatic.height = MAP_H;
  const g = mapStatic.getContext("2d");
  g.setTransform(1, 0, 0, 1, -MAP_X0, -MAP_Z0); // draw in world metres
  g.fillStyle = "#14505f";
  g.fillRect(MAP_X0, MAP_Z0, MAP_W, MAP_H);
  g.fillStyle = "#6b716b";
  g.fillRect(-95, -1000, 520, 2000);
  g.fillStyle = "#c4b08a";
  g.fillRect(-125, -1000, 43, 2000);
  g.fillStyle = "#283239";
  for (let x of roadsX) g.fillRect(x - 8, -330, 16, 660);
  for (let z of roadsZ) g.fillRect(-95, z - 7, 520, 14);
  g.fillStyle = "#9b9c90";
  for (let b of obstacles)
    g.fillRect(b.min.x, b.min.z, b.max.x - b.min.x, b.max.z - b.min.z);
  mapStaticReady = true;
}
$("mapToggle").onclick = () => {
  bigMap = !bigMap;
  document.querySelector(".bottomleft").classList.toggle("expanded", bigMap);
  drawMap();
};
function drawMap() {
  const w = 224,
    h = 176,
    s = bigMap ? 0.48 : 0.95;
  // Big map only changes the zoom, so a rebuild is unnecessary; the cached layer covers the
  // whole reachable world at 1 canvas pixel per metre.
  if (!mapStaticReady) buildMapStatic();
  map.setTransform(2, 0, 0, 2, 0, 0);
  map.clearRect(0, 0, w, h);
  map.fillStyle = "#123d4a";
  map.fillRect(0, 0, w, h);
  map.save();
  map.translate(w / 2, h / 2);
  map.rotate(mapHeading - Math.PI);
  map.scale(s, s);
  map.translate(-pos.x, -pos.z);
  // One blit of the pre-rendered ground, roads and buildings instead of ~80 fillRect calls
  // per frame, which is what made the rotating map stutter on phones.
  map.drawImage(mapStatic, MAP_X0, MAP_Z0, MAP_W, MAP_H);
  for (let c of cars) {
    map.fillStyle = c.bike ? "#c99bff" : "#d6d4bc";
    map.fillRect(c.obj.position.x - 1.7, c.obj.position.z - 2, 3.4, 4);
  }
  for (let p of peers.values()) {
    map.fillStyle = "#76b7ff";
    map.beginPath();
    map.arc(p.target.x, p.target.z, 3.8, 0, 7);
    map.fill();
  }
  if (checkpoint > 0 && checkpoint <= 3) {
    let p = checkpoints[checkpoint - 1];
    map.strokeStyle = "#e9c779";
    map.lineWidth = 2;
    map.setLineDash([5, 5]);
    map.beginPath();
    map.moveTo(pos.x, pos.z);
    map.lineTo(p.x, p.z);
    map.stroke();
    map.setLineDash([]);
    map.fillStyle = "#e9c779";
    map.beginPath();
    map.arc(p.x, p.z, 5, 0, 7);
    map.fill();
  }
  map.restore();
  map.save();
  map.translate(w / 2, h / 2);
  // Player points up; the world rotates around the fixed chevron.
  map.shadowColor = "#000";
  map.shadowBlur = 3;
  map.fillStyle = "#f8e1a0";
  map.strokeStyle = "#0c1a20";
  map.lineWidth = 1.5;
  map.beginPath();
  map.moveTo(0, -9);
  map.lineTo(-6, 7);
  map.lineTo(0, 4);
  map.lineTo(6, 7);
  map.closePath();
  map.fill();
  map.stroke();
  map.restore();
  const rot = mapHeading - Math.PI;
  // Writing style each frame thrashed layout; only touch the DOM when the needle actually moves.
  if (mapNeedleRot !== rot) {
    mapNeedle.style.transform = `rotate(${rot}rad)`;
    mapNeedleRot = rot;
  }
}
// Room networking: fixed 10 Hz, quantized transforms, peer-to-peer optional audio.
const nativeApp = location.hostname === "appassets.androidplatform.net";
let serverURL = localStorage.getItem("coastline.server") || "";
$("serverurl").value = serverURL;
const socket = io(serverURL || location.origin, {
  autoConnect: false,
  reconnection: false,
  timeout: 10000,
  transports: ["websocket", "polling"],
});
let roomCode = "",
  ownId = "",
  voiceStream = null;
const peers = new Map(),
  pcs = new Map(),
  audios = new Map();
function peerAdd(p) {
  if (peers.has(p.id)) return;
  let model = makeActor(1.85);
  let group = new T.Group();
  group.add(model);
  scene.add(group);
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 64;
  let ctx = cv.getContext("2d");
  ctx.fillStyle = "#102e32cc";
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = "#d9fc79";
  ctx.font = "bold 24px Arial";
  ctx.textAlign = "center";
  ctx.fillText(p.name, 128, 42);
  let label = new T.Sprite(
    new T.SpriteMaterial({ map: new T.CanvasTexture(cv), depthTest: false }),
  );
  label.position.y = 2.5;
  label.scale.set(2.7, 0.67, 1);
  group.add(label);
  peers.set(p.id, {
    group,
    target: new T.Vector3(...p.state.slice(0, 3)),
    angle: p.state[3],
  });
  updatePlayers();
}
function peerRemove(id) {
  let p = peers.get(id);
  if (p) scene.remove(p.group);
  peers.delete(id);
  pcs.get(id)?.close();
  pcs.delete(id);
  audios.get(id)?.remove();
  audios.delete(id);
  updatePlayers();
}
function updatePlayers() {
  $("players").textContent = `${peers.size + 1} PLAYER${peers.size ? "S" : ""}`;
}
$("join").onclick = () => {
  if (!started) return;
  let url = $("serverurl").value.trim().replace(/\/$/, "");
  if (nativeApp && !url)
    return toast(
      "Enter a hosted HTTPS game server address first. Solo works offline.",
    );
  if (url) {
    try {
      let u = new URL(url);
      if (u.protocol !== "https:" && !(u.protocol === "http:" && !nativeApp))
        throw Error();
    } catch {
      return toast("Use a valid HTTPS game server URL.");
    }
  }
  if (url !== serverURL) {
    socket.disconnect();
    socket.io.uri = url || location.origin;
    serverURL = url;
    localStorage.setItem("coastline.server", url);
  }
  $("roomstatus").textContent = "Connecting…";
  socket.connect();
  const join = () =>
    socket.emit(
      "join",
      { name: $("playername").value, code: $("roomcode").value },
      (r) => {
        if (r.error) {
          $("roomstatus").textContent = r.error;
          return;
        }
        for (let id of peers.keys()) peerRemove(id);
        roomCode = r.code;
        ownId = r.id;
        r.peers.forEach(peerAdd);
        $("roomcode").value = r.code;
        $("roomstatus").textContent =
          `Room ${r.code} · ${r.peers.length + 1}/6 connected`;
        $("net").textContent = "● ROOM " + r.code;
        toast("Connected! Share room " + r.code + " with your friends.");
        if (voiceStream) for (let p of r.peers) callPeer(p.id);
      },
    );
  if (socket.connected) join();
  else {
    socket.off("connect");
    socket.once("connect", join);
  }
};
socket.on("connect_error", () => {
  $("roomstatus").textContent =
    "Cannot reach server. Check its address and connection.";
  toast("Connection failed. Offline solo is still available.");
});
socket.on("peer", (p) => {
  peerAdd(p);
  toast(p.name + " joined the coast.");
});
socket.on("left", peerRemove);
socket.on("state", ({ id, v }) => {
  let p = peers.get(id);
  if (!p) return;
  p.target.set(v[0], v[1], v[2]);
  p.angle = v[3];
  p.group.visible = v[4] < 0;
  if (v[4] >= 0 && cars[v[4]] && driving?.id !== v[4]) {
    let c = cars[v[4]];
    c.traffic = false;
    c.obj.position.copy(p.target);
    c.obj.rotation.y = v[3];
    c.angle = v[3];
  }
});
socket.on("disconnect", () => {
  for (let id of peers.keys()) peerRemove(id);
  $("net").textContent = "● SOLO SESSION";
  $("roomstatus").textContent = "Disconnected. Rejoin to reconnect.";
  roomCode = "";
  stopVoice();
});
$("copy").onclick = async () => {
  if (!roomCode) return toast("Create or join a room first.");
  let url = (serverURL || location.origin) + "/?room=" + roomCode;
  try {
    await navigator.clipboard.writeText(url);
    toast("Invite link copied.");
  } catch {
    prompt("Copy this invite link:", url);
  }
};
$("leave").onclick = () => {
  socket.emit("leave");
  socket.disconnect();
  stopVoice();
  $("roomstatus").textContent = "You are now in a solo session.";
};
function makePC(id) {
  if (pcs.has(id)) return pcs.get(id);
  let pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  pcs.set(id, pc);
  if (voiceStream)
    for (let track of voiceStream.getTracks()) pc.addTrack(track, voiceStream);
  pc.onicecandidate = (e) => {
    if (e.candidate)
      socket.emit("signal", { to: id, data: { candidate: e.candidate } });
  };
  pc.ontrack = (e) => {
    let a = audios.get(id) || document.createElement("audio");
    a.autoplay = true;
    a.srcObject = e.streams[0];
    document.body.appendChild(a);
    a.play().catch(() => toast("Tap Enable voice to allow audio."));
    audios.set(id, a);
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected")
      for (let s of pc.getSenders()) {
        if (s.track?.kind === "audio") {
          let p = s.getParameters();
          p.encodings = p.encodings?.length ? p.encodings : [{}];
          p.encodings[0].maxBitrate = 16000;
          s.setParameters(p).catch(() => {});
        }
      }
    if (pc.connectionState === "failed")
      toast("Voice connection failed. This network may require a TURN relay.");
  };
  return pc;
}
async function callPeer(id) {
  let pc = makePC(id);
  let offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit("signal", { to: id, data: { description: pc.localDescription } });
}
const iceQueues = new Map();
socket.on("signal", async ({ from, data }) => {
  try {
    let pc = makePC(from);
    if (data.description) {
      if (data.description.type === "offer" && pc.signalingState !== "stable") {
        if (ownId > from) return;
        await pc.setLocalDescription({ type: "rollback" });
      }
      await pc.setRemoteDescription(data.description);
      for (let c of iceQueues.get(from) || []) await pc.addIceCandidate(c);
      iceQueues.delete(from);
      if (data.description.type === "offer") {
        await pc.setLocalDescription(await pc.createAnswer());
        socket.emit("signal", {
          to: from,
          data: { description: pc.localDescription },
        });
      }
    } else if (data.candidate) {
      if (pc.remoteDescription) await pc.addIceCandidate(data.candidate);
      else {
        if (!iceQueues.has(from)) iceQueues.set(from, []);
        iceQueues.get(from).push(data.candidate);
      }
    }
  } catch (e) {
    console.warn(e);
  }
});
function stopVoice() {
  voiceStream?.getTracks().forEach((t) => t.stop());
  voiceStream = null;
  for (let pc of pcs.values()) pc.close();
  pcs.clear();
  for (let a of audios.values()) a.remove();
  audios.clear();
  $("voice").textContent = "♩ Enable voice";
}
$("voice").onclick = async () => {
  if (!roomCode) return toast("Join a room before enabling voice.");
  if (voiceStream) {
    stopVoice();
    return toast("Microphone off.");
  }
  try {
    voiceStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1,
      },
      video: false,
    });
    $("voice").textContent = "● Mic on · disable";
    for (let id of peers.keys()) {
      pcs.get(id)?.close();
      pcs.delete(id);
      await callPeer(id);
    }
    toast("Voice enabled. Your microphone is live in this room.");
  } catch (e) {
    toast("Microphone unavailable: " + e.message);
  }
};
const invite = new URLSearchParams(location.search).get("room");
if (invite) {
  $("roomcode").value = invite;
  setTimeout(() => modal("roommodal"), 1200);
}
let nativePaused = false;
let renderLast = 0;
let last = performance.now(),
  frames = 0,
  fpsTime = 0,
  netTime = 0,
  uiTime = 0;
camera.position.set(-51, 5.5, 85);
const desiredCam = new T.Vector3(),
  look = new T.Vector3(),
  ray = new T.Raycaster();
// Keeps the frame budget by trading resolution, then shadows, before the player sees stutter.
// Only relaxes when well below target and only recovers slowly, so it cannot oscillate.
let stableFps = 60, adaptCooldown = 0;
function adaptiveFrameRate(fps) {
  if (!started) return;
  stableFps = stableFps * 0.6 + fps * 0.4;
  const now = elapsed;
  if (now < adaptCooldown) return;
  const target = Number($("framerate").value) || 30;
  if (stableFps < target * 0.72) {
    if (renderScale > 0.62) {
      renderScale = Math.max(0.6, renderScale - 0.1);
      applyPixelRatio();
      adaptCooldown = now + 2.5;
    } else if (renderer.shadowMap.enabled && $("quality").value !== "low") {
      // Still short of budget at the lowest scale: drop shadows rather than resolution again.
      renderer.shadowMap.enabled = false;
      scene.traverse((o) => { if (o.isMesh && o.material) o.material.needsUpdate = true; });
      adaptCooldown = now + 4;
    }
  } else if (stableFps > target * 0.97 && renderScale < 1) {
    renderScale = Math.min(1, renderScale + 0.05);
    applyPixelRatio();
    adaptCooldown = now + 4;
  }
}
function tick(now) {
  requestAnimationFrame(tick);
  if (document.hidden || nativePaused) {
    last = now;
    return;
  }
  let cap = Number($("framerate").value);
  if (now - renderLast < 1000 / cap - 0.5) return;
  renderLast = now;
  let wallDt = Math.max(0.001, (now - last) / 1000),
    dt = Math.min(wallDt, 0.0667);
  last = now;
  elapsed += dt;
  if (!started) {
    renderer.render(scene, camera);
    return;
  }
  let up =
      (keys.KeyW || keys.ArrowUp ? 1 : 0) -
      (keys.KeyS || keys.ArrowDown ? 1 : 0) +
      joyY,
    right =
      (keys.KeyD || keys.ArrowRight ? 1 : 0) -
      (keys.KeyA || keys.ArrowLeft ? 1 : 0) +
      joyX;
  const dialogOpen = document.querySelector(".overlay.open");
  const paused = dialogOpen || transition;
  if (paused) {
    up = right = 0;
    speed *= Math.pow(0.94, dt * 60);
  }
  let moving = Math.abs(up) + Math.abs(right) > 0.1;
  let running = keys.ShiftLeft || keys.ShiftRight;
  if (transition) {
    updateTransition(dialogOpen ? 0 : dt);
  } else if (driving) {
    let throttle = paused ? 0 : keys.Gas || keys.KeyW || keys.ArrowUp ? 1 : 0,
      brake = !paused && (keys.Space || keys.KeyS || keys.ArrowDown);
    right = paused
      ? 0
      : T.MathUtils.clamp(
          right + (keys.SteerRight ? 1 : 0) - (keys.SteerLeft ? 1 : 0),
          -1,
          1,
        );
    if (throttle) speed += driving.accel * dt;
    if (brake) {
      if (speed > 0.8) speed = Math.max(0, speed - 32 * dt);
      else if (!throttle) speed = Math.max(-8, speed - 10 * dt);
    }
    speed *= Math.pow(throttle ? 0.997 : 0.989, dt * 60);
    speed = T.MathUtils.clamp(speed, -8, driving.max);
    const oldHeading = heading;
    if (Math.abs(speed) > 0.15)
      heading -=
        right *
        dt *
        (driving.bike ? 1.8 : 1.25) *
        T.MathUtils.clamp(speed / 8, -1, 1);
    if (
      blocked(pos, 0.55, driving, {
        angle: heading,
        hw: driving.hw,
        hl: driving.hl,
      })
    ) {
      heading = oldHeading;
      speed *= 0.7;
    }
    move(
      pos,
      Math.sin(heading) * speed * dt,
      Math.cos(heading) * speed * dt,
      driving.bike ? 0.55 : 1.25,
      driving,
      { angle: heading, hw: driving.hw, hl: driving.hl },
    );
    pos.y = 0.12;
    driving.obj.position.copy(pos);
    driving.obj.rotation.y = heading;
    driving.obj.rotation.z = driving.bike
      ? T.MathUtils.lerp(
          driving.obj.rotation.z,
          -right * 0.15 * Math.min(Math.abs(speed) / 8, 1),
          dt * 8,
        )
      : 0;
    driving.angle = heading;
    driving.speed = speed;
    if (driving.bike) {
      player.position.copy(pos);
      player.position.y = pos.y + 0.61 - riderHipOffset;
      player.rotation.set(0, heading, driving.obj.rotation.z);
    }
  } else {
    if (moving) {
      let angle = yaw + Math.PI - Math.atan2(right, up);
      heading = T.MathUtils.lerp(
        heading,
        heading +
          T.MathUtils.euclideanModulo(angle - heading + Math.PI, Math.PI * 2) -
          Math.PI,
        Math.min(dt * 14, 1),
      );
      let n = Math.max(1, Math.hypot(up, right)),
        v = (running ? 8 : 4.2) * dt;
      move(
        pos,
        (Math.sin(angle) * v * Math.hypot(up, right)) / n,
        (Math.cos(angle) * v * Math.hypot(up, right)) / n,
        0.55,
      );
    }
    vy -= 18 * dt;
    pos.y = Math.max(0, pos.y + vy * dt);
    if (pos.y === 0) vy = 0;
    player.position.copy(pos);
    player.rotation.y = heading;
    animatePlayer(moving, running, punchTime > 0);
    punchTime = Math.max(0, punchTime - dt);
  }
  if (keys.Fire && !paused) fireWeapon();
  updateWeapons(dt);
  for (let m of mixers) {
    if (driving?.bike && m === mixer && !transition) continue;
    const actor = npcs.find((n) => n.m === m) || cops.find((n) => n.m === m);
    if (actor && (!actor.active || actor.g.position.distanceTo(pos) > 100))
      continue;
    m.update(dt);
  }
  enforceActorScale(playerModel);
  if (driving?.bike && !transition) poseRider(false);
  updatePoliceCars(dialogOpen ? 0 : dt);
  updatePolice(dialogOpen ? 0 : dt);
  updateCitizens(dialogOpen ? 0 : dt);
  // Reuse two preallocated buffers: this ran every frame with filter/map/sort/slice, i.e. several
  // arrays and object spreads per frame, which showed up as GC stutter on phones.
  const want = 3;
  audioNear.length = 0;
  audioNear.push(...(driving ? [{ ...driving, speed, distance: 0 }] : []));
  for (const c of cars) {
    if (!c.obj.visible || c === driving) continue;
    const d = c.obj.position.distanceTo(pos);
    if (d >= 45) continue;
    if (audioNear.length < want) audioNear.push({ ...c, distance: d });
    else {
      let worst = 0;
      for (let i = 1; i < audioNear.length; i++)
        if (audioNear[i].distance > audioNear[worst].distance) worst = i;
      if (d < audioNear[worst].distance) audioNear[worst] = { ...c, distance: d };
    }
  }
  sfx.update(audioNear, elapsed, wanted);
  for (const c of cars) {
    if (c === driving || transition?.car === c || !c.traffic) continue;
    if (!c.cruise) c.cruise = 6 + (c.id % 3);
    if (
      move(c.obj.position, 0, c.cruise * dt, 0.8, c, {
        angle: 0,
        hw: c.hw,
        hl: c.hl,
      })
    )
      c.speed = c.cruise;
    else c.speed = 0;
    if (c.obj.position.z > WORLD.zMax - 8) {
      const q = c.obj.position.clone();
      q.z = WORLD.zMin + 8;
      if (!blocked(q, 0.8, c, { angle: 0, hw: c.hw, hl: c.hl }))
        c.obj.position.copy(q);
    }
  }
  for (let p of peers.values()) {
    p.group.position.lerp(p.target, Math.min(1, dt * 12));
    p.group.rotation.y = p.angle;
  }
  if (driving && elapsed > orbitUntil && !drag)
    yaw = T.MathUtils.lerp(
      yaw,
      yaw +
        T.MathUtils.euclideanModulo(
          heading - Math.PI - yaw + Math.PI,
          Math.PI * 2,
        ) -
        Math.PI,
      dt * 2,
    ); // walking movement is camera-relative, camera stays stable during free look
  look.copy(pos);
  look.y += driving ? 1.4 : 1.3;
  let dist = driving ? zoom + 3 : zoom;
  const viewYaw = cameraMode === "front" ? heading : yaw;
  desiredCam.set(
    look.x + Math.sin(viewYaw) * dist * Math.cos(pitch),
    look.y + 1 + Math.sin(pitch) * dist,
    look.z + Math.cos(viewYaw) * dist * Math.cos(pitch),
  );
  if (cameraMode === "first") {
    if (driving) desiredCam.copy(pos).add(new T.Vector3(0, 1.25, 0));
    else { findBone(playerModel,"Head").getWorldPosition(desiredCam); desiredCam.y += .07; }
    const forward = new T.Vector3(-Math.sin(yaw), -Math.sin(pitch), -Math.cos(yaw)).normalize();
    desiredCam.addScaledVector(forward,.12); look.copy(desiredCam).addScaledVector(forward,10);
  }
  dirVec.copy(desiredCam).sub(look);
  let len = dirVec.length();
  ray.set(look, dirVec.normalize());
  let nearestHit = len;
  for (let b of (cameraMode === "first" ? EMPTY : obstacles)) {
    // Shared scratch vector: this loop ran per obstacle per frame and allocated each time.
    let hit = ray.ray.intersectBox(b, rayHit);
    if (hit) nearestHit = Math.min(nearestHit, look.distanceTo(hit) - 0.5);
  }
  if (nearestHit < len)
    // dirVec was normalised in place by ray.set above; reuse it instead of a fresh vector.
    desiredCam.copy(look).addScaledVector(dirVec, Math.max(1.1, nearestHit));
  if (freeCam) {
    camera.position.copy(freeCam.eye);
    camera.lookAt(freeCam.target);
  } else if (cameraMode === "first") camera.position.copy(desiredCam);
  else camera.position.lerp(desiredCam, 1 - Math.exp(-dt * 7));
  if (!freeCam) camera.lookAt(look);
  playerModel.visible = cameraMode !== "first" && camera.position.distanceTo(look) > 1.7;
  sun.position.set(
    pos.x - 40,
    mode === "sunset" || mode === "cycle" ? 45 : 90,
    pos.z + 30,
  );
  sun.target.position.copy(pos);
  sun.target.updateMatrixWorld();
  mapHeading = heading; // exact heading-up rotation, no lag or wrap flip
  updateHud();
  water.material.uniforms.time.value = elapsed;
  ring && (ring.material.opacity = 0.6 + Math.sin(elapsed * 3) * 0.25);
  if (checkpoint > 0 && checkpoint <= 3) {
    let target = checkpoints[checkpoint - 1];
    ring.position.set(target.x, 0.3, target.z);
    if (pos.distanceTo(target) < 9) {
      checkpoint++;
      $("progress").style.width = `${((checkpoint - 1) / 3) * 100}%`;
      if (checkpoint > 3) {
        ring.visible = false;
        toast("Coastal detour complete! Keep exploring Santa Palma.");
        $("missiontext").textContent =
          "Three neighborhoods. One unforgettable ride.";
        $("objective").textContent = "✓ Coastal detour complete";
        $("distance").textContent = "DONE";
      } else
        toast(
          "Checkpoint reached. Next stop: " +
            (checkpoint === 2 ? "Downtown" : "South coast"),
        );
    }
  }
  netTime += dt;
  if (netTime > 0.1 && socket.connected && roomCode) {
    netTime = 0;
    socket.volatile.emit("state", [
      +pos.x.toFixed(2),
      +pos.y.toFixed(2),
      +pos.z.toFixed(2),
      +heading.toFixed(3),
      driving ? driving.id : -1,
      Math.round(speed),
    ]);
  }
  uiTime += dt;
  if (uiTime > 0.15) {
    uiTime = 0;
    for (const batch of staticBatches) {
      const level = batch.userData.cityLevel;
      if (!level) continue;
      const center = batch.userData.cellCenter;
      const d = Math.hypot(center.x - pos.x, center.z - pos.z);
      batch.visible = d < 430 && level === (d < 85 ? "near" : "far");
      batch.castShadow = d < 85;
    }
    for (let c of cars) c.obj.visible = c.obj.position.distanceTo(pos) < 260 && (!c.police || c.deployed) && !(c === driving && cameraMode === "first");
    nearest = null;
    let d = Infinity;
    for (let c of cars) {
      let v = c.obj.position.distanceTo(pos);
      if (v < d && Math.abs(c.speed) < 12) {
        d = v;
        nearest = c;
      }
    }
    if (d > 7) nearest = null;
    $("interact").style.display = driving || nearest ? "flex" : "none";
    $("interact").querySelector("div").innerHTML = driving
      ? "Exit vehicle"
      : nearest
        ? "Enter " + vehicleName(nearest.type)
        : "";
    $("touchEnter").innerHTML = driving
      ? "↩<small>EXIT</small>"
      : "↪<small>ENTER</small>";
    $("speed").style.display = driving ? "flex" : "none";
    $("vehiclegear").textContent = speed < -0.5 ? "R" : speed > 0.5 ? "D" : "N";
    $("speed").querySelector("strong").textContent = String(
      Math.round(Math.abs(speed) * 3.6),
    ).padStart(3, "0");
    $("district").textContent =
      pos.x > 15 ? "DOWNTOWN" : pos.z > 130 ? "SOUTH COAST" : "PALM BEACH";
    if (checkpoint === 0)
      $("distance").textContent = Number.isFinite(d)
        ? Math.round(d) + " M"
        : "—";
    else if (checkpoint <= 3) {
      $("distance").textContent =
        Math.round(pos.distanceTo(checkpoints[checkpoint - 1])) + " M";
      $("objective").textContent = "◈ Follow the coastal checkpoints";
      $("missiontext").textContent =
        checkpoint === 1
          ? "Cruise north along the ocean."
          : checkpoint === 2
            ? "Head into the heart of downtown."
            : "Finish your detour on the south coast.";
      document.querySelector(".missiontop small").textContent =
        String(checkpoint).padStart(2, "0") + " / 03";
    }
    if (mode === "cycle") updateLight();
  }
  // 20 Hz, and only when the player actually moved or turned: a static map costs nothing.
  if (
    now - mapLastDraw > 50 &&
    (Math.abs(pos.x - mapDrawnX) > 0.35 ||
      Math.abs(pos.z - mapDrawnZ) > 0.35 ||
      Math.abs(mapHeading - mapDrawnHeading) > 0.02)
  ) {
    mapLastDraw = now;
    mapDrawnX = pos.x;
    mapDrawnZ = pos.z;
    mapDrawnHeading = mapHeading;
    drawMap();
  }
  frames++;
  fpsTime += wallDt;
  if (fpsTime > 1) {
    $("fps").textContent = Math.round(frames / fpsTime) + " FPS";
    adaptiveFrameRate(frames / fpsTime);
    fpsTime = 0;
    frames = 0;
  }
  // Shadow pass at half rate on mobile: it re-renders every caster, and one frame of lag is
  // imperceptible for sun shadows while roughly halving that cost.
  if (mobile && renderer.shadowMap.enabled) {
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = ++shadowFrame % 2 === 0;
  }
  renderer.render(scene, camera);
}
drawMap();
updateWeapons(0);
requestAnimationFrame(tick);
addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

canvas.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  resetInput();
  toast("Graphics paused by Android. Restoring…");
});
canvas.addEventListener("webglcontextrestored", () => location.reload());
document.addEventListener("coastlinepause", () => {
  nativePaused = true;
  resetInput();
  stopVoice();
  music.pause();
});
document.addEventListener("coastlineresume", () => {
  nativePaused = false;
  resetInput();
  music.resume();
});
$("musicToggle").textContent = music.enabled ? "♫ Music on" : "♫ Music off";
$("musicVolume").value = music.volume;
function vehicleName(type) {
  return (
    {
      "car-concept": "Coastal coupe",
      motorcycle: "Street bike",
      "suv-luxury": "Luxury SUV",
      "milk-truck": "Utility van",
      delivery: "Delivery van",
      truck: "Pickup",
      sedan: "Sedan",
      "sedan-sports": "City compact",
      "hatchback-sports": "Hatchback",
      taxi: "Taxi",
      "police-car": "Police cruiser",
    }[type] || type
  );
}
function tintCar(root, color) {
  root.traverse((n) => {
    if (!n.isMesh) return;
    const list = Array.isArray(n.material) ? n.material : [n.material];
    n.material = list.map((m) => {
      if (/paint|bodycolor|colour|color1/i.test(m.name)) {
        m = m.clone();
        m.color.setHex(color);
        m.metalness = 0.65;
        m.roughness = 0.23;
      }
      return m;
    });
    if (n.material.length === 1) n.material = n.material[0];
  });
}
async function prepareMaterials() {
  const texloader = new T.TextureLoader(manager);
  const maps = await Promise.all(
    ["asphalt", "asphalt-normal", "concrete", "concrete-normal"].map((n) =>
      texloader.loadAsync("/assets/" + n + ".jpg"),
    ),
  );
  for (let t of maps) {
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  }
  maps[0].colorSpace = maps[2].colorSpace = T.SRGBColorSpace;
  for (let [key, map, norm] of [
    ["#4f5f62", maps[0], maps[1]],
    ["#d4cfbc", maps[2], maps[3]],
    ["#d9cfb7", maps[2], maps[3]],
  ]) {
    let m = mats[key];
    if (!m) continue;
    m.map = map;
    m.normalMap = norm;
    m.color.set("#d1d0c8");
    m.roughness = 0.94;
    m.normalScale.set(0.3, 0.3);
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = "varying vec3 vSurfacePos;\n" + sh.vertexShader;
      sh.vertexShader = sh.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvec4 surface=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\nsurface=instanceMatrix*surface;\n#endif\nvSurfacePos=(modelMatrix*surface).xyz;",
      );
      sh.fragmentShader = "varying vec3 vSurfacePos;\n" + sh.fragmentShader;
      sh.fragmentShader = sh.fragmentShader
        .replace(
          "#include <map_fragment>",
          T.ShaderChunk.map_fragment.replaceAll(
            "vMapUv",
            "(vSurfacePos.xz*.23)",
          ),
        )
        .replace(
          "#include <normal_fragment_maps>",
          T.ShaderChunk.normal_fragment_maps.replaceAll(
            "vNormalMapUv",
            "(vSurfacePos.xz*.23)",
          ),
        );
    };
    m.needsUpdate = true;
  }
  assets["car-concept"].scene.traverse((n) => {
    if (/Interior|Engine|Underside|Pedal|Wipers|Gasket/i.test(n.name))
      n.visible = false;
    if (n.isMesh) {
      let ms = Array.isArray(n.material) ? n.material : [n.material];
      for (let m of ms)
        if (m.transmission > 0) {
          m.transmission = 0;
          m.transparent = true;
          m.opacity = 0.68;
          m.color.set("#263a45");
          m.roughness = 0.12;
          m.metalness = 0.35;
          m.needsUpdate = true;
        }
    }
  });
  for (const name of ["real-city", "real-human", "street-lamp"]) {
    assets[name].scene.traverse(n => {
      if (!n.isMesh) return;
      n.castShadow = true; n.receiveShadow = true;
      for (const m of (Array.isArray(n.material) ? n.material : [n.material])) {
        for (const key of ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap"]) {
          if (m[key]) m[key].anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        }
      }
    });
  }
}
let riderPose = null,
  riderHipOffset = 0.8;
function poseRider(reset = true) {
  if (!reset && riderPose) {
    for (const [bone, q] of riderPose) bone.quaternion.copy(q);
    return;
  }
  mixer.stopAllAction();
  let action = actions["idle_gun"] || actions["idle"];
  action.reset().setEffectiveWeight(1).play();
  mixer.update(0.35);
  action.paused = true;
  player.updateMatrixWorld(true);
  const modelQ = playerModel.getWorldQuaternion(new T.Quaternion());
  function point(name, childName, d) {
    let bone = findBone(playerModel, name),
      child = findBone(playerModel, childName);
    if (!bone || !child) return;
    player.updateMatrixWorld(true);
    let from = child
        .getWorldPosition(new T.Vector3())
        .sub(bone.getWorldPosition(new T.Vector3()))
        .normalize(),
      to = new T.Vector3(...d).normalize().applyQuaternion(modelQ),
      delta = new T.Quaternion().setFromUnitVectors(from, to),
      world = bone.getWorldQuaternion(new T.Quaternion());
    bone.quaternion.copy(
      bone.parent
        .getWorldQuaternion(new T.Quaternion())
        .invert()
        .multiply(delta.multiply(world)),
    );
  }
  for (let side of ["L", "R"]) {
    point("UpperLeg." + side, "LowerLeg." + side, [
      side === "L" ? 0.17 : -0.17,
      -0.15,
      1,
    ]);
    point("LowerLeg." + side, "Foot." + side, [0, -1, -0.15]);
    point("UpperArm." + side, "LowerArm." + side, [
      side === "L" ? 0.3 : -0.3,
      -0.3,
      1,
    ]);
    point("LowerArm." + side, "Wrist." + side, [0, -0.1, 1]);
  }
  riderHipOffset =
    findBone(playerModel, "Hips").getWorldPosition(new T.Vector3()).y -
    player.position.y;
  riderPose = [];
  playerModel.traverse((n) => {
    if (n.isBone) riderPose.push([n, n.quaternion.clone()]);
  });
  activeAction = "";
}
function initWeapons() {
  player.rotation.y = heading;
  const idle = actions.idle_gun;
  idle.reset().play();
  mixer.update(0.05);
  player.updateMatrixWorld(true);
  for (const name of ["blaster-g", "blaster-d"])
    weapons.push(attachWeapon(playerModel, name));
  idle.stop();
  activeAction = "";
  for (let i = 0; i < 10; i++) {
    let g = new T.BufferGeometry();
    g.setAttribute(
      "position",
      new T.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3),
    );
    let l = new T.Line(
      g,
      new T.LineBasicMaterial({
        color: 0xffdca0,
        transparent: true,
        opacity: 0.85,
      }),
    );
    l.frustumCulled = false;
    l.visible = false;
    scene.add(l);
    tracers.push({ line: l, ttl: 0 });
  }
}
function cycleWeapon() {
  if (driving || transition) return;
  weaponIndex = (weaponIndex + 1) % 3;
  reloadTimer = 0;
  for (let i = 0; i < weapons.length; i++)
    weapons[i].visible = i === weaponIndex - 1;
  updateWeapons(0);
}
function reloadWeapon() {
  if (weaponIndex && !reloadTimer && ammo[weaponIndex] < maxAmmo[weaponIndex])
    reloadTimer = 1.3;
}
function fireWeapon() {
  if (driving || transition || document.querySelector(".overlay.open")) return;
  if (!weaponIndex) {
    punch();
    return;
  }
  if (fireTimer > 0 || reloadTimer > 0) return;
  if (ammo[weaponIndex] <= 0) {
    reloadWeapon();
    return;
  }
  ammo[weaponIndex]--;
  sfx.shot(weaponIndex === 1 ? "sidearm" : "rifle");
  fireTimer = weaponIndex === 1 ? 0.34 : 0.13;
  shotAnimTime = 0.16;
  recordCrime(2, 0.45);
  const recoil = actions.upperfire;
  if (recoil) {
    recoil.reset().setEffectiveWeight(0.85).setLoop(T.LoopOnce, 1).play();
    recoil.clampWhenFinished = false;
  }
  if (cameraMode !== "front") heading = Math.atan2(-Math.sin(yaw), -Math.cos(yaw));
  player.rotation.y = heading;
  let origin = new T.Vector3();
  player.updateMatrixWorld(true);
  weapons[weaponIndex - 1].userData.muzzle.getWorldPosition(origin);
  const r = new T.Raycaster();
  if (cameraMode === "front") r.set(origin, new T.Vector3(Math.sin(heading), 0, Math.cos(heading)));
  else r.setFromCamera(new T.Vector2(0, 0), camera);
  let target = r.ray.at(90, new T.Vector3()),
    distance = 90;
  for (let b of obstacles) {
    let hit = r.ray.intersectBox(b, new T.Vector3());
    if (hit && r.ray.origin.distanceTo(hit) < distance) {
      distance = r.ray.origin.distanceTo(hit);
      target.copy(hit);
    }
  }
  for (let npc of [...npcs, ...cops.filter((c) => c.active)]) {
    if (npc.stun > 0) continue;
    const sphere = new T.Sphere(
        npc.g.position.clone().add(new T.Vector3(0, 1, 0)),
        0.8,
      ),
      hit = r.ray.intersectSphere(sphere, new T.Vector3());
    if (hit && hit.distanceTo(r.ray.origin) < distance) {
      target.copy(hit);
      distance = hit.distanceTo(r.ray.origin);
      recordCrime(npc.police ? Math.min(5, wanted + 1) : 2, 0.5);
      if (!npc.police) npc.aggroUntil = elapsed + 28;
      npc.stun = 1.5;
      npc.walk.stop();
      npc.hit.reset().setLoop(T.LoopOnce, 1).play();
    }
  }
  let shot = tracers.find((t) => t.ttl <= 0) || tracers[0],
    a = shot.line.geometry.attributes.position;
  a.setXYZ(0, origin.x, origin.y, origin.z);
  a.setXYZ(1, target.x, target.y, target.z);
  a.needsUpdate = true;
  shot.line.visible = true;
  shot.ttl = 0.065;
  if (ammo[weaponIndex] === 0) reloadWeapon();
}
function updateWeapons(dt) {
  fireTimer = Math.max(0, fireTimer - dt);
  shotAnimTime = Math.max(0, shotAnimTime - dt);
  for (const w of weapons) {
    w.userData.visual.position.z =
      w.userData.restZ - (shotAnimTime / 0.16) * 0.028;
    w.userData.flash.visible = shotAnimTime > 0.11;
  }
  if (reloadTimer > 0) {
    reloadTimer -= dt;
    if (reloadTimer <= 0) ammo[weaponIndex] = maxAmmo[weaponIndex];
  }
  for (let t of tracers) {
    t.ttl -= dt;
    t.line.visible = t.ttl > 0;
  }
  for (let i = 0; i < weapons.length; i++)
    weapons[i].visible = !driving && !transition && i === weaponIndex - 1;
  $("weaponSwitch").textContent = ["✊", "⌖", "▰"][weaponIndex];
  $("weaponSwitch").setAttribute(
    "aria-label",
    "Switch weapon: " + ["Fists", "Pulse sidearm", "Carbine"][weaponIndex],
  );
  $("ammoCount").textContent = weaponIndex
    ? reloadTimer > 0
      ? "Reloading…"
      : ammo[weaponIndex] + " / " + maxAmmo[weaponIndex]
    : "Fists";
  $("crosshair").style.display = weaponIndex && !driving ? "block" : "none";
  $("touchPunch").innerHTML = weaponIndex
    ? "⌖<small>FIRE</small>"
    : "✊<small>PUNCH</small>";
}
function summon(id) {
  if (transition) return;
  if (driving) {
    toast("Exit your current vehicle first");
    return;
  }
  let c = cars[id];
  if (!c || c.response) return;
  let dest = pos.clone();
  let found = false;
  for (let dz of [5, -5, 9, -9]) {
    dest.copy(pos);
    dest.z += dz;
    if (!blocked(dest, 1.5, c)) {
      found = true;
      break;
    }
  }
  if (!found) {
    toast("Move to an open street first");
    return;
  }
  c.traffic = false;
  c.speed = 0;
  c.obj.position.copy(dest);
  c.obj.rotation.y = heading;
  c.angle = heading;
  c.obj.rotation.z = 0;
  nearest = c;
  document
    .querySelectorAll(".overlay")
    .forEach((o) => o.classList.remove("open"));
  enter(c);
}

$("garage").onclick = () => {
  resetInput();
  $("garageList").innerHTML = "";
  for (let c of cars.filter((c) => !c.traffic && !c.response)) {
    let b = document.createElement("button");
    b.textContent = vehicleName(c.type) + (c.bike ? " · BIKE" : "") + " · " + Math.round(c.max * 3.6) + " km/h";
    b.onclick = () => summon(c.id);
    $("garageList").appendChild(b);
  }
  modal("garagemodal");
};

if (new URLSearchParams(location.search).has("test"))
  window.coastlineTest = {
    getState: () => ({
      position: pos.toArray(),
      heading,
      speed,
      vehicle: driving?.type || null,
      bike: !!driving?.bike,
      weapon: weaponIndex,
      ammo: [...ammo],
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      quality: $("quality").value,
      animation: activeAction,
      transition: transition?.kind || null,
      wanted,
      health,
      police: cops.filter((c) => c.active).length,
      policeShots,
      elapsed,
      copData: cops
        .filter((c) => c.active)
        .map((c) => ({
          position: c.g.position.toArray(),
          distance: c.g.position.distanceTo(pos),
          mode: c.mode,
        })),
      mapHeading,
      actorScale: playerModel.scale.toArray(),
      rigScale: playerModel.userData.rig.scale.toArray(),
      treesOnRoad: treeColliders.filter((t) => isRoad(t.x, t.z, 0)).length,
      weaponParent: weapons[0]?.parent?.name,
      weaponHandDistance: weapons[0]
        ?.getWorldPosition(new T.Vector3())
        .distanceTo(weapons[0].parent.getWorldPosition(new T.Vector3())),
      treeColliders: treeColliders.length,
      bikeMeshRotation: driving?.bike
        ? driving.obj.children[0].rotation.y
        : null,
      actorBounds: new T.Box3()
        .setFromObject(playerModel, true)
        .getSize(new T.Vector3())
        .toArray(),
      actorBodyBounds: measureActor(playerModel),
      legQuaternion: findBone(playerModel, "UpperLeg.L").quaternion.toArray(),
      fireAnimating: !!actions.upperfire?.isRunning(),
      citizens: npcs.length,
      characterAsset: "Rocketbox Male Adult 06 / MIT",
      cityAsset: "Poly Haven urban apartments + factory / CC0",
      buildingCount: buildings.length,
      playerVisible: playerModel.visible,
      cameraMode, cameraPosition: camera.position.toArray(), cameraDistance: camera.position.distanceTo(pos),
      responsePolice: cops.filter(c=>c.active&&!c.street).length,
      streetPolice: cops.filter(c=>c.street).length,
      heavyPolice: cops.filter(c=>c.active&&c.heavy).length,
      policeCars: cars.filter(c=>c.police&&c.deployed).length,
      civilianAggro: npcs.filter(n=>n.aggroUntil>elapsed).length,
      civilianShots,
      appearances: npcs.map(n=>({id:n.appearanceId,asset:n.model.userData.assetName,width:n.width,height:n.height})),
      soundStats: sfx.stats,
      renderInfo: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles },
    }),
    summon,
    setCameraMode,
    victim: (i=0) => { const n=npcs[i]; n.g.position.copy(pos).add(new T.Vector3(0,0,1.2)); return n.appearanceId; },
    attackVictim: (i=0) => { npcs[i].aggroUntil=elapsed+30; recordCrime(1); },
    appearanceAudit: () => ({civilians:npcs.map(n=>({id:n.appearanceId,bounds:measureActor(n.model)})),police:cops.slice(0,2).map(n=>measureActor(n.model))}),
    showLineup: () => {
      pos.set(-57,0,112);yaw=0;heading=Math.PI;
      for(let i=0;i<4;i++){const n=npcs[i*5];n.g.position.set(-63+i*2.3,0,106);n.g.rotation.y=Math.PI;n.stun=20;n.m.stopAllAction();n.actions.Idle.reset().play();n.m.update(.1);n.actions.Idle.paused=true;}
      const c=cops[0];c.g.position.set(-52,0,106);c.g.rotation.y=Math.PI;c.stun=20;c.m.stopAllAction();c.actions.Idle.reset().play();c.m.update(.1);c.actions.Idle.paused=true;
    },
    vehicleSpecs: () => cars.map(c=>({id:c.id,type:c.type,max:c.max,hw:c.hw,hl:c.hl,sound:c.soundId,police:!!c.police,dimensions:c.obj.userData.meterDimensions})),
    // Regression hooks for the "cars flying" and "minimap stutters while rotating" reports.
    vehicleBounds: () => cars.map((c) => {
      const b = new T.Box3().setFromObject(c.obj);
      return { id: c.id, type: c.type, minY: +b.min.y.toFixed(3),
        width: +(b.max.x - b.min.x).toFixed(2), length: +(b.max.z - b.min.z).toFixed(2) };
    }),
    mapCost: () => {
      const t = performance.now();
      for (let i = 0; i < 30; i++) drawMap();
      return +((performance.now() - t) / 30).toFixed(3);
    },
    perf: () => ({
      renderScale, pixelRatio: +renderer.getPixelRatio().toFixed(3),
      shadowMap: sun.shadow.mapSize.x, shadows: renderer.shadowMap.enabled,
      calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    }),
    worldInfo: () => ({
      ...WORLD, obstacles: obstacles.length, buildings: buildings.length,
      districts: [...DISTRICTS.entries()],
    }),
    board: (type) => {
      const c = cars.find((v) => v.type === type);
      if (!c || driving || transition) return driving?.type || null;
      pos.set(c.obj.position.x, 0, c.obj.position.z + 2.4);
      enter(c);
      return c.type;
    },
    // Straight-to-the-point camera for screenshots: look at a target from a fixed eye point.
    setFreeCam: (eye, target) => {
      freeCam = { eye: new T.Vector3(...eye), target: new T.Vector3(...target) };
    },
    policeLightHeights: () => cars.filter((c) => c.police).map((c) => {
      const roof = new T.Box3().setFromObject(c.obj).max.y;
      const light = c.strobe[0].getWorldPosition(new T.Vector3()).y;
      return { roof: +roof.toFixed(2), light: +light.toFixed(2) };
    }),
    districtsCenters: () => [...DISTRICTS.entries()].map(([k, kind]) => {
      const [xi, zi] = k.split(":").map(Number);
      return { kind, x: (roadsX[xi] + roadsX[xi + 1]) / 2, z: (roadsZ[zi] + roadsZ[zi + 1]) / 2 };
    }),
    cycleWeapon,
    setWanted: (v) => {
      wanted = v;
      lastCrime = elapsed;
    },
    setPosition: (x, z) => {
      if (!driving && !transition) {
        pos.set(x, 0, z);
      }
    },
    setCamera: (v) => {
      yaw = v;
    },
    collisionAt: (x, z, r = 0.55) => blocked(new T.Vector3(x, 0, z), r),
    treeData: () => treeColliders.map((t) => ({ ...t })),
    vehicleData: () =>
      cars.map((c) => ({
        id: c.id,
        x: c.obj.position.x,
        z: c.obj.position.z,
        hw: c.hw,
        hl: c.hl,
      })),
    houseData: () =>
      obstacles.map((b) => ({ min: b.min.toArray(), max: b.max.toArray() })),
    jump,
  };

// Stable actor construction: animation never targets the normalization wrapper.
function sanitizeClip(source) {
  const c = source.clone();
  c.tracks = c.tracks.filter(
    (t) => t.name.endsWith(".quaternion") && !/^Root\./.test(t.name),
  );
  return c;
}
function makeActor(height, assetName = "real-human", width = 1, depth = 1) {
  const rig = skeletonClone(assets[assetName].scene);
  rig.updateMatrixWorld(true);
  rig.traverse((n) => {
    if (n.isSkinnedMesh) {
      n.skeleton.pose();
      n.boundingBox = null;
    }
  });
  rig.updateMatrixWorld(true);
  const bounds = indexedBounds(rig),
    size = bounds.getSize(new T.Vector3());
  let base = Number.isFinite(size.y) && size.y > 0.01 ? size.y : 1.7;
  rig.scale.multiplyScalar(height / base);
  rig.scale.x *= width; rig.scale.z *= depth;
  rig.updateMatrixWorld(true);
  let floor = indexedBounds(rig).min.y;
  rig.position.y -= floor;
  const visual = new T.Group();
  visual.name = "ActorVisual";
  visual.add(rig);
  visual.userData.assetName = assetName;
  visual.userData.rig = rig;
  visual.userData.rigScale = rig.scale.clone();
  visual.userData.rigPosition = rig.position.clone();
  return visual;
}
function enforceActorScale(model) {
  if (!model) return;
  model.scale.set(1, 1, 1);
  const rig = model.userData.rig;
  if (rig) {
    rig.scale.copy(model.userData.rigScale);
    rig.position.copy(model.userData.rigPosition);
  }
}
function isRoad(x, z, pad = 1.5) {
  return (
    (Math.abs(z) < 372 && roadsX.some((v) => Math.abs(x - v) < 8.5 + pad)) ||
    (x > -95 - pad &&
      x < 304 + pad &&
      roadsZ.some((v) => Math.abs(z - v) < 7.5 + pad))
  );
}
function plantTree(name, x, z, h, angle = 0) {
  if (isRoad(x, z, 1.5) || blocked(new T.Vector3(x, 0, z), 0.65)) return;
  const root = instance(name, x, z, h, angle);
  root.updateMatrixWorld(true);
  let points = [];
  root.traverse((n) => {
    if (!n.isMesh) return;
    const p = n.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let v = new T.Vector3()
        .fromBufferAttribute(p, i)
        .applyMatrix4(n.matrixWorld);
      if (v.y < 0.45) points.push(v);
    }
  });
  let center = points.length
    ? points
        .reduce((a, b) => a.add(b), new T.Vector3())
        .multiplyScalar(1 / points.length)
    : root.position.clone();
  if (isRoad(center.x, center.z, 0.8) || blocked(center, 0.5)) {
    scene.remove(root);
    staticProps.splice(staticProps.indexOf(root), 1);
    return;
  }
  treeColliders.push({
    x: center.x,
    z: center.z,
    r: name === "palm" ? 0.48 : 0.36,
  });
}
function circleRect(x, z, r, center, a, hw, hl) {
  let dx = x - center.x,
    dz = z - center.z,
    c = Math.cos(a),
    s = Math.sin(a),
    lx = c * dx - s * dz,
    lz = s * dx + c * dz;
  return (
    (lx - T.MathUtils.clamp(lx, -hw, hw)) ** 2 +
      (lz - T.MathUtils.clamp(lz, -hl, hl)) ** 2 <
    r * r
  );
}
function rectOverlap(a, aa, aw, al, b, ba, bw, bl) {
  let ax = { x: Math.cos(aa), z: -Math.sin(aa) },
    az = { x: Math.sin(aa), z: Math.cos(aa) },
    bx = { x: Math.cos(ba), z: -Math.sin(ba) },
    bz = { x: Math.sin(ba), z: Math.cos(ba) },
    dx = b.x - a.x,
    dz = b.z - a.z;
  for (let u of [ax, az, bx, bz]) {
    let ra =
        aw * Math.abs(u.x * ax.x + u.z * ax.z) +
        al * Math.abs(u.x * az.x + u.z * az.z),
      rb =
        bw * Math.abs(u.x * bx.x + u.z * bx.z) +
        bl * Math.abs(u.x * bz.x + u.z * bz.z);
    if (Math.abs(dx * u.x + dz * u.z) > ra + rb - 0.015) return false;
  }
  return true;
}
function measureVehicle(c) {
  const saved = c.obj.rotation.clone();
  c.obj.rotation.set(0, 0, 0);
  c.obj.updateMatrixWorld(true);
  let size = new T.Box3().setFromObject(c.obj).getSize(new T.Vector3());
  c.hw = Math.max(0.3, size.x * 0.48);
  c.hl = Math.max(0.8, size.z * 0.48);
  c.obj.rotation.copy(saved);
  c.obj.updateMatrixWorld(true);
}
function findExit(c) {
  const a = c.angle;
  for (const side of [1, -1])
    for (const extra of [0, 1]) {
      let p = c.obj.position.clone();
      p.x += Math.cos(a) * (c.hw + 0.8 + extra) * side;
      p.z -= Math.sin(a) * (c.hw + 0.8 + extra) * side;
      p.y = 0;
      if (!blocked(p, 0.5, c)) return p;
    }
  return null;
}
function playerSeat(c) {
  const p = c.obj.position.clone();
  p.y = c.bike ? 0 : 0;
  return p;
}
function updateTransition(dt) {
  const t = transition;
  if (!t) return;
  t.t += dt;
  const f = Math.min(1, t.t / t.duration),
    ease = f * f * (3 - 2 * f);
  let destination = t.to;
  if (t.kind === "enter") {
    if (f < 0.45) pos.lerpVectors(t.from, t.side, Math.min(1, f / 0.45));
    else pos.lerpVectors(t.side, t.to, (f - 0.45) / 0.55);
  } else pos.lerpVectors(t.from, destination, ease);
  player.position.copy(pos);
  player.position.y += Math.sin(f * Math.PI) * (t.car.bike ? 0.12 : 0.04);
  player.rotation.set(0, t.car.angle, 0);
  player.visible = true;
  playAction("interact");
  if (f < 1) return;
  const c = t.car;
  transition = null;
  if (t.kind === "enter") {
    driving = c;
    speed = 0;
    heading = c.angle;
    pos.copy(c.obj.position);
    document.body.classList.add("driving");
    player.visible = c.bike;
    if (c.bike) poseRider(true);
    $("touchEnter").innerHTML = "↩<small>EXIT</small>";
    if (checkpoint === 0) {
      checkpoint = 1;
      ring.visible = true;
    }
  } else {
    driving = null;
    speed = vy = 0;
    c.speed = 0;
    c.obj.rotation.z = 0;
    pos.copy(t.to);
    pos.y = 0;
    player.position.copy(pos);
    player.rotation.z = 0;
    document.body.classList.remove("driving");
    mixer.stopAllAction();
    for (const a of Object.values(actions)) {
      a.paused = false;
      a.enabled = true;
    }
    activeAction = "";
    playAction("idle");
    $("touchEnter").innerHTML = "↪<small>ENTER</small>";
  }
  resetInput();
}
function attachWeapon(model, name) {
  const hand = findBone(model, "Wrist.R");
  const holder = new T.Group();
  holder.name = "WeaponGrip";
  hand.add(holder);
  holder.position.set(0, 0.035, 0);
  model.updateWorldMatrix(true, true);
  const modelQ = model.getWorldQuaternion(new T.Quaternion()),
    handQ = hand.getWorldQuaternion(new T.Quaternion());
  holder.quaternion.copy(handQ.invert().multiply(modelQ));
  const visual = assets[name].scene.clone(),
    bounds = new T.Box3().setFromObject(visual),
    size = bounds.getSize(new T.Vector3()),
    handScale = hand.getWorldScale(new T.Vector3()).x;
  let length = name === "blaster-g" ? 0.38 : 0.6;
  visual.scale.setScalar(length / Math.max(size.x, size.y, size.z) / handScale);
  visual.position.set(0, 0.04, -0.065);
  holder.add(visual);
  const muzzle = new T.Object3D();
  muzzle.position.set(0, 0.04, (length * 0.62) / handScale);
  holder.add(muzzle);
  let flash = new T.Mesh(
    new T.SphereGeometry(0.055, 6, 4),
    new T.MeshBasicMaterial({ color: 0xffe0a0 }),
  );
  muzzle.add(flash);
  flash.visible = false;
  holder.visible = false;
  holder.userData = { muzzle, flash, visual, restZ: visual.position.z };
  return holder;
}
function actorActions(model, clips) {
  const m = new T.AnimationMixer(model.userData.rig), actions = {};
  for (const name of ["Idle","Walk","Run","Punch_Right","Gun_Shoot","HitRecieve"]) actions[name] = m.clipAction(clips.find(c=>c.name===name));
  mixers.push(m); return {m,actions};
}
function dressCitizen(model, i) {
  model.traverse(n=>{
    if (!n.isMesh) return;
    const list=Array.isArray(n.material)?n.material:[n.material];
    n.material=list.map(old=>{
      const m=old.clone();
      if (/body/i.test(m.name) && m.map?.image) {
        const cv=document.createElement('canvas');cv.width=cv.height=512;const c=cv.getContext('2d');
        c.filter=`hue-rotate(${35+i*47}deg) saturate(${.58+(i%4)*.19}) brightness(${.72+(i%6)*.09})`;
        c.drawImage(m.map.image,0,0,512,512);
        const tex=new T.CanvasTexture(cv);tex.flipY=m.map.flipY;tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=2;m.map=tex;
      }
      return m;
    }); if(n.material.length===1)n.material=n.material[0];
    n.castShadow=true;
  });
}
function spawnCitizen(i) {
  const asset=["npc-male_adult_01","npc-male_adult_10","npc-male_adult_16","npc-female_adult_07"][i%4];
  const width=[.86,.94,1,1.10,1.22,1.30][Math.floor(i/4)], height=1.63+(i%7)*.037;
  const model=makeActor(height,asset,width,.91+(Math.floor(i/4))*.065), g=new T.Group();g.add(model);scene.add(g);dressCitizen(model,i);
  let x=roadsX[i%4]+(i%2?11:-11),z=-240+Math.floor(i/4)*77+(i%4)*9;
  for(let a=0;a<18&&blocked(new T.Vector3(x,0,z),.42);a++)z+=3;
  g.position.set(x,.12,z);
  const {m,actions}=actorActions(model,npcClipSets[asset]);actions.Walk.play();
  npcs.push({g,model,m,actions,walk:actions.Walk,hit:actions.HitRecieve,active:true,stun:0,dir:i%2?1:-1,aggroUntil:0,cooldown:0,mode:'Walk',armed:i%6===2,weapon:null,appearanceId:asset+'-outfit-'+i,width,height});
}
function initPolice() {
  for(let i=0;i<24;i++){
    const model=makeActor(1.76+(i%4)*.025,"npc-police",1+(i%3-1)*.045,1),g=new T.Group();g.add(model);scene.add(g);
    const {m,actions}=actorActions(model,npcClipSets['npc-police']);
    const street=i<4,home=new T.Vector3(roadsX[i%4]+10.5,0,[92,-80,140,-165][i%4]);
    for(let a=0;a<18&&blocked(home,.4);a++)home.z+=3;
    g.position.copy(home);g.visible=street;
    const c={g,model,m,actions,walk:actions.Run,hit:actions.HitRecieve,active:street,street,home,patrolDir:1,police:true,stun:0,cooldown:1,mode:'',heavy:false,weapon:attachWeapon(model,'blaster-g'),heavyWeapon:attachWeapon(model,'blaster-d')};
    cops.push(c);copAction(c,'Idle');
  }
}
function takePlayerDamage(amount, from, knockback=0) {
  if(invulnerable || health<=0)return;
  health=Math.max(0,health-amount);invulnerable=.38;
  if(knockback && !driving && !transition){const d=pos.clone().sub(from);d.y=0;d.normalize();move(pos,d.x*knockback,d.z*knockback,.55);}
  $('damageflash').classList.add('hit');setTimeout(()=>$('damageflash').classList.remove('hit'),110);
}
function updateCitizens(dt) {
  if(dt<=0)return;
  for(const n of npcs){
    n.cooldown-=dt;
    if(n.stun>0){n.stun-=dt;if(n.stun<=0){n.hit.stop();n.mode='';}enforceActorScale(n.model);continue;}
    const angry=n.aggroUntil>elapsed && wanted>=1;
    if(angry){
      const to=pos.clone().sub(n.g.position);to.y=0;const distance=to.length();to.normalize();n.g.rotation.y=Math.atan2(to.x,to.z);
      const armed=n.armed&&wanted>=3;
      if(armed&&!n.weapon)n.weapon=attachWeapon(n.model,'blaster-g');
      if(n.weapon)n.weapon.visible=armed;
      if(distance>55){n.aggroUntil=0;continue;}
      if(distance>(armed?15:1.65)){
        copAction(n,'Run');move(n.g.position,to.x*dt*2.8,to.z*dt*2.8,.36);
      }else if(n.cooldown<=0&&hasSight(n.g.position.clone().add(new T.Vector3(0,1.2,0)),pos.clone().add(new T.Vector3(0,1,0)))){
        n.cooldown=armed?1.65:1.4;n.mode='';copAction(n,armed?'Gun_Shoot':'Punch_Right');
        if(armed){civilianShots++;drawPoliceShot(n);takePlayerDamage(3,n.g.position);}else{sfx.punch();takePlayerDamage(2,n.g.position,.13);}
      }
    }else{
      if(n.weapon)n.weapon.visible=false;
      copAction(n,'Walk');if(!move(n.g.position,0,n.dir*dt*1.1,.34))n.dir*=-1;n.g.rotation.y=n.dir>0?0:Math.PI;if(Math.abs(n.g.position.z)>265)n.dir*=-1;
    }
    enforceActorScale(n.model);
  }
}
function initPoliceCars() {
  for(let i=0;i<7;i++){
    const xi=i%roadsX.length,zi=(i*2+2)%roadsZ.length;
    const obj=instance('police-car',roadsX[xi]+3,roadsZ[zi],1.7,0);
    const c={obj,id:cars.length,type:'police-car',police:true,response:i>=2,patrol:i<2,deployed:i<2,traffic:false,bike:false,speed:0,angle:0,max:47,xi,zi,goal:null,wait:0,strobe:[]};
    const lights=new T.Group();
    // Sit the light bar on the measured roof instead of a hard-coded height, so it stays
    // attached after the model is grounded to y=0.
    obj.updateMatrixWorld(true);
    const roof=new T.Box3().setFromObject(obj).max.y-obj.position.y;
    for(let side of [-1,1]){const light=new T.Mesh(new T.SphereGeometry(.105,6,4),new T.MeshBasicMaterial({color:side<0?0xe03131:0x227bff}));light.position.set(side*.28,roof-.1,-.1);lights.add(light);c.strobe.push(light);}
    obj.add(lights);obj.visible=c.deployed;cars.push(c);
  }
}
function closestIndex(a,v){let best=0;for(let i=1;i<a.length;i++)if(Math.abs(a[i]-v)<Math.abs(a[best]-v))best=i;return best;}
function updatePoliceCars(dt) {
  if(dt<=0)return;
  const desired=[0,0,1,2,3,5][wanted];let responseIndex=0;
  for(const c of cars.filter(c=>c.police)){
    if(c===driving || transition?.car===c)continue;
    const deploy=c.patrol || responseIndex++<desired;
    if(!deploy){c.deployed=false;c.obj.visible=false;c.speed=0;continue;}
    if(!c.deployed){c.xi=closestIndex(roadsX,pos.x);c.zi=T.MathUtils.clamp(closestIndex(roadsZ,pos.z)+(c.id%2?1:-1),0,roadsZ.length-1);const p=new T.Vector3(roadsX[c.xi]+3,.12,roadsZ[c.zi]);if(blocked(p,.5,c,{angle:0,hw:c.hw,hl:c.hl}))continue;c.obj.position.copy(p);c.goal=null;c.deployed=true;}
    c.obj.visible=c.obj.position.distanceTo(pos)<260;
    c.strobe.forEach((l,i)=>l.visible=wanted>=2&&(Math.floor(elapsed*7)+i)%2===0);
    const chase=wanted>=2, distance=c.obj.position.distanceTo(pos);
    if(chase&&distance<14){c.speed=0;c.goal=null;continue;}
    if(!c.goal){
      const tx=chase?closestIndex(roadsX,pos.x):(c.xi+(c.id%2?1:-1)+roadsX.length)%roadsX.length;
      const tz=chase?closestIndex(roadsZ,pos.z):(c.zi+1)%roadsZ.length;
      let xi=c.xi,zi=c.zi;
      if(tx!==xi)xi+=Math.sign(tx-xi);else if(tz!==zi)zi+=Math.sign(tz-zi);else{zi=T.MathUtils.clamp(zi+(pos.z>c.obj.position.z?1:-1),0,roadsZ.length-1);}
      if(xi===c.xi&&zi===c.zi){c.speed=0;continue;}
      c.goal={xi,zi,p:new T.Vector3(roadsX[xi]+3,.12,roadsZ[zi])};
    }
    const to=c.goal.p.clone().sub(c.obj.position);to.y=0;const len=to.length();to.normalize();const angle=Math.atan2(to.x,to.z);
    c.angle=angle;c.obj.rotation.y=angle;
    const velocity=chase?Math.min(19+wanted*2,c.max):7+(c.id%3);
    const step=Math.min(len,velocity*dt);
    const ok=move(c.obj.position,to.x*step,to.z*step,.5,c,{angle,hw:c.hw,hl:c.hl});c.speed=ok?velocity:0;
    if(!ok)c.wait+=dt;else c.wait=0;
    if(c.wait>3){c.goal=null;c.wait=0;}
    if(len<1.2){c.xi=c.goal.xi;c.zi=c.goal.zi;c.goal=null;}
  }
}

function recordCrime(level, heat = 1) {
  lastCrime = elapsed;
  if (level > wanted) {
    wanted = level;
    crimeHeat = 0;
  } else if (wanted) {
    crimeHeat += heat;
    if (crimeHeat > 4) {
      wanted = Math.min(5, wanted + 1);
      crimeHeat = 0;
    }
  }
}
function hasSight(from, to) {
  let d = to.clone().sub(from),
    length = d.length();
  let ray = new T.Ray(from, d.normalize());
  for (const b of obstacles) {
    const hit = ray.intersectBox(b, new T.Vector3());
    if (hit && from.distanceTo(hit) < length) return false;
  }
  return true;
}
function copAction(c, name) {
  if (c.mode === name) return;
  for (const a of Object.values(c.actions)) a.stop();
  const a = c.actions[name];
  a.reset()
    .setLoop(
      name === "Punch_Right" || name === "Gun_Shoot"
        ? T.LoopOnce
        : T.LoopRepeat,
      name === "Punch_Right" || name === "Gun_Shoot" ? 1 : Infinity,
    )
    .play();
  c.mode = name;
}
function updatePolice(dt) {
  if(dt<=0)return;
  invulnerable=Math.max(0,invulnerable-dt);
  const count=[0,0,4,8,12,20][wanted];
  for(let i=0;i<cops.length;i++){
    const c=cops[i],should=c.street || i-4<count;
    if(!should){c.active=false;c.g.visible=false;c.weapon.visible=c.heavyWeapon.visible=false;continue;}
    if(c.street&&wanted<2){
      c.active=true;c.g.visible=c.g.position.distanceTo(pos)<150;c.weapon.visible=c.heavyWeapon.visible=false;c.heavy=false;
      if(c.stun>0){c.stun-=dt;continue;}
      copAction(c,'Walk');if(!move(c.g.position,0,c.patrolDir*dt*.75,.35))c.patrolDir*=-1;if(Math.abs(c.g.position.z-c.home.z)>12)c.patrolDir*=-1;c.g.rotation.y=c.patrolDir>0?0:Math.PI;continue;
    }
    if(!c.active){
      if(elapsed-lastCrime>18)continue;
      let placed=false;
      for(let a=0;a<40;a++){
        const angle=i*2.3+a*.8;let p=pos.clone().add(new T.Vector3(Math.sin(angle)*(17+a*.4),0,Math.cos(angle)*(17+a*.4)));p.y=0;
        const car=cars.filter(v=>v.police&&v.deployed&&v.obj.position.distanceTo(pos)<70)[i%Math.max(1,cars.filter(v=>v.police&&v.deployed&&v.obj.position.distanceTo(pos)<70).length)];
        if(car&&a<4)p.copy(car.obj.position).add(new T.Vector3((a%2?1:-1)*2.1,0,Math.floor(a/2)*2.4));
        if(!blocked(p,.4)){c.g.position.copy(p);placed=true;break;}
      }
      if(!placed)continue;c.active=true;c.cooldown=.7;c.mode='';
    }
    const distance=c.g.position.distanceTo(pos);c.g.visible=distance<150;
    if(distance>140&&!c.street){c.active=false;c.g.visible=false;continue;}
    c.cooldown-=dt;c.heavy=wanted===5&&!c.street&&i%2===0;
    const armed=wanted>=3;c.weapon.visible=armed&&!c.heavy;c.heavyWeapon.visible=armed&&c.heavy;
    if(c.stun>0){c.stun-=dt;c.mode='';continue;}
    const to=pos.clone().sub(c.g.position);to.y=0;const dist=to.length();to.normalize();c.g.rotation.y=Math.atan2(to.x,to.z);
    const sight=hasSight(c.g.position.clone().add(new T.Vector3(0,1.3,0)),pos.clone().add(new T.Vector3(0,1.1,0)));
    if(dist>(armed&&sight?13:1.65)){
      copAction(c,'Run');const speed=3.1+wanted*.34;const moved=move(c.g.position,to.x*dt*speed,to.z*dt*speed,.35);if(!moved)move(c.g.position,-to.z*dt*2.3,to.x*dt*2.3,.35);
    }else if(c.cooldown<=0&&sight){
      c.cooldown=armed?(c.heavy?.32:Math.max(.58,1.7-wanted*.2)):1.05;c.mode='';copAction(c,armed?'Gun_Shoot':'Punch_Right');
      if(armed){policeShots++;drawPoliceShot(c);}else sfx.punch();
      if(!armed||dist<38)takePlayerDamage(armed?(c.heavy?11:3+wanted):5,c.g.position,armed?0:.45);
    }else if(c.cooldown<.35)copAction(c,'Idle');
    enforceActorScale(c.model);
  }
  if(wanted&&elapsed-lastCrime>25&&!cops.some(c=>c.active&&wanted>=2&&c.g.position.distanceTo(pos)<35&&hasSight(c.g.position.clone().add(new T.Vector3(0,1,0)),pos.clone().add(new T.Vector3(0,1,0))))){
    crimeHeat-=dt*.15;if(crimeHeat< -2){wanted--;crimeHeat=0;lastCrime=elapsed-18;}
  }
  if(health<=0)respawnPlayer();
}

function drawPoliceShot(c) {
  let shot = tracers.find((t) => t.ttl <= 0) || tracers[0],
    p = c.g.position.clone().add(new T.Vector3(0, 1.2, 0)),
    a = shot.line.geometry.attributes.position;
  a.setXYZ(0, p.x, p.y, p.z);
  a.setXYZ(1, pos.x, pos.y + 1, pos.z);
  a.needsUpdate = true;
  shot.ttl = 0.07;
  sfx.shot(c.heavy ? "heavy" : "sidearm", c.g.position.distanceTo(pos));
  shot.line.visible = true;
}
function respawnPlayer(reason = "Busted · Back at Palm Beach") {
  if (driving) {
    driving.speed = 0;
    driving.obj.rotation.z = 0;
  }
  if (transition) transition.car.speed = 0;
  transition = null;
  driving = null;
  document.body.classList.remove("driving");
  player.visible = true;
  pos.set(-57, 0, 76);
  player.position.copy(pos);
  speed = vy = 0;
  health = 100;
  wanted = crimeHeat = 0;
  invulnerable = 4;
  mixer.stopAllAction();
  activeAction = "";
  playAction("idle");
  resetInput();
  toast(reason);
}
function updateHud() {
  $("wanted").textContent = "★".repeat(wanted) + "☆".repeat(5 - wanted);
  $("wanted").style.opacity = wanted ? "1" : ".45";
  $("playerhealth").style.width = health + "%";
  $("wanted").setAttribute("aria-label", "Wanted level " + wanted);
}

function findBone(model, name) {
  let found = null,
    key = name.replace(/[^a-z0-9]/gi, "").toLowerCase();
  model.traverse((n) => {
    if (n.isBone && n.name.replace(/[^a-z0-9]/gi, "").toLowerCase() === key)
      found = n;
  });
  return found;
}

function indexedBounds(model) {
  const out = new T.Box3();
  model.updateWorldMatrix(true, true);
  model.traverse((n) => {
    if (!n.isSkinnedMesh) return;
    const p = n.geometry.attributes.position,
      ix = n.geometry.index,
      used = ix
        ? new Set(Array.from(ix.array))
        : Array.from({ length: p.count }, (_, i) => i);
    for (const i of used) {
      let v = n
        .getVertexPosition(i, new T.Vector3())
        .applyMatrix4(n.matrixWorld);
      out.expandByPoint(v);
    }
  });
  return out;
}
function measureActor(model) {
  let b = indexedBounds(model);
  return { height: b.max.y - b.min.y, minY: b.min.y, maxY: b.max.y };
}
// Mocap locomotion from Rocketbox; combat overlays authored for this exact biped.
function buildHumanClips(assetName = "real-human") {
  const source = assets[assetName].animations;
  const clips = ["Idle", "Walk", "Run"].map(name => sanitizeClip(source.find(c => c.name === name)));
  const rig = skeletonClone(assets[assetName].scene);
  const temp = new T.AnimationMixer(rig);
  temp.clipAction(source.find(c => c.name === "Idle")).play(); temp.update(.05);
  rig.updateMatrixWorld(true);
  const bones = [], base = new Map();
  rig.traverse(b => { if (b.isBone) { bones.push(b); base.set(b.name, b.quaternion.clone()); } });
  function point(name, childName, vector) {
    const b = findBone(rig, name), child = findBone(rig, childName);
    if (!b || !child) return;
    rig.updateMatrixWorld(true);
    const from = child.getWorldPosition(new T.Vector3()).sub(b.getWorldPosition(new T.Vector3())).normalize();
    const delta = new T.Quaternion().setFromUnitVectors(from, new T.Vector3(...vector).normalize());
    const world = b.getWorldQuaternion(new T.Quaternion());
    b.quaternion.copy(b.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(delta.multiply(world)));
  }
  function aim(recoil = 0) {
    point("UpperArmR", "LowerArmR", [-.17, -.18 + recoil, 1]);
    point("LowerArmR", "WristR", [.05, .12 + recoil, 1]);
    point("UpperArmL", "LowerArmL", [.36, -.23, 1]);
    point("LowerArmL", "WristL", [-.45, .17, 1]);
  }
  function make(name, times, pose) {
    const values = new Map(bones.map(b => [b.name, []]));
    times.forEach((time, i) => {
      bones.forEach(b => b.quaternion.copy(base.get(b.name)));
      pose(time, i);
      bones.forEach(b => values.get(b.name).push(...b.quaternion.toArray()));
    });
    const tracks = bones.map(b => new T.QuaternionKeyframeTrack(b.name + ".quaternion", times, values.get(b.name)));
    const clip = new T.AnimationClip(name, times[times.length - 1], tracks);
    clips.push(clip); return clip;
  }
  const idleGun = make("Idle_Gun", [0, 1], () => aim());
  make("Gun_Shoot", [0, .065, .15, .30], (_, i) => aim(i === 1 ? .28 : 0));
  make("Punch_Right", [0, .14, .28, .47, .65], (_, i) => {
    const extend = [0, .15, 1, .45, 0][i];
    point("UpperArmR", "LowerArmR", [-.28, -.45 + extend * .47, .3 + extend]);
    point("LowerArmR", "WristR", [0, .85 * (1 - extend), .25 + extend]);
    point("UpperArmL", "LowerArmL", [.35, -.35, .4]);
    point("LowerArmL", "WristL", [0, .8, .35]);
  });
  make("P_Jump", [0, .18, .40, .70, .90], (_, i) => {
    const k = [0, .6, 1, .4, 0][i];
    for (const side of ["L", "R"]) {
      point("UpperLeg" + side, "LowerLeg" + side, [side === "L" ? .1 : -.1, -1, .6 * k]);
      point("LowerLeg" + side, "Foot" + side, [0, -1, -.7 * k]);
      point("UpperArm" + side, "LowerArm" + side, [side === "L" ? .25 : -.25, -.4, .2 + .7 * k]);
    }
  });
  make("Interact", [0, .3, .6, 1.1], (_, i) => {
    const k = [0, .8, 1, 0][i];
    point("UpperArmR", "LowerArmR", [-.15, -.7 + k * .5, k]);
    point("LowerArmR", "WristR", [0, -.4, .3 + k]);
  });
  make("HitRecieve", [0, .12, .35, .55], (_, i) => {
    const chest = findBone(rig, "Chest");
    if (chest) chest.rotateX([0, -.2, .08, 0][i]);
  });
  const runShoot = clips.find(c => c.name === "Run").clone(); runShoot.name = "Run_Shoot"; clips.push(runShoot);
  return clips;
}

function setCameraMode(mode) {
  if (!["first","third","front"].includes(mode)) return;
  cameraMode=mode;camera.near=mode==="first"?.08:.2;camera.updateProjectionMatrix();
  if(driving)driving.obj.visible=mode!=="first";
  $("cameraMode").value=mode;
  $("cameraCycle").textContent={first:"Ⅰ",third:"Ⅲ",front:"Ⅱ"}[mode];
  $("cameraCycle").setAttribute("aria-label","Camera: "+mode+" person. Tap to cycle");
}
$("cameraCycle").onclick=()=>setCameraMode({third:"first",first:"front",front:"third"}[cameraMode]);
$("cameraMode").onchange=e=>setCameraMode(e.target.value);
addEventListener("keydown",e=>{if(e.code==="KeyV"&&!/INPUT|SELECT/.test(document.activeElement.tagName))$("cameraCycle").click();});
$("sfxVolume").value=sfx.volume;
$("sfxVolume").oninput=e=>sfx.volume=Number(e.target.value);

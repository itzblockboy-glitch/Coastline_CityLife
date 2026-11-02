# Coastline v1.7 — weapons, vehicle physics, car damage, player health

Scope: the driving-feel request ("add some good physics"), a much larger weapon roster plus a
knife, car damage, player health/death, and civilians who hit back.

Built artifact: `dist/Coastline-CityLife-v1.7-game.apk` (versionCode 8 / versionName 1.7.0).

---

## 1. What shipped

| Area | Detail |
|---|---|
| Vehicle physics | Rate-limited, speed-sensitive steering; free velocity vector pulled to the nose by a grip budget (slide/skid above the limit); spring pitch/roll (dive, squat, lean); road rumble; airborne hops with landing impact; per-car `vx/vz`, `pitch/roll`, `lift`, `steer` state |
| Car damage | Per-car `hp`. Impacts, kerbs, landings, bullets and grenades subtract. Smoke < 45 %, power loss < 30 %, wrecked at 0 (burns, cannot drive, stays in the world) |
| Weapons | 7: fists, sidearm, carbine, **knife**, SMG, shotgun, grenade. One `WEAPON_DEFS` table drives damage, rate, spread, pellets, reach, ammo. Grenades bounce and explode with falloff |
| Melee | Rebuilt two-handed alternating combo (`Punch_Left`/`Punch_Right`, chest+hip twist, guard arm) and a dedicated `Knife_Slash`. Fists are melee, so they never consume ammo |
| Player life | 100 hp, hit flash, camera shake, 4 s respawn invulnerability, death fall, cause-of-death message, death counter, ammo refill on respawn |
| Retaliation | A punched civilian turns and hits back immediately (no wanted level required); armed civilians shoot at 3+ stars; police punches deal real damage |
| Render loop | A thrown frame error no longer kills the loop — it is recorded and rendering continues (this was freezing the world while the HUD still looked alive) |
| Facing | Correction now comes from the authoring convention (a pure 180° root rotation = model authored nose -Z) rather than a cabin-position guess, which had started flipping the truck and the coupe |

Honest note on the punch: the user asked for "the very first version" punch animation back. No such
clip exists in any shipped source — the bundled rigs only carry Idle/Walk/Run/Sit, and the original
first-version punch was procedural, not mocap. The current punch is a *rebuilt* two-handed combo
built to look closer to what was asked for; it is not the old animation restored verbatim.

## 2. Verification

`Verify game build` runs the headless smoke test: **23/23 checks pass**, `errors: []`, no frame
errors. Highlights from the committed `src/coastline/smoke-results.json`:

- taxi drives forward `forwardFraction 1.0` (7.98 m along the nose in 1.2 simulated seconds) and
  "steer right" decreases heading by `-0.986 rad`;
- sedan physics probe: `headingDelta -0.977`, `pitch 0.025`, `roll -0.257` — suspension is visibly
  working, and `wedged: false` proves the car was not simply stuck;
- knife strike takes an NPC from `hp 100 → 66` and sets `aggro/stunned`;
- punching an NPC costs the player health (`100 → 98`) with no wanted level;
- carbine/SMG/shotgun each spend exactly 1 round per shot;
- a car goes `hp 100 → 45` then to `0` and `wrecked: true`;
- the player dies and respawns at `health 100` with `deaths: 1`;
- only the taxi is rotated (`3.14159`); every other car is exactly `0`;
- 0.027 ms minimap redraw, 1024 px shadow map, pixel ratio 1.0 on mobile.

Screenshot ground truth (committed): `src/coastline/screenshots/orient-taxi.png`,
`orient-sedan-control.png`, `orient-truck.png`, `orient-coupe.png` — each shot from 7 m ahead of the
car along its own travel direction, so a backwards mesh would show its boot instead of its bonnet.

## 3. Test-harness lessons (kept so they are not relearned)

- The harness originally drove with `page.waitForTimeout`: CI renders through SwiftShader at a few
  fps, so 1.2 s of wall clock was only a couple of physics frames and every car looked stuck. Probes
  now wait on the **simulation** clock (`elapsed`).
- Traffic cars spawn nose-first into kerbs, so `aimOpenRoad()` scans 16 directions with the car's own
  collider and faces the clearest lane before a drive probe.
- A failed run now always writes `smoke-results.json` including the stack, because the CI log host
  (`results-receiver.actions.githubusercontent.com`) intermittently returns `EOF` and the artifacts
  are not downloadable from every environment.

---

# Coastline v1.6 — game detection, vehicle fixes, open world, mobile performance

Scope: the Game Booster/Game Turbo detection problem, the flying-car and taxi-control bugs, the
stuttering rotating minimap, mobile heat/lag, and opening the map up with construction sites and
factories.

Built artifact: `dist/Coastline-CityLife-v1.6-game.apk` (versionCode 7 / versionName 1.6.0).

---

## 1. Why the booster still did not detect the game

`android:appCategory="game"` alone was not enough, and one of the two markers added in the previous
round is not read by the platform at all.

| Marker | Status | Who reads it |
|---|---|---|
| `android:appCategory="game"` | **kept** | `ApplicationInfo.category == CATEGORY_GAME`; GameManager; OEM boosters |
| `android:isGame="true"` | **added this round** | `ApplicationInfo.FLAG_IS_GAME` — the attribute AOSP's own game classifier checks first |
| `<category android:name="android.intent.category.GAME"/>` | **kept, now documented as cosmetic** | Not read by AOSP for game classification |
| `android.game_mode_config` meta-data | **added this round** | AOSP `GameManagerService`, Android 13+ (API 33) |

The `android.intent.category.GAME` category added last round is *not* a platform-recognised game
signal — AOSP's game services resolve games from `ApplicationInfo`, i.e. `isGame`/`appCategory`, not
from activity intent categories. It is harmless (the launcher matches `MAIN`+`LAUNCHER`), so it stays,
but it was doing no work. `android:isGame="true"` is the missing piece.

### Game Mode (the part that makes boosters treat it as a real game)

Android 13+ exposes a Game Mode API, and the platform only honours it for apps that declare the
config. `AndroidManifest.xml` now carries, **inside `<application>`** (it is silently ignored anywhere
else):

```xml
<application android:appCategory="game" android:isGame="true" ...>
  <meta-data android:name="android.game_mode_config" android:resource="@xml/game_mode_config"/>
```

with `android/res/xml/game_mode_config.xml`:

```xml
<game-mode-config
    android:supportsPerformanceGameMode="true"
    android:supportsBatteryGameMode="true"
    android:allowGameDownscaling="true"
    android:allowGameAngleDriver="true"
    android:allowGameFpsOverride="true" />
```

`MainActivity` reads `GameManager.getGameMode()` reflectively (so the same source still compiles
against an API 30 stub jar) and passes the value to the page; **battery game mode makes the game
choose Low graphics by itself**, and performance mode chooses High. Nothing is assumed: if the
platform returns `GAME_MODE_UNSUPPORTED`, the previous behaviour is unchanged.

### What this does and does not guarantee

- Verified in the built APK (see §6): `application-isGame`, `appCategory=0`, and the
  `game_mode_config` meta-data with its compiled `res/xml/game_mode_config.xml` are all present.
- Some OEM boosters additionally keep their own server-side allowlists and may still need a shipped
  update (or a Play listing) before a new package is treated as a game. Manifest markers cannot
  override that, and no client-side change can.
- Samsung's Game Launcher in particular keys off its own catalog for Play-installed apps; for
  sideloaded APKs the manifest markers are what it has to go on.

---

## 2. Cars flying / floating

Cause found in the assets, not guessed: `instance()` never grounded pre-normalised vehicles, and
`police-car.glb`'s pivot sits **0.80 m above its wheels**.

| Model | min_y before | after |
|---|---|---|
| police-car | **+0.8008** | 0.0000 |
| car-concept | **-0.3154** (sunk) | 0.0000 |
| truck / sedan / suv / delivery / taxi / milk-truck / hatchback / sedan-sports | ~0 | 0.0000 |

Every vehicle is now grounded from its own measured bounding box, and the police light bar is placed
on the measured roof height instead of a hard-coded `1.7` (which is why it was left behind in the air
once the car dropped). `tools/inspect-vehicles.mjs` re-checks both properties against the GLBs and
`smoke-test.cjs` asserts `minY` for all 20 spawned cars in the running game.

## 3. Taxi: reversed throttle and mirrored steering

Not a controls bug — a model-orientation bug. The taxi GLB is authored **facing -Z** while every
other car faces +Z: its cabin sits *forward* of centre (roof dz `+0.38` vs `-0.42…-0.55` for the
others) and its root nodes carry a 180° Y rotation (`[0,-1,0,~0]`) that the other vehicles do not.

That is exactly the reported symptom: driving forward rendered it backwards, so it *looked* like
reverse, and a right turn visually appeared to swing left. Fixed with a per-model correction
(`VEHICLE_MODEL_FIX`) applied once at spawn, so the mesh, `measureVehicle()` collision box and the
driving code all agree.

Verified in a real browser by pressing the on-screen pedals: throttle displacement is **100 % along
the car's nose** and "steer right" decreases heading.

## 4. Minimap stutter while rotating

`drawMap()` rebuilt the entire static city — 5 road strips, 9 cross streets, 40+ lane dashes, every
obstacle box, every car — with ~80 `fillRect` calls **and wrote a CSS `style.transform` every single
frame**. Rotating the map scales and re-rasterises all of that.

Now: the ground, roads and buildings are pre-rendered **once** into an offscreen canvas and blitted
with a single `drawImage`; the dynamic layer is cars/peers/checkpoint only; the map redraws at 20 Hz
and only when the player actually moved or turned; the compass needle's transform is written only
when the angle changes. Measured cost of a full `drawMap()` in the headless run: **0.03 ms**.

(The minimap was also previously refreshed only inside a checkpoint mission; it is now live, at lower
cost than the old path.)

## 5. Mobile heat and lag

| Change | Before | After |
|---|---|---|
| Device pixel ratio (mobile) | 1.5 | **1.0** (balanced 0.85, low 0.7) |
| Shadow map (mobile) | 2048² | **1024²** |
| Shadow map updates | every frame | **every other frame** on mobile |
| Default frame rate (mobile) | 60 | **30** |
| Triangles rendered (headless, same scene) | 1.91 M | **1.40 M** |

- **Adaptive resolution**: measured FPS below ~72 % of target drops `renderScale` in 10 % steps, then
  disables shadows if still short; it recovers in 5 % steps with a cooldown so it cannot oscillate.
- **Per-frame allocations removed** from the hot path: the engine-audio list (four arrays plus object
  spreads *every frame*), the camera anti-clip ray (a `new Vector3()` per obstacle per frame), and a
  dead vector in the traffic loop. These were the main source of GC hitches.
- Textures get anisotropy so the lower render scale does not look soft at grazing angles.

Honest limits: shadow-caster count is unchanged, and the new city has more geometry than before
(four detailed districts), so the honest claim is *fewer pixels, half the shadow work, far less
garbage per frame* — not a measured on-device thermal result. No physical handset was available to
this environment; the numbers above are from a software-rendered headless Chromium.

## 6. Open world, construction sites, factories

The playable area was walled at `x ≤ 211`, `|z| ≤ 290`. It is now **x −120…305, z ±375** (≈ 2.1 km² ),
with two new road rows/columns, extended pavements, markings, palms and street lamps, and traffic that
wraps at the new city edge instead of the old invisible wall.

Four city blocks are now industrial land, built from batched primitives (one draw call per colour, so
they cost almost nothing at runtime):

- **2 construction sites** — levelled dirt, yellow hoarding, half-finished concrete frame with exposed
  rebar, scaffolding, tower crane (mast, cab, jib, counter-jib, counterweight, cable, hook block),
  stacked timber, pipe stacks and barriers.
- **2 factories** — two sheds with clerestory roofs and loading doors, three chimneys, four storage
  tanks, stacked shipping containers, a pipe rack over the yard.

Plus city-wide detail to stop blocks reading as empty: traffic lights at intersections, benches and
planters along block edges, and rooftop water tanks / AC units on the taller buildings.

### On "grab great 3D city models from Sketchfab"

I did **not** add any Sketchfab assets, and I want to be straight about why rather than pad the
change: Sketchfab and its CDN are not reachable from this environment, so I cannot download, inspect,
convert or licence-check a model. Dropping in an unverified binary asset would be worse than not doing
it — it would ship unknown provenance, unknown scale/orientation, and possibly a non-redistributable
licence into your APK.

The districts above are generated from geometry instead, so they are original, tiny, and
licence-clean. If you want real models, the cheapest path is: download the GLB you want (CC-BY or
CC0), drop it in `public/assets/`, and tell me the filename — the loader, per-model grounding, LOD
batching and credits plumbing already exist, so wiring in a `factory-a.glb` or `apartment-tower.glb`
is a small change. `asset-manifest-v1.5.json` + `public/credits.html` are where the attribution has to
go, and I can fill those in from the model's page.

## 7. Verification

Everything below was produced by CI on a real (headless) Chromium against the built bundle, then
committed back to the branch.

**`smoke-test.cjs` — 12/12 checks, 0 runtime errors**

```
PASS loads without a fatal error
PASS no runtime errors
PASS every vehicle grounded (no floating police cars)   worst minY 0.12 (the instance root)
PASS taxi exists in the fleet
PASS minimap redraw is cheap (<3ms/frame)              0.03 ms
PASS world extends past the old 211 m wall             x -120..305, z +-375
PASS industrial districts registered                   4 blocks
PASS mobile pixel ratio capped at <=1.0                 1.0
PASS shadow map no larger than 1024 on mobile           1024
PASS taxi accelerates forward, not backward            forwardFraction 1.0
PASS steering right turns right (heading decreases)    -0.199 rad
PASS police light bars sit on the roof                 roof 1.68 / light 1.57
```

**`tools/inspect-vehicles.mjs`** — all 20 vehicles grounded to y=0; every model with a known authoring
convention faces +Z.

**`tools/verify-apk-manifest.py`** on the built APK:

```
android:isGame        = 'true'
android:appCategory   = 0            (ApplicationInfo.CATEGORY_GAME)
android:name          = 'android.game_mode_config'   present
res/xml/game_mode_config.xml                         in the APK
PASS
```

Note `appCategory` compiles to the integer `0`, not the string `game`, so grepping the APK for `game`
gives a false negative.

A bug this process caught: an earlier camera refactor left a stale `dir` reference, which threw
*before* `renderer.render()` — the game looked alive but no frame was ever drawn again. The smoke test
now fails on any page error, which is what exposed it. The same class of bug came back in v1.7 as an
undefined `dragF` in the new physics block: speed climbed but the car never moved. The frame loop now
catches and reports the first error instead of dying, and the v1.7 table above records it.

## 8. Install

```
https://github.com/itzblockboy-glitch/Coastline_CityLife/raw/arena/dc2dfb50-coastline-citylife/dist/Coastline-CityLife-v1.7-game.apk
```

- Signed with the same **generated development key** as before (no release keystore exists in the
  repo). It will not update an install signed with your delivery key — uninstall first, or rebuild
  with `ANDROID_KEYSTORE_BASE64` / `COASTLINE_KEYSTORE`.
- `versionCode` is now **8**, so it does install over the previous development-key build.
- Verified here by parsing the packaged manifest and running the game headless; **not** installed on a
  physical device, so on-device booster behaviour and thermal numbers remain unconfirmed.

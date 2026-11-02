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
now fails on any page error, which is what exposed it.

## 8. Install

```
https://github.com/itzblockboy-glitch/Coastline_CityLife/raw/arena/dc2dfb50-coastline-citylife/dist/Coastline-CityLife-v1.6-game.apk
```

- Signed with the same **generated development key** as before (no release keystore exists in the
  repo). It will not update an install signed with your delivery key — uninstall first, or rebuild
  with `ANDROID_KEYSTORE_BASE64` / `COASTLINE_KEYSTORE`.
- `versionCode` is now **7**, so it does install over the previous development-key build.
- Verified here by parsing the packaged manifest and running the game headless; **not** installed on a
  physical device, so on-device booster behaviour and thermal numbers remain unconfirmed.

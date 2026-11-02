# Coastline 1.6 — game detection, open world, mobile performance

Original Three.js/WebGL2 coastal sandbox; signed offline Android APK, optional six-player rooms and WebRTC voice. High graphics is now the default at the user's request. It is more GPU-intensive: use Balanced/Low when needed. RAM capacity alone does not predict performance, and no physical-device FPS/thermal claim is made.

## Run / build

```bash
npm install
npm run bundle
npm start
```

Server binds to `0.0.0.0:3000`. `public/main.js` is readable client code; `public/app.js` is the prebuilt offline bundle. Android: follow `android/bootstrap-tools.sh`, then `npm run build:apk`. Requires JDK/Android build tools; SDK binaries and private signing key are not included. Default output `/home/user/Coastline-CityLife-v1.5.apk`; change for your workspace. Android package `ai.arena.coastline`, version 1.6.0/code 7, min 26/target 35. The manifest declares `android:appCategory="game"` **and** `android:isGame="true"` (the attribute AOSP's own game classifier reads), plus the Android 13+ `android.game_mode_config` meta-data with `res/xml/game_mode_config.xml`. `MainActivity` reads `GameManager.getGameMode()` reflectively and passes it to the page, so battery game mode selects Low graphics. The extra `android.intent.category.GAME` category is harmless but is *not* read by AOSP for classification. Same development signing certificate as delivered v1.4; source rebuilds without that original private key cannot update an installed APK directly.

## What's new

- 24 civilians use **four different Rocketbox base models**, not the player model. Per-civilian outfit/palette, height and stored rig-width/depth variations produce thin-to-chubby bodies. 24 distinct appearance IDs. Police appropriately share a recognizable uniform, with small height/width differences.
- **Separate Sketchfab police character**, body-compatible retargeted locomotion and custom melee/fire clips. 4 street officers patrol sidewalks; responders escalate below.
- Existing generic car classes upgraded from a licensed **Sketchfab passenger car pack**, plus Sketchfab Taxi 2 and police cruisers. Existing licensed Sketchfab motorcycle retained and normalized to 2.22 m length. Sedan/SUV/van/pickup lengths 4.2–5.35 m, player ~1.85 m. Measurement/collision rectangles derive from final assets, not arbitrary global enlargement.
- Each vehicle instance has a different speed and stable procedural engine profile. The two bikes have more clearly different limits (38 and 51 m/s). Sidearm, carbine and heavy police fire have separate sound envelopes; punches have a thud. SFX volume is separate from the music control. These are synthesized sounds, **not recordings of real engines**.
- Camera button / desktop **V** cycles **third → first → front-facing second → third**. Settings also offers a selector. First-person hides the local avatar/current car to avoid interior/head clipping. Front view is cinematic: weapon fire follows the player's facing, not the backward-facing camera.
- High default with 2048px sun shadows. City geometry now uses a bundled offline Meshopt decoder; no CDN/decoder fetch is required.

## Wanted escalation

| Stars | Civilian / police behavior | Response officers | Street officers | Response cars |
|---|---|---:|---:|---:|
| 0 | Civilians walk; street police/cars patrol | 0 | 4 | 0 |
| 1 | The specifically attacked civilian chases and gives light retaliatory punches | 0 | 4, not joining | 0 |
| 2 | Police pursue, punch and knock back the player; no police gunfire | 4 | 4 | 1 |
| 3 | Police use firearms; attacked armed civilians may shoot back | 8 | 4 | 2 |
| 4 | More armed police and faster pressure | 12 | 4 | 3 |
| 5 | Strict response, faster attacks, some heavier automatic weapons | 20 | 4 | 5 |

Two street patrol cars remain in addition to response cars. Cruisers navigate the existing road-intersection grid with collision-aware movement; responders prefer to appear beside nearby deployed cruisers. Attacking a police officer raises at least two stars. Crime heat escalates further. Escape range/sight and stop offending to reduce wanted level. Bystanders are not all magically armed or hostile.

AI is **simple local pursuit**, not production navigation/vehicle tactics. Officers/cars can get stuck; there is no full vehicle physics, roadblock planning, arrest/cuff simulation or synchronized multiplayer combat. Civilian retaliation lasts a limited grace period.

## Preserved controls / features

Joystick walk, drag to look, sprint/jump/punch/fire; rotating minimap. Driving: steering arrows, icon accelerator and brake; continue holding brake at rest to reverse. Slow before exiting. Garage brings the existing fleet to open road; responder cruisers are excluded from garage spawning. Enter/exit and bike mounting retain animation transitions and fixed actor scale. Fists/sidearm/carbine cycle; tap ammo to reload. Music remains original relaxing local Web Audio synthesis. User-provided app icon retained.

## Network / offline

Solo assets, music, sound effects and decoder are bundled for offline play. Multiplayer/voice needs the same reachable HTTPS backend in Play with friends → Game server; no permanent public service is embedded. Voice requires microphone permission and can require TURN on restrictive cellular networks. Six-person mesh uses more data than two-person voice. Rooms are not authentication; use with trusted friends. Peer connections may expose network addresses. Voice is not recorded.

Client-led transform/vehicle replication is not authoritative, cheat-resistant, or synchronized NPC/police/combat simulation. No persistent accounts or world saves.

## Tests

`npm run inspect:vehicles` (`tools/inspect-vehicles.mjs`) loads every vehicle GLB through three's loader and asserts each is grounded to y=0 and faces +Z — this is what caught the floating police car (+0.80 m) and the taxi being authored facing -Z.

`npm run test:smoke` (`smoke-test.cjs`) runs the real game in headless Chromium and asserts no page errors, grounded vehicles, taxi throttle direction via the on-screen pedals, police light-bar placement, minimap redraw cost, world bounds, districts and mobile pixel/shadow caps; it also captures district screenshots. `.github/workflows/verify.yml` runs it on every push.

`npm run test:citylife` (`v15-test.cjs`) checks keyboard/joystick directions, changing walk poses, punch/jump/fire, car entry/exit, 3 bike cycles and fixed scale, collision predicates, one-star attacked-civilian retaliation, two-star police melee/no firearm shots, three-star firearm shots, five-star officer/heavy-weapon/car counts, 24 appearance IDs/4 models/body widths, distinct speed/sound profiles, first/front/third cameras, actor bounds and errors/failed requests.

`mobile-v15-test.cjs` checks APK-staged file loading with zero external requests, touch driving/brake/music, two peers and synthetic bidirectional microphone tracks. Run `npm run build:apk` first to stage packaged assets. The network-only phase suppresses WebGL draw calls and throttles frames to fit the software-GPU runner; offline High rendering and the full gameplay regression are tested without that suppression. This does not constitute a simultaneous rendered two-device performance benchmark. `v15-results.json` and `mobile-v15-results.json` record results. Browser tests are not physical Android installation, microphone routing, long-session, battery or thermal testing.

## Sources / licenses

`asset-manifest-v1.5.json`, `public/credits.html` and `public/licenses/` list original authors, URLs, modifications and hashes. Sketchfab assets are **CC BY 4.0**, downloaded through a public GLB mirror and checked against original Sketchfab pages. No NC-only Charger is bundled. Four additional Rocketbox civilians are MIT-licensed. City/facades/street lamps remain Poly Haven CC0; original licensed palm and fictional blasters retained.

Optimized GLBs are directly editable in Blender. Optional actor/fleet rebuild scripts: `fetch-v15-assets.py`, `build-v15-actors.py`, `build-v15-vehicles.py`, `optimize-v15.mjs`. Fetch requires Python requests; conversion requires Blender. `npc-source-files-v1.5.json` records avatar upstream paths. Fetch preprocesses empty mirrored mesh bindings to avoid a Blender importer error. Bone-direction retargeting preserves target rest basis; vehicle fitting is meter-based and removes loose vertices before measuring. Original raw downloads are not included in the source archive. Older v1.4 environment build scripts describe the previous environment pipeline. Do not re-run applied patch scripts.

This remains an **original compact mobile city**, not GTA V/VI graphics, a Rockstar map, a branded 40-vehicle collection, or a production game engine.

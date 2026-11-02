# Coastline 1.5 · City life & police update

## Downloads

- **Coastline-CityLife-v1.5.apk** — Android 8.0+, signed update, version 1.5.0/code 6.
- **Coastline-Source-v1.5.zip** — full Three.js source, optimized GLBs, Android wrapper, build scripts, licenses and test reports.

## Your requested changes

### Civilian variety

All 24 civilians now use one of **four additional character models**, not your player model. Their outfits/palettes, height, width and depth vary, with thin and chubbier combinations. Police use a **separate Sketchfab uniformed character**, with small height/build differences. Uniformed officers deliberately remain recognizable as police rather than having 24 unrelated outfits.

### Crime and police

| Wanted | Response |
|---|---|
| **1 star** | The civilian you attacked gives light retaliatory punches. Other bystanders do not all attack. No dispatched police yet. |
| **2 stars** | Four responding officers join four street officers. They punch/knock back the player; no police gunfire. |
| **3 stars** | Eight responding officers plus street police; firearms. Attacked armed civilians can also shoot back. |
| **4 stars** | Twelve responding officers plus street police; stronger pressure. |
| **5 stars** | Up to twenty responders plus four street officers, faster attacks, and ten heavier-weapon officers at full strength. |

Two street patrol cars plus up to five response cruisers are available. Police cars use the road grid with collision-aware movement, flashing light effects and a siren. Responders prefer nearby deployed cruisers as spawn points. Spawn counts can be lower if there is no collision-free space. The five-star regression observed **24 officers, 10 heavy-weapon officers and 6 deployed cruisers**.

Assaulting police raises at least two stars. Stop offending and escape sight/range to reduce wanted level. Civilian retaliation has a time limit. This is simple game AI: officers/cars can get stuck, and it is not GTA's production navigation, driving tactics or arrest system.

### Cars, sizes and sounds

The existing generic car fleet is replaced with **licensed Sketchfab passenger-car models**, plus a Sketchfab taxi and police cruiser. The existing licensed Sketchfab motorcycle is retained. Generic models are not official branded vehicle replicas.

Vehicles now use real-world meter dimensions: cars approximately **4.2–5.35 m long**, bikes **2.22 m long**, with your player around **1.85 m tall**. Cars are not all scaled to an arbitrary height; collision footprints are measured from the final assets. This is proportional calibration, not an exact copy of GTA V's scaling.

Every vehicle instance has a distinct top-speed and synthesized engine signature. The two bikes have clearly different limits (about 137 and 184 km/h). Sidearm, carbine, heavy police fire and punches have different sound envelopes. **Sounds are procedural, not recordings of actual engines.** Adjust the new **Sound effects** volume separately from music.

### Three camera modes

Tap the top **Ⅲ / Ⅰ / Ⅱ** camera button, or press **V** on desktop:

1. **Ⅲ Third person:** normal follow view.
2. **Ⅰ First person:** eye-height view; local avatar/car is hidden to avoid clipping.
3. **Ⅱ Second person:** your selected front-facing camera, looking back at the player.

You can also choose a mode in Settings. Front view is cinematic; firing follows the player's facing rather than the backward-facing camera.

### High graphics default

High is now the default, with sharper sun shadows. Keep 30 FPS selected initially. **High graphics and five-star crowds cost more GPU time.** Switch to Balanced or Low if your phone heats up or slows down. Six or eight GB of RAM does not guarantee a particular frame rate.

## Install

Install **Coastline-CityLife-v1.5.apk**, allowing this download source if Android prompts. It has the same package and signing certificate as v1.4, with a newer version code, so it is intended as an update. It is development-signed, not Play Store certified. Update Android System WebView if necessary; the game requires WebGL2.

Solo play, models, geometry decoder, music and SFX are bundled and work offline. Multiplayer/voice still need a shared reachable HTTPS backend and microphone permission. No permanent public server is included. Some cellular networks need TURN for voice. Police, NPCs and combat remain local rather than synchronized multiplayer combat.

## Verification / limits

Browser regression passed: joystick/keyboard directions, walk/punch/jump/fire, car entry/exit, three bike cycles with fixed scale, collision checks, the new wanted escalation, appearance/body variation, unique speed/sound profiles, all camera modes and actor heights. No JS errors or failed asset HTTP requests were reported.

Packaged High-graphics offline loading passed with **zero external requests**, as did touch driving/brake/music. Two-peer room and bidirectional synthetic microphone tracks passed. The network-only test throttles rendering/suppresses draw calls to fit the software-GPU runner; it is not a simultaneous rendered multiplayer performance benchmark.

**Not physically tested on an Android phone:** installation, real microphone routing, device FPS, battery, heat and extended play still require testing. This is an original compact mobile city—not a GTA V/VI map or GTA-level graphics.

## Source / licenses

Unzip the source, run `npm install`, `npm run bundle`, then `npm start`; open port 3000. APK build instructions are in `README.md`. SDK binaries, raw upstream downloads and private signing key are excluded. Optimized GLBs are included for editing in Blender.

See `asset-manifest-v1.5.json`, `public/credits.html` and `public/licenses/` for original Sketchfab authors, CC BY 4.0 attribution, Microsoft Rocketbox MIT notices, source URLs, modifications and hashes. Noncommercial-only assets were not included. Your supplied app icon is retained.

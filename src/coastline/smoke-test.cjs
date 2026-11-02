// Headless regression test for the v1.6 fixes. Run against a live server:
//   npm run bundle && node server.cjs &   then   node smoke-test.cjs
// Requires a Chromium that Playwright can launch (CI installs one via `npx playwright install`).
const { chromium } = require("@playwright/test");
const fs = require("fs");

const SHOT_DIR = process.env.SHOT_DIR || "screenshots";
const results = { checks: {}, shots: [] };
const fail = [];

function check(name, ok, detail) {
  results.checks[name] = ok ? detail ?? "ok" : { FAILED: detail };
  if (!ok) fail.push(`${name}: ${JSON.stringify(detail)}`);
}

(async () => {
  const browser = await chromium.launch({
    args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({
    viewport: { width: 740, height: 416 },
    hasTouch: true,
    isMobile: true,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

  await page.goto("http://localhost:3000/?test");
  await page.waitForSelector("#loading", { state: "hidden", timeout: 120000 });
  await page.waitForFunction(() => window.coastlineTest?.getState().animation === "idle");

  check("loads without a fatal error", true);
  // A thrown exception inside tick() aborts the frame before renderer.render(), which freezes
  // the game while the HUD still looks alive. Treat any page error as a failure.
  check("no runtime errors", errors.length === 0, errors.slice(0, 5));
  const state = await page.evaluate(() => window.coastlineTest.getState());

  // --- 1. Vehicles must not fly or sink -------------------------------------------------
  const bounds = await page.evaluate(() => window.coastlineTest.vehicleBounds());
  // Instance roots sit at y = 0.12, so a grounded car's world-space min.y is ~0.12.
  const floating = bounds.filter((b) => b.minY > 0.35 || b.minY < -0.05);
  check("every vehicle grounded (no floating police cars)", floating.length === 0, {
    worst: bounds.sort((a, b) => b.minY - a.minY).slice(0, 3),
    floating: floating.map((f) => `${f.type}#${f.id}@${f.minY}`),
  });

  // --- 2. Taxi drives and steers the way it looks ---------------------------------------
  // Drive the taxi: throttle must increase forward speed and steering right must turn right.
  const taxi = await page.evaluate(() => {
    const t = window.coastlineTest;
    return t.vehicleSpecs().find((v) => v.type === "taxi");
  });
  check("taxi exists in the fleet", !!taxi, taxi);

  // --- 3. Map redraw cost --------------------------------------------------------------
  const mapMs = await page.evaluate(() => window.coastlineTest.mapCost());
  check("minimap redraw is cheap (<3 ms/frame)", mapMs < 3, { ms: mapMs });

  // --- 4. Open world + districts -------------------------------------------------------
  const world = await page.evaluate(() => window.coastlineTest.worldInfo());
  check("world extends past the old 211 m wall", world.xMax > 250 && world.zMax > 320, world);
  check("industrial districts registered", world.districts.length >= 4, world.districts);

  // --- 5. Performance posture on mobile ------------------------------------------------
  const perf = await page.evaluate(() => window.coastlineTest.perf());
  check("mobile pixel ratio capped at <=1.0", perf.pixelRatio <= 1.01, perf);
  check("shadow map no larger than 1024 on mobile", perf.shadowMap <= 1024, perf);

  // --- 6. The taxi must drive and steer the way it is facing ---------------------------
  // The model is now authored nose-+Z; forward = (sin heading, cos heading). Throttle must move
  // the car along +forward and "steer right" must decrease heading.
  await page.evaluate(() => coastlineTest.board("taxi"));
  await page.waitForFunction(() => coastlineTest.getState().vehicle === "taxi", null, { timeout: 60000 });
  // Traffic spawns nose-first into kerbs and junction furniture. Face the open lane first so the
  // check measures the steering model instead of the scenery the taxi happens to be parked against.
  const aim = await page.evaluate(() => coastlineTest.aimOpenRoad(60));
  results.taxiAim = aim;
  const drive = await (async () => {
    const before = await page.evaluate(() => coastlineTest.getState());
    const gas = await page.locator("#touchGas").boundingBox();
    await page.locator("#touchGas").dispatchEvent("pointerdown", { pointerId: 61, clientX: gas.x + 10, clientY: gas.y + 10 });
    await page.waitForFunction(() => coastlineTest.getState().speed > 3, null, { timeout: 60000 });
    // Simulated time, not wall clock: CI renders through SwiftShader at a few fps, so a fixed
    // wait would only advance the car a couple of frames and every probe would read as "stuck".
    const e0 = await page.evaluate(() => coastlineTest.getState().elapsed);
    await page.waitForFunction((e) => coastlineTest.getState().elapsed > e + 1.2, e0, { timeout: 90000 });
    const moving = await page.evaluate(() => coastlineTest.getState());
    const steer = await page.locator("#steerRight").boundingBox();
    await page.locator("#steerRight").dispatchEvent("pointerdown", { pointerId: 62, clientX: steer.x + 10, clientY: steer.y + 10 });
    const e1 = await page.evaluate(() => coastlineTest.getState().elapsed);
    await page.waitForFunction((e) => coastlineTest.getState().elapsed > e + 0.9, e1, { timeout: 90000 });
    const turned = await page.evaluate(() => coastlineTest.getState());
    await page.locator("#steerRight").dispatchEvent("pointercancel", { pointerId: 62 });
    await page.locator("#touchGas").dispatchEvent("pointercancel", { pointerId: 61 });
    return { before, moving, turned };
  })();
  const fwd = [Math.sin(drive.before.heading), Math.cos(drive.before.heading)];
  const dx = drive.moving.position[0] - drive.before.position[0];
  const dz = drive.moving.position[2] - drive.before.position[2];
  // Direction, not distance: the displacement must be almost entirely along the car's nose.
  const along = dx * fwd[0] + dz * fwd[1];
  const travelled = Math.hypot(dx, dz);
  const forwardFraction = travelled > 0.05 ? along / travelled : 0;
  check("taxi accelerates forward, not backward", travelled > 0.8 && forwardFraction > 0.9, {
    forwardFraction: +forwardFraction.toFixed(3),
    travelled: +travelled.toFixed(2),
    alongForward: +along.toFixed(2),
    speed: +drive.moving.speed.toFixed(2),
  });
  const dHeading = drive.turned.heading - drive.moving.heading;
  check("steering right turns right (heading decreases)", dHeading < -0.05, {
    aim,
    headingDelta: +dHeading.toFixed(3),
    speed: +drive.turned.speed.toFixed(2),
    heading: [+drive.before.heading.toFixed(2), +drive.moving.heading.toFixed(2), +drive.turned.heading.toFixed(2)],
  });

  // --- 7. Police light bar sits on the roof, not in the sky ----------------------------
  const lights = await page.evaluate(() => coastlineTest.policeLightHeights());
  const badLights = lights.filter((l) => Math.abs(l.light - l.roof) > 0.8);
  check("police light bars sit on the roof", badLights.length === 0, {
    sample: lights.slice(0, 3), bad: badLights.length,
  });

  // --- 8. Weapons, knife, melee, NPC retaliation, death, car damage ---------------------
  // Combat is on foot: leave any vehicle carried over from the driving checks.
  await page.evaluate(() => coastlineTest.dismount());
  await page.waitForFunction(() => !coastlineTest.getState().vehicle, null, { timeout: 30000 });
  const weapons = await page.evaluate(() => coastlineTest.weaponList());
  const ids = weapons.map((w) => w.id);
  check("weapon table includes a knife and several firearms",
    ids.includes("knife") && ids.filter((i) => !["fists", "knife"].includes(i)).length >= 4,
    { count: weapons.length, ids });
  check("every firearm has a model attached", weapons.filter((w) => !w.melee).every((w) => w.hasMesh),
    weapons.filter((w) => !w.melee && !w.hasMesh));

  // Knife: select it, strike an NPC, expect damage well above a punch.
  await page.evaluate(() => { coastlineTest.setPosition(-57, 96); coastlineTest.setWanted(0); });
  await page.waitForTimeout(300);
  await page.evaluate(() => coastlineTest.selectWeapon("knife"));
  const knifeHit = await page.evaluate(() => coastlineTest.hitNearestNpc());
  check("knife damages an NPC on strike", !!knifeHit && knifeHit.after.hp < knifeHit.before.hp,
    knifeHit);

  // Retaliation: the NPC we hit must turn hostile, chase and land a hit on the player.
  const hpBefore = await page.evaluate(() => coastlineTest.playerState().health);
  const retaliated = await page.waitForFunction(
    (hp) => coastlineTest.playerState().health < hp,
    hpBefore, { timeout: 45000 },
  ).then(() => true).catch(() => false);
  check("punched NPC fights back and damages the player", retaliated,
    { healthBefore: hpBefore, after: await page.evaluate(() => coastlineTest.playerState()) });

  // Firearms: carbine and shotgun should discharge and consume ammo.
  const fired = [];
  for (const id of ["carbine", "smg", "shotgun"]) {
    const before = await page.evaluate((w) => {
      coastlineTest.selectWeapon(w);
      return coastlineTest.weaponList().find((x) => x.id === w).ammo;
    }, id);
    await page.evaluate(() => coastlineTest.hitNearestNpc());
    const after = await page.evaluate((w) => coastlineTest.weaponList().find((x) => x.id === w).ammo, id);
    fired.push({ id, before, after, spent: before - after });
  }
  check("carbine/smg/shotgun consume ammunition when fired",
    fired.every((f) => f.spent >= 1), fired);

  // Car damage: a heavy hit wrecks a car and marks it damaged.
  const dmg1 = await page.evaluate(() => coastlineTest.damageCarOfType("hatchback-sports", 55));
  const dmg2 = await page.evaluate(() => coastlineTest.damageCarOfType("hatchback-sports", 60));
  check("cars take damage and can be wrecked",
    dmg1 && dmg1.hp < 100 && dmg2 && dmg2.wrecked, { after55: dmg1, afterMore: dmg2 });

  // Player death and respawn.
  await page.evaluate(() => coastlineTest.hurtPlayer(400));
  const died = await page.waitForFunction(() => coastlineTest.playerState().dead, null, { timeout: 15000 })
    .then(() => true).catch(() => false);
  const revived = await page.waitForFunction(() => !coastlineTest.playerState().dead, null, { timeout: 30000 })
    .then(() => true).catch(() => false);
  const pState = await page.evaluate(() => coastlineTest.playerState());
  check("player dies and respawns with full health", died && revived && pState.health === 100,
    { died, revived, ...pState });

  // --- 9. Vehicle physics probe -------------------------------------------------------
  await page.evaluate(() => coastlineTest.board("sedan"));
  await page.waitForFunction(() => coastlineTest.getState().vehicle === "sedan", null, { timeout: 60000 });
  const probeAim = await page.evaluate(() => coastlineTest.aimOpenRoad(60));
  const probe = await page.evaluate(() => coastlineTest.driveProbe());
  if (probe) probe.aim = probeAim;
  if (!probe || !(probe.forwardFraction > 3)) console.error("drive probe:", JSON.stringify(probe));
  check("car accelerates forward and steers right", probe && probe.forwardFraction > 3 && probe.headingDelta < -0.05, probe);
  check("suspension responds (pitch/roll move away from zero)",
    probe && (Math.abs(probe.pitch) > 0.002 || Math.abs(probe.roll) > 0.002), probe);

  const tickErr = await page.evaluate(() => coastlineTest.getState().tickError);
  check("no frame errors during the whole run", !tickErr && errors.length === 0,
    { tickErr, errors: errors.slice(0, 4) });

  const fixes = await page.evaluate(() => coastlineTest.facingFixes());
  const report = await page.evaluate(() => coastlineTest.facingReport());
  results.facing = { fixes, report };
  // The taxi is authored facing -Z (its root carries a pure 180 deg Y rotation) and is the vehicle
  // the user reported reversing, so it is the one pinned by name. Everything else only has to be
  // an unambiguous half turn or nothing at all - never a half-applied angle.
  const angles = Object.values(fixes);
  check("taxi is rotated 180 deg, and every correction is exactly 0 or 180",
    Math.abs((fixes.taxi || 0) - Math.PI) < 0.01 &&
    angles.every((a) => Math.abs(a) < 0.01 || Math.abs(Math.abs(a) - Math.PI) < 0.01) &&
    Object.entries(report).every(([k, r]) => r.pureYFlip === (Math.abs(fixes[k] || 0) > 0.01)),
    { fixes, report });

  // --- 10. Vehicle orientation diagnostics (visual ground truth) -------------------------
  // Capture a traffic taxi and a traffic sedan from in front of their travel direction (+Z).
  // If the mesh faced backwards, the shot would show the boot/rear window instead of the bonnet.
  const noseT = await page.evaluate(() => coastlineTest.noseInfo("taxi"));
  const noseS = await page.evaluate(() => coastlineTest.noseInfo("sedan"));
  results.orientation = { taxi: noseT, sedan: noseS };
  // The truck and the coupe are the two shapes the old roof/heuristic disagreed about, so shoot
  // them too: their cabins are not clearly behind centre and the front/rear read has to be eyeballed.
  for (const [label, type] of [["taxi", "taxi"], ["sedan-control", "sedan"], ["truck", "truck"], ["coupe", "car-concept"]]) {
    const info = await page.evaluate((t) => {
      const car = coastlineTest.noseInfo(t).find((c) => c.traffic);
      return car || coastlineTest.noseInfo(t)[0];
    }, type);
    const target = await page.evaluate((id) => { const c = coastlineTest.carAt(id); return c; }, info.id);
    if (target) {
      // Stand the player beside the car first (traffic cars are culled beyond 260 m), then track the
      // car from 6.5 m ahead of its nose - along its own travel direction, not +Z, because half the
      // fleet drives east-west lanes - looking back at it.
      await page.evaluate((id) => {
        const c = coastlineTest.carAt(id);
        coastlineTest.setPosition(c.x - Math.sin(c.rotY) * 3, c.z - Math.cos(c.rotY) * 3);
      }, info.id);
      await page.waitForTimeout(600);
      const cam = await page.evaluate((id) => coastlineTest.setCarCam(id, 6.5), info.id);
      results.orientationShots = { ...(results.orientationShots || {}), [label]: cam };
      await page.waitForTimeout(700);
      const file = `${SHOT_DIR}/orient-${label}.png`;
      await page.screenshot({ path: file, timeout: 90000 });
      results.shots.push(file);
    }
  }
  await page.evaluate(() => coastlineTest.setFreeCam(null, null));

  // --- Screenshots of the new districts -------------------------------------------------
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const centers = await page.evaluate(() => window.coastlineTest.districtsCenters());
  for (const c of centers) {
    // Fixed eye point above the block edge, looking at the district centre: avoids the chase
    // camera clipping into a neighbouring building.
    await page.evaluate(([x, z]) => {
      coastlineTest.setPosition(x, z);
      coastlineTest.setFreeCam([x - 30, 20, z + 46], [x, 6, z]);
    }, [c.x, c.z]);
    await page.waitForTimeout(1500);
    const file = `${SHOT_DIR}/v1.6-${c.kind}-${Math.round(c.x)}_${Math.round(c.z)}.png`;
    await page.screenshot({ path: file, timeout: 90000 });
    results.shots.push(file);
  }
  // wide shot of downtown + the coastline
  await page.evaluate(() => {
    coastlineTest.setPosition(-30, 40);
    coastlineTest.setFreeCam([-95, 42, 150], [40, 0, -20]);
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOT_DIR}/v1.6-downtown.png`, timeout: 90000 });
  results.shots.push(`${SHOT_DIR}/v1.6-downtown.png`);

  results.errors = errors;
  results.platform = await page.evaluate(() => navigator.platform);
  results.state = { drawCalls: state.drawCalls, triangles: state.triangles, quality: state.quality };
  fs.writeFileSync("smoke-results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  await browser.close();

  if (fail.length) {
    console.error("\nFAILED:\n" + fail.map((f) => "  " + f).join("\n"));
    process.exit(1);
  }
  console.log("\nAll smoke checks passed.");
})().catch((e) => {
  // Always leave a record: the CI log host is not reachable from every environment, so the
  // committed JSON is the only reliable way to see where a run stopped.
  results.error = String((e && e.stack) || e);
  results.pageErrors = errors;
  try {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    fs.writeFileSync("smoke-results.json", JSON.stringify(results, null, 2));
  } catch { /* best effort */ }
  console.error(e);
  process.exit(1);
});

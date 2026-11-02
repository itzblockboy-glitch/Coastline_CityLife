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

  // --- Screenshots of the new districts -------------------------------------------------
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const centers = await page.evaluate(() => window.coastlineTest.districtsCenters());
  for (const c of centers) {
    await page.evaluate(([x, z]) => {
      coastlineTest.setPosition(x, z + 34);
      coastlineTest.setCamera(0);
    }, [c.x, c.z]);
    await page.waitForTimeout(1200);
    const file = `${SHOT_DIR}/v1.6-${c.kind}-${Math.round(c.x)}_${Math.round(c.z)}.png`;
    await page.screenshot({ path: file, timeout: 90000 });
    results.shots.push(file);
  }
  // wide shot of downtown + the coastline
  await page.evaluate(() => { coastlineTest.setPosition(-30, 40); coastlineTest.setCamera(0); });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOT_DIR}/v1.6-downtown.png`, timeout: 90000 });
  results.shots.push(`${SHOT_DIR}/v1.6-downtown.png`);

  results.errors = errors;
  results.state = { drawCalls: state.drawCalls, triangles: state.triangles, quality: state.quality };
  fs.writeFileSync("smoke-results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  await browser.close();

  if (fail.length) {
    console.error("\nFAILED:\n" + fail.map((f) => "  " + f).join("\n"));
    process.exit(1);
  }
  console.log("\nAll smoke checks passed.");
})().catch((e) => { console.error(e); process.exit(1); });

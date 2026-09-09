import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { generateAssets, installRaster, verifyAsset } from "../src/assets.mjs";
import { checkAssets } from "../src/check.mjs";
import { planIllustrations } from "../src/planner.mjs";
import { scanProject } from "../src/scan.mjs";
import { createFixture, investmentEn, investmentZh } from "./helpers.mjs";

test("manifest provider exposes raster work and import installs optimized source and web assets", async (t) => {
  const fixture = await createFixture({ id: "investment-psychology", zh: investmentZh, en: investmentEn });
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const scan = await scanProject({ projectRoot: fixture.root, configPath: fixture.configPath });
  const manifest = await planIllustrations(scan, fixture.config);
  const generated = await generateAssets({ manifest, config: fixture.config, projectRoot: fixture.root, provider: "manifest" });
  assert.deepEqual(generated.pending.map((job) => job.imageId), ["investment-high-wire"]);

  const inputPath = join(fixture.root, "input.png");
  await sharp({
    create: { width: 1536, height: 1024, channels: 3, background: { r: 243, g: 240, b: 232 } },
  }).png().toFile(inputPath);
  const candidate = manifest.candidates.find((item) => item.imageId === "investment-high-wire");
  const result = await installRaster({ candidate, inputPath, config: fixture.config, projectRoot: fixture.root });
  assert.equal(result.width, 1536);
  assert.equal(result.height, 1024);
  assert.ok(result.webBytes < result.sourceBytes);
  const verified = await verifyAsset(candidate, "en", fixture.config, fixture.root);
  assert.equal(verified.asset.sha256, result.sha256);
  const assetCheck = await checkAssets({ manifest, config: fixture.config, projectRoot: fixture.root });
  assert.equal(assetCheck.status, "ok");
});

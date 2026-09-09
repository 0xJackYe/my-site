import assert from "node:assert/strict";
import { rm, unlink } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { applyManifest } from "../src/apply.mjs";
import { generateAssets } from "../src/assets.mjs";
import { checkManifest } from "../src/check.mjs";
import { planIllustrations } from "../src/planner.mjs";
import { scanProject } from "../src/scan.mjs";
import { bitcoinEn, bitcoinZh, createFixture, readFixture } from "./helpers.mjs";

async function preparedFixture() {
  const fixture = await createFixture({ zh: bitcoinZh, en: bitcoinEn });
  const scan = await scanProject({ projectRoot: fixture.root, configPath: fixture.configPath });
  const manifest = await planIllustrations(scan, fixture.config);
  await generateAssets({ manifest, config: fixture.config, projectRoot: fixture.root, provider: "manifest" });
  return { ...fixture, manifest };
}

test("apply synchronizes Markdown and HTML, and a second apply is idempotent", async (t) => {
  const fixture = await preparedFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const dryRun = await applyManifest({ manifest: fixture.manifest, config: fixture.config, projectRoot: fixture.root, dryRun: true });
  assert.equal(dryRun.inserted.length, 12);
  assert.doesNotMatch(await readFixture(fixture, fixture.zhFile), /blog-image-agent:start/);

  const first = await applyManifest({ manifest: fixture.manifest, config: fixture.config, projectRoot: fixture.root });
  assert.equal(first.inserted.length, 12);
  const zh = await readFixture(fixture, fixture.zhFile);
  const en = await readFixture(fixture, fixture.enFile);
  const html = await readFixture(fixture, "index.html");
  for (const candidate of fixture.manifest.candidates) {
    assert.equal(zh.split(`id="${candidate.imageId}"`).length - 1, 3);
    assert.equal(en.split(`id="${candidate.imageId}"`).length - 1, 3);
    assert.match(html, new RegExp(`data-image-id="${candidate.imageId}"`));
  }
  const result = await checkManifest({ manifest: fixture.manifest, config: fixture.config, projectRoot: fixture.root });
  assert.equal(result.status, "ok");

  const beforeSecond = { zh, en, html };
  const second = await applyManifest({ manifest: fixture.manifest, config: fixture.config, projectRoot: fixture.root });
  assert.equal(second.inserted.length, 0);
  assert.equal(second.unchanged.length, 3);
  assert.equal(await readFixture(fixture, fixture.zhFile), beforeSecond.zh);
  assert.equal(await readFixture(fixture, fixture.enFile), beforeSecond.en);
  assert.equal(await readFixture(fixture, "index.html"), beforeSecond.html);
});

test("apply fails closed when an anchor is stale", async (t) => {
  const fixture = await preparedFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  fixture.manifest.candidates[0].anchors.zh.match = "不存在的稳定锚点";
  await assert.rejects(
    applyManifest({ manifest: fixture.manifest, config: fixture.config, projectRoot: fixture.root }),
    /anchor must resolve exactly once/,
  );
  assert.doesNotMatch(await readFixture(fixture, fixture.zhFile), /blog-image-agent:start/);
  assert.doesNotMatch(await readFixture(fixture, "index.html"), /data-image-id/);
});

test("apply fails closed when a generated asset is missing", async (t) => {
  const fixture = await preparedFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const missing = join(fixture.root, "public", fixture.manifest.candidates[0].assets.zh.webPath);
  await unlink(missing);
  await assert.rejects(
    applyManifest({ manifest: fixture.manifest, config: fixture.config, projectRoot: fixture.root }),
    /Missing web asset/,
  );
  assert.doesNotMatch(await readFixture(fixture, fixture.zhFile), /blog-image-agent:start/);
});

import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import test from "node:test";
import { scanProject } from "../src/scan.mjs";
import { planIllustrations } from "../src/planner.mjs";
import { validateManifest } from "../src/schema.mjs";
import { bitcoinEn, bitcoinZh, createFixture } from "./helpers.mjs";

test("scan skips the whole bilingual article when either source has an image", async (t) => {
  const fixture = await createFixture({
    zh: `${bitcoinZh}\n![已有图片](../assets/existing.png)\n`,
    en: bitcoinEn,
  });
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const scan = await scanProject({ projectRoot: fixture.root, configPath: fixture.configPath });
  assert.equal(scan.articles[0].status, "skipped");
  assert.equal(scan.articles[0].languages.zh.markdownHasImage, true);
  assert.equal(scan.articles[0].languages.en.markdownHasImage, false);
});

test("scan also detects HTML picture and figure elements", async (t) => {
  const fixture = await createFixture({
    zh: bitcoinZh,
    en: bitcoinEn,
    htmlTransform: ({ zhHtml, enHtml }) => ({
      zhHtml,
      enHtml: `${enHtml}<picture><source srcset="existing.webp"><img src="existing.png" alt="existing"></picture>`,
    }),
  });
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const scan = await scanProject({ projectRoot: fixture.root, configPath: fixture.configPath });
  assert.equal(scan.articles[0].status, "skipped");
  assert.equal(scan.articles[0].languages.en.htmlHasImage, true);
});

test("scan detects an image-free bilingual pair and planning emits paired anchors", async (t) => {
  const fixture = await createFixture({ zh: bitcoinZh, en: bitcoinEn });
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const scan = await scanProject({ projectRoot: fixture.root, configPath: fixture.configPath });
  assert.equal(scan.articles[0].status, "eligible");
  const manifest = await planIllustrations(scan, fixture.config);
  await validateManifest(manifest);
  assert.equal(manifest.articles[0].status, "selected");
  assert.deepEqual(manifest.candidates.map((candidate) => candidate.imageId), [
    "bitcoin-ledger-topology",
    "bitcoin-transaction-path",
    "bitcoin-governance-balance",
  ]);
  for (const candidate of manifest.candidates) {
    assert.ok(candidate.anchors.zh.contextHash);
    assert.ok(candidate.anchors.en.contextHash);
    assert.equal(candidate.languageStrategy, "localized-svg");
    assert.ok(candidate.scores.total >= 0.72);
  }
});

test("manifest schema rejects incomplete candidates", async () => {
  await assert.rejects(
    validateManifest({ schemaVersion: 1, generatedAt: new Date().toISOString(), scanHash: "a".repeat(64), articles: [], candidates: [{ imageId: "broken" }] }),
    /Manifest schema validation failed/,
  );
});

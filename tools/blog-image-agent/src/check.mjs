import { readFile } from "node:fs/promises";
import { load as loadHtml } from "cheerio";
import { normalizeText, projectPath, sha256 } from "./core.mjs";
import { stripAgentMarkdown } from "./apply.mjs";
import { validateManifest } from "./schema.mjs";
import { verifyAsset } from "./assets.mjs";

function markerCount(markdown, imageId) {
  return markdown.split(`<!-- blog-image-agent:start id="${imageId}" -->`).length - 1;
}

export async function checkAssets({ manifest, config, projectRoot }) {
  await validateManifest(manifest);
  const checks = [];
  const ids = new Set();
  for (const candidate of manifest.candidates) {
    if (ids.has(candidate.imageId)) throw new Error(`Duplicate image id in manifest: ${candidate.imageId}`);
    ids.add(candidate.imageId);
    for (const language of ["zh", "en"]) {
      const result = await verifyAsset(candidate, language, config, projectRoot);
      checks.push({
        type: "asset",
        imageId: candidate.imageId,
        language,
        webPath: result.asset.webPath,
        bytes: result.bytes,
        status: "ok",
      });
    }
  }
  return { status: "ok", checks };
}

export async function checkManifest({ manifest, config, projectRoot }) {
  await validateManifest(manifest);
  const indexPath = projectPath(projectRoot, config.indexHtml);
  const indexHtml = await readFile(indexPath, "utf8");
  const $ = loadHtml(indexHtml, { decodeEntities: false });
  const checks = [];

  for (const article of manifest.articles) {
    for (const language of ["zh", "en"]) {
      const source = article.languages[language];
      const markdown = await readFile(projectPath(projectRoot, source.file), "utf8");
      const baseline = article.status === "selected" ? stripAgentMarkdown(markdown) : markdown;
      if (sha256(baseline) !== source.contentHash) {
        throw new Error(`Non-agent article content changed after planning: ${source.file}`);
      }
      checks.push({ type: "content", articleId: article.id, language, status: "ok" });
    }
    if (article.status === "skipped") {
      const count = $(`article[data-article="${article.id}"] [data-image-id]`).length;
      if (count !== 0) throw new Error(`Skipped article ${article.id} contains agent images`);
      checks.push({ type: "skip", articleId: article.id, status: "ok" });
    }
  }

  for (const candidate of manifest.candidates) {
    for (const language of ["zh", "en"]) {
      const article = manifest.articles.find((item) => item.id === candidate.articleId);
      const markdown = await readFile(projectPath(projectRoot, article.languages[language].file), "utf8");
      if (markerCount(markdown, candidate.imageId) !== 1) {
        throw new Error(`Expected one Markdown insertion for ${candidate.imageId}/${language}`);
      }
      const assetResult = await verifyAsset(candidate, language, config, projectRoot);
      const assetKey = candidate.languageStrategy === "shared-raster" ? "shared" : language;
      const asset = candidate.assets[assetKey];
      const $figure = $(`article[data-article="${candidate.articleId}"] .article-content[data-article-lang="${language}"] figure[data-image-id="${candidate.imageId}"]`);
      if ($figure.length !== 1) throw new Error(`Expected one HTML figure for ${candidate.imageId}/${language}`);
      const $image = $figure.children("img");
      if ($image.length !== 1
        || $image.attr("src") !== asset.webPath
        || $image.attr("alt") !== candidate.alt[language]
        || $image.attr("width") !== String(asset.width)
        || $image.attr("height") !== String(asset.height)
        || $image.attr("loading") !== "lazy"
        || $image.attr("decoding") !== "async") {
        throw new Error(`Invalid HTML image metadata for ${candidate.imageId}/${language}`);
      }
      if (normalizeText($figure.children("figcaption").text()) !== normalizeText(candidate.caption[language])) {
        throw new Error(`Invalid caption for ${candidate.imageId}/${language}`);
      }
      checks.push({
        type: "asset-and-insertion",
        imageId: candidate.imageId,
        language,
        bytes: assetResult.bytes,
        status: "ok",
      });
    }
  }
  return { status: "ok", checks };
}

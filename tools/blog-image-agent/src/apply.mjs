import { readFile } from "node:fs/promises";
import { load as loadHtml } from "cheerio";
import {
  escapeHtml,
  normalizeText,
  projectPath,
  sha256,
  writeTextAtomic,
} from "./core.mjs";
import { extractMarkdownBlocks } from "./scan.mjs";
import { validateManifest } from "./schema.mjs";
import { verifyAsset } from "./assets.mjs";

const markerPattern = /\r?\n\r?\n<!-- blog-image-agent:start id="([a-z0-9-]+)" -->[\s\S]*?<!-- blog-image-agent:end id="\1" -->/g;

export function stripAgentMarkdown(markdown) {
  return markdown.replace(markerPattern, "");
}

function countMarkdownMarker(markdown, imageId) {
  const escaped = imageId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (markdown.match(new RegExp(`<!-- blog-image-agent:start id="${escaped}" -->`, "g")) ?? []).length;
}

function markdownAssetPath(webPath) {
  return `../public/${webPath}`;
}

function figureMarkup(candidate, language, target) {
  const assetKey = candidate.languageStrategy === "shared-raster" ? "shared" : language;
  const asset = candidate.assets[assetKey];
  const src = target === "markdown" ? markdownAssetPath(asset.webPath) : asset.webPath;
  const indent = target === "html" ? "          " : "";
  const innerIndent = target === "html" ? "            " : "  ";
  const imageId = escapeHtml(candidate.imageId);
  const alt = escapeHtml(candidate.alt[language]);
  const caption = escapeHtml(candidate.caption[language]);
  const figure = [
    `${indent}<figure class="article-figure article-figure--agent" data-image-id="${imageId}">`,
    `${innerIndent}<img src="${escapeHtml(src)}" alt="${alt}" width="${asset.width}" height="${asset.height}" loading="lazy" decoding="async" />`,
    `${innerIndent}<figcaption>${caption}</figcaption>`,
    `${indent}</figure>`,
  ].join("\n");
  if (target === "html") return `\n\n${figure}`;
  return `\n\n<!-- blog-image-agent:start id="${imageId}" -->\n${figure}\n<!-- blog-image-agent:end id="${imageId}" -->`;
}

function findMarkdownAnchor(markdown, anchor) {
  const matches = extractMarkdownBlocks(markdown).filter((block) => {
    const kindMatches = anchor.kind === "paragraph" ? ["paragraph", "quote"].includes(block.kind) : block.kind === anchor.kind;
    return kindMatches
      && block.contextHash === anchor.contextHash
      && normalizeText(block.text).includes(normalizeText(anchor.match));
  });
  if (matches.length !== 1) {
    throw new Error(`Markdown anchor must resolve exactly once; found ${matches.length} for "${anchor.match}"`);
  }
  const block = matches[0];
  const first = markdown.indexOf(block.raw);
  const second = markdown.indexOf(block.raw, first + block.raw.length);
  if (first < 0 || second >= 0) {
    throw new Error(`Markdown anchor text is missing or ambiguous for "${anchor.match}"`);
  }
  return first + block.raw.length;
}

function findHtmlAnchor($, articleId, language, anchor) {
  const $article = $(`article[data-article="${articleId}"]`);
  const $content = $article.find(`.article-content[data-article-lang="${language}"]`);
  if ($article.length !== 1 || $content.length !== 1) {
    throw new Error(`HTML article body missing for ${articleId}/${language}`);
  }
  const selector = anchor.kind === "heading" ? "h2,h3,h4,h5,h6" : anchor.kind === "list" ? "ol,ul" : "p";
  const nodes = $content.find(selector).toArray().filter((node) => normalizeText($(node).text()).includes(normalizeText(anchor.match)));
  if (nodes.length !== anchor.occurrence) {
    throw new Error(`HTML anchor must resolve ${anchor.occurrence} time(s); found ${nodes.length} for ${articleId}/${language}`);
  }
  const node = nodes[anchor.occurrence - 1];
  const endOffset = node.sourceCodeLocation?.endOffset;
  if (!Number.isInteger(endOffset)) throw new Error(`HTML source location unavailable for ${articleId}/${language}`);
  return endOffset;
}

function insertionState(markdownByLanguage, indexHtml, candidate) {
  const $ = loadHtml(indexHtml, { decodeEntities: false });
  const mdCounts = {
    zh: countMarkdownMarker(markdownByLanguage.zh, candidate.imageId),
    en: countMarkdownMarker(markdownByLanguage.en, candidate.imageId),
  };
  const htmlCounts = {
    zh: $(`article[data-article="${candidate.articleId}"] .article-content[data-article-lang="zh"] [data-image-id="${candidate.imageId}"]`).length,
    en: $(`article[data-article="${candidate.articleId}"] .article-content[data-article-lang="en"] [data-image-id="${candidate.imageId}"]`).length,
  };
  const counts = [mdCounts.zh, mdCounts.en, htmlCounts.zh, htmlCounts.en];
  if (counts.every((count) => count === 0)) return "absent";
  if (counts.every((count) => count === 1)) return "complete";
  throw new Error(`Partial or duplicate insertion detected for ${candidate.imageId}: ${JSON.stringify({ mdCounts, htmlCounts })}`);
}

async function writeFileSetWithRollback(fileMap, originals) {
  const written = [];
  try {
    for (const [path, content] of fileMap) {
      await writeTextAtomic(path, content);
      written.push(path);
    }
  } catch (error) {
    for (const path of written.reverse()) {
      await writeTextAtomic(path, originals.get(path));
    }
    throw error;
  }
}

export async function applyManifest({ manifest, config, projectRoot, dryRun = false }) {
  await validateManifest(manifest);
  const indexPath = projectPath(projectRoot, config.indexHtml);
  const originalIndex = await readFile(indexPath, "utf8");
  const originals = new Map([[indexPath, originalIndex]]);
  const markdownPaths = new Map();

  for (const article of manifest.articles) {
    for (const language of ["zh", "en"]) {
      const path = projectPath(projectRoot, article.languages[language].file);
      if (!originals.has(path)) originals.set(path, await readFile(path, "utf8"));
      markdownPaths.set(`${article.id}:${language}`, path);
    }
  }

  let nextIndex = originalIndex;
  const nextMarkdown = new Map([...originals].filter(([path]) => path !== indexPath));
  const inserted = [];
  const unchanged = [];
  const candidatesByArticle = Map.groupBy(manifest.candidates, (candidate) => candidate.articleId);

  for (const article of manifest.articles.filter((item) => item.status === "selected")) {
    const byLanguage = {
      zh: nextMarkdown.get(markdownPaths.get(`${article.id}:zh`)),
      en: nextMarkdown.get(markdownPaths.get(`${article.id}:en`)),
    };
    const candidates = candidatesByArticle.get(article.id) ?? [];
    const states = candidates.map((candidate) => insertionState(byLanguage, nextIndex, candidate));
    if (states.every((state) => state === "complete")) {
      unchanged.push(...candidates.map((candidate) => candidate.imageId));
      continue;
    }
    if (states.some((state) => state === "complete")) {
      throw new Error(`Article ${article.id} has a mixed applied/unapplied manifest; refusing a partial update`);
    }
    for (const language of ["zh", "en"]) {
      if (sha256(byLanguage[language]) !== article.languages[language].contentHash) {
        throw new Error(`Article changed after planning: ${article.languages[language].file}`);
      }
    }

    for (const candidate of candidates) {
      await verifyAsset(candidate, "zh", config, projectRoot);
      await verifyAsset(candidate, "en", config, projectRoot);
    }

    for (const language of ["zh", "en"]) {
      const markdownPath = markdownPaths.get(`${article.id}:${language}`);
      let markdown = nextMarkdown.get(markdownPath);
      const placements = candidates.map((candidate) => ({
        candidate,
        offset: findMarkdownAnchor(markdown, candidate.anchors[language]),
      })).sort((left, right) => right.offset - left.offset);
      for (const placement of placements) {
        markdown = `${markdown.slice(0, placement.offset)}${figureMarkup(placement.candidate, language, "markdown")}${markdown.slice(placement.offset)}`;
        inserted.push(`${placement.candidate.imageId}:${language}:markdown`);
      }
      nextMarkdown.set(markdownPath, markdown);
    }

    const $ = loadHtml(nextIndex, { decodeEntities: false, sourceCodeLocationInfo: true });
    const placements = [];
    for (const candidate of candidates) {
      for (const language of ["zh", "en"]) {
        placements.push({
          candidate,
          language,
          offset: findHtmlAnchor($, article.id, language, candidate.anchors[language]),
        });
      }
    }
    placements.sort((left, right) => right.offset - left.offset);
    for (const placement of placements) {
      nextIndex = `${nextIndex.slice(0, placement.offset)}${figureMarkup(placement.candidate, placement.language, "html")}${nextIndex.slice(placement.offset)}`;
      inserted.push(`${placement.candidate.imageId}:${placement.language}:html`);
    }
  }

  if (!dryRun && inserted.length > 0) {
    const files = new Map([[indexPath, nextIndex], ...nextMarkdown]);
    await writeFileSetWithRollback(files, originals);
  }
  return {
    dryRun,
    changedFiles: inserted.length > 0 ? 1 + new Set([...nextMarkdown.keys()].filter((path) => nextMarkdown.get(path) !== originals.get(path))).size : 0,
    inserted,
    unchanged,
  };
}

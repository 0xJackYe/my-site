import { readFile } from "node:fs/promises";
import { load as loadHtml } from "cheerio";
import {
  excerpt,
  defaultProjectRoot,
  loadConfig,
  normalizeText,
  projectPath,
  sha256,
  stripMarkdown,
} from "./core.mjs";

const markdownImagePattern = /!\[[^\]]*\]\([^\n)]+\)|<(?:img|picture|figure)\b/i;

function blockKind(raw) {
  const trimmed = raw.trim();
  if (/^#{1,6}\s+/.test(trimmed)) return "heading";
  if (/^(?:\s*(?:[-+*]|\d+[.)])\s+)/m.test(trimmed)) return "list";
  if (/^\s*\|.+\|/m.test(trimmed)) return "table";
  if (/^>\s?/.test(trimmed)) return "quote";
  return "paragraph";
}

export function extractMarkdownBlocks(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let start = 0;
  let buffer = [];

  const flush = (end) => {
    const raw = buffer.join("\n").trim();
    if (raw) {
      const text = stripMarkdown(raw);
      blocks.push({
        kind: blockKind(raw),
        raw,
        text,
        startLine: start + 1,
        endLine: end,
        contextHash: sha256(normalizeText(raw)),
      });
    }
    buffer = [];
  };

  lines.forEach((line, index) => {
    if (line.trim() === "") {
      flush(index);
      start = index + 1;
      return;
    }
    if (buffer.length === 0) start = index;
    buffer.push(line);
  });
  flush(lines.length);
  return blocks;
}

function scanMarkdown(markdown) {
  const blocks = extractMarkdownBlocks(markdown);
  const headings = blocks.filter((block) => block.kind === "heading").map((block) => block.text);
  return {
    hasImage: markdownImagePattern.test(markdown),
    contentHash: sha256(markdown),
    headings,
    blocks,
    plainText: stripMarkdown(markdown),
    raw: markdown,
  };
}

function contentHasImage($content) {
  return $content.find("img, picture, figure").length > 0;
}

export async function scanProject({ projectRoot, configPath } = {}) {
  const root = projectRoot ?? defaultProjectRoot;
  const config = await loadConfig({ projectRoot: root, configPath });
  const indexPath = projectPath(root, config.indexHtml);
  const indexHtml = await readFile(indexPath, "utf8");
  const $ = loadHtml(indexHtml, { decodeEntities: false });
  const articles = [];

  for (const definition of config.articles) {
    const $article = $(`article[data-article="${definition.id}"]`);
    if ($article.length !== 1) {
      throw new Error(`Expected one HTML article[data-article="${definition.id}"], found ${$article.length}`);
    }
    const languages = {};
    let articleHasImage = false;

    for (const language of ["zh", "en"]) {
      const source = definition[language];
      const filePath = projectPath(root, source.file);
      const markdown = await readFile(filePath, "utf8");
      const markdownScan = scanMarkdown(markdown);
      const $content = $article.find(`.article-content[data-article-lang="${language}"]`);
      if ($content.length !== 1) {
        throw new Error(`Expected one ${language} HTML body for ${definition.id}, found ${$content.length}`);
      }
      const htmlHasImage = contentHasImage($content);
      articleHasImage ||= markdownScan.hasImage || htmlHasImage;
      languages[language] = {
        file: source.file,
        title: source.title,
        contentHash: markdownScan.contentHash,
        markdownHasImage: markdownScan.hasImage,
        htmlHasImage,
        headings: markdownScan.headings,
        blocks: markdownScan.blocks,
        plainText: markdownScan.plainText,
        raw: markdownScan.raw,
      };
    }

    const contentHash = sha256(`${languages.zh.contentHash}:${languages.en.contentHash}`);
    articles.push({
      id: definition.id,
      status: articleHasImage ? "skipped" : "eligible",
      reason: articleHasImage ? "At least one source already contains an image" : "No Markdown or HTML images found",
      contentHash,
      languages,
    });
  }

  const scan = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    indexHtml: config.indexHtml,
    indexHash: sha256(indexHtml),
    articles,
  };
  scan.scanHash = sha256(JSON.stringify(scan.articles.map((article) => ({
    id: article.id,
    status: article.status,
    contentHash: article.contentHash,
  }))));
  return scan;
}

export function publicScan(scan) {
  return {
    ...scan,
    articles: scan.articles.map((article) => ({
      ...article,
      languages: Object.fromEntries(Object.entries(article.languages).map(([language, source]) => [language, {
        ...source,
        raw: undefined,
        plainTextPreview: excerpt(source.plainText, 240),
      }])),
    })),
  };
}

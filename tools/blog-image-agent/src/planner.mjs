import { excerpt, normalizeText, roundScore, sha256, toPosix } from "./core.mjs";
import { opportunityTemplates, sharedNegativeConstraints, visualStyle } from "./templates.mjs";
import { validateManifest } from "./schema.mjs";

function summarizeLanguage(source, language) {
  const useful = source.blocks.filter((block) => !["heading", "table"].includes(block.kind));
  const first = useful[0]?.text ?? source.plainText;
  const later = useful[Math.min(useful.length - 1, Math.max(1, Math.floor(useful.length * 0.45)))]?.text ?? "";
  const separator = language === "zh" ? "；" : "; ";
  return excerpt(`${first}${later ? `${separator}${later}` : ""}`, 260);
}

function locateAnchor(source, cues) {
  const normalizedCues = cues.map(normalizeText);
  for (const cue of normalizedCues) {
    const matches = source.blocks.filter((block) => normalizeText(block.text).includes(cue));
    if (matches.length === 1) {
      const block = matches[0];
      const match = excerpt(block.text, Math.max(88, cue.length));
      return {
        block,
        anchor: {
          kind: ["heading", "list"].includes(block.kind) ? block.kind : "paragraph",
          match,
          placement: "after",
          occurrence: 1,
          contextHash: block.contextHash,
        },
      };
    }
  }
  return null;
}

function keywordCoverage(source, keywords) {
  const haystack = normalizeText(source.plainText).toLocaleLowerCase();
  const hits = keywords.filter((keyword) => haystack.includes(normalizeText(keyword).toLocaleLowerCase())).length;
  return hits / keywords.length;
}

function scoreOpportunity(template, article, zhLocation, enLocation, selectedLocations) {
  const zhCoverage = keywordCoverage(article.languages.zh, template.keywords.zh);
  const enCoverage = keywordCoverage(article.languages.en, template.keywords.en);
  const semanticFit = (zhCoverage + enCoverage) / 2;
  const blockCount = Math.max(article.languages.zh.blocks.length, 1);
  const position = zhLocation.block.startLine / Math.max(article.languages.zh.raw.split(/\r?\n/).length, 1);
  const placement = 1 - Math.min(0.22, Math.abs(position - 0.5) * 0.25);
  const nearest = selectedLocations.length === 0
    ? Number.POSITIVE_INFINITY
    : Math.min(...selectedLocations.map((line) => Math.abs(line - zhLocation.block.startLine)));
  const novelty = nearest < 2 ? 0.55 : 0.96;
  const total = semanticFit * 0.42 + template.explanatoryValue * 0.34 + placement * 0.12 + novelty * 0.12;
  return {
    semanticFit: roundScore(semanticFit),
    explanatoryValue: roundScore(template.explanatoryValue),
    placement: roundScore(placement),
    novelty: roundScore(novelty),
    total: roundScore(total),
  };
}

function assetPlan(template, config) {
  const sourceDir = toPosix(config.sourceAssetsDir);
  const webDir = toPosix(config.publicAssetsDir).replace(/^public\//, "");
  if (template.languageStrategy === "localized-svg") {
    return {
      zh: {
        sourcePath: `${sourceDir}/${template.id}-zh.svg`,
        webPath: `${webDir}/${template.id}-zh.svg`,
        width: template.width,
        height: template.height,
        format: "svg",
      },
      en: {
        sourcePath: `${sourceDir}/${template.id}-en.svg`,
        webPath: `${webDir}/${template.id}-en.svg`,
        width: template.width,
        height: template.height,
        format: "svg",
      },
    };
  }
  return {
    shared: {
      sourcePath: `${sourceDir}/${template.id}.png`,
      webPath: `${webDir}/${template.id}.webp`,
      width: template.width,
      height: template.height,
      format: "webp",
    },
  };
}

export async function planIllustrations(scan, config) {
  if (scan.schemaVersion !== 1 || !Array.isArray(scan.articles) || !scan.scanHash) {
    throw new Error("Invalid scan input");
  }
  const articles = [];
  const candidates = [];

  for (const article of scan.articles) {
    const summary = {
      zh: summarizeLanguage(article.languages.zh, "zh"),
      en: summarizeLanguage(article.languages.en, "en"),
    };
    const manifestArticle = {
      id: article.id,
      status: article.status === "eligible" ? "selected" : "skipped",
      reason: article.status === "eligible"
        ? "Both Markdown and rendered HTML are image-free"
        : article.reason,
      summary,
      contentHash: article.contentHash,
      languages: {
        zh: {
          file: article.languages.zh.file,
          title: article.languages.zh.title,
          contentHash: article.languages.zh.contentHash,
        },
        en: {
          file: article.languages.en.file,
          title: article.languages.en.title,
          contentHash: article.languages.en.contentHash,
        },
      },
    };
    articles.push(manifestArticle);
    if (manifestArticle.status === "skipped") continue;

    const pool = [];
    for (const template of opportunityTemplates) {
      const zhLocation = locateAnchor(article.languages.zh, template.cues.zh);
      const enLocation = locateAnchor(article.languages.en, template.cues.en);
      if (!zhLocation || !enLocation) continue;
      const scores = scoreOpportunity(template, article, zhLocation, enLocation, []);
      if (scores.semanticFit < 0.6 || scores.total < 0.72) continue;
      pool.push({ template, zhLocation, enLocation, scores });
    }

    pool.sort((left, right) => right.scores.total - left.scores.total);
    const selected = [];
    const selectedLocations = [];
    for (const opportunity of pool) {
      if (selected.length >= 3) break;
      const scores = scoreOpportunity(
        opportunity.template,
        article,
        opportunity.zhLocation,
        opportunity.enLocation,
        selectedLocations,
      );
      if (scores.novelty < 0.7 || scores.total < 0.72) continue;
      selected.push({ ...opportunity, scores });
      selectedLocations.push(opportunity.zhLocation.block.startLine);
    }
    selected.sort((left, right) => left.zhLocation.block.startLine - right.zhLocation.block.startLine);

    if (selected.length === 0) {
      manifestArticle.status = "skipped";
      manifestArticle.reason = "No illustration opportunity passed the semantic and placement thresholds";
      continue;
    }

    for (const { template, zhLocation, enLocation, scores } of selected) {
      const contentHash = sha256([
        article.contentHash,
        template.id,
        zhLocation.anchor.contextHash,
        enLocation.anchor.contextHash,
        template.prompt,
      ].join(":"));
      candidates.push({
        imageId: template.id,
        articleId: article.id,
        languageStrategy: template.languageStrategy,
        anchors: {
          zh: zhLocation.anchor,
          en: enLocation.anchor,
        },
        visualRole: template.visualRole,
        mediaType: template.mediaType,
        subject: template.subject,
        composition: template.composition,
        style: visualStyle,
        aspectRatio: template.aspectRatio,
        prompt: template.prompt,
        negativeConstraints: sharedNegativeConstraints,
        alt: template.alt,
        caption: template.caption,
        confidence: roundScore(Math.min(0.99, scores.total + 0.04)),
        scores,
        rationale: `Selected because the nearby passage is structurally visual and scored ${scores.total.toFixed(2)} after semantic, explanatory, placement, and novelty checks.`,
        critique: template.mediaType === "svg"
          ? "A diagram explains the relationship more precisely than decorative imagery; localized labels prevent translation loss."
          : "A text-free metaphor adds emotional memory without duplicating a diagram or creating bilingual text inside the image.",
        contentHash,
        assets: assetPlan(template, config),
      });
    }
  }

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    scanHash: scan.scanHash,
    articles,
    candidates,
  };
  await validateManifest(manifest);
  return manifest;
}

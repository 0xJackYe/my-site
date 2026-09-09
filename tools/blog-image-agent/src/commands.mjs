import { resolve } from "node:path";
import {
  defaultConfigPath,
  defaultProjectRoot,
  loadConfig,
  projectPath,
  readJson,
  requireOption,
  writeJson,
} from "./core.mjs";
import { scanProject } from "./scan.mjs";
import { planIllustrations } from "./planner.mjs";
import { generateAssets, installRaster } from "./assets.mjs";
import { applyManifest } from "./apply.mjs";
import { checkAssets, checkManifest } from "./check.mjs";
import { validateManifest } from "./schema.mjs";

function context(options) {
  const projectRoot = options.root ? resolve(options.root) : defaultProjectRoot;
  const configPath = options.config ? resolve(options.config) : defaultConfigPath;
  return { projectRoot, configPath };
}

function outputPath(options, config, projectRoot, fallback) {
  return options.out ? resolve(projectRoot, options.out) : projectPath(projectRoot, `${config.workDir}/${fallback}`);
}

export async function runCommand(command, options) {
  const { projectRoot, configPath } = context(options);
  const config = await loadConfig({ projectRoot, configPath });

  if (command === "scan") {
    const scan = await scanProject({ projectRoot, configPath });
    const out = outputPath(options, config, projectRoot, "scan.json");
    await writeJson(out, scan);
    return { command, out, eligible: scan.articles.filter((article) => article.status === "eligible").map((article) => article.id), skipped: scan.articles.filter((article) => article.status === "skipped").map((article) => article.id) };
  }

  if (command === "plan") {
    const scanPath = options.scan ? resolve(projectRoot, options.scan) : projectPath(projectRoot, `${config.workDir}/scan.json`);
    const scan = await readJson(scanPath);
    const manifest = await planIllustrations(scan, config);
    const out = outputPath(options, config, projectRoot, "manifest.json");
    await writeJson(out, manifest);
    return { command, out, selectedArticles: manifest.articles.filter((article) => article.status === "selected").map((article) => article.id), skippedArticles: manifest.articles.filter((article) => article.status === "skipped").map((article) => article.id), candidates: manifest.candidates.map((candidate) => ({ imageId: candidate.imageId, articleId: candidate.articleId, mediaType: candidate.mediaType, score: candidate.scores.total })) };
  }

  if (command === "generate") {
    const manifestPath = resolve(projectRoot, requireOption(options, "manifest"));
    const manifest = await validateManifest(await readJson(manifestPath));
    const result = await generateAssets({ manifest, config, projectRoot, provider: options.provider || "manifest" });
    await writeJson(manifestPath, manifest);
    return { command, manifest: manifestPath, ...result };
  }

  if (command === "import") {
    const manifestPath = resolve(projectRoot, requireOption(options, "manifest"));
    const imageId = requireOption(options, "id");
    const inputPath = resolve(requireOption(options, "file"));
    const manifest = await validateManifest(await readJson(manifestPath));
    const candidate = manifest.candidates.find((item) => item.imageId === imageId);
    if (!candidate) throw new Error(`Unknown image id: ${imageId}`);
    const result = await installRaster({ candidate, inputPath, config, projectRoot });
    await validateManifest(manifest);
    await writeJson(manifestPath, manifest);
    return { command, manifest: manifestPath, imported: result };
  }

  if (command === "apply") {
    const manifestPath = resolve(projectRoot, requireOption(options, "manifest"));
    const manifest = await validateManifest(await readJson(manifestPath));
    return { command, ...(await applyManifest({ manifest, config, projectRoot, dryRun: options["dry-run"] === true })) };
  }

  if (command === "check") {
    const manifestPath = resolve(projectRoot, requireOption(options, "manifest"));
    const manifest = await validateManifest(await readJson(manifestPath));
    return { command, ...(await checkManifest({ manifest, config, projectRoot })) };
  }

  if (command === "check-assets") {
    const manifestPath = resolve(projectRoot, requireOption(options, "manifest"));
    const manifest = await validateManifest(await readJson(manifestPath));
    return { command, ...(await checkAssets({ manifest, config, projectRoot })) };
  }

  if (command === "pipeline") {
    const scan = await scanProject({ projectRoot, configPath });
    const manifest = await planIllustrations(scan, config);
    const manifestPath = outputPath(options, config, projectRoot, "manifest.json");
    const assetResult = await generateAssets({ manifest, config, projectRoot, provider: options.provider || "manifest" });
    await writeJson(manifestPath, manifest);
    if (assetResult.pending.length > 0) {
      return { command, status: "awaiting-import", manifest: manifestPath, ...assetResult };
    }
    const applyResult = await applyManifest({ manifest, config, projectRoot, dryRun: options["dry-run"] === true });
    if (options["dry-run"] === true) return { command, status: "dry-run", manifest: manifestPath, ...assetResult, applyResult };
    const checkResult = await checkManifest({ manifest, config, projectRoot });
    return { command, status: "ok", manifest: manifestPath, ...assetResult, applyResult, checkResult };
  }

  throw new Error(`Unknown command: ${command || "(none)"}`);
}

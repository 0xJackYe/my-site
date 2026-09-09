import { access, readFile } from "node:fs/promises";
import sharp from "sharp";
import {
  projectPath,
  sha256,
  writeBinaryAtomic,
  writeTextAtomic,
} from "./core.mjs";
import { validateImageApiResponse, validateManifest } from "./schema.mjs";
import { renderSvg } from "./svg.mjs";

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function publicPath(config, webPath, projectRoot) {
  const publicRelative = `${config.publicAssetsDir.replace(/\\/g, "/").replace(/\/+$|^public\/?/g, "")}/${webPath.split("/").at(-1)}`;
  return projectPath(projectRoot, `public/${publicRelative}`);
}

async function renderLocalizedSvg(candidate, language, config, projectRoot) {
  const asset = candidate.assets[language];
  const svg = renderSvg(candidate, language);
  const serialized = `${svg}\n`;
  const sourcePath = projectPath(projectRoot, asset.sourcePath);
  const targetPath = publicPath(config, asset.webPath, projectRoot);
  await writeTextAtomic(sourcePath, serialized);
  await writeTextAtomic(targetPath, serialized);
  const digest = sha256(Buffer.from(serialized));
  asset.sha256 = digest;
  return { imageId: candidate.imageId, language, sourcePath: asset.sourcePath, webPath: asset.webPath, sha256: digest };
}

export async function installRaster({ candidate, inputPath, config, projectRoot }) {
  if (candidate.mediaType !== "raster" || candidate.languageStrategy !== "shared-raster") {
    throw new Error(`${candidate.imageId} is not a shared raster candidate`);
  }
  const input = await readFile(inputPath);
  const metadata = await sharp(input, { failOn: "error" }).metadata();
  if (!metadata.width || !metadata.height || metadata.width < 1200 || metadata.height < 800) {
    throw new Error(`Raster ${candidate.imageId} must be at least 1200x800; received ${metadata.width ?? 0}x${metadata.height ?? 0}`);
  }
  if (!new Set(["png", "jpeg", "webp", "avif", "tiff"]).has(metadata.format)) {
    throw new Error(`Unsupported raster format for ${candidate.imageId}: ${metadata.format ?? "unknown"}`);
  }

  const normalized = sharp(input, { failOn: "error" }).rotate().resize({
    width: 1536,
    height: 1024,
    fit: "cover",
    position: "attention",
    withoutEnlargement: false,
  });
  const sourceBuffer = await normalized.clone().png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  const webBuffer = await normalized.clone().webp({ quality: 82, effort: 6, smartSubsample: true }).toBuffer();
  const asset = candidate.assets.shared;
  const sourcePath = projectPath(projectRoot, asset.sourcePath);
  const targetPath = publicPath(config, asset.webPath, projectRoot);
  await writeBinaryAtomic(sourcePath, sourceBuffer);
  await writeBinaryAtomic(targetPath, webBuffer);
  asset.width = 1536;
  asset.height = 1024;
  asset.sha256 = sha256(webBuffer);
  return {
    imageId: candidate.imageId,
    sourcePath: asset.sourcePath,
    webPath: asset.webPath,
    width: asset.width,
    height: asset.height,
    sourceBytes: sourceBuffer.length,
    webBytes: webBuffer.length,
    sha256: asset.sha256,
  };
}

async function requestOpenAiImage(candidate, { timeoutMs = 120000, retries = 2 } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for --provider openai");
  const prompt = `${candidate.prompt}\n\nNegative constraints: ${candidate.negativeConstraints.join("; ")}.`;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-image-2",
          prompt,
          size: "1536x1024",
          quality: "medium",
        }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = payload?.error?.message || `${response.status} ${response.statusText}`;
        const error = new Error(`OpenAI image request failed: ${message}`);
        error.retryable = response.status === 429 || response.status >= 500;
        throw error;
      }
      return Buffer.from(validateImageApiResponse(payload), "base64");
    } catch (error) {
      lastError = error;
      const retryable = error.name === "AbortError" || error.retryable === true || error.cause?.code === "ECONNRESET";
      if (!retryable || attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, 750 * (2 ** attempt)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`Unable to generate ${candidate.imageId} after ${retries + 1} attempts: ${lastError?.message ?? "unknown error"}`);
}

export async function generateAssets({ manifest, config, projectRoot, provider = "manifest" }) {
  await validateManifest(manifest);
  if (!new Set(["manifest", "openai"]).has(provider)) {
    throw new Error(`Unsupported generation provider: ${provider}`);
  }
  const generated = [];
  const pending = [];
  for (const candidate of manifest.candidates) {
    if (candidate.mediaType === "svg") {
      generated.push(await renderLocalizedSvg(candidate, "zh", config, projectRoot));
      generated.push(await renderLocalizedSvg(candidate, "en", config, projectRoot));
      continue;
    }

    const sourcePath = projectPath(projectRoot, candidate.assets.shared.sourcePath);
    const targetPath = publicPath(config, candidate.assets.shared.webPath, projectRoot);
    if (await exists(sourcePath) && await exists(targetPath) && candidate.assets.shared.sha256) {
      generated.push({ imageId: candidate.imageId, status: "existing", webPath: candidate.assets.shared.webPath });
      continue;
    }
    if (provider === "manifest") {
      pending.push({
        imageId: candidate.imageId,
        prompt: candidate.prompt,
        negativeConstraints: candidate.negativeConstraints,
        expectedAspectRatio: candidate.aspectRatio,
      });
      continue;
    }
    const apiImage = await requestOpenAiImage(candidate);
    const temporaryPath = projectPath(projectRoot, `${config.workDir}/${candidate.imageId}-openai.png`);
    await writeBinaryAtomic(temporaryPath, apiImage);
    generated.push(await installRaster({ candidate, inputPath: temporaryPath, config, projectRoot }));
  }
  await validateManifest(manifest);
  return { generated, pending };
}

export async function verifyAsset(candidate, language, config, projectRoot) {
  const key = candidate.languageStrategy === "shared-raster" ? "shared" : language;
  const asset = candidate.assets[key];
  if (!asset) throw new Error(`Missing ${key} asset metadata for ${candidate.imageId}`);
  const sourcePath = projectPath(projectRoot, asset.sourcePath);
  const targetPath = publicPath(config, asset.webPath, projectRoot);
  if (!await exists(sourcePath)) throw new Error(`Missing source asset: ${asset.sourcePath}`);
  if (!await exists(targetPath)) throw new Error(`Missing web asset: ${asset.webPath}`);
  const webBuffer = await readFile(targetPath);
  const digest = sha256(webBuffer);
  if (!asset.sha256 || digest !== asset.sha256) {
    throw new Error(`Asset checksum mismatch for ${candidate.imageId}/${key}`);
  }
  const metadata = await sharp(webBuffer, { failOn: "error" }).metadata();
  if (metadata.width !== asset.width || metadata.height !== asset.height) {
    throw new Error(`Asset dimensions mismatch for ${candidate.imageId}/${key}`);
  }
  return { asset, sourcePath, targetPath, bytes: webBuffer.length };
}

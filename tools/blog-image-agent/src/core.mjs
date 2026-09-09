import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const agentRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const defaultProjectRoot = resolve(agentRoot, "..", "..");
export const defaultConfigPath = resolve(agentRoot, "config", "articles.json");
export const defaultSchemaPath = resolve(agentRoot, "schema", "manifest.schema.json");

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeText(value) {
  return String(value ?? "")
    .replace(/\u200b/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([:：,，.。;；!?！？])/g, "$1")
    .trim();
}

export function excerpt(value, length = 96) {
  const text = normalizeText(value);
  return text.length <= length ? text : text.slice(0, length).trimEnd();
}

export function stripMarkdown(value) {
  return normalizeText(
    String(value ?? "")
      .replace(/<!--[^]*?-->/g, " ")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^>\s?/gm, "")
      .replace(/^\s*(?:[-+*]|\d+[.)])\s+/gm, "")
      .replace(/[|*_~`]/g, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

export function toPosix(value) {
  return value.replaceAll("\\", "/");
}

export function projectPath(projectRoot, value) {
  const root = resolve(projectRoot);
  const target = resolve(root, value);
  const rel = relative(root, target);
  if (rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))) {
    return target;
  }
  throw new Error(`Path escapes project root: ${value}`);
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function writeJson(path, data) {
  await writeTextAtomic(path, `${JSON.stringify(data, null, 2)}\n`);
}

export async function writeTextAtomic(path, data) {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, data, "utf8");
  await rename(tempPath, path);
}

export async function writeBinaryAtomic(path, data) {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, data);
  await rename(tempPath, path);
}

export async function loadConfig({ projectRoot = defaultProjectRoot, configPath = defaultConfigPath } = {}) {
  const config = await readJson(configPath);
  if (config.version !== 1 || !Array.isArray(config.articles) || config.articles.length === 0) {
    throw new Error(`Invalid agent config: ${configPath}`);
  }
  for (const article of config.articles) {
    if (!article.id || !article.zh?.file || !article.en?.file) {
      throw new Error(`Invalid article mapping in ${configPath}`);
    }
    projectPath(projectRoot, article.zh.file);
    projectPath(projectRoot, article.en.file);
  }
  projectPath(projectRoot, config.indexHtml);
  projectPath(projectRoot, config.publicAssetsDir);
  projectPath(projectRoot, config.sourceAssetsDir);
  return config;
}

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
    } else {
      options[key] = next;
      index += 1;
    }
  }
  return { command, options };
}

export function requireOption(options, name) {
  const value = options[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required option --${name}`);
  }
  return value;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function escapeXml(value) {
  return escapeHtml(value).replaceAll("'", "&apos;");
}

export function roundScore(value) {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}

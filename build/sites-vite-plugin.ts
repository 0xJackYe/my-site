import { access, appendFile, cp, mkdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export function sites(): Plugin {
  let root = process.cwd();
  return {
    name: "sites",
    apply: "build",
    configResolved(config) {
      root = config.root;
    },
    async closeBundle() {
      const outputDirectory = resolve(root, "dist", ".openai");
      const clientDirectory = resolve(root, "dist", "client");
      const hostingConfig = resolve(root, ".openai", "hosting.json");
      const siteHtml = resolve(root, "index.html");
      const headersFile = resolve(clientDirectory, "_headers");
      await rm(outputDirectory, { recursive: true, force: true });
      await mkdir(outputDirectory, { recursive: true });
      await mkdir(clientDirectory, { recursive: true });
      if (await exists(hostingConfig)) {
        await cp(hostingConfig, resolve(outputDirectory, "hosting.json"));
      }
      if (await exists(siteHtml)) {
        await cp(siteHtml, resolve(clientDirectory, "index.html"));
      }
      const existingHeaders = (await exists(headersFile)) ? await readFile(headersFile, "utf8") : "";
      if (!existingHeaders.includes("# Personal site cache policy")) {
        await appendFile(headersFile, [
          "",
          "# Personal site cache policy",
          "/",
          "  Cache-Control: public, max-age=60, stale-while-revalidate=86400",
          "/index.html",
          "  Cache-Control: public, max-age=60, stale-while-revalidate=86400",
          "/assets/*",
          "  Cache-Control: public, max-age=604800, stale-while-revalidate=2592000",
          "/trip%20photos/*",
          "  Cache-Control: public, max-age=604800, stale-while-revalidate=2592000",
          "  Content-Type: image/webp",
          "",
        ].join("\n"), "utf8");
      }
    },
  };
}

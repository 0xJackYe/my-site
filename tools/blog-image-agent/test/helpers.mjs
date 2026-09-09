import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeText } from "../src/core.mjs";

function markdownToSimpleHtml(markdown) {
  const blocks = markdown.replace(/\r\n/g, "\n").split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  return blocks.map((block) => {
    if (/^#\s+/.test(block)) return "";
    if (/^!\[/.test(block)) {
      const match = block.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
      return `<figure><img src="${match[2]}" alt="${match[1]}"></figure>`;
    }
    const text = normalizeText(block.replace(/^>\s?/gm, "").replace(/[*_]/g, ""));
    return `<p>${text}</p>`;
  }).join("\n");
}

export async function createFixture({ id = "what-is-bitcoin", zh, en, htmlTransform } = {}) {
  const root = await mkdtemp(join(tmpdir(), "blog-image-agent-"));
  await mkdir(join(root, "article"), { recursive: true });
  await mkdir(join(root, "tools", "blog-image-agent", "config"), { recursive: true });
  const zhFile = "article/zh.md";
  const enFile = "article/en.md";
  await writeFile(join(root, zhFile), zh, "utf8");
  await writeFile(join(root, enFile), en, "utf8");
  let zhHtml = markdownToSimpleHtml(zh);
  let enHtml = markdownToSimpleHtml(en);
  if (htmlTransform) ({ zhHtml, enHtml } = htmlTransform({ zhHtml, enHtml }));
  const html = `<!doctype html>
<html><body><section id="articles"><article data-article="${id}">
<div class="article-content" data-article-lang="en" lang="en">${enHtml}</div>
<div class="article-content" data-article-lang="zh" lang="zh-CN">${zhHtml}</div>
</article></section></body></html>\n`;
  await writeFile(join(root, "index.html"), html, "utf8");
  const config = {
    version: 1,
    indexHtml: "index.html",
    publicAssetsDir: "public/assets/blog",
    sourceAssetsDir: "tools/blog-image-agent/generated/source",
    workDir: "tools/blog-image-agent/generated/work",
    articles: [{
      id,
      zh: { file: zhFile, title: "中文标题" },
      en: { file: enFile, title: "English title" },
    }],
  };
  const configPath = join(root, "tools", "blog-image-agent", "config", "articles.json");
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return { root, configPath, config, zhFile, enFile };
}

export async function readFixture(fixture, relativePath) {
  return readFile(join(fixture.root, relativePath), "utf8");
}

export const bitcoinZh = `# 什么是比特币？

简单来说比特币是一个分布式账本。传统的记账由一个机构完成，矿工共同维护账本并排除恶意节点。

比特币的网络是由区块组成的。交易先广播，进入等待区，矿工按手续费打包进区块，后续区块形成确认。

用户则是比特币生态的终端角色。矿工、开发者和用户可以拒绝不认同的规则，形成三权分立。\n`;

export const bitcoinEn = `# What Is Bitcoin?

Put simply, Bitcoin is a distributed ledger. Traditional bookkeeping relies on one institution, while miners maintain matching copies and reject a malicious node.

The Bitcoin network consists of blocks linked together in a chain. A transaction is broadcast, waits for a miner, enters a block, and gains confirmation according to fees.

Users are the final participants in the Bitcoin ecosystem. Miners, developers, and users may refuse rules and form a separation of powers.\n`;

export const investmentZh = `# 关于投资的心理学

很多时候，事实根本没有发生变化，变化的只是价格。价格改变情绪，情绪筛选信息，信息证明情绪，最后形成循环。

如果一个人站在一厘米高的木板上，他可以保持平衡。把木板放到一百米高，仓位和犯错代价会让身体僵硬。\n`;

export const investmentEn = `# The Psychology of Investing

Often, the facts have not changed at all. Only the price has changed. Price changes mood, mood filters information, and selected evidence proves the mood, forming a loop.

A person can balance comfortably on a board one centimeter above the ground. Put it one hundred meters high and position size changes the cost of a mistake and the ability to balance.\n`;

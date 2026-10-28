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

传统的账本由一个机构来记。比特币换了一种做法：节点各存一份账本，新区块不合规则就会被拒绝。

一笔转账通常要等 20 到 30 分钟才算到账。矿工把交易打包进区块算一次确认，手续费高的交易优先。

矿工、开发者、用户，三方的权力来源各不相同。谁都可以拒绝不认同的规则，有点像三权分立。\n`;

export const bitcoinEn = `# What Is Bitcoin?

Traditional bookkeeping relies on one institution. Bitcoin does it differently: thousands of nodes keep a copy of the ledger, and an invalid block is rejected.

A transfer usually takes 20 to 30 minutes to arrive. A miner includes the transaction in a block, each later block adds a confirmation, and higher fees go first.

Miners, developers and users draw their power from different places. Any of them can refuse rules they reject, a little like a separation of powers.\n`;

export const investmentZh = `# 关于投资的心理学

很多时候，事实一点都没变，变的只是价格。价格改变情绪，情绪筛选信息，信息又证明情绪是对的，循环就这样转了起来。

站在离地一厘米的木板上，谁都能保持平衡。把木板架到一百米高，仓位和犯错的代价会让身体僵住。\n`;

export const investmentEn = `# The Psychology of Investing

Often the facts haven’t changed at all. Only the price has. Price changes mood, mood filters information, and the evidence that gets through seems to prove the mood right, closing the loop.

Picture a board one centimeter off the ground: anyone can keep their balance. Raise it one hundred meters and position size changes the cost of a mistake.\n`;

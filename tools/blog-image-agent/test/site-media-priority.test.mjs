import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const indexPath = new URL("../../../index.html", import.meta.url);

test("site defers agent illustrations until the active article and language need them", async () => {
  const html = await readFile(indexPath, "utf8");

  assert.match(
    html,
    /querySelectorAll\('\.article-figure:not\(\.article-figure--agent\) img'\)/,
    "background warmup should leave generated article illustrations lazy",
  );
  assert.doesNotMatch(
    html,
    /var chartImages = document\.querySelectorAll\('\.article-figure img'\)/,
    "background warmup must not fetch every article illustration",
  );
  assert.match(
    html,
    /\.article-entry\.is-active-article \.article-content\[data-article-lang="' \+ lang \+ '"\] \.article-figure img/,
    "only the visible article's current-language images should be prioritized",
  );
  assert.match(
    html,
    /if \(document\.body\.classList\.contains\('article-reader'\)\) prioritizeViewMedia\('articles'\)/,
    "switching article language should prioritize the newly visible image set",
  );
});

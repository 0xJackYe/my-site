import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { renderSvg } from "../src/svg.mjs";
import { opportunityTemplates } from "../src/templates.mjs";

test("every deterministic template renders as valid bilingual SVG", async () => {
  for (const template of opportunityTemplates.filter((item) => item.mediaType === "svg")) {
    const candidate = {
      imageId: template.id,
      alt: template.alt,
      caption: template.caption,
      assets: {
        zh: { width: template.width, height: template.height },
        en: { width: template.width, height: template.height },
      },
    };
    for (const language of ["zh", "en"]) {
      const svg = renderSvg(candidate, language);
      const metadata = await sharp(Buffer.from(svg)).metadata();
      assert.equal(metadata.format, "svg", `${template.id}/${language}`);
      assert.equal(metadata.width, template.width, `${template.id}/${language}`);
      assert.equal(metadata.height, template.height, `${template.id}/${language}`);
    }
  }
});

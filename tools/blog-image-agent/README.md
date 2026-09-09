# Blog Image Agent

This CLI audits bilingual Markdown articles and their rendered HTML, plans a small number of useful illustrations, creates deterministic diagrams or imports/generated raster art, applies both sources atomically, and verifies the result.

## Commands

```powershell
node tools/blog-image-agent/cli.mjs scan --out tools/blog-image-agent/generated/work/scan.json
node tools/blog-image-agent/cli.mjs plan --scan tools/blog-image-agent/generated/work/scan.json --out tools/blog-image-agent/generated/work/manifest.json
node tools/blog-image-agent/cli.mjs generate --manifest tools/blog-image-agent/generated/work/manifest.json --provider manifest
node tools/blog-image-agent/cli.mjs import --manifest tools/blog-image-agent/generated/work/manifest.json --id investment-high-wire --file C:\path\to\image.png
node tools/blog-image-agent/cli.mjs check-assets --manifest tools/blog-image-agent/generated/work/manifest.json
node tools/blog-image-agent/cli.mjs apply --manifest tools/blog-image-agent/generated/work/manifest.json
node tools/blog-image-agent/cli.mjs check --manifest tools/blog-image-agent/generated/work/manifest.json
```

`generate --provider manifest` renders all deterministic SVGs and prints the raster jobs that still need an imported image. Use `--provider openai` to generate those raster jobs with `OPENAI_API_KEY` and the current `gpt-image-2` Images API. The OpenAI provider has explicit timeouts, retries, response validation, and image validation.

`apply` fails closed when an article changed after planning, an anchor is missing or ambiguous, or any asset is absent. Every insertion has a stable `data-image-id`, so running it again is a no-op. Markdown and `index.html` are prepared in memory and written together only after every check succeeds.

Run the test suite with:

```powershell
npm run test:blog-images
```

## Checked-in site run

`manifests/site-2026-09-09.json` is the audited manifest applied to the current
site. It records the stable anchors, decisions, localized copy, asset dimensions,
and content hashes for the four illustrated bilingual articles. Because those
articles now contain images, a fresh scan correctly skips them; use this manifest
for repeatable `check` or idempotent `apply` verification.

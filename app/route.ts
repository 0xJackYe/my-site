// vinext resolves Vite raw imports during the build.
// @ts-ignore -- a clean checkout has no ambient type for the `?raw` query.
import siteHtml from "../index.html?raw";

export async function GET() {
  return new Response(siteHtml, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=60, stale-while-revalidate=86400",
    },
  });
}

import siteHtml from "../index.html?raw";

export async function GET() {
  return new Response(siteHtml, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=60, stale-while-revalidate=86400",
    },
  });
}

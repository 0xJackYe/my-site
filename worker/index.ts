import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

function withCacheHeaders(response: Response, cacheControl: string, contentType?: string): Response {
  const headers = new Headers(response.headers);
  headers.set("cache-control", cacheControl);
  if (contentType) headers.set("content-type", contentType);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (env?.ASSETS && (url.pathname === "/" || url.pathname === "/index.html")) {
      const assetUrl = new URL(request.url);
      assetUrl.pathname = "/index.html";
      const response = await env.ASSETS.fetch(new Request(assetUrl, request));
      if (response.ok) {
        return withCacheHeaders(
          response,
          "public, max-age=60, stale-while-revalidate=86400",
          "text/html; charset=utf-8",
        );
      }
    }
    if (env?.ASSETS && (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/trip%20photos/") || url.pathname.startsWith("/trip photos/"))) {
      const response = await env.ASSETS.fetch(request);
      if (url.pathname.endsWith(".webp")) {
        return withCacheHeaders(
          response,
          "public, max-age=604800, stale-while-revalidate=2592000",
          "image/webp",
        );
      }
      return response;
    }
    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }
    return handler.fetch(request, env, ctx);
  },
};

export default worker;

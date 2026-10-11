export type DiscoveredFont = {
  family: string;
  style: string;
  weight: string;
  url: string;
};

const maxDocumentBytes = 1_000_000;
const maxFontBytes = 5_000_000;
const maxStylesheets = 12;
const maxResults = 40;

/** Reject local addresses before every request, including redirects. */
export function publicHttpsUrl(value: string, base?: string) {
  const url = new URL(value, base);
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !host.includes(".") ||
    host.includes(":") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)
  ) {
    throw new Error("Enter a public HTTPS website URL.");
  }
  url.hash = "";
  return url;
}

export async function fetchPublic(url: URL, accept: string) {
  let current = url;
  for (let redirects = 0; redirects < 4; redirects++) {
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: accept },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("The website redirected without a destination.");
      current = publicHttpsUrl(location, current.href);
      continue;
    }
    if (response.status === 403) {
      throw new Error(
        "This website blocked access (403). Add a font file or use another font URL.",
      );
    }
    if (!response.ok) throw new Error(`The website returned ${response.status}.`);
    return { response, url: current };
  }
  throw new Error("The website redirected too many times.");
}

export async function readLimited(response: Response, limit: number) {
  const declaredSize = Number(response.headers.get("content-length"));
  if (declaredSize > limit) throw new Error("The remote file is too large.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The remote file is empty.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error("The remote file is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function attribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function cssValue(block: string, property: string) {
  return block.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "i"))?.[1]?.trim();
}

function findImports(css: string) {
  return [...css.matchAll(/@import\s+(?:url\(\s*)?["']?([^"'\s)]+)["']?\s*\)?/gi)].map(
    (match) => match[1],
  );
}

function fontFaces(css: string, base: string) {
  const found: DiscoveredFont[] = [];
  for (const match of css.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
    const block = match[1];
    const family = cssValue(block, "font-family")?.replace(/^['"]|['"]$/g, "");
    const src = cssValue(block, "src");
    if (!family || !src) continue;
    const candidates = [
      ...src.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)(?:\s*format\(\s*["']?([^"')]+))?/gi),
    ];
    const chosen =
      candidates.find((candidate) => /woff2/i.test(candidate[2] ?? candidate[1])) ?? candidates[0];
    if (!chosen || chosen[1].startsWith("data:")) continue;
    try {
      found.push({
        family,
        style: cssValue(block, "font-style") ?? "normal",
        weight: cssValue(block, "font-weight") ?? "400",
        url: publicHttpsUrl(chosen[1], base).href,
      });
    } catch {
      // Ignore local or malformed URLs in third-party CSS.
    }
  }
  return found;
}

/** Inspect the document and linked CSS. JavaScript-generated styles are outside this scan. */
export async function scanWebsite(urlValue: string) {
  const siteUrl = publicHttpsUrl(urlValue);
  const page = await fetchPublic(siteUrl, "text/html");
  const contentType = page.response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) throw new Error("That URL did not return a website.");
  const html = new TextDecoder().decode(await readLimited(page.response, maxDocumentBytes));
  const stylesheets: string[] = [];
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/(?:^|\s)stylesheet(?:\s|$)/i.test(attribute(tag, "rel") ?? "")) continue;
    const href = attribute(tag, "href");
    if (href) stylesheets.push(href);
  }
  const queue = stylesheets.map((href) => ({ href, base: page.url.href }));
  const found = html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi);
  const fonts: DiscoveredFont[] = [];
  for (const match of found) {
    fonts.push(...fontFaces(match[1], page.url.href));
    queue.push(...findImports(match[1]).map((href) => ({ href, base: page.url.href })));
  }

  const visited = new Set<string>();
  while (queue.length && visited.size < maxStylesheets && fonts.length < maxResults) {
    const next = queue.shift();
    if (!next) break;
    let cssUrl: URL;
    try {
      cssUrl = publicHttpsUrl(next.href, next.base);
    } catch {
      continue;
    }
    if (visited.has(cssUrl.href)) continue;
    visited.add(cssUrl.href);
    try {
      const sheet = await fetchPublic(cssUrl, "text/css");
      const css = new TextDecoder().decode(await readLimited(sheet.response, maxDocumentBytes));
      fonts.push(...fontFaces(css, sheet.url.href));
      queue.push(...findImports(css).map((href) => ({ href, base: sheet.url.href })));
    } catch {
      // Continue scanning other stylesheets if one is unavailable.
    }
  }

  const unique = new Map(
    fonts.map((font) => [`${font.family}|${font.style}|${font.weight}|${font.url}`, font]),
  );
  return { site: page.url.hostname, fonts: [...unique.values()].slice(0, maxResults) };
}

export async function fetchFontResource(rawUrl: string) {
  const result = await fetchPublic(
    publicHttpsUrl(rawUrl),
    "font/woff2,font/woff,font/ttf,font/otf",
  );
  const bytes = await readLimited(result.response, maxFontBytes);
  const signature = String.fromCharCode(...bytes.slice(0, 4));
  const type =
    signature === "wOF2"
      ? "font/woff2"
      : signature === "wOFF"
        ? "font/woff"
        : signature === "OTTO" || signature === "\x00\x01\x00\x00" || signature === "true"
          ? "font/ttf"
          : undefined;
  if (!type) throw new Error("The remote URL did not return a supported font file.");
  return new Response(bytes.buffer as ArrayBuffer, {
    headers: { "content-type": type, "cache-control": "public, max-age=3600" },
  });
}

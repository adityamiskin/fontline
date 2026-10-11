import type { DiscoveredFont } from "./site-fonts.server";

export type FontSource = {
  id: string;
  name: string;
  family: string;
  kind: "system" | "file" | "url";
  detail: string;
  sourceUrl?: string;
};

export const starterFonts: FontSource[] = [
  {
    id: "system-sans",
    name: "System Sans",
    family: "Arial, Helvetica, sans-serif",
    kind: "system",
    detail: "Browser font",
  },
  {
    id: "georgia",
    name: "Georgia",
    family: "Georgia, serif",
    kind: "system",
    detail: "Browser font",
  },
];

const stylesheet = /\.css(?:$|[?#])/i;

function displayName(value: string) {
  return value
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

function directFontSource(source: string) {
  return `url(${JSON.stringify(source)})`;
}

async function loadFace(name: string, source: string) {
  const id = crypto.randomUUID();
  const family = `Fontline_${id.replaceAll("-", "")}`;
  const face = new FontFace(family, directFontSource(source));
  await face.load();
  document.fonts.add(face);

  return {
    font: {
      id,
      name,
      family: `"${family}"`,
      kind: source.startsWith("blob:") ? "file" : "url",
      detail: source.startsWith("blob:") ? "Uploaded file" : "Font URL",
    } satisfies FontSource,
    dispose: () => document.fonts.delete(face),
  };
}

/** Load an uploaded font for this browser session and release its object URL on removal. */
export async function loadFile(file: File) {
  if (!/\.(woff2?|ttf|otf)$/i.test(file.name)) {
    throw new Error("Choose a WOFF, WOFF2, TTF, or OTF file.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const loaded = await loadFace(displayName(file.name), objectUrl);
    return {
      ...loaded,
      dispose: () => {
        loaded.dispose();
        URL.revokeObjectURL(objectUrl);
      },
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

/** A direct font URL loads through FontFace; a stylesheet needs its declared family. */
export async function loadUrl(rawUrl: string, suppliedName: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Enter a valid HTTPS font or stylesheet URL.");
  }

  if (url.protocol !== "https:") {
    throw new Error("Use an HTTPS URL for remote fonts.");
  }

  const googleFamily =
    url.hostname === "fonts.googleapis.com"
      ? url.searchParams.get("family")?.split(":")[0]
      : undefined;
  const name =
    suppliedName.trim() || googleFamily || displayName(url.pathname.split("/").pop() || "");

  if (url.hostname !== "fonts.googleapis.com" && !stylesheet.test(url.href)) {
    const loaded = await loadFace(name || "Remote font", url.href);
    return {
      ...loaded,
      font: { ...loaded.font, detail: url.hostname },
    };
  }

  if (!name) {
    throw new Error("Enter the CSS font-family name for a stylesheet URL.");
  }

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = url.href;

  try {
    await new Promise<void>((resolve, reject) => {
      link.onload = () => resolve();
      link.onerror = () => reject(new Error("Could not load that stylesheet URL."));
      document.head.append(link);
    });

    const faces = await document.fonts.load(`16px ${JSON.stringify(name)}`);
    if (faces.length === 0) {
      throw new Error("No matching font was found. Check the family name.");
    }

    return {
      font: {
        id: crypto.randomUUID(),
        name,
        family: JSON.stringify(name),
        kind: "url",
        detail: url.hostname,
      } satisfies FontSource,
      dispose: () => link.remove(),
    };
  } catch (error) {
    link.remove();
    throw error;
  }
}

/** Load a font found in a website's CSS through the same-origin font route. */
export async function loadScannedFont(face: DiscoveredFont, site: string) {
  const source = `/api/font-resource?url=${encodeURIComponent(face.url)}`;
  const name = face.style === "normal" ? face.family : `${face.family} ${face.style}`;
  const loaded = await loadFace(name, source);
  return {
    ...loaded,
    font: { ...loaded.font, detail: site, sourceUrl: face.url } satisfies FontSource,
  };
}

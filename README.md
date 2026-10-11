# Fontline

A browser-based font comparison workbench. Add WOFF, WOFF2, TTF, or OTF files, direct HTTPS font URLs, CSS stylesheet URLs (including Google Fonts), or scan a website URL and choose from the fonts found in its CSS. Compare two fonts side by side, on a proof sheet, or with a movable overlay divider. Specimen settings stay in the browser session. Uploaded font files are not sent to a server; website scans and selected remote fonts pass through the Cloudflare Worker.

Website scanning reads the page's HTML, linked stylesheets, and CSS imports. It does not run the page's JavaScript, so fonts added only by scripts may not appear.

Built with TanStack Start, React 19, Vite+ with the OXC React Compiler, Tailwind CSS v4, shadcn/ui, and Bun. It deploys as a Cloudflare Worker.

## Local development

```bash
bun install
bun run dev
```

Open <http://localhost:3000>.

## Checks and build

```bash
bun run check
bun run build
```

`check` runs Vite+'s formatter, linter, and TypeScript check. The build generates the Cloudflare Worker output.

## Deployment

Authenticate once with `bunx wrangler login`, then run:

```bash
bun run deploy
```

The Worker name, custom domain, and compatibility date are in `wrangler.jsonc`.

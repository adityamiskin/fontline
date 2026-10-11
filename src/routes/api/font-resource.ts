import { createFileRoute } from "@tanstack/react-router";
import { fetchFontResource } from "../../site-fonts.server";

export const Route = createFileRoute("/api/font-resource")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const remoteUrl = new URL(request.url).searchParams.get("url");
        if (!remoteUrl) return new Response("Missing font URL.", { status: 400 });
        try {
          return await fetchFontResource(remoteUrl);
        } catch (error) {
          return new Response(error instanceof Error ? error.message : "Could not load font.", {
            status: 400,
          });
        }
      },
    },
  },
});

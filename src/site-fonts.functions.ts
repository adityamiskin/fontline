import { createServerFn } from "@tanstack/react-start";
import { scanWebsite } from "./site-fonts.server";

export const scanWebsiteFonts = createServerFn({ method: "POST" })
  .validator((data: { url: string }) => {
    if (typeof data?.url !== "string" || data.url.length > 2048) {
      throw new Error("Enter a website URL.");
    }
    return data;
  })
  .handler(async ({ data }) => scanWebsite(data.url));

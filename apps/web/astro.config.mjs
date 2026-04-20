import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";

export default defineConfig({
  integrations: [tailwind({ applyBaseStyles: false })],
  server: { host: "0.0.0.0", port: 4325 },
  vite: {
    server: {
      allowedHosts: ["nomos.dashable.dev", "localhost", ".dashable.dev"],
    },
  },
  markdown: {
    shikiConfig: {
      theme: "github-light",
      wrap: true,
    },
  },
});

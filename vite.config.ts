import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { imagesOptimizer } from "@vinext/cloudflare/images/images-optimizer";
import { kvDataAdapter } from "@vinext/cloudflare/cache/kv-data-adapter";

const buildSha =
  process.env.WORKERS_CI_COMMIT_SHA ??
  process.env.GITHUB_SHA ??
  process.env.LUMEO_BUILD_SHA ??
  "";

const deploymentEnvironment =
  process.env.WORKERS_CI === "1"
    ? process.env.WORKERS_CI_BRANCH === "main"
      ? "production"
      : "preview"
    : process.env.GITHUB_ACTIONS === "true"
      ? "ci"
      : "local";

export default defineConfig({
  define: {
    "process.env.LUMEO_BUILD_SHA": JSON.stringify(buildSha),
    "process.env.LUMEO_DEPLOYMENT_ENV": JSON.stringify(deploymentEnvironment),
  },
  plugins: [
    vinext({
      images: { optimizer: imagesOptimizer() },
      cache: {
        data: kvDataAdapter(),
      },
    }),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});

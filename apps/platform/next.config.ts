import type { NextConfig } from "next";
import path from "node:path";
const config: NextConfig = {
  ...(process.env.FLUIVIX_CONTAINER_BUILD === "true"
    ? { output: "standalone" as const }
    : {}),
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  transpilePackages: ["@fluivix/api-client"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};
export default config;

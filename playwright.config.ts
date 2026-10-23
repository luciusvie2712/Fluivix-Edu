import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm exec tsx tooling/e2e-server.ts",
    url: "http://localhost:3000/login",
    timeout: 60000,
    reuseExistingServer: false,
  },
  projects: [
    {
      name: "tenant-chromium",
      use: {
        browserName: "chromium",
        ...(process.platform === "win32" ? { channel: "msedge" } : {}),
      },
    },
  ],
  reporter: [["list"], ["html", { open: "never" }]],
});

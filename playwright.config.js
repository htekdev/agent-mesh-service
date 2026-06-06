// @ts-check
import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for MeshWire dashboard UI tests.
 *
 * Tests use mock auth (MOCK_AUTH=true) so they can access /dashboard
 * without a real GitHub OAuth flow. This makes them suitable for:
 *   - Local development (npm run test:e2e)
 *   - CI/CD (GitHub Actions) before ECS deploy
 *   - QA agent automation (no browser login required)
 *
 * The webServer block starts the Express app on port 3001 with mock auth
 * enabled. Tests hit http://localhost:3001.
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.js",

  // Fail fast in CI; run all tests locally
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,

  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],

  use: {
    baseURL: "http://localhost:3001",
    // Capture trace on first retry for debugging
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Start MeshWire server with mock auth before running tests
  webServer: {
    command: "node src/index.js",
    url: "http://localhost:3001",
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
    env: {
      PORT: "3001",
      MOCK_AUTH: "true",
      NODE_ENV: "test",
      SESSION_SECRET: "playwright-test-secret",
      // DynamoDB not needed for mock auth — point at local region to avoid real calls
      AWS_REGION: "us-east-1",
    },
  },
});

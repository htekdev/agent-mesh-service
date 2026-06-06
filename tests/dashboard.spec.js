// @ts-check
import { test, expect } from "@playwright/test";

/**
 * MeshWire Dashboard — UI Test Suite
 *
 * All tests use mock auth: navigate to /auth/mock first to get a session,
 * then visit /dashboard. No GitHub OAuth required.
 *
 * Run locally:  npm run test:e2e
 * Run in CI:    MOCK_AUTH=true npm run test:e2e
 */

// ─── Setup: authenticate before each test ──────────────────────────────────
test.beforeEach(async ({ page }) => {
  // Hit the mock login route — it creates a session and redirects to /dashboard
  await page.goto("/auth/mock");
  // Should land on the dashboard
  await expect(page).toHaveURL("/dashboard");
});

// ─── 1. Dashboard loads correctly ──────────────────────────────────────────
test("dashboard loads with all sections", async ({ page }) => {
  // Page title
  await expect(page).toHaveTitle(/MeshWire/);

  // Header / nav bar
  await expect(page.locator(".logo")).toBeVisible();
  await expect(page.locator(".bso")).toContainText("Sign out");

  // User pill shows mock user login
  await expect(page.locator("#ul")).toHaveText("meshwire-test", { timeout: 5000 });

  // Step 1 — Authenticate section
  await expect(page.locator(".sec-t", { hasText: "Authenticate" }).first()).toBeVisible();

  // Step 2 — Connect your agent section
  await expect(page.locator(".sec-t", { hasText: "Connect your agent" })).toBeVisible();

  // Step 3 — Your meshes section
  await expect(page.locator(".sec-t", { hasText: "Your meshes" })).toBeVisible();

  // Integrations coming-soon section
  await expect(page.locator(".sec-t", { hasText: "Integrations" })).toBeVisible();
  await expect(page.locator("text=Coming soon")).toBeVisible();
});

// ─── 2. Auth tabs switch (CLI Login ↔ API Token) ───────────────────────────
test("auth tabs switch between CLI Login and API Token", async ({ page }) => {
  // CLI Login tab starts active
  const cliTab = page.locator("#auth-tabs .tab").filter({ hasText: "CLI Login" });
  const tokenTab = page.locator("#auth-tabs .tab").filter({ hasText: "API Token" });

  await expect(cliTab).toHaveClass(/on/);
  await expect(tokenTab).not.toHaveClass(/on/);

  // CLI pane visible, token pane hidden
  await expect(page.locator("#pane-cli")).toBeVisible();
  await expect(page.locator("#pane-token")).toBeHidden();

  // Click API Token tab
  await tokenTab.click();

  // Token tab now active, CLI not
  await expect(tokenTab).toHaveClass(/on/);
  await expect(cliTab).not.toHaveClass(/on/);

  // Token pane visible, CLI pane hidden
  await expect(page.locator("#pane-token")).toBeVisible();
  await expect(page.locator("#pane-cli")).toBeHidden();

  // Switch back to CLI Login
  await cliTab.click();
  await expect(cliTab).toHaveClass(/on/);
  await expect(page.locator("#pane-cli")).toBeVisible();
  await expect(page.locator("#pane-token")).toBeHidden();
});

// ─── 3. Harness tabs switch (Copilot / Hermes / Cursor / Any agent) ─────────
test("harness tabs switch and show correct content", async ({ page }) => {
  const copilotTab = page.locator("#harness-tabs .tab").filter({ hasText: "Copilot" });
  const hermesTab = page.locator("#harness-tabs .tab").filter({ hasText: "Hermes" });
  const cursorTab = page.locator("#harness-tabs .tab").filter({ hasText: "Cursor" });
  const anyTab = page.locator("#harness-tabs .tab").filter({ hasText: "Any agent" });

  // Copilot starts active
  await expect(copilotTab).toHaveClass(/on/);
  await expect(page.locator("#pane-copilot")).toBeVisible();
  await expect(page.locator("#pane-hermes")).toBeHidden();
  await expect(page.locator("#pane-cursor")).toBeHidden();
  await expect(page.locator("#pane-any")).toBeHidden();

  // Copilot pane shows the right command
  await expect(page.locator("#pane-copilot")).toContainText("meshwire init --harness copilot");

  // Switch to Hermes
  await hermesTab.click();
  await expect(hermesTab).toHaveClass(/on/);
  await expect(copilotTab).not.toHaveClass(/on/);
  await expect(page.locator("#pane-hermes")).toBeVisible();
  await expect(page.locator("#pane-copilot")).toBeHidden();
  await expect(page.locator("#pane-hermes")).toContainText("meshwire init --harness hermes");

  // Switch to Cursor
  await cursorTab.click();
  await expect(cursorTab).toHaveClass(/on/);
  await expect(page.locator("#pane-cursor")).toBeVisible();
  await expect(page.locator("#pane-hermes")).toBeHidden();
  await expect(page.locator("#pane-cursor")).toContainText("meshwire init --harness cursor");

  // Switch to Any agent
  await anyTab.click();
  await expect(anyTab).toHaveClass(/on/);
  await expect(page.locator("#pane-any")).toBeVisible();
  await expect(page.locator("#pane-cursor")).toBeHidden();
  // Any agent pane has a mesh selector
  await expect(page.locator("#any-sel")).toBeVisible();

  // Switch back to Copilot
  await copilotTab.click();
  await expect(copilotTab).toHaveClass(/on/);
  await expect(page.locator("#pane-copilot")).toBeVisible();
  await expect(page.locator("#pane-any")).toBeHidden();
});

// ─── 4. Mesh creation flow ────────────────────────────────────────────────
test("can create a mesh and see it in the list", async ({ page }) => {
  // Initially no meshes
  await expect(page.locator("#ml")).toContainText("No meshes yet", { timeout: 5000 });

  // Create a mesh
  await page.locator("#mn").fill("test-fleet");
  await page.locator("button.bp").click();

  // Mesh appears in the list
  await expect(page.locator("#ml")).toContainText("test-fleet", { timeout: 5000 });
  await expect(page.locator(".mempty")).toBeHidden();
});

// ─── 5. Mesh modal opens and closes ──────────────────────────────────────
test("clicking a mesh opens the modal and close button works", async ({ page }) => {
  // Create a mesh first
  await page.locator("#mn").fill("modal-test-mesh");
  await page.locator("button.bp").click();
  await expect(page.locator("#ml")).toContainText("modal-test-mesh", { timeout: 5000 });

  // Modal starts closed
  await expect(page.locator("#ov")).toHaveClass(/off/);

  // Click the mesh row
  await page.locator(".mr").first().click();

  // Modal opens
  await expect(page.locator("#ov")).not.toHaveClass(/off/);

  // Modal shows mesh name
  await expect(page.locator("#mn2")).toHaveText("modal-test-mesh");

  // Modal shows the use command
  await expect(page.locator("#muse")).toContainText("meshwire mesh use");

  // Close the modal
  await page.locator(".mdlx").click();

  // Modal closes
  await expect(page.locator("#ov")).toHaveClass(/off/);
});

// ─── 6. Escape key closes modal ──────────────────────────────────────────
test("Escape key closes the modal", async ({ page }) => {
  // Create and open a mesh
  await page.locator("#mn").fill("escape-test");
  await page.locator("button.bp").click();
  await expect(page.locator("#ml")).toContainText("escape-test", { timeout: 5000 });
  await page.locator(".mr").first().click();
  await expect(page.locator("#ov")).not.toHaveClass(/off/);

  // Press Escape
  await page.keyboard.press("Escape");
  await expect(page.locator("#ov")).toHaveClass(/off/);
});

// ─── 7. Copy buttons exist and are interactive ───────────────────────────
test("copy buttons are present and clickable", async ({ page }) => {
  // At least one copy button exists in the default (Copilot) pane
  const copyBtn = page.locator("#pane-copilot .cp").first();
  await expect(copyBtn).toBeVisible();
  await expect(copyBtn).toBeEnabled();

  // Clicking doesn't throw (clipboard access may be denied in headless, that's OK)
  await copyBtn.click();
  // Button shows feedback (either "Copied!" or stays — doesn't matter for existence test)
  await expect(copyBtn).toBeVisible();
});

// ─── 8. Sign out link exists ─────────────────────────────────────────────
test("sign out button is present", async ({ page }) => {
  await expect(page.locator(".bso")).toContainText("Sign out");
  await expect(page.locator(".bso")).toBeEnabled();
});

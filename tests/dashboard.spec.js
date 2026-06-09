// @ts-check
import { test, expect } from "@playwright/test";

/**
 * MeshWire Dashboard - UI Automation Test Suite
 *
 * All tests use mock auth: navigate to /auth/mock first to get a session,
 * then visit /dashboard. No GitHub OAuth required.
 *
 * Run locally:  npm run test:e2e
 * Run in CI:    MOCK_AUTH=true npm run test:e2e
 */

// --- Setup: authenticate before each test ----------------------------------
test.beforeEach(async ({ page }) => {
  // Hit the mock login route - it creates a session and redirects to /dashboard
  await page.goto("/auth/mock");
  // Should land on the dashboard
  await expect(page).toHaveURL("/dashboard");
});

// --- 1. Dashboard loads correctly ------------------------------------------
test("dashboard loads with all sections", async ({ page }) => {
  // Page title
  await expect(page).toHaveTitle(/MeshWire/);

  // Header / nav bar
  await expect(page.locator(".logo")).toBeVisible();
  await expect(page.locator(".bso")).toContainText("Sign out");

  // User pill shows mock user login
  await expect(page.locator("#ul")).toHaveText("meshwire-test", { timeout: 5000 });

  // Step 1 - Your API token section
  await expect(page.locator(".sec-t", { hasText: /token/i }).first()).toBeVisible();

  // Step 2 - Connect your agent section
  await expect(page.locator(".sec-t", { hasText: "Connect your agent" })).toBeVisible();

  // Step 3 - Your meshes section
  await expect(page.locator(".sec-t", { hasText: "Your meshes" })).toBeVisible();
});

// --- 2. Harness tabs switch and show correct content -----------------------
test("harness tabs switch and show correct content", async ({ page }) => {
  const copilotTab = page.locator("#ht .tab").filter({ hasText: "Copilot" });
  const hermesTab = page.locator("#ht .tab").filter({ hasText: "Hermes" });
  const piTab = page.locator("#ht .tab").filter({ hasText: "Pi" });
  const anyTab = page.locator("#ht .tab").filter({ hasText: /Any/i });

  // Copilot starts active
  await expect(copilotTab).toHaveClass(/on/);
  await expect(page.locator("#pane-copilot")).toBeVisible();
  await expect(page.locator("#pane-hermes")).toBeHidden();

  // Copilot pane shows the right command
  await expect(page.locator("#pane-copilot")).toContainText("meshwire init --harness copilot");

  // Switch to Hermes
  await hermesTab.click();
  await expect(hermesTab).toHaveClass(/on/);
  await expect(copilotTab).not.toHaveClass(/on/);
  await expect(page.locator("#pane-hermes")).toBeVisible();
  await expect(page.locator("#pane-copilot")).toBeHidden();
  await expect(page.locator("#pane-hermes")).toContainText("meshwire init --harness hermes");

  // Switch to Pi
  await piTab.click();
  await expect(piTab).toHaveClass(/on/);
  await expect(page.locator("#pane-pi")).toBeVisible();

  // Switch to Any agent
  await anyTab.click();
  await expect(anyTab).toHaveClass(/on/);
  await expect(page.locator("#pane-any")).toBeVisible();

  // Switch back to Copilot
  await copilotTab.click();
  await expect(copilotTab).toHaveClass(/on/);
  await expect(page.locator("#pane-copilot")).toBeVisible();
});

// --- 3. Mesh creation flow -------------------------------------------------
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

// --- 4. Mesh modal opens and closes ----------------------------------------
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

// --- 5. Escape key closes modal --------------------------------------------
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

// --- 6. Sign out button is present and functional --------------------------
test("sign out button is present", async ({ page }) => {
  await expect(page.locator(".bso")).toContainText("Sign out");
  await expect(page.locator(".bso")).toBeEnabled();
});

// ===========================================================================
// COPY BUTTON TESTS - Validates clipboard functionality end-to-end
// ===========================================================================

test.describe("Copy Token Button", () => {
  test("copy token button exists and is visible", async ({ page }) => {
    const copyBtn = page.locator("button.cp").filter({ hasText: "Copy" }).first();
    await expect(copyBtn).toBeVisible();
    await expect(copyBtn).toBeEnabled();
  });

  test("copy token button copies token to clipboard when token is available", async ({ page, context }) => {
    // Grant clipboard permissions for testing
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    // The mock auth provides a newToken, so the token should be copyable
    const tokenDisplay = page.locator("#tv");
    await expect(tokenDisplay).toBeVisible();

    // The token should be shown (mock auth sets newToken)
    const tokenText = await tokenDisplay.textContent();
    expect(tokenText).toContain("mw_");

    // Click the copy button next to the token
    const copyBtn = page.locator("button.cp[onclick*='copyTok']");
    await expect(copyBtn).toBeVisible();
    await copyBtn.click();

    // Button should show "Copied!" feedback
    await expect(copyBtn).toHaveText("Copied!", { timeout: 2000 });

    // Verify clipboard contents match the token
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain("mw_test_token_abc123def456");

    // After timeout, button text should revert
    await expect(copyBtn).not.toHaveText("Copied!", { timeout: 3000 });
  });

  test("copy token button shows ok class during feedback", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    const copyBtn = page.locator("button.cp[onclick*='copyTok']");
    await copyBtn.click();

    // Should have .ok class while showing feedback
    await expect(copyBtn).toHaveClass(/ok/, { timeout: 1000 });

    // After ~1.8s the class should be removed
    await expect(copyBtn).not.toHaveClass(/ok/, { timeout: 3000 });
  });

  test("copy token uses fallback when clipboard API unavailable", async ({ page }) => {
    // Override clipboard API to simulate insecure context
    await page.evaluate(() => {
      Object.defineProperty(window, "isSecureContext", { value: false, writable: true });
    });

    const copyBtn = page.locator("button.cp[onclick*='copyTok']");
    await copyBtn.click();

    // Fallback uses execCommand('copy') - button should still show feedback
    await expect(copyBtn).toHaveText("Copied!", { timeout: 2000 });
  });
});

test.describe("Copy Command Buttons", () => {
  test("copilot pane copy button copies the init command", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    const copyBtn = page.locator("#pane-copilot .cp").first();
    await expect(copyBtn).toBeVisible();
    await copyBtn.click();

    // Should show "Copied!" feedback
    await expect(copyBtn).toHaveText("Copied!", { timeout: 2000 });

    // Clipboard should contain the meshwire init command
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain("meshwire init --harness copilot");
  });

  test("hermes pane copy button copies the init command", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    // Switch to Hermes tab
    const hermesTab = page.locator("#ht .tab").filter({ hasText: "Hermes" });
    await hermesTab.click();
    await expect(page.locator("#pane-hermes")).toBeVisible();

    const copyBtn = page.locator("#pane-hermes .cp").first();
    await copyBtn.click();

    await expect(copyBtn).toHaveText("Copied!", { timeout: 2000 });
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain("meshwire init --harness hermes");
  });

  test("pi pane copy button copies the init command", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    // Switch to Pi tab
    const piTab = page.locator("#ht .tab").filter({ hasText: "Pi" });
    await piTab.click();
    await expect(page.locator("#pane-pi")).toBeVisible();

    const copyBtn = page.locator("#pane-pi .cp").first();
    await copyBtn.click();

    await expect(copyBtn).toHaveText("Copied!", { timeout: 2000 });
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain("meshwire init --harness pi");
  });

  test("modal copy buttons work after mesh creation", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    // Create a mesh
    await page.locator("#mn").fill("clipboard-mesh");
    await page.locator("button.bp").click();
    await expect(page.locator("#ml")).toContainText("clipboard-mesh", { timeout: 5000 });

    // Open modal
    await page.locator(".mr").first().click();
    await expect(page.locator("#ov")).not.toHaveClass(/off/);

    // Copy the "meshwire mesh use" command
    const useCopyBtn = page.locator("button.cp[onclick*='cpUse']");
    await useCopyBtn.click();
    await expect(useCopyBtn).toHaveText("Copied!", { timeout: 2000 });

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain("meshwire mesh use");
  });

  test("modal prompt copy button copies agent prompt", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    // Create a mesh and open modal
    await page.locator("#mn").fill("prompt-copy-mesh");
    await page.locator("button.bp").click();
    await expect(page.locator("#ml")).toContainText("prompt-copy-mesh", { timeout: 5000 });
    await page.locator(".mr").first().click();
    await expect(page.locator("#ov")).not.toHaveClass(/off/);

    // Copy the agent prompt
    const promptCopyBtn = page.locator("button.cp[onclick*='cpPrm']");
    await promptCopyBtn.click();
    await expect(promptCopyBtn).toHaveText("Copied!", { timeout: 2000 });

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain("MeshWire");
    expect(clipboardText).toContain("/integrate");
  });
});

// ===========================================================================
// TOKEN UX TESTS - Show/Hide, Regenerate button
// ===========================================================================

test.describe("Token UX", () => {
  test("token display shows the full token on initial mock login", async ({ page }) => {
    // Mock auth provides newToken, so it should be visible
    const tokenDisplay = page.locator("#tv");
    const tokenText = await tokenDisplay.textContent();
    expect(tokenText).toContain("mw_test_token_abc123def456");
  });

  test("show/hide button toggles token visibility", async ({ page }) => {
    const tokenDisplay = page.locator("#tv");
    const toggleBtn = page.locator("button.bs").filter({ hasText: /Show/i });

    // Token starts revealed (mock login provides newToken)
    const initialText = await tokenDisplay.textContent();
    expect(initialText).toContain("mw_test_token");

    // Click hide
    await toggleBtn.click();
    const hiddenText = await tokenDisplay.textContent();
    expect(hiddenText).not.toContain("abc123def456");

    // Click show again
    await toggleBtn.click();
    const revealedText = await tokenDisplay.textContent();
    expect(revealedText).toContain("mw_test_token_abc123def456");
  });

  test("regenerate button exists and is clickable", async ({ page }) => {
    const regenBtn = page.locator("button.bg").filter({ hasText: /Regenerate/i });
    await expect(regenBtn).toBeVisible();
    await expect(regenBtn).toBeEnabled();
  });
});

// ===========================================================================
// NAVIGATION & LANDING PAGE TESTS
// ===========================================================================

test.describe("Navigation", () => {
  test("logo links back to homepage", async ({ page }) => {
    const logo = page.locator(".logo");
    await expect(logo).toHaveAttribute("href", "/");
  });

  test("sign out redirects to landing page", async ({ page }) => {
    await page.locator(".bso").click();
    // Should redirect to landing page (which is /)
    await expect(page).toHaveURL("/");
  });
});

// ===========================================================================
// NO CONSOLE ERRORS
// ===========================================================================

test("no console errors on dashboard load", async ({ page }) => {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  // Navigate fresh (beforeEach already did this, but let's be explicit)
  await page.goto("/auth/mock");
  await page.waitForLoadState("networkidle");

  // Filter out expected messages (e.g., favicon 404)
  const realErrors = errors.filter(
    (e) => !e.includes("favicon") && !e.includes("404")
  );
  expect(realErrors).toHaveLength(0);
});

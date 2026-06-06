/**
 * Mock Auth — bypass GitHub OAuth for local testing and QA automation.
 *
 * SAFETY: Only activates when BOTH conditions are true:
 *   1. MOCK_AUTH=true is set in the environment
 *   2. NODE_ENV is NOT 'production'
 *
 * Production ECS tasks never set MOCK_AUTH=true, so this code is inert in prod.
 */

export const MOCK_USER_ID = "mock-test-user-001";

export const MOCK_USER = {
  user_id: MOCK_USER_ID,
  github_id: "mock-github-id",
  login: "meshwire-test",
  email: "test@meshwire.io",
  avatar_url: "https://avatars.githubusercontent.com/u/9919?s=40&v=4",
  plan: "free",
  token_hash: "mock-token-hash-for-testing-only-never-in-prod",
  token_suffix: "testonly",
  maskedToken: "mw_••••••••••••••••testonly",
  tokenSuffix: "testonly",
  created_at: new Date().toISOString(),
};

/**
 * Returns true if mock auth mode is enabled (dev/test only).
 */
export function isMockAuthEnabled() {
  return process.env.MOCK_AUTH === "true" && process.env.NODE_ENV !== "production";
}

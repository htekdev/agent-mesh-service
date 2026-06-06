import { Router } from "express";
import passport from "passport";
import { Strategy as GitHubStrategy } from "passport-github2";
import { createUser, getUserByGithubId, getUserById, regenerateToken } from "../db/users.js";
import { isMockAuthEnabled, MOCK_USER, MOCK_USER_ID } from "../middleware/mockAuth.js";

const DEFAULT_BASE_URL =
  process.env.BASE_URL ||
  "https://meshwire.io";

let passportConfigured = false;

function getPrimaryEmail(profile) {
  return profile.emails?.find((entry) => entry.verified)?.value || profile.emails?.[0]?.value || "";
}

function toSessionUser(user) {
  return {
    user_id: user.user_id,
    login: user.login,
    email: user.email,
    avatar_url: user.avatar_url,
    plan: user.plan,
    created_at: user.created_at,
  };
}

export function requireSessionAuth(req, res, next) {
  if (req.isAuthenticated?.() && req.user) {
    return next();
  }

  return res.status(401).json({ error: "Sign in with GitHub to access the dashboard." });
}

export function configurePassport() {
  if (passportConfigured) {
    return;
  }

  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID || "meshwire-github-client-id",
        clientSecret: process.env.GITHUB_CLIENT_SECRET || "meshwire-github-client-secret",
        callbackURL: `${DEFAULT_BASE_URL}/auth/github/callback`,
        scope: ["user:email"],
        passReqToCallback: true,
      },
      async (req, _accessToken, _refreshToken, profile, done) => {
        try {
          const existingUser = await getUserByGithubId(profile.id);
          if (existingUser) {
            req.session.userId = existingUser.user_id;
            return done(null, existingUser);
          }

          const { user, plainToken } = await createUser({
            githubId: profile.id,
            login: profile.username || profile.displayName || "github-user",
            email: getPrimaryEmail(profile),
            avatarUrl: profile.photos?.[0]?.value || "",
          });

          req.session.userId = user.user_id;
          req.session.newToken = plainToken;
          return done(null, user);
        } catch (error) {
          return done(error);
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    done(null, user.user_id);
  });

  passport.deserializeUser(async (userId, done) => {
    // Return mock user without hitting DynamoDB when mock auth is active
    if (isMockAuthEnabled() && userId === MOCK_USER_ID) {
      return done(null, MOCK_USER);
    }
    try {
      const user = await getUserById(userId);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  passportConfigured = true;
}

export const authRouter = Router();

authRouter.get("/github", passport.authenticate("github", { scope: ["user:email"] }));

// ─── CLI Auth — browser-based login that returns token to local HTTP server ──
// GET /auth/cli?port=PORT — starts GitHub OAuth, stores CLI port in session
authRouter.get("/cli", (req, res) => {
  const port = parseInt(req.query.port, 10);
  if (!port || port < 1024 || port > 65535) {
    return res.status(400).send("Invalid port. Usage: /auth/cli?port=57777");
  }
  // Store CLI port in session so the callback knows to redirect to localhost
  req.session.cliPort = port;
  return passport.authenticate("github", { scope: ["user:email"] })(req, res);
});

// GitHub OAuth callback — handle web and CLI flows.
authRouter.get(
  "/github/callback",
  (req, res, next) => {
    passport.authenticate("github", (err, user) => {
      if (err) {
        console.error("[OAuth] Callback error:", err.message || err);
        const cliPort = req.session?.cliPort;
        if (cliPort) return res.redirect(`http://localhost:${cliPort}?error=auth_error`);
        return res.redirect("/?error=auth_error");
      }
      if (!user) {
        console.warn("[OAuth] No user returned — auth denied or state mismatch");
        const cliPort = req.session?.cliPort;
        if (cliPort) return res.redirect(`http://localhost:${cliPort}?error=auth_failed`);
        return res.redirect("/?error=auth_failed");
      }
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          console.error("[OAuth] Login error:", loginErr.message);
          const cliPort = req.session?.cliPort;
          if (cliPort) return res.redirect(`http://localhost:${cliPort}?error=login_error`);
          return res.redirect("/?error=login_error");
        }

        // CLI flow — send token back to local server
        const cliPort = req.session?.cliPort;
        if (cliPort) {
          delete req.session.cliPort;
          // Get the plain token — for new users it's in session.newToken, for existing we need to re-issue
          const token = req.session.newToken || null;
          if (token) {
            delete req.session.newToken;
            return req.session.save(() => {
              res.redirect(`http://localhost:${cliPort}?token=${encodeURIComponent(token)}&login=${encodeURIComponent(user.login)}`);
            });
          }
          // Existing user — regenerate token so CLI gets a fresh one
          regenerateToken(user.user_id).then((freshToken) => {
            res.redirect(`http://localhost:${cliPort}?token=${encodeURIComponent(freshToken)}&login=${encodeURIComponent(user.login)}`);
          }).catch(() => {
            res.redirect(`http://localhost:${cliPort}?error=token_error`);
          });
          return;
        }

        // Web flow — redirect to dashboard
        return res.redirect("/dashboard");
      });
    })(req, res, next);
  }
);

authRouter.get("/logout", (req, res, next) => {
  req.logout((error) => {
    if (error) {
      return next(error);
    }

    return req.session.destroy((sessionError) => {
      if (sessionError) {
        return next(sessionError);
      }

      res.clearCookie("connect.sid");
      return res.redirect("/");
    });
  });
});

authRouter.get("/me", (req, res) => {
  if (!req.isAuthenticated?.() || !req.user) {
    return res.status(401).json({ error: "Not signed in" });
  }

  return res.json({
    user: toSessionUser(req.user),
    newToken: req.session.newToken || null,
  });
});

authRouter.post("/regenerate-token", requireSessionAuth, async (req, res, next) => {
  try {
    const plainToken = await regenerateToken(req.user.user_id);
    res.json({ token: plainToken });
  } catch (error) {
    next(error);
  }
});

// ─── Mock Auth — dev/test only, NEVER production ──────────────────────────────
// GET /auth/mock → bypasses GitHub OAuth, creates a test session instantly.
// Requires: MOCK_AUTH=true and NODE_ENV !== 'production'.
// Usage in tests: await page.goto('/auth/mock') → redirects to /dashboard.
authRouter.get("/mock", (req, res, next) => {
  if (!isMockAuthEnabled()) {
    return res.status(404).json({ error: "Not found" });
  }

  req.logIn(MOCK_USER, (err) => {
    if (err) return next(err);
    console.log("[MockAuth] Test session created for user:", MOCK_USER.login);
    return res.redirect("/dashboard");
  });
});

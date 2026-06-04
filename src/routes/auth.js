import { Router } from "express";
import passport from "passport";
import { Strategy as GitHubStrategy } from "passport-github2";
import { createUser, getUserByGithubId, getUserById, regenerateToken } from "../db/users.js";

const DEFAULT_BASE_URL =
  process.env.BASE_URL ||
  "http://AgentM-MeshS-C9BTpnBG6o3j-892354001.us-east-1.elb.amazonaws.com";

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

authRouter.get(
  "/github/callback",
  passport.authenticate("github", { failureRedirect: "/" }),
  (_req, res) => {
    res.redirect("/dashboard");
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

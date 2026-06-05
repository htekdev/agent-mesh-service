// Agent Mesh Service — Entry Point
import express from "express";
import cors from "cors";
import helmet from "helmet";
import session from "express-session";
import cookieParser from "cookie-parser";
import passport from "passport";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { meshRouter } from "./routes/mesh.js";
import { integrateRouter } from "./routes/integrate.js";
import { authRouter, configurePassport } from "./routes/auth.js";
import { dashboardRouter } from "./routes/dashboard.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

configurePassport();

app.use(
  helmet({
    // Disable HSTS — service runs on HTTP only until Phase 3 (ACM + HTTPS).
    // HSTS on an HTTP-only site causes browsers to block the OAuth callback redirect.
    hsts: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "https://avatars.githubusercontent.com", "https://github.githubassets.com"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        // No upgradeInsecureRequests — site is HTTP-only until HTTPS lands in Phase 3
        upgradeInsecureRequests: null,
      },
    },
  })
);
app.use(cors());
app.use(cookieParser());
// Serve static assets (logo, etc.)
app.use(express.static(join(__dirname, "public")));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-in-prod",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());
app.use(express.json({ limit: "64kb" }));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "agent-mesh-service",
    version: process.env.npm_package_version || "0.1.x",
    uptime: Math.floor(process.uptime()),
    region: process.env.AWS_REGION || "us-east-1",
    timestamp: new Date().toISOString(),
  });
});

app.use("/auth", authRouter);
app.use("/", dashboardRouter);
app.use("/mesh", integrateRouter);
app.use("/", integrateRouter);
app.use("/mesh", meshRouter);

app.use((err, _req, res, _next) => {
  console.error(`[ERROR] ${err.message}`, err.stack);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`🕸️  Agent Mesh Service running on port ${PORT}`);
});

export default app;

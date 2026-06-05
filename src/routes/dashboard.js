import { readFile } from "node:fs/promises";
import { Router } from "express";
import { listAgents, createMesh } from "../db/dynamo.js";
import { countUserMeshes, getMaskedToken, listUserMeshes } from "../db/users.js";
import { requireSessionAuth } from "./auth.js";
import { canCreateMesh, FREE_PLAN_MESH_LIMIT_MESSAGE } from "../lib/planLimits.js";
import { nanoid } from "nanoid";

const DEFAULT_BASE_URL =
  process.env.BASE_URL ||
  "http://AgentM-MeshS-C9BTpnBG6o3j-892354001.us-east-1.elb.amazonaws.com";

const landingTemplateUrl = new URL("../views/landing.html", import.meta.url);
const dashboardTemplateUrl = new URL("../views/dashboard.html", import.meta.url);

async function readTemplate(templateUrl) {
  return readFile(templateUrl, "utf8");
}

function escapeForInlineScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function buildDashboardBootstrap(user, { newToken = null } = {}) {
  return {
    user_id: user.user_id,
    login: user.login,
    email: user.email,
    avatar_url: user.avatar_url,
    plan: user.plan,
    maskedToken: getMaskedToken(user),
    tokenSuffix: user.token_suffix || "",
    newToken,
    baseUrl: DEFAULT_BASE_URL,
  };
}

async function buildDashboardPayload(user) {
  const meshes = (await listUserMeshes(user.user_id)).sort((left, right) =>
    (right.created_at || "").localeCompare(left.created_at || "")
  );

  const counts = await Promise.all(
    meshes.map(async (mesh) => [mesh.mesh_id, (await listAgents(mesh.mesh_id)).length])
  );

  return {
    user: buildDashboardBootstrap(user),
    meshes,
    agentCounts: Object.fromEntries(counts),
  };
}

export const dashboardRouter = Router();

dashboardRouter.get("/", async (req, res, next) => {
  try {
    if (req.isAuthenticated?.()) {
      return res.redirect("/dashboard");
    }

    const html = await readTemplate(landingTemplateUrl);
    return res.type("html").send(html);
  } catch (error) {
    return next(error);
  }
});

dashboardRouter.get("/dashboard", async (req, res, next) => {
  try {
    if (!req.isAuthenticated?.() || !req.user) {
      return res.redirect("/");
    }

    const html = await readTemplate(dashboardTemplateUrl);
    const newToken = req.session.newToken || null;
    const bootstrap = buildDashboardBootstrap(req.user, { newToken });
    const rendered = html.replace("__USER_JSON__", escapeForInlineScript(bootstrap));

    delete req.session.newToken;
    return req.session.save((sessionError) => {
      if (sessionError) {
        return next(sessionError);
      }

      return res.type("html").send(rendered);
    });
  } catch (error) {
    return next(error);
  }
});

dashboardRouter.get("/api/me", requireSessionAuth, async (req, res, next) => {
  try {
    res.json(await buildDashboardPayload(req.user));
  } catch (error) {
    next(error);
  }
});

dashboardRouter.post("/api/meshes", requireSessionAuth, async (req, res, next) => {
  try {
    const currentMeshCount = await countUserMeshes(req.user.user_id);
    if (!canCreateMesh(req.user, currentMeshCount)) {
      return res.status(403).json({ error: FREE_PLAN_MESH_LIMIT_MESSAGE });
    }

    const { name, description } = req.body || {};
    const mesh = {
      mesh_id: nanoid(12),
      owner_id: req.user.user_id,
      name: name || "Untitled Mesh",
      description: description || "",
      created_at: new Date().toISOString(),
      agent_count: 0,
    };

    await createMesh(mesh);
    return res.status(201).json(mesh);
  } catch (error) {
    return next(error);
  }
});

dashboardRouter.get("/upgrade", (_req, res) => {
  res.redirect("https://github.com/sponsors/htekdev");
});

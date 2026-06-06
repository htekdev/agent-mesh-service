// Agent routes -- register and list agents in a mesh
import { Router } from "express";
import { nanoid } from "nanoid";
import { registerAgent, listAgents, getAgent, updateAgentHeartbeat, getMesh } from "../db/dynamo.js";

export const agentsRouter = Router({ mergeParams: true });

agentsRouter.use(async (req, res, next) => {
  try {
    const mesh = await getMesh(req.params.meshId);
    if (!mesh) {
      return res.status(404).json({ error: "Mesh not found" });
    }
    req.mesh = mesh;
    return next();
  } catch (err) {
    return next(err);
  }
});

agentsRouter.post("/", async (req, res, next) => {
  try {
    const { meshId } = req.params;
    const { name, description, workspace, metadata } = req.body || {};
    if (!name) {
      return res.status(400).json({ error: "Agent name is required" });
    }

    const agent = {
      mesh_id: meshId,
      agent_id: nanoid(12),
      name,
      description: description || "",
      workspace: workspace || "",
      status: "active",
      registered_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      metadata: metadata || {},
    };

    await registerAgent(agent);
    return res.status(201).json(agent);
  } catch (err) {
    return next(err);
  }
});

agentsRouter.get("/", async (req, res, next) => {
  try {
    const agents = await listAgents(req.params.meshId);
    return res.json({ agents, count: agents.length });
  } catch (err) {
    return next(err);
  }
});

agentsRouter.get("/:agentId", async (req, res, next) => {
  try {
    const { meshId, agentId } = req.params;
    const agent = await getAgent(meshId, agentId);
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }
    return res.json(agent);
  } catch (err) {
    return next(err);
  }
});

agentsRouter.post("/:agentId/heartbeat", async (req, res, next) => {
  try {
    const { meshId, agentId } = req.params;
    await updateAgentHeartbeat(meshId, agentId);
    return res.json({ status: "ok", last_seen: new Date().toISOString() });
  } catch (err) {
    return next(err);
  }
});

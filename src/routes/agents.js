// Agent routes — register and list agents in a mesh
import { Router } from "express";
import { nanoid } from "nanoid";
import { registerAgent, listAgents, getAgent, updateAgentHeartbeat, getMesh } from "../db/dynamo.js";

export const agentsRouter = Router({ mergeParams: true });

// POST /mesh/:meshId/agents — Register an agent
agentsRouter.post("/", async (req, res, next) => {
  try {
    const { meshId } = req.params;
    const mesh = await getMesh(meshId);
    if (!mesh) return res.status(404).json({ error: "Mesh not found" });

    const { name, description, workspace, metadata } = req.body;
    if (!name) return res.status(400).json({ error: "Agent name is required" });

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
    res.status(201).json(agent);
  } catch (err) {
    next(err);
  }
});

// GET /mesh/:meshId/agents — List all agents in a mesh
agentsRouter.get("/", async (req, res, next) => {
  try {
    const { meshId } = req.params;
    const agents = await listAgents(meshId);
    res.json({ agents, count: agents.length });
  } catch (err) {
    next(err);
  }
});

// GET /mesh/:meshId/agents/:agentId — Get a specific agent
agentsRouter.get("/:agentId", async (req, res, next) => {
  try {
    const { meshId, agentId } = req.params;
    const agent = await getAgent(meshId, agentId);
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    res.json(agent);
  } catch (err) {
    next(err);
  }
});

// POST /mesh/:meshId/agents/:agentId/heartbeat — Update agent heartbeat
agentsRouter.post("/:agentId/heartbeat", async (req, res, next) => {
  try {
    const { meshId, agentId } = req.params;
    await updateAgentHeartbeat(meshId, agentId);
    res.json({ status: "ok", last_seen: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

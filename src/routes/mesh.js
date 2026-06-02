// Mesh routes — create and manage meshes
import { Router } from "express";
import { nanoid } from "nanoid";
import { createMesh, getMesh } from "../db/dynamo.js";
import { agentsRouter } from "./agents.js";
import { messagesRouter } from "./messages.js";

export const meshRouter = Router();

// Mount sub-routers
meshRouter.use("/:meshId/agents", agentsRouter);
meshRouter.use("/:meshId/messages", messagesRouter);

// POST /mesh — Create a new mesh
meshRouter.post("/", async (req, res, next) => {
  try {
    const { name, description } = req.body;
    const mesh = {
      mesh_id: nanoid(12),
      name: name || "Untitled Mesh",
      description: description || "",
      created_at: new Date().toISOString(),
      agent_count: 0,
    };
    await createMesh(mesh);
    res.status(201).json(mesh);
  } catch (err) {
    next(err);
  }
});

// GET /mesh/:meshId — Get mesh info
meshRouter.get("/:meshId", async (req, res, next) => {
  try {
    const mesh = await getMesh(req.params.meshId);
    if (!mesh) return res.status(404).json({ error: "Mesh not found" });
    res.json(mesh);
  } catch (err) {
    next(err);
  }
});

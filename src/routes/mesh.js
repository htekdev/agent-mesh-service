// Mesh routes — create and manage meshes
import { Router } from "express";
import { nanoid } from "nanoid";
import { createMesh, getMesh } from "../db/dynamo.js";
import { countUserMeshes } from "../db/users.js";
import { requireApiKey } from "../middleware/requireApiKey.js";
import { canCreateMesh, FREE_PLAN_MESH_LIMIT_MESSAGE } from "../lib/planLimits.js";
import { agentsRouter } from "./agents.js";
import { messagesRouter } from "./messages.js";

export const meshRouter = Router();

meshRouter.use("/:meshId/agents", requireApiKey, agentsRouter);
meshRouter.use("/:meshId/messages", requireApiKey, messagesRouter);

meshRouter.post("/", requireApiKey, async (req, res, next) => {
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
  } catch (err) {
    return next(err);
  }
});

meshRouter.get("/:meshId", async (req, res, next) => {
  try {
    const mesh = await getMesh(req.params.meshId);
    if (!mesh) {
      return res.status(404).json({ error: "Mesh not found" });
    }

    const { owner_id: _ownerId, ...publicMesh } = mesh;
    return res.json(publicMesh);
  } catch (err) {
    return next(err);
  }
});

// Agent Mesh Service — Entry Point
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { meshRouter } from "./routes/mesh.js";
import { agentsRouter } from "./routes/agents.js";
import { messagesRouter } from "./routes/messages.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "64kb" }));

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "agent-mesh-service", timestamp: new Date().toISOString() });
});

// Routes
app.use("/mesh", meshRouter);

// Error handler
app.use((err, req, res, _next) => {
  console.error(`[ERROR] ${err.message}`, err.stack);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`🕸️  Agent Mesh Service running on port ${PORT}`);
});

export default app;

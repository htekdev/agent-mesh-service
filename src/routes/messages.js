// Message routes — send, receive (long-poll), and reply to messages
// Implements Telegram-style getUpdates long-polling pattern
import { Router } from "express";
import { nanoid } from "nanoid";
import { createMessage, getMessage, queryMessages, markMessageRead, getMesh } from "../db/dynamo.js";

export const messagesRouter = Router({ mergeParams: true });

// In-memory subscribers for long-polling (mesh_id -> Set of resolvers)
const subscribers = new Map();

function notifySubscribers(meshId, message) {
  const subs = subscribers.get(meshId);
  if (!subs) return;
  for (const sub of subs) {
    sub.resolve(message);
  }
  subscribers.delete(meshId);
}

/**
 * Wait for new messages or timeout.
 * Returns a promise that resolves when a new message arrives or timeout expires.
 */
function waitForMessages(meshId, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      // Timeout — remove this subscriber and resolve with null
      const subs = subscribers.get(meshId);
      if (subs) {
        subs.delete(entry);
        if (subs.size === 0) subscribers.delete(meshId);
      }
      resolve(null);
    }, timeoutMs);

    const entry = {
      resolve: (msg) => {
        clearTimeout(timer);
        resolve(msg);
      },
    };

    if (!subscribers.has(meshId)) {
      subscribers.set(meshId, new Set());
    }
    subscribers.get(meshId).add(entry);
  });
}

// POST /mesh/:meshId/messages — Send a message
messagesRouter.post("/", async (req, res, next) => {
  try {
    const { meshId } = req.params;
    const mesh = await getMesh(meshId);
    if (!mesh) return res.status(404).json({ error: "Mesh not found" });

    const { sender_id, recipient_id, content, priority, metadata } = req.body;

    if (!sender_id) return res.status(400).json({ error: "sender_id is required" });
    if (!content) return res.status(400).json({ error: "content is required" });
    if (content.length > 10240) return res.status(400).json({ error: "Content exceeds 10KB limit" });

    // Generate a sortable numeric message ID (timestamp-based for DynamoDB sort key)
    const messageId = Date.now() * 1000 + Math.floor(Math.random() * 1000);

    const message = {
      mesh_id: meshId,
      message_id: messageId,
      message_uid: nanoid(12),
      sender_id,
      recipient_id: recipient_id || "*", // * = broadcast
      content,
      priority: priority || "normal",
      metadata: metadata || {},
      created_at: new Date().toISOString(),
      read_at: null,
      replies: [],
    };

    await createMessage(message);

    // Notify any long-polling subscribers
    notifySubscribers(meshId, message);

    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /mesh/:meshId/messages — Long-poll for messages (Telegram-style getUpdates)
 *
 * Query params:
 *   offset    — Return messages with ID > offset (default: 0)
 *   timeout   — Long-poll timeout in seconds (default: 30, max: 60)
 *   recipient — Filter to messages for this agent_id (optional)
 *   limit     — Max messages to return (default: 50, max: 100)
 *
 * Behavior:
 *   1. Check DB for messages > offset
 *   2. If messages exist → return immediately
 *   3. If no messages → hold connection open until:
 *      a. New message arrives → return it
 *      b. Timeout expires → return empty array
 */
messagesRouter.get("/", async (req, res, next) => {
  try {
    const { meshId } = req.params;
    const offset = parseInt(req.query.offset) || 0;
    const timeout = Math.min(parseInt(req.query.timeout) || 30, 60);
    const recipientId = req.query.recipient || null;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    // First check: are there already messages > offset?
    let messages = await queryMessages(meshId, { recipientId, offset, limit });

    if (messages.length > 0) {
      // Messages available — return immediately
      return res.json({
        ok: true,
        messages,
        count: messages.length,
      });
    }

    // No messages yet — long-poll (hold connection open)
    const result = await waitForMessages(meshId, timeout * 1000);

    if (result) {
      // Got a new message during the wait
      // Re-query to get all messages since offset (there may be more than one)
      messages = await queryMessages(meshId, { recipientId, offset, limit });
      return res.json({
        ok: true,
        messages,
        count: messages.length,
      });
    }

    // Timeout — return empty
    res.json({
      ok: true,
      messages: [],
      count: 0,
    });
  } catch (err) {
    next(err);
  }
});

// GET /mesh/:meshId/messages/:messageId — Get a specific message
messagesRouter.get("/:messageId", async (req, res, next) => {
  try {
    const { meshId, messageId } = req.params;
    const message = await getMessage(meshId, parseInt(messageId));
    if (!message) return res.status(404).json({ error: "Message not found" });
    res.json(message);
  } catch (err) {
    next(err);
  }
});

// POST /mesh/:meshId/messages/:messageId/reply — Reply to a message
messagesRouter.post("/:messageId/reply", async (req, res, next) => {
  try {
    const { meshId, messageId } = req.params;
    const { sender_id, content } = req.body;

    if (!sender_id) return res.status(400).json({ error: "sender_id is required" });
    if (!content) return res.status(400).json({ error: "content is required" });

    const originalMessage = await getMessage(meshId, parseInt(messageId));
    if (!originalMessage) return res.status(404).json({ error: "Original message not found" });

    // Create reply as a new message referencing the original
    const replyId = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    const reply = {
      mesh_id: meshId,
      message_id: replyId,
      message_uid: nanoid(12),
      sender_id,
      recipient_id: originalMessage.sender_id, // Reply goes to original sender
      content,
      priority: "normal",
      metadata: { reply_to: parseInt(messageId) },
      created_at: new Date().toISOString(),
      read_at: null,
      replies: [],
    };

    await createMessage(reply);
    notifySubscribers(meshId, reply);

    res.status(201).json(reply);
  } catch (err) {
    next(err);
  }
});

// POST /mesh/:meshId/messages/:messageId/read — Mark message as read
messagesRouter.post("/:messageId/read", async (req, res, next) => {
  try {
    const { meshId, messageId } = req.params;
    await markMessageRead(meshId, parseInt(messageId));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

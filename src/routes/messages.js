// Message routes -- send, receive (long-poll), and reply to messages
// Implements Telegram-style getUpdates long-polling pattern
import { Router } from "express";
import { nanoid } from "nanoid";
import { createMessage, getMessage, queryMessages, markMessageRead, getMesh } from "../db/dynamo.js";

export const messagesRouter = Router({ mergeParams: true });

const subscribers = new Map();

function notifySubscribers(meshId, message) {
  const subs = subscribers.get(meshId);
  if (!subs) return;
  for (const sub of subs) {
    sub.resolve(message);
  }
  subscribers.delete(meshId);
}

function waitForMessages(meshId, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
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

messagesRouter.use(async (req, res, next) => {
  try {
    const mesh = await getMesh(req.params.meshId);
    if (!mesh) {
      return res.status(404).json({ error: "Mesh not found" });
    }

    if (mesh.owner_id && mesh.owner_id !== req.user?.user_id) {
      return res.status(403).json({ error: "You do not have access to this mesh." });
    }

    req.mesh = mesh;
    return next();
  } catch (err) {
    return next(err);
  }
});

messagesRouter.post("/", async (req, res, next) => {
  try {
    const { meshId } = req.params;
    const { sender_id, recipient_id, content, priority, metadata } = req.body || {};

    if (!sender_id) {
      return res.status(400).json({ error: "sender_id is required" });
    }
    if (!content) {
      return res.status(400).json({ error: "content is required" });
    }
    if (content.length > 10240) {
      return res.status(400).json({ error: "Content exceeds 10KB limit" });
    }

    const messageId = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    const message = {
      mesh_id: meshId,
      message_id: messageId,
      message_uid: nanoid(12),
      sender_id,
      recipient_id: recipient_id || "*",
      content,
      priority: priority || "normal",
      metadata: metadata || {},
      created_at: new Date().toISOString(),
      read_at: null,
      replies: [],
    };

    await createMessage(message);
    notifySubscribers(meshId, message);

    return res.status(201).json(message);
  } catch (err) {
    return next(err);
  }
});

messagesRouter.get("/", async (req, res, next) => {
  try {
    const { meshId } = req.params;
    const offset = parseInt(req.query.offset, 10) || 0;
    const timeout = Math.min(parseInt(req.query.timeout, 10) || 30, 60);
    const recipientId = req.query.recipient || null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

    let messages = await queryMessages(meshId, { recipientId, offset, limit });
    if (messages.length > 0) {
      return res.json({ ok: true, messages, count: messages.length });
    }

    const result = await waitForMessages(meshId, timeout * 1000);
    if (result) {
      messages = await queryMessages(meshId, { recipientId, offset, limit });
      return res.json({ ok: true, messages, count: messages.length });
    }

    return res.json({ ok: true, messages: [], count: 0 });
  } catch (err) {
    return next(err);
  }
});

messagesRouter.get("/:messageId", async (req, res, next) => {
  try {
    const { meshId, messageId } = req.params;
    const message = await getMessage(meshId, parseInt(messageId, 10));
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }
    return res.json(message);
  } catch (err) {
    return next(err);
  }
});

messagesRouter.post("/:messageId/reply", async (req, res, next) => {
  try {
    const { meshId, messageId } = req.params;
    const { sender_id, content } = req.body || {};

    if (!sender_id) {
      return res.status(400).json({ error: "sender_id is required" });
    }
    if (!content) {
      return res.status(400).json({ error: "content is required" });
    }

    const originalMessage = await getMessage(meshId, parseInt(messageId, 10));
    if (!originalMessage) {
      return res.status(404).json({ error: "Original message not found" });
    }

    const replyId = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    const reply = {
      mesh_id: meshId,
      message_id: replyId,
      message_uid: nanoid(12),
      sender_id,
      recipient_id: originalMessage.sender_id,
      content,
      priority: "normal",
      metadata: { reply_to: parseInt(messageId, 10) },
      created_at: new Date().toISOString(),
      read_at: null,
      replies: [],
    };

    await createMessage(reply);
    notifySubscribers(meshId, reply);

    return res.status(201).json(reply);
  } catch (err) {
    return next(err);
  }
});

messagesRouter.post("/:messageId/read", async (req, res, next) => {
  try {
    const { meshId, messageId } = req.params;
    await markMessageRead(meshId, parseInt(messageId, 10));
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

import crypto from "node:crypto";
import { getUserByTokenHash } from "../db/users.js";

const INVALID_TOKEN_MESSAGE = "Invalid or missing API token. Get yours at meshwire.io";

export function hashApiToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function extractBearerToken(authorizationHeader = "") {
  if (!authorizationHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authorizationHeader.slice(7).trim();
  return token.startsWith("mw_") ? token : null;
}

export function createRequireApiKey(userLookup = getUserByTokenHash) {
  return async function requireApiKey(req, res, next) {
    try {
      const token = extractBearerToken(req.get("authorization") || "");
      if (!token) {
        return res.status(401).json({ error: INVALID_TOKEN_MESSAGE });
      }

      const user = await userLookup(hashApiToken(token));
      if (!user) {
        return res.status(401).json({ error: INVALID_TOKEN_MESSAGE });
      }

      req.user = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export const requireApiKey = createRequireApiKey();

import crypto from "node:crypto";
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { nanoid } from "nanoid";
import { ddb, TABLES, countMeshesByOwner, listMeshesByOwner } from "./dynamo.js";

const TOKEN_PREFIX = "mw_";
const TOKEN_BYTES = 32;

export function hashToken(plainToken) {
  return crypto.createHash("sha256").update(plainToken).digest("hex");
}

export function generateToken() {
  const plainToken = `${TOKEN_PREFIX}${crypto.randomBytes(TOKEN_BYTES).toString("hex")}`;
  return {
    plainToken,
    tokenHash: hashToken(plainToken),
    tokenSuffix: plainToken.slice(-8),
  };
}

export function getMaskedToken(user) {
  const suffix = user?.token_suffix || "••••••••";
  return `mw_••••••••••••••••${suffix}`;
}

export async function getUserById(userId) {
  const result = await ddb.send(
    new GetCommand({
      TableName: TABLES.users,
      Key: { user_id: userId },
    })
  );
  return result.Item || null;
}

export async function getUserByGithubId(githubId) {
  if (!githubId) return null;

  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLES.users,
      IndexName: "github-id-index",
      KeyConditionExpression: "github_id = :githubId",
      ExpressionAttributeValues: {
        ":githubId": String(githubId),
      },
      Limit: 1,
    })
  );

  return result.Items?.[0] || null;
}

export async function getUserByTokenHash(tokenHash) {
  if (!tokenHash) return null;

  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLES.users,
      IndexName: "token-hash-index",
      KeyConditionExpression: "token_hash = :tokenHash",
      ExpressionAttributeValues: {
        ":tokenHash": tokenHash,
      },
      Limit: 1,
    })
  );

  return result.Items?.[0] || null;
}

export async function createUser({ githubId, login, email, avatarUrl }) {
  const createdAt = new Date().toISOString();
  const { plainToken, tokenHash, tokenSuffix } = generateToken();
  const user = {
    user_id: nanoid(12),
    github_id: String(githubId),
    login,
    email: email || "",
    avatar_url: avatarUrl || "",
    plan: "free",
    token_hash: tokenHash,
    token_suffix: tokenSuffix,
    created_at: createdAt,
    stripe_customer_id: null,
  };

  await ddb.send(
    new PutCommand({
      TableName: TABLES.users,
      Item: user,
    })
  );

  return { user, plainToken };
}

export async function regenerateToken(userId) {
  const { plainToken, tokenHash, tokenSuffix } = generateToken();

  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.users,
      Key: { user_id: userId },
      UpdateExpression: "SET token_hash = :tokenHash, token_suffix = :tokenSuffix",
      ExpressionAttributeValues: {
        ":tokenHash": tokenHash,
        ":tokenSuffix": tokenSuffix,
      },
    })
  );

  return plainToken;
}

export async function listUserMeshes(userId) {
  return listMeshesByOwner(userId);
}

export async function countUserMeshes(userId) {
  return countMeshesByOwner(userId);
}

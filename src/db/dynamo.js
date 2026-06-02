// DynamoDB client and table operations
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
  ...(process.env.DYNAMODB_ENDPOINT && { endpoint: process.env.DYNAMODB_ENDPOINT }),
});

export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

// Table names from environment
export const TABLES = {
  meshes: process.env.MESHES_TABLE || "agent-mesh-meshes",
  agents: process.env.AGENTS_TABLE || "agent-mesh-agents",
  messages: process.env.MESSAGES_TABLE || "agent-mesh-messages",
};

// ─── Mesh Operations ─────────────────────────────────────────────

export async function createMesh(mesh) {
  await ddb.send(new PutCommand({ TableName: TABLES.meshes, Item: mesh }));
  return mesh;
}

export async function getMesh(meshId) {
  const result = await ddb.send(
    new GetCommand({ TableName: TABLES.meshes, Key: { mesh_id: meshId } })
  );
  return result.Item || null;
}

// ─── Agent Operations ────────────────────────────────────────────

export async function registerAgent(agent) {
  await ddb.send(new PutCommand({ TableName: TABLES.agents, Item: agent }));
  return agent;
}

export async function getAgent(meshId, agentId) {
  const result = await ddb.send(
    new GetCommand({ TableName: TABLES.agents, Key: { mesh_id: meshId, agent_id: agentId } })
  );
  return result.Item || null;
}

export async function listAgents(meshId) {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLES.agents,
      KeyConditionExpression: "mesh_id = :mid",
      ExpressionAttributeValues: { ":mid": meshId },
    })
  );
  return result.Items || [];
}

export async function updateAgentHeartbeat(meshId, agentId) {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.agents,
      Key: { mesh_id: meshId, agent_id: agentId },
      UpdateExpression: "SET last_seen = :ts, #s = :status",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":ts": new Date().toISOString(), ":status": "active" },
    })
  );
}

// ─── Message Operations ──────────────────────────────────────────

export async function createMessage(message) {
  await ddb.send(new PutCommand({ TableName: TABLES.messages, Item: message }));
  return message;
}

export async function getMessage(meshId, messageId) {
  const result = await ddb.send(
    new GetCommand({ TableName: TABLES.messages, Key: { mesh_id: meshId, message_id: messageId } })
  );
  return result.Item || null;
}

/**
 * Query messages for a mesh, optionally filtered by recipient and offset.
 * Used for long-polling — returns messages with message_id > offset.
 */
export async function queryMessages(meshId, { recipientId, offset = 0, limit = 50 } = {}) {
  const params = {
    TableName: TABLES.messages,
    KeyConditionExpression: "mesh_id = :mid AND message_id > :offset",
    ExpressionAttributeValues: {
      ":mid": meshId,
      ":offset": offset,
    },
    Limit: limit,
    ScanIndexForward: true,
  };

  if (recipientId) {
    // Use GSI for recipient-filtered queries
    params.IndexName = "recipient-index";
    params.KeyConditionExpression = "mesh_id = :mid";
    params.FilterExpression = "message_id > :offset AND (recipient_id = :rid OR recipient_id = :broadcast)";
    params.ExpressionAttributeValues[":rid"] = recipientId;
    params.ExpressionAttributeValues[":broadcast"] = "*";
  }

  const result = await ddb.send(new QueryCommand(params));
  return result.Items || [];
}

export async function markMessageRead(meshId, messageId) {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.messages,
      Key: { mesh_id: meshId, message_id: messageId },
      UpdateExpression: "SET read_at = :ts",
      ExpressionAttributeValues: { ":ts": new Date().toISOString() },
    })
  );
}

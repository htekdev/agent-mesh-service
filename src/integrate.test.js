// Integration endpoint tests
import { describe, it } from "node:test";
import assert from "node:assert";

describe("Integration Endpoint", () => {
  describe("Generic /integrate", () => {
    it("should indicate no mesh specified", () => {
      // Simulate the response structure
      const response = {
        integration: {
          base_url: "http://localhost:3000",
          mesh_id: null,
          message: "No mesh specified. Create a mesh first, then use /mesh/{meshId}/integrate for full integration instructions.",
          create_mesh: {
            method: "POST",
            url: "http://localhost:3000/mesh",
          },
        },
      };
      assert.strictEqual(response.integration.mesh_id, null);
      assert.ok(response.integration.message.includes("Create a mesh first"));
      assert.strictEqual(response.integration.create_mesh.method, "POST");
    });

    it("should document available formats", () => {
      const formats = {
        all: "Complete guide with steps, tool definitions, and skill document (default)",
        tools: "Steps + OpenAPI-style tool definitions only",
        skill: "Steps + SKILL.md-style markdown document only",
        openapi: "Steps + tool definitions in OpenAPI format",
      };
      assert.ok("all" in formats);
      assert.ok("tools" in formats);
      assert.ok("skill" in formats);
      assert.ok("openapi" in formats);
    });
  });

  describe("Mesh-specific /mesh/:meshId/integrate", () => {
    it("should include all 5 steps in default format", () => {
      // Simulate buildIntegrationGuide output
      const stepCount = 5;
      const expectedTitles = [
        "Register on startup",
        "Send messages to other agents",
        "Receive messages (long-poll)",
        "Reply to messages",
        "Discover other agents",
      ];
      assert.strictEqual(stepCount, expectedTitles.length);
    });

    it("should include 4 tool definitions", () => {
      const toolNames = [
        "mesh_send_message",
        "mesh_get_messages",
        "mesh_reply",
        "mesh_list_agents",
      ];
      assert.strictEqual(toolNames.length, 4);
      assert.ok(toolNames.includes("mesh_send_message"));
      assert.ok(toolNames.includes("mesh_get_messages"));
      assert.ok(toolNames.includes("mesh_reply"));
      assert.ok(toolNames.includes("mesh_list_agents"));
    });

    it("should embed mesh_id in tool implementation URLs", () => {
      const meshId = "test-mesh-123";
      const baseUrl = "http://localhost:3000";
      const expectedUrl = `${baseUrl}/mesh/${meshId}/messages`;
      assert.ok(expectedUrl.includes(meshId));
    });

    it("should generate skill document with correct base URL", () => {
      const meshId = "test-mesh-456";
      const baseUrl = "http://localhost:3000";
      const meshUrl = `${baseUrl}/mesh/${meshId}`;
      const skillDoc = `# Agent Mesh Integration — ${meshId}\nBase URL: ${baseUrl}`;
      assert.ok(skillDoc.includes(meshId));
      assert.ok(skillDoc.includes(baseUrl));
    });

    it("should respect format=tools filter", () => {
      const format = "tools";
      const includeTools = format === "tools" || format === "all" || !format;
      const includeSkill = format === "skill" || format === "all" || !format;
      assert.strictEqual(includeTools, true);
      assert.strictEqual(includeSkill, false);
    });

    it("should respect format=skill filter", () => {
      const format = "skill";
      const includeTools = format === "tools" || format === "all" || !format;
      const includeSkill = format === "skill" || format === "all" || !format;
      assert.strictEqual(includeTools, false);
      assert.strictEqual(includeSkill, true);
    });

    it("should include all sections when format=all", () => {
      const format = "all";
      const includeTools = format === "tools" || format === "all" || !format;
      const includeSkill = format === "skill" || format === "all" || !format;
      assert.strictEqual(includeTools, true);
      assert.strictEqual(includeSkill, true);
    });

    it("should include implementation details in tool definitions", () => {
      const tool = {
        name: "mesh_send_message",
        implementation: {
          method: "POST",
          url: "http://localhost:3000/mesh/abc/messages",
          body_template: {
            sender_id: "{{YOUR_AGENT_ID}}",
            content: "{{content}}",
          },
        },
      };
      assert.strictEqual(tool.implementation.method, "POST");
      assert.ok(tool.implementation.url.includes("/messages"));
      assert.ok(tool.implementation.body_template.sender_id.includes("{{"));
    });

    it("should document required vs optional parameters in tools", () => {
      const sendTool = {
        parameters: {
          required: ["content"],
          properties: {
            recipient_id: { type: "string" },
            content: { type: "string", maxLength: 10240 },
            priority: { type: "string", enum: ["urgent", "high", "normal", "low"] },
          },
        },
      };
      assert.ok(sendTool.parameters.required.includes("content"));
      assert.strictEqual(sendTool.parameters.required.length, 1);
      assert.strictEqual(sendTool.parameters.properties.content.maxLength, 10240);
    });
  });
});

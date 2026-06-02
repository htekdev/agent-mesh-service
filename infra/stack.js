// CDK Infrastructure — Agent Mesh Service
// DynamoDB tables only (App Runner is manual or via separate config)
//
// Deployment strategy:
// 1. CDK deploys DynamoDB tables + IAM roles
// 2. GitHub Actions builds Docker image → pushes to ECR
// 3. App Runner auto-deploys from ECR image updates
//
// Why not Lambda: API Gateway has 29s hard timeout — too short for 60s long-polling
// Why not ECS Fargate: Overkill for this service, App Runner is simpler

import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

class AgentMeshStack extends cdk.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    // ─── ECR Repository ────────────────────────────────────────────

    const ecrRepo = new ecr.Repository(this, "MeshEcrRepo", {
      repositoryName: "agent-mesh-service",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
      lifecycleRules: [
        { maxImageCount: 5, description: "Keep last 5 images" },
      ],
    });

    // ─── DynamoDB Tables ───────────────────────────────────────────

    const meshesTable = new dynamodb.Table(this, "MeshesTable", {
      tableName: "agent-mesh-meshes",
      partitionKey: { name: "mesh_id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const agentsTable = new dynamodb.Table(this, "AgentsTable", {
      tableName: "agent-mesh-agents",
      partitionKey: { name: "mesh_id", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "agent_id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const messagesTable = new dynamodb.Table(this, "MessagesTable", {
      tableName: "agent-mesh-messages",
      partitionKey: { name: "mesh_id", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "message_id", type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // GSI for recipient-based queries
    messagesTable.addGlobalSecondaryIndex({
      indexName: "recipient-index",
      partitionKey: { name: "mesh_id", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "recipient_id", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ─── IAM Role for App Runner instance ──────────────────────────

    const instanceRole = new iam.Role(this, "AppRunnerInstanceRole", {
      assumedBy: new iam.ServicePrincipal("tasks.apprunner.amazonaws.com"),
      roleName: "agent-mesh-apprunner-instance",
    });

    meshesTable.grantReadWriteData(instanceRole);
    agentsTable.grantReadWriteData(instanceRole);
    messagesTable.grantReadWriteData(instanceRole);

    // App Runner ECR access role
    const accessRole = new iam.Role(this, "AppRunnerAccessRole", {
      assumedBy: new iam.ServicePrincipal("build.apprunner.amazonaws.com"),
      roleName: "agent-mesh-apprunner-access",
    });
    ecrRepo.grantPull(accessRole);

    // ─── Outputs ───────────────────────────────────────────────────

    new cdk.CfnOutput(this, "EcrRepoUri", {
      value: ecrRepo.repositoryUri,
      description: "ECR Repository URI for Docker pushes",
    });
    new cdk.CfnOutput(this, "InstanceRoleArn", {
      value: instanceRole.roleArn,
      description: "Instance role ARN for App Runner service",
    });
    new cdk.CfnOutput(this, "AccessRoleArn", {
      value: accessRole.roleArn,
      description: "ECR access role ARN for App Runner service",
    });
    new cdk.CfnOutput(this, "MeshesTableName", { value: meshesTable.tableName });
    new cdk.CfnOutput(this, "AgentsTableName", { value: agentsTable.tableName });
    new cdk.CfnOutput(this, "MessagesTableName", { value: messagesTable.tableName });
  }
}

// ─── App ─────────────────────────────────────────────────────────

const app = new cdk.App();
new AgentMeshStack(app, "AgentMeshStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || "us-east-1",
  },
});

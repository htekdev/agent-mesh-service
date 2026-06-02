// CDK Infrastructure — Agent Mesh Service
// ECS Fargate + ALB + DynamoDB
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecs_patterns from "aws-cdk-lib/aws-ecs-patterns";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

class AgentMeshStack extends cdk.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

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

    // ─── VPC ───────────────────────────────────────────────────────

    const vpc = new ec2.Vpc(this, "MeshVpc", {
      maxAzs: 2,
      natGateways: 1, // Keep costs low
    });

    // ─── ECS Cluster ───────────────────────────────────────────────

    const cluster = new ecs.Cluster(this, "MeshCluster", {
      vpc,
      clusterName: "agent-mesh-cluster",
    });

    // ─── Fargate Service with ALB ──────────────────────────────────

    const service = new ecs_patterns.ApplicationLoadBalancedFargateService(
      this,
      "MeshService",
      {
        cluster,
        serviceName: "agent-mesh-service",
        desiredCount: 1,
        cpu: 256,
        memoryLimitMiB: 512,
        taskImageOptions: {
          image: ecs.ContainerImage.fromAsset("."),
          containerPort: 3000,
          environment: {
            NODE_ENV: "production",
            PORT: "3000",
            AWS_REGION: this.region,
            MESHES_TABLE: meshesTable.tableName,
            AGENTS_TABLE: agentsTable.tableName,
            MESSAGES_TABLE: messagesTable.tableName,
          },
          logDriver: ecs.LogDrivers.awsLogs({
            streamPrefix: "agent-mesh",
            logRetention: logs.RetentionDays.ONE_WEEK,
          }),
        },
        publicLoadBalancer: true,
        // Long-polling needs longer idle timeout
        idleTimeout: cdk.Duration.seconds(65),
      }
    );

    // ALB health check
    service.targetGroup.configureHealthCheck({
      path: "/health",
      interval: cdk.Duration.seconds(30),
      timeout: cdk.Duration.seconds(5),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 3,
    });

    // Grant DynamoDB access to Fargate task
    meshesTable.grantReadWriteData(service.taskDefinition.taskRole);
    agentsTable.grantReadWriteData(service.taskDefinition.taskRole);
    messagesTable.grantReadWriteData(service.taskDefinition.taskRole);

    // ─── Outputs ───────────────────────────────────────────────────

    new cdk.CfnOutput(this, "ServiceURL", {
      value: `http://${service.loadBalancer.loadBalancerDnsName}`,
      description: "Agent Mesh Service URL",
    });

    new cdk.CfnOutput(this, "MeshesTableName", {
      value: meshesTable.tableName,
    });
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

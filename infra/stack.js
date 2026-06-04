// CDK Infrastructure — Agent Mesh Service
// ECS Fargate + ALB + DynamoDB (App Runner deprecated April 2026)
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs_patterns from "aws-cdk-lib/aws-ecs-patterns";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

class AgentMeshStack extends cdk.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

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

    const usersTable = new dynamodb.Table(this, "UsersTable", {
      tableName: "agent-mesh-users",
      partitionKey: { name: "user_id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    messagesTable.addGlobalSecondaryIndex({
      indexName: "recipient-index",
      partitionKey: { name: "mesh_id", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "recipient_id", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    usersTable.addGlobalSecondaryIndex({
      indexName: "github-id-index",
      partitionKey: { name: "github_id", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    usersTable.addGlobalSecondaryIndex({
      indexName: "token-hash-index",
      partitionKey: { name: "token_hash", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const repository = ecr.Repository.fromRepositoryName(this, "MeshRepo", "agent-mesh-service");

    const vpc = new ec2.Vpc(this, "MeshVpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "Public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    });

    const cluster = new ecs.Cluster(this, "MeshCluster", {
      vpc,
      clusterName: "agent-mesh-cluster",
    });

    const service = new ecs_patterns.ApplicationLoadBalancedFargateService(this, "MeshService", {
      cluster,
      serviceName: "agent-mesh-service",
      desiredCount: 1,
      cpu: 256,
      memoryLimitMiB: 512,
      circuitBreaker: { enable: true, rollback: true },
      assignPublicIp: true,
      taskSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      taskImageOptions: {
        image: ecs.ContainerImage.fromEcrRepository(repository, "latest"),
        containerPort: 3000,
        environment: {
          NODE_ENV: "production",
          PORT: "3000",
          AWS_REGION: this.region,
          MESHES_TABLE: meshesTable.tableName,
          AGENTS_TABLE: agentsTable.tableName,
          MESSAGES_TABLE: messagesTable.tableName,
          USERS_TABLE: usersTable.tableName,
          SESSION_SECRET: process.env.SESSION_SECRET || "set-this-in-production",
          GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || "",
          GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET || "",
          BASE_URL:
            process.env.BASE_URL ||
            "http://AgentM-MeshS-C9BTpnBG6o3j-892354001.us-east-1.elb.amazonaws.com",
        },
        logDriver: ecs.LogDrivers.awsLogs({
          streamPrefix: "agent-mesh",
          logRetention: logs.RetentionDays.ONE_WEEK,
        }),
      },
      publicLoadBalancer: true,
      idleTimeout: cdk.Duration.seconds(65),
    });

    service.targetGroup.configureHealthCheck({
      path: "/health",
      interval: cdk.Duration.seconds(30),
      timeout: cdk.Duration.seconds(5),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 3,
    });

    meshesTable.grantReadWriteData(service.taskDefinition.taskRole);
    agentsTable.grantReadWriteData(service.taskDefinition.taskRole);
    messagesTable.grantReadWriteData(service.taskDefinition.taskRole);
    usersTable.grantReadWriteData(service.taskDefinition.taskRole);

    new cdk.CfnOutput(this, "ServiceURL", {
      value: `http://${service.loadBalancer.loadBalancerDnsName}`,
      description: "Agent Mesh Service URL",
    });

    new cdk.CfnOutput(this, "ClusterName", {
      value: cluster.clusterName,
    });

    new cdk.CfnOutput(this, "ServiceName", {
      value: "agent-mesh-service",
    });
  }
}

const app = new cdk.App();
new AgentMeshStack(app, "AgentMeshStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT || "250230555773",
    region: process.env.CDK_DEFAULT_REGION || "us-east-1",
  },
});

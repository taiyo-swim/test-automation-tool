import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import { Construct } from "constructs";

interface EcsStackProps extends cdk.StackProps {
  prefix: string;
  vpc: ec2.Vpc;
  ecsSecurityGroup: ec2.SecurityGroup;
  albSecurityGroup: ec2.SecurityGroup;
  dbSecret: secretsmanager.ISecret;
  dbEndpoint: string;
  cacheEndpoint: string;
  screenshotsBucket: s3.Bucket;
  apiRepo: ecr.Repository;
  webRepo: ecr.Repository;
  runnerRepo: ecr.Repository;
  domainName?: string;
  certificateArn?: string;
}

export class EcsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EcsStackProps) {
    super(scope, id, props);

    const {
      prefix,
      vpc,
      ecsSecurityGroup,
      albSecurityGroup,
      dbSecret,
      dbEndpoint,
      cacheEndpoint,
      screenshotsBucket,
      apiRepo,
      webRepo,
      runnerRepo,
      domainName,
      certificateArn,
    } = props;

    // ── Secrets ───────────────────────────────────────────────────────────
    const jwtSecret = new secretsmanager.Secret(this, "JwtSecret", {
      secretName: `${prefix}/jwt-secret`,
      generateSecretString: {
        excludePunctuation: true,
        passwordLength: 64,
      },
    });

    const runnerSecret = new secretsmanager.Secret(this, "RunnerSecret", {
      secretName: `${prefix}/runner-secret`,
      generateSecretString: {
        excludePunctuation: true,
        passwordLength: 48,
      },
    });

    // ── ECS Cluster ───────────────────────────────────────────────────────
    const cluster = new ecs.Cluster(this, "Cluster", {
      clusterName: `${prefix}-cluster`,
      vpc,
      containerInsights: true,
    });

    // ── IAM Roles ─────────────────────────────────────────────────────────
    const executionRole = new iam.Role(this, "ExecutionRole", {
      roleName: `${prefix}-ecs-execution-role`,
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy"),
      ],
    });
    // Allow pulling secrets from Secrets Manager
    executionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: [
          dbSecret.secretArn,
          jwtSecret.secretArn,
          runnerSecret.secretArn,
        ],
      })
    );

    const apiTaskRole = new iam.Role(this, "ApiTaskRole", {
      roleName: `${prefix}-api-task-role`,
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });
    screenshotsBucket.grantReadWrite(apiTaskRole);

    const runnerTaskRole = new iam.Role(this, "RunnerTaskRole", {
      roleName: `${prefix}-runner-task-role`,
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });
    screenshotsBucket.grantReadWrite(runnerTaskRole);

    // ── CloudWatch Log Groups ─────────────────────────────────────────────
    const apiLogGroup = new logs.LogGroup(this, "ApiLogGroup", {
      logGroupName: `/ecs/${prefix}/api`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const webLogGroup = new logs.LogGroup(this, "WebLogGroup", {
      logGroupName: `/ecs/${prefix}/web`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const runnerLogGroup = new logs.LogGroup(this, "RunnerLogGroup", {
      logGroupName: `/ecs/${prefix}/runner-web`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Build the DATABASE_URL from secret fields + endpoint
    // We use Secrets Manager secret value injection for the password
    const dbUrlSecret = new secretsmanager.Secret(this, "DbUrlSecret", {
      secretName: `${prefix}/database-url`,
      secretStringValue: cdk.SecretValue.unsafePlainText(
        // Placeholder — the real value is set by a custom resource or manually after first deploy
        `postgresql://postgres:CHANGEME@${dbEndpoint}:5432/e2etool`
      ),
    });

    // ── API Task Definition ───────────────────────────────────────────────
    const apiTaskDef = new ecs.FargateTaskDefinition(this, "ApiTask", {
      family: `${prefix}-api`,
      cpu: 512,
      memoryLimitMiB: 1024,
      executionRole,
      taskRole: apiTaskRole,
    });

    const apiContainer = apiTaskDef.addContainer("api", {
      image: ecs.ContainerImage.fromEcrRepository(apiRepo, "latest"),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "api",
        logGroup: apiLogGroup,
      }),
      environment: {
        NODE_ENV: "production",
        PORT: "4000",
        STORAGE_TYPE: "s3",
        AWS_S3_BUCKET: screenshotsBucket.bucketName,
        AWS_REGION: this.region,
        REDIS_URL: `redis://${cacheEndpoint}:6379`,
        // SMTP (email notifications) — set via SSM Parameter or override after deploy:
        // SMTP_HOST: "email-smtp.ap-northeast-1.amazonaws.com",
        // SMTP_PORT: "587",
        // SMTP_FROM: '"E2E Tool" <noreply@your-domain.com>',
      },
      secrets: {
        DATABASE_URL: ecs.Secret.fromSecretsManager(dbUrlSecret),
        JWT_SECRET: ecs.Secret.fromSecretsManager(jwtSecret),
        RUNNER_SECRET: ecs.Secret.fromSecretsManager(runnerSecret),
      },
      healthCheck: {
        command: ["CMD-SHELL", "curl -f http://localhost:4000/health || exit 1"],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
      portMappings: [{ containerPort: 4000 }],
    });

    // ── Web Task Definition ───────────────────────────────────────────────
    const webTaskDef = new ecs.FargateTaskDefinition(this, "WebTask", {
      family: `${prefix}-web`,
      cpu: 512,
      memoryLimitMiB: 1024,
      executionRole,
    });

    webTaskDef.addContainer("web", {
      image: ecs.ContainerImage.fromEcrRepository(webRepo, "latest"),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "web",
        logGroup: webLogGroup,
      }),
      environment: {
        NODE_ENV: "production",
        PORT: "3000",
        // The web container proxies /api/* to the API service via internal DNS
        NEXT_PUBLIC_API_URL: "/api",
      },
      healthCheck: {
        command: ["CMD-SHELL", "curl -f http://localhost:3000/ || exit 1"],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
      portMappings: [{ containerPort: 3000 }],
    });

    // ── Runner Task Definition ────────────────────────────────────────────
    // Runner is a worker process — no ALB, scales based on queue depth
    const runnerTaskDef = new ecs.FargateTaskDefinition(this, "RunnerTask", {
      family: `${prefix}-runner-web`,
      cpu: 1024,  // Playwright needs more CPU
      memoryLimitMiB: 3072, // Playwright needs ~2GB
      executionRole,
      taskRole: runnerTaskRole,
    });

    runnerTaskDef.addContainer("runner-web", {
      image: ecs.ContainerImage.fromEcrRepository(runnerRepo, "latest"),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "runner-web",
        logGroup: runnerLogGroup,
      }),
      environment: {
        NODE_ENV: "production",
        STORAGE_TYPE: "s3",
        AWS_S3_BUCKET: screenshotsBucket.bucketName,
        AWS_REGION: this.region,
        REDIS_URL: `redis://${cacheEndpoint}:6379`,
        // Runner calls the API internally via service discovery
        API_URL: "http://api.e2e-tool.local:4000",
      },
      secrets: {
        RUNNER_SECRET: ecs.Secret.fromSecretsManager(runnerSecret),
        DATABASE_URL: ecs.Secret.fromSecretsManager(dbUrlSecret),
      },
      // Playwright needs /dev/shm for Chrome shared memory
      linuxParameters: new ecs.LinuxParameters(this, "RunnerLinuxParams", {
        sharedMemorySize: 2048, // 2GB /dev/shm
      }),
    });

    // ── ALB ───────────────────────────────────────────────────────────────
    const alb = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      loadBalancerName: `${prefix}-alb`,
      vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    // HTTPS certificate
    let certificate: acm.ICertificate | undefined;
    if (certificateArn) {
      certificate = acm.Certificate.fromCertificateArn(this, "Cert", certificateArn);
    }

    // Target groups
    const webTg = new elbv2.ApplicationTargetGroup(this, "WebTg", {
      targetGroupName: `${prefix}-web-tg`,
      vpc,
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: "/",
        interval: cdk.Duration.seconds(30),
        healthyHttpCodes: "200",
      },
      deregistrationDelay: cdk.Duration.seconds(30),
    });

    const apiTg = new elbv2.ApplicationTargetGroup(this, "ApiTg", {
      targetGroupName: `${prefix}-api-tg`,
      vpc,
      port: 4000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: "/health",
        interval: cdk.Duration.seconds(30),
        healthyHttpCodes: "200",
      },
      deregistrationDelay: cdk.Duration.seconds(30),
      // Enable sticky sessions for WebSocket connections
      stickinessCookieDuration: cdk.Duration.seconds(86400),
    });

    // HTTP listener — redirect to HTTPS if cert present, otherwise route directly
    const httpListener = alb.addListener("HttpListener", {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: certificate
        ? elbv2.ListenerAction.redirect({ protocol: "HTTPS", port: "443", permanent: true })
        : elbv2.ListenerAction.forward([webTg]),
    });

    if (!certificate) {
      // Without HTTPS, add API routing on HTTP listener
      httpListener.addAction("ApiRoute", {
        priority: 10,
        conditions: [
          elbv2.ListenerCondition.pathPatterns(["/api/*", "/ws", "/health"]),
        ],
        action: elbv2.ListenerAction.forward([apiTg]),
      });
    }

    // HTTPS listener (only if certificate is provided)
    if (certificate) {
      const httpsListener = alb.addListener("HttpsListener", {
        port: 443,
        protocol: elbv2.ApplicationProtocol.HTTPS,
        certificates: [certificate],
        defaultAction: elbv2.ListenerAction.forward([webTg]),
        sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS,
      });

      httpsListener.addAction("ApiRoute", {
        priority: 10,
        conditions: [
          elbv2.ListenerCondition.pathPatterns(["/api/*", "/ws", "/health"]),
        ],
        action: elbv2.ListenerAction.forward([apiTg]),
      });
    }

    // ── ECS Services ──────────────────────────────────────────────────────
    const apiService = new ecs.FargateService(this, "ApiService", {
      serviceName: `${prefix}-api`,
      cluster,
      taskDefinition: apiTaskDef,
      desiredCount: 1,
      securityGroups: [ecsSecurityGroup],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
      enableECSManagedTags: true,
      propagateTags: ecs.PropagatedTagSource.SERVICE,
    });
    apiService.attachToApplicationTargetGroup(apiTg);

    const webService = new ecs.FargateService(this, "WebService", {
      serviceName: `${prefix}-web`,
      cluster,
      taskDefinition: webTaskDef,
      desiredCount: 1,
      securityGroups: [ecsSecurityGroup],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
      enableECSManagedTags: true,
      propagateTags: ecs.PropagatedTagSource.SERVICE,
    });
    webService.attachToApplicationTargetGroup(webTg);

    // Runner runs as a background worker; no ALB attachment
    new ecs.FargateService(this, "RunnerService", {
      serviceName: `${prefix}-runner-web`,
      cluster,
      taskDefinition: runnerTaskDef,
      desiredCount: 1,
      securityGroups: [ecsSecurityGroup],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
      enableECSManagedTags: true,
      propagateTags: ecs.PropagatedTagSource.SERVICE,
    });

    // ── Outputs ───────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, "AlbDnsName", {
      value: alb.loadBalancerDnsName,
      exportName: `${prefix}-alb-dns`,
      description: "ALB DNS name — point your domain CNAME here",
    });
    new cdk.CfnOutput(this, "ClusterName", {
      value: cluster.clusterName,
      exportName: `${prefix}-cluster-name`,
    });
    new cdk.CfnOutput(this, "ApiServiceName", {
      value: apiService.serviceName,
      exportName: `${prefix}-api-service`,
    });
    new cdk.CfnOutput(this, "WebServiceName", {
      value: webService.serviceName,
      exportName: `${prefix}-web-service`,
    });

    // Add resource tagging
    cdk.Tags.of(this).add("Project", prefix);
    cdk.Tags.of(this).add("ManagedBy", "CDK");
  }
}

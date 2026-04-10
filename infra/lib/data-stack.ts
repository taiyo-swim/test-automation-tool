import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as elasticache from "aws-cdk-lib/aws-elasticache";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

interface DataStackProps extends cdk.StackProps {
  prefix: string;
  vpc: ec2.Vpc;
  dbSecurityGroup: ec2.SecurityGroup;
  cacheSecurityGroup: ec2.SecurityGroup;
}

export class DataStack extends cdk.Stack {
  readonly dbSecret: secretsmanager.ISecret;
  readonly dbEndpoint: string;
  readonly cacheEndpoint: string;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const { prefix, vpc, dbSecurityGroup, cacheSecurityGroup } = props;

    // ── RDS PostgreSQL ────────────────────────────────────────────────────
    const dbInstance = new rds.DatabaseInstance(this, "Postgres", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSecurityGroup],
      databaseName: "e2etool",
      credentials: rds.Credentials.fromGeneratedSecret("postgres", {
        secretName: `${prefix}/db-credentials`,
      }),
      multiAz: false, // Set to true for production HA
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      storageEncrypted: true,
      backupRetention: cdk.Duration.days(7),
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      enablePerformanceInsights: true,
      monitoringInterval: cdk.Duration.seconds(60),
      cloudwatchLogsExports: ["postgresql"],
      parameterGroup: new rds.ParameterGroup(this, "PgParams", {
        engine: rds.DatabaseInstanceEngine.postgres({
          version: rds.PostgresEngineVersion.VER_16,
        }),
        parameters: {
          // Log slow queries (>1s)
          log_min_duration_statement: "1000",
          shared_preload_libraries: "pg_stat_statements",
        },
      }),
    });

    this.dbSecret = dbInstance.secret!;
    this.dbEndpoint = dbInstance.dbInstanceEndpointAddress;

    // ── ElastiCache Redis ─────────────────────────────────────────────────
    const cacheSubnetGroup = new elasticache.CfnSubnetGroup(this, "CacheSubnetGroup", {
      description: `${prefix} ElastiCache subnet group`,
      subnetIds: vpc.isolatedSubnets.map((s) => s.subnetId),
      cacheSubnetGroupName: `${prefix}-cache-subnet-group`,
    });

    const redisCluster = new elasticache.CfnReplicationGroup(this, "Redis", {
      replicationGroupDescription: `${prefix} Redis cluster`,
      replicationGroupId: `${prefix}-redis`,
      engine: "redis",
      engineVersion: "7.1",
      cacheNodeType: "cache.t3.micro",
      numCacheClusters: 1, // Increase to 2 for read replicas
      automaticFailoverEnabled: false, // Set to true with numCacheClusters >= 2
      cacheSubnetGroupName: cacheSubnetGroup.cacheSubnetGroupName!,
      securityGroupIds: [cacheSecurityGroup.securityGroupId],
      atRestEncryptionEnabled: true,
      transitEncryptionEnabled: false, // Enable for prod (requires TLS in Redis URL)
    });
    redisCluster.addDependency(cacheSubnetGroup);

    this.cacheEndpoint = redisCluster.attrPrimaryEndPointAddress;

    // ── Outputs ───────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, "DbEndpoint", {
      value: this.dbEndpoint,
      exportName: `${prefix}-db-endpoint`,
    });
    new cdk.CfnOutput(this, "DbSecretArn", {
      value: this.dbSecret.secretArn,
      exportName: `${prefix}-db-secret-arn`,
    });
    new cdk.CfnOutput(this, "RedisEndpoint", {
      value: this.cacheEndpoint,
      exportName: `${prefix}-redis-endpoint`,
    });
  }
}

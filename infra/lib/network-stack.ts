import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

interface NetworkStackProps extends cdk.StackProps {
  prefix: string;
}

export class NetworkStack extends cdk.Stack {
  readonly vpc: ec2.Vpc;
  readonly albSecurityGroup: ec2.SecurityGroup;
  readonly ecsSecurityGroup: ec2.SecurityGroup;
  readonly dbSecurityGroup: ec2.SecurityGroup;
  readonly cacheSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const { prefix } = props;

    // ── VPC ──────────────────────────────────────────────────────────────
    this.vpc = new ec2.Vpc(this, "Vpc", {
      vpcName: `${prefix}-vpc`,
      maxAzs: 2,
      natGateways: 1, // 1 NAT GW (cost-effective; use 2 for HA prod)
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: "private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
        {
          name: "isolated",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 28,
        },
      ],
    });

    // ── Security Groups ───────────────────────────────────────────────────

    // ALB: accept HTTP/HTTPS from internet
    this.albSecurityGroup = new ec2.SecurityGroup(this, "AlbSg", {
      vpc: this.vpc,
      securityGroupName: `${prefix}-alb-sg`,
      description: "ALB security group",
    });
    this.albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "HTTP");
    this.albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "HTTPS");

    // ECS tasks: accept traffic from ALB only
    this.ecsSecurityGroup = new ec2.SecurityGroup(this, "EcsSg", {
      vpc: this.vpc,
      securityGroupName: `${prefix}-ecs-sg`,
      description: "ECS Fargate tasks security group",
    });
    this.ecsSecurityGroup.addIngressRule(this.albSecurityGroup, ec2.Port.tcp(3000), "Web from ALB");
    this.ecsSecurityGroup.addIngressRule(this.albSecurityGroup, ec2.Port.tcp(4000), "API from ALB");
    // Allow internal ECS-to-ECS communication (runner → api)
    this.ecsSecurityGroup.addIngressRule(this.ecsSecurityGroup, ec2.Port.tcp(4000), "Internal API");

    // RDS: accept from ECS tasks only
    this.dbSecurityGroup = new ec2.SecurityGroup(this, "DbSg", {
      vpc: this.vpc,
      securityGroupName: `${prefix}-db-sg`,
      description: "RDS security group",
    });
    this.dbSecurityGroup.addIngressRule(this.ecsSecurityGroup, ec2.Port.tcp(5432), "Postgres from ECS");

    // ElastiCache: accept from ECS tasks only
    this.cacheSecurityGroup = new ec2.SecurityGroup(this, "CacheSg", {
      vpc: this.vpc,
      securityGroupName: `${prefix}-cache-sg`,
      description: "ElastiCache security group",
    });
    this.cacheSecurityGroup.addIngressRule(this.ecsSecurityGroup, ec2.Port.tcp(6379), "Redis from ECS");

    // ── Outputs ───────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, "VpcId", { value: this.vpc.vpcId, exportName: `${prefix}-vpc-id` });
  }
}

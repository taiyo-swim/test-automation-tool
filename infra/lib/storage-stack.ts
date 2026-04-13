import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ecr from "aws-cdk-lib/aws-ecr";
import { Construct } from "constructs";

interface StorageStackProps extends cdk.StackProps {
  prefix: string;
}

export class StorageStack extends cdk.Stack {
  readonly screenshotsBucket: s3.Bucket;
  readonly apiRepo: ecr.Repository;
  readonly webRepo: ecr.Repository;
  readonly runnerRepo: ecr.Repository;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    const { prefix } = props;

    // ── S3: screenshots, baselines, diffs ────────────────────────────────
    this.screenshotsBucket = new s3.Bucket(this, "ScreenshotsBucket", {
      bucketName: `${prefix}-screenshots-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: false,
      lifecycleRules: [
        {
          // Expire old screenshots after 90 days to control storage costs
          expiration: cdk.Duration.days(90),
          prefix: "screenshots/",
        },
        {
          expiration: cdk.Duration.days(180),
          prefix: "baselines/",
        },
        {
          expiration: cdk.Duration.days(90),
          prefix: "diffs/",
        },
      ],
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
          maxAge: 3600,
        },
      ],
    });

    // ── ECR Repositories ─────────────────────────────────────────────────
    const ecrProps: Partial<ecr.RepositoryProps> = {
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          // Keep last 10 images per repo to control ECR costs
          maxImageCount: 10,
          description: "Keep last 10 images",
        },
      ],
    };

    this.apiRepo = new ecr.Repository(this, "ApiRepo", {
      repositoryName: `${prefix}/api`,
      ...ecrProps,
    });

    this.webRepo = new ecr.Repository(this, "WebRepo", {
      repositoryName: `${prefix}/web`,
      ...ecrProps,
    });

    this.runnerRepo = new ecr.Repository(this, "RunnerRepo", {
      repositoryName: `${prefix}/runner-web`,
      ...ecrProps,
    });

    // ── Outputs ───────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, "BucketName", {
      value: this.screenshotsBucket.bucketName,
      exportName: `${prefix}-bucket-name`,
    });
    new cdk.CfnOutput(this, "ApiRepoUri", {
      value: this.apiRepo.repositoryUri,
      exportName: `${prefix}-api-repo-uri`,
    });
    new cdk.CfnOutput(this, "WebRepoUri", {
      value: this.webRepo.repositoryUri,
      exportName: `${prefix}-web-repo-uri`,
    });
    new cdk.CfnOutput(this, "RunnerRepoUri", {
      value: this.runnerRepo.repositoryUri,
      exportName: `${prefix}-runner-repo-uri`,
    });
  }
}

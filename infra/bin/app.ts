#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { NetworkStack } from "../lib/network-stack";
import { StorageStack } from "../lib/storage-stack";
import { DataStack } from "../lib/data-stack";
import { EcsStack } from "../lib/ecs-stack";

const app = new cdk.App();

const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? "ap-northeast-1",
};

const prefix = app.node.tryGetContext("prefix") ?? "e2e-tool";
const domainName: string | undefined = app.node.tryGetContext("domainName");
const certificateArn: string | undefined = app.node.tryGetContext("certificateArn");

const networkStack = new NetworkStack(app, `${prefix}-network`, { env, prefix });

const storageStack = new StorageStack(app, `${prefix}-storage`, {
  env,
  prefix,
});

const dataStack = new DataStack(app, `${prefix}-data`, {
  env,
  prefix,
  vpc: networkStack.vpc,
  dbSecurityGroup: networkStack.dbSecurityGroup,
  cacheSecurityGroup: networkStack.cacheSecurityGroup,
});

new EcsStack(app, `${prefix}-ecs`, {
  env,
  prefix,
  vpc: networkStack.vpc,
  ecsSecurityGroup: networkStack.ecsSecurityGroup,
  albSecurityGroup: networkStack.albSecurityGroup,
  dbSecret: dataStack.dbSecret,
  dbEndpoint: dataStack.dbEndpoint,
  cacheEndpoint: dataStack.cacheEndpoint,
  screenshotsBucket: storageStack.screenshotsBucket,
  apiRepo: storageStack.apiRepo,
  webRepo: storageStack.webRepo,
  runnerRepo: storageStack.runnerRepo,
  domainName,
  certificateArn,
});

app.synth();

#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { LeadsETLPipelineStack } from '../lib/leads-etl-pipeline-stack';

const app = new cdk.App();

new LeadsETLPipelineStack(app, 'LeadsETLPipelineStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'ETL Pipeline for processing church leads from S3 to DynamoDB',
  tags: {
    Project: 'NovaVoice',
    Purpose: 'LeadsETL',
    ManagedBy: 'CDK'
  }
});

app.synth();
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
export interface LeadsETLPipelineStackProps extends cdk.StackProps {
    sourceBucket?: string;
    sourceKey?: string;
    notificationEmail?: string;
}
export declare class LeadsETLPipelineStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: LeadsETLPipelineStackProps);
}

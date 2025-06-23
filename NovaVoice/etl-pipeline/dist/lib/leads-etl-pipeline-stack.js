"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeadsETLPipelineStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const stepfunctions = __importStar(require("aws-cdk-lib/aws-stepfunctions"));
const sfnTasks = __importStar(require("aws-cdk-lib/aws-stepfunctions-tasks"));
const sns = __importStar(require("aws-cdk-lib/aws-sns"));
const snsSubscriptions = __importStar(require("aws-cdk-lib/aws-sns-subscriptions"));
const cloudwatch = __importStar(require("aws-cdk-lib/aws-cloudwatch"));
const path = __importStar(require("path"));
class LeadsETLPipelineStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // Configuration
        const sourceBucket = props?.sourceBucket || 'globaloutreachevent.com';
        const sourceKey = props?.sourceKey || 'leads.txt';
        const notificationEmail = props?.notificationEmail || '';
        // Create output bucket for processed data
        const outputBucket = new s3.Bucket(this, 'LeadsProcessedOutput', {
            bucketName: `leads-processed-output-${this.account}-${this.region}`,
            versioned: true,
            encryption: s3.BucketEncryption.S3_MANAGED,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            lifecycleRules: [
                {
                    id: 'DeleteOldProcessedFiles',
                    expiration: cdk.Duration.days(90),
                    prefix: 'processed/'
                }
            ]
        });
        // Create scripts bucket for Glue scripts
        const scriptsBucket = new s3.Bucket(this, 'GlueScriptsBucket', {
            bucketName: `glue-scripts-${this.account}-${this.region}`,
            versioned: true,
            encryption: s3.BucketEncryption.S3_MANAGED,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true
        });
        // Create DynamoDB table with phone as primary key
        const churchesTable = new dynamodb.Table(this, 'ChurchesTable', {
            tableName: 'Churches',
            partitionKey: { name: 'phone', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecovery: true,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            encryption: dynamodb.TableEncryption.AWS_MANAGED,
            stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES // Enable DynamoDB Streams for change tracking
        });
        // Add Global Secondary Indexes
        churchesTable.addGlobalSecondaryIndex({
            indexName: 'lead_status-index',
            partitionKey: { name: 'lead_status', type: dynamodb.AttributeType.STRING },
            projectionType: dynamodb.ProjectionType.ALL
        });
        churchesTable.addGlobalSecondaryIndex({
            indexName: 'owner_alias-index',
            partitionKey: { name: 'owner_alias', type: dynamodb.AttributeType.STRING },
            projectionType: dynamodb.ProjectionType.ALL
        });
        // Create Glue IAM role
        const glueRole = new iam.Role(this, 'GlueETLRole', {
            assumedBy: new iam.ServicePrincipal('glue.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSGlueServiceRole')
            ]
        });
        // Grant Glue access to S3 buckets
        glueRole.addToPolicy(new iam.PolicyStatement({
            actions: ['s3:GetObject', 's3:ListBucket'],
            resources: [
                `arn:aws:s3:::${sourceBucket}`,
                `arn:aws:s3:::${sourceBucket}/*`
            ]
        }));
        outputBucket.grantReadWrite(glueRole);
        scriptsBucket.grantRead(glueRole);
        // Upload Glue script to S3
        const glueScriptAsset = new cdk.aws_s3_deployment.BucketDeployment(this, 'GlueScriptDeployment', {
            sources: [cdk.aws_s3_deployment.Source.asset(path.join(__dirname, '../glue-scripts'))],
            destinationBucket: scriptsBucket,
            destinationKeyPrefix: 'scripts/'
        });
        // Create Glue job using CfnJob
        const glueJob = new cdk.aws_glue.CfnJob(this, 'LeadsParserJob', {
            name: 'leads-parser-job',
            role: glueRole.roleArn,
            command: {
                name: 'glueetl',
                pythonVersion: '3',
                scriptLocation: `s3://${scriptsBucket.bucketName}/scripts/parse-leads.py`
            },
            glueVersion: '4.0',
            defaultArguments: {
                '--SOURCE_BUCKET': sourceBucket,
                '--SOURCE_KEY': sourceKey,
                '--OUTPUT_BUCKET': outputBucket.bucketName,
                '--enable-metrics': '',
                '--enable-continuous-cloudwatch-log': 'true',
                '--enable-spark-ui': 'true',
                '--spark-event-logs-path': `s3://${outputBucket.bucketName}/spark-logs/`,
                '--job-language': 'python'
            },
            maxRetries: 2,
            timeout: 30, // minutes
            executionProperty: {
                maxConcurrentRuns: 1
            }
        });
        glueJob.node.addDependency(glueScriptAsset);
        // Create Lambda functions
        const lambdaRole = new iam.Role(this, 'LambdaETLRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
            ]
        });
        outputBucket.grantRead(lambdaRole);
        churchesTable.grantReadWriteData(lambdaRole);
        // DynamoDB Loader Lambda
        const dynamoLoaderLambda = new lambda.Function(this, 'DynamoLoaderFunction', {
            functionName: 'leads-dynamo-loader',
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/dynamo-loader')),
            role: lambdaRole,
            timeout: cdk.Duration.minutes(15),
            memorySize: 1024,
            environment: {
                TABLE_NAME: churchesTable.tableName,
                OUTPUT_BUCKET: outputBucket.bucketName
            }
        });
        // Rails Seeds Generator Lambda
        const seedsGeneratorLambda = new lambda.Function(this, 'SeedsGeneratorFunction', {
            functionName: 'rails-seeds-generator',
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/seeds-generator')),
            role: lambdaRole,
            timeout: cdk.Duration.minutes(10),
            memorySize: 512,
            environment: {
                OUTPUT_BUCKET: outputBucket.bucketName
            }
        });
        // Data Validation Lambda
        const validationLambda = new lambda.Function(this, 'DataValidationFunction', {
            functionName: 'leads-data-validation',
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/data-validation')),
            role: lambdaRole,
            timeout: cdk.Duration.minutes(5),
            memorySize: 256,
            environment: {
                TABLE_NAME: churchesTable.tableName,
                OUTPUT_BUCKET: outputBucket.bucketName
            }
        });
        // Create SNS topic for notifications
        const notificationTopic = new sns.Topic(this, 'ETLNotificationTopic', {
            topicName: 'leads-etl-notifications',
            displayName: 'Leads ETL Pipeline Notifications'
        });
        if (notificationEmail) {
            notificationTopic.addSubscription(new snsSubscriptions.EmailSubscription(notificationEmail));
        }
        // Create Step Functions state machine
        const glueTask = new sfnTasks.GlueStartJobRun(this, 'RunGlueETL', {
            glueJobName: glueJob.name || 'leads-parser-job',
            integrationPattern: stepfunctions.IntegrationPattern.RUN_JOB,
            resultPath: '$.glueResult'
        });
        const dynamoLoaderTask = new sfnTasks.LambdaInvoke(this, 'LoadToDynamoDB', {
            lambdaFunction: dynamoLoaderLambda,
            outputPath: '$.Payload',
            retryOnServiceExceptions: true
        });
        const seedsGeneratorTask = new sfnTasks.LambdaInvoke(this, 'GenerateRailsSeeds', {
            lambdaFunction: seedsGeneratorLambda,
            outputPath: '$.Payload',
            retryOnServiceExceptions: true
        });
        const validationTask = new sfnTasks.LambdaInvoke(this, 'ValidateData', {
            lambdaFunction: validationLambda,
            outputPath: '$.Payload',
            retryOnServiceExceptions: true
        });
        const successNotification = new sfnTasks.SnsPublish(this, 'SendSuccessNotification', {
            topic: notificationTopic,
            message: stepfunctions.TaskInput.fromText('ETL Pipeline completed successfully!')
        });
        const failureNotification = new sfnTasks.SnsPublish(this, 'SendFailureNotification', {
            topic: notificationTopic,
            message: stepfunctions.TaskInput.fromJsonPathAt('$.error')
        });
        // Define the workflow
        const definition = glueTask
            .next(dynamoLoaderTask)
            .next(new stepfunctions.Parallel(this, 'ParallelProcessing')
            .branch(seedsGeneratorTask)
            .branch(validationTask))
            .next(successNotification);
        // Add error handling
        const errorHandler = new stepfunctions.Fail(this, 'ETLFailed', {
            error: 'ETLPipelineError',
            cause: 'Check CloudWatch Logs for details'
        });
        const definitionWithErrorHandling = new stepfunctions.Parallel(this, 'ETLPipelineWithErrorHandling')
            .branch(definition)
            .addCatch(failureNotification.next(errorHandler), {
            errors: ['States.ALL'],
            resultPath: '$.error'
        });
        const stateMachine = new stepfunctions.StateMachine(this, 'LeadsETLStateMachine', {
            stateMachineName: 'leads-etl-pipeline',
            definition: definitionWithErrorHandling,
            timeout: cdk.Duration.hours(2),
            tracingEnabled: true
        });
        // Create CloudWatch Dashboard
        const dashboard = new cloudwatch.Dashboard(this, 'ETLDashboard', {
            dashboardName: 'leads-etl-pipeline-dashboard'
        });
        dashboard.addWidgets(new cloudwatch.GraphWidget({
            title: 'Lambda Function Duration',
            width: 12,
            height: 6,
            left: [
                dynamoLoaderLambda.metricDuration(),
                seedsGeneratorLambda.metricDuration(),
                validationLambda.metricDuration()
            ]
        }), new cloudwatch.GraphWidget({
            title: 'DynamoDB Write Throttles',
            width: 12,
            height: 6,
            left: [
                churchesTable.metricUserErrors()
            ]
        }));
        // Outputs
        new cdk.CfnOutput(this, 'OutputBucketName', {
            value: outputBucket.bucketName,
            description: 'S3 bucket for processed output files'
        });
        new cdk.CfnOutput(this, 'DynamoTableName', {
            value: churchesTable.tableName,
            description: 'DynamoDB table name for church leads'
        });
        new cdk.CfnOutput(this, 'StateMachineArn', {
            value: stateMachine.stateMachineArn,
            description: 'Step Functions state machine ARN'
        });
    }
}
exports.LeadsETLPipelineStack = LeadsETLPipelineStack;
//# sourceMappingURL=leads-etl-pipeline-stack.js.map
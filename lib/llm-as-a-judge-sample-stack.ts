import * as cdk from 'aws-cdk-lib/core';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class LlmAsAJudgeSampleStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const ordersTable = new dynamodb.Table(this, 'OrdersTable', {
            tableName: 'orders-table-prod',
            partitionKey: {
                name: 'orderId',
                type: dynamodb.AttributeType.STRING,
            },
        });

        const orderProcessor = new lambda.Function(this, 'OrderProcessor', {
            runtime: lambda.Runtime.NODEJS_22_X,
            code: lambda.Code.fromAsset('lambda'),
            handler: 'orderProcessor.handler',
            timeout: cdk.Duration.seconds(300),
            environment: {
                ORDERS_TABLE: 'orders-table-prod',
                HISTORY_TABLE: 'order-history-prod',
                SNS_TOPIC:
                    'arn:aws:sns:ap-northeast-1:123456789012:order-notifications',
                ENV: 'prod',
            },
        });

        orderProcessor.addToRolePolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ['*'],
                resources: ['*'],
            }),
        );
    }
}

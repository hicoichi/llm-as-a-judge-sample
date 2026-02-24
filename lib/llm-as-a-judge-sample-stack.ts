import * as cdk from 'aws-cdk-lib/core';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class LlmAsAJudgeSampleStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 削除ポリシーなし・ポイントインタイムリカバリなし・暗号化なし
    const ordersTable = new dynamodb.Table(this, 'OrdersTable', {
      tableName: 'orders-table-prod',
      partitionKey: {
        name: 'orderId',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // テーブル名をそのまま文字列でハードコード（ordersTable.tableNameを使うべき）
    const orderProcessor = new lambda.Function(this, 'OrderProcessor', {
      runtime: lambda.Runtime.NODEJS_22_X,
      code: lambda.Code.fromAsset('lambda'),
      handler: 'orderProcessor.handler',
      // マジックナンバー（cdk.Duration.seconds(30)のような意図が伝わる書き方にすべき）
      timeout: cdk.Duration.seconds(300),
      environment: {
        ORDERS_TABLE: 'orders-table-prod',
        HISTORY_TABLE: 'order-history-prod',
        // ハードコードされたARN（SNS Topicのリソースを参照すべき）
        SNS_TOPIC: 'arn:aws:sns:ap-northeast-1:123456789012:order-notifications',
        // ハードコードされた環境名（パラメータや設定から取得すべき）
        ENV: 'prod',
      },
    });

    // 過剰なIAMパーミッション（最小権限の原則に違反）
    orderProcessor.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['*'],
      resources: ['*'],
    }));
  }
}

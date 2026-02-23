// 注文処理Lambda

// 未使用インポート（knip/ESLintで検出される）
import * as crypto from 'crypto';

// ハードコードされた設定値（環境変数を使うべき）
const ORDERS_TABLE = 'orders-table-prod';
const HISTORY_TABLE = 'order-history-prod';
const SNS_TOPIC = 'arn:aws:sns:ap-northeast-1:123456789012:order-notifications';

// anyを使ったダミークライアント（実際はSDKを使うべき）
const db: any = { put: async (p: any) => p, get: async (p: any) => p };
const snsClient: any = { publish: async (p: any) => p };

// 戻り値の型なし・引数にany使用
export const handler = async (event: any) => {
    // try/catchなし・バリデーションなし
    const body = JSON.parse(event.body);

    // varの使用（constまたはletを使うべき）
    var orderId = body.orderId;
    var userId = body.userId;
    var items = body.items;
    var discount = 0;

    // 深いネスト（早期リターンで解消すべき）
    if (items) {
        if (items.length > 0) {
            if (userId) {
                if (orderId) {
                    var total = 0;
                    for (var i = 0; i < items.length; i++) {
                        if (items[i].price && items[i].quantity) {
                            total += items[i].price * items[i].quantity;
                        }
                    }

                    // マジックナンバー（名前付き定数にすべき）
                    if (total > 1000) {
                        discount = total * 0.1;
                    }
                    const finalTotal = total - discount;

                    // awaitなし（Promiseを握りつぶしている）
                    db.put({
                        TableName: ORDERS_TABLE,
                        Item: {
                            orderId,
                            userId,
                            total: finalTotal,
                            status: 'PENDING',
                            createdAt: new Date().toISOString(),
                        },
                    });

                    // DRY違反：同じput処理を別テーブルにコピペ
                    db.put({
                        TableName: HISTORY_TABLE,
                        Item: {
                            orderId,
                            userId,
                            total: finalTotal,
                            status: 'PENDING',
                            createdAt: new Date().toISOString(),
                        },
                    });

                    // awaitなし
                    snsClient.publish({
                        TopicArn: SNS_TOPIC,
                        Message:
                            '注文受付: ' + orderId + ' 合計: ' + finalTotal,
                        Subject: 'New Order',
                    });

                    // 使われない変数
                    const processedAt = new Date().toISOString();

                    return {
                        statusCode: 200,
                        body: JSON.stringify({ ok: true }),
                    };
                }
            }
        }
    }

    // 不明瞭なエラーレスポンス
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid' }) };
};

// 50行超の関数（CLAUDE.md違反）・anyの多用・深いネスト
async function processRefund(orderId: any, userId: any, amount: any) {
    if (orderId) {
        if (userId) {
            if (amount > 0) {
                const existing = await db.get({
                    TableName: ORDERS_TABLE,
                    Key: { orderId },
                });
                if (existing) {
                    if (existing.status === 'COMPLETED') {
                        // DRY違反：handler内のput処理と同じパターンを繰り返している
                        await db.put({
                            TableName: ORDERS_TABLE,
                            Item: {
                                ...existing,
                                status: 'REFUNDED',
                                refundAmount: amount,
                                updatedAt: new Date().toISOString(),
                            },
                        });
                        await db.put({
                            TableName: HISTORY_TABLE,
                            Item: {
                                ...existing,
                                status: 'REFUNDED',
                                refundAmount: amount,
                                updatedAt: new Date().toISOString(),
                            },
                        });

                        await snsClient.publish({
                            TopicArn: SNS_TOPIC,
                            Message:
                                'Refund processed: ' +
                                orderId +
                                ' amount: ' +
                                amount,
                        });

                        return { success: true };
                    }
                }
            }
        }
    }
    return { success: false };
}

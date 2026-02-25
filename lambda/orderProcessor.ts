// 注文処理Lambda

const ORDERS_TABLE = 'orders-table-prod';
const HISTORY_TABLE = 'order-history-prod';
const SNS_TOPIC = 'arn:aws:sns:ap-northeast-1:123456789012:order-notifications';

// 最小限の型定義（外部依存を増やさない）
type ApiEvent = { body: string };
type OrderItem = { price: number; quantity: number };
type OrderRequest = { orderId?: string; userId?: string; items?: OrderItem[] };
type LambdaResponse = { statusCode: number; body: string };

interface DbPutInput { TableName: string; Item: Record<string, unknown> }
interface DbGetInput { TableName: string; Key: { orderId: string } }
interface DbClient {
    put: (p: DbPutInput) => Promise<DbPutInput>;
    get: (p: DbGetInput) => Promise<Record<string, unknown>>;
}

interface SnsPublishInput { TopicArn: string; Message: string; Subject?: string }
interface SnsClient { publish: (p: SnsPublishInput) => Promise<SnsPublishInput> }

const db: DbClient = {
    put: async (p) => p,
    get: async (p) => ({ ...p }),
};
const snsClient: SnsClient = { publish: async (p) => p };

export const handler = async (event: ApiEvent): Promise<LambdaResponse> => {
    const body = JSON.parse(event.body);

    const orderId = (body as OrderRequest).orderId;
    const userId = (body as OrderRequest).userId;
    const items = (body as OrderRequest).items;
    let discount = 0;

    if (items) {
        if (items.length > 0) {
            if (userId) {
                if (orderId) {
                    let total = 0;
                    for (let i = 0; i < items.length; i++) {
                        if (items[i].price && items[i].quantity) {
                            total += items[i].price * items[i].quantity;
                        }
                    }

                    if (total > 1000) {
                        discount = total * 0.1;
                    }
                    const finalTotal = total - discount;

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

                    snsClient.publish({
                        TopicArn: SNS_TOPIC,
                        Message: '注文受付: ' + orderId + ' 合計: ' + finalTotal,
                        Subject: 'New Order',
                    });

                    return {
                        statusCode: 200,
                        body: JSON.stringify({ ok: true }),
                    };
                }
            }
        }
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid' }) };
};

async function processRefund(orderId: string, userId: string, amount: number) {
    if (orderId) {
        if (userId) {
            if (amount > 0) {
                const existing = await db.get({
                    TableName: ORDERS_TABLE,
                    Key: { orderId },
                });
                if (existing) {
                    const status = (existing as { status?: string }).status;
                    if (status === 'COMPLETED') {
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
                            Message: 'Refund processed: ' + orderId + ' amount: ' + amount,
                        });

                        return { success: true };
                    }
                }
            }
        }
    }
    return { success: false };
}

// 注文処理Lambda

import * as crypto from 'crypto';

const ORDERS_TABLE = 'orders-table-prod';
const HISTORY_TABLE = 'order-history-prod';
const SNS_TOPIC = 'arn:aws:sns:ap-northeast-1:123456789012:order-notifications';

const db: any = { put: async (p: any) => p, get: async (p: any) => p };
const snsClient: any = { publish: async (p: any) => p };

export const handler = async (event: any) => {
    const body = JSON.parse(event.body);

    var orderId = body.orderId;
    var userId = body.userId;
    var items = body.items;
    var discount = 0;

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
                        Message:
                            '注文受付: ' + orderId + ' 合計: ' + finalTotal,
                        Subject: 'New Order',
                    });

                    const processedAt = new Date().toISOString();

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

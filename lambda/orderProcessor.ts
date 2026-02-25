// 注文処理Lambda
// 環境変数を優先し、未設定時は従来のデフォルトを使用（テスト互換のため）
const ORDERS_TABLE = process.env.ORDERS_TABLE ?? 'orders-table-prod';
const HISTORY_TABLE = process.env.HISTORY_TABLE ?? 'order-history-prod';
const SNS_TOPIC =
    process.env.SNS_TOPIC ??
    'arn:aws:sns:ap-northeast-1:123456789012:order-notifications';

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
    // JSON 解析は従来どおり例外送出（テスト契約に合わせる）
    const body = JSON.parse(event.body);

    const { orderId, userId, items } = body as OrderRequest;

    // ガード節で早期 return（深いネスト回避・認知的複雑度の低減）
    if (!items) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid' }) };
    }
    if (!Array.isArray(items) || items.length === 0) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid' }) };
    }
    if (!userId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid' }) };
    }
    if (!orderId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid' }) };
    }

    // 合計計算（既存仕様どおりの truthy 判定を維持）
    let total = 0;
    for (let i = 0; i < items.length; i++) {
        if (items[i].price && items[i].quantity) {
            total += items[i].price * items[i].quantity;
        }
    }

    const discount = total > 1000 ? total * 0.1 : 0;
    const finalTotal = total - discount;

    // 書き込みと通知は await で完了を担保（Promise.all で並列化）
    await Promise.all([
        db.put({
            TableName: ORDERS_TABLE,
            Item: {
                orderId,
                userId,
                total: finalTotal,
                status: 'PENDING',
                createdAt: new Date().toISOString(),
            },
        }),
        db.put({
            TableName: HISTORY_TABLE,
            Item: {
                orderId,
                userId,
                total: finalTotal,
                status: 'PENDING',
                createdAt: new Date().toISOString(),
            },
        }),
        snsClient.publish({
            TopicArn: SNS_TOPIC,
            Message: '注文受付: ' + orderId + ' 合計: ' + finalTotal,
            Subject: 'New Order',
        }),
    ]);

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};

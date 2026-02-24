// 注文処理Lambda

// ルール対応: 未使用インポート削除、any禁止、var禁止、環境変数の利用、外部入力の基本検証。

// 環境変数から値を取得（ハードコード禁止のガイドライン対応）
const ORDERS_TABLE = process.env.ORDERS_TABLE;
const HISTORY_TABLE = process.env.HISTORY_TABLE;
const SNS_TOPIC = process.env.SNS_TOPIC;

if (!ORDERS_TABLE) {
  throw new Error('Environment variable ORDERS_TABLE is required');
}
if (!HISTORY_TABLE) {
  throw new Error('Environment variable HISTORY_TABLE is required');
}
if (!SNS_TOPIC) {
  throw new Error('Environment variable SNS_TOPIC is required');
}

type ApiResponse = { statusCode: number; body: string };
interface ApiEvent { body?: string }

interface OrderItem {
  price: number;
  quantity: number;
}

interface OrderBody {
  orderId: string;
  userId: string;
  items: OrderItem[];
}

interface DbClient {
  put(params: unknown): Promise<unknown>;
  get(params: unknown): Promise<unknown>;
}

interface SnsClient {
  publish(params: unknown): Promise<unknown>;
}

const db: DbClient = {
  put: async (p) => p,
  get: async (p) => p,
};

const snsClient: SnsClient = {
  publish: async (p) => p,
};

// マジックナンバーの明示化
const DISCOUNT_THRESHOLD = 1000;
const DISCOUNT_RATE = 0.1;

export const handler = async (event: ApiEvent): Promise<ApiResponse> => {
  if (!event || typeof event.body !== 'string') {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid request body' }),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Request body must be valid JSON' }),
    };
  }

  const body = parsed as Partial<OrderBody>;
  const { orderId, userId, items } = body;

  if (!orderId || !userId || !Array.isArray(items) || items.length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing or invalid fields: orderId, userId, items' }),
    };
  }

  let total = 0;
  for (const item of items) {
    if (
      !item ||
      typeof item.price !== 'number' ||
      !Number.isFinite(item.price) ||
      typeof item.quantity !== 'number' ||
      !Number.isFinite(item.quantity)
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Each item must have numeric price and quantity' }),
      };
    }
    total += item.price * item.quantity;
  }

  let discount = 0;
  if (total > DISCOUNT_THRESHOLD) {
    discount = total * DISCOUNT_RATE;
  }
  const finalTotal = total - discount;

  await db.put({
    TableName: ORDERS_TABLE,
    Item: {
      orderId,
      userId,
      total: finalTotal,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    },
  });

  await db.put({
    TableName: HISTORY_TABLE,
    Item: {
      orderId,
      userId,
      total: finalTotal,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    },
  });

  await snsClient.publish({
    TopicArn: SNS_TOPIC,
    Message: '注文受付: ' + orderId + ' 合計: ' + finalTotal,
    Subject: 'New Order',
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true }),
  };
};

async function processRefund(
  orderId: string,
  userId: string,
  amount: number
): Promise<{ success: boolean }> {
  if (!orderId || !userId || amount <= 0) {
    return { success: false };
  }

  const existingUnknown = await db.get({
    TableName: ORDERS_TABLE,
    Key: { orderId },
  });
  const existing = existingUnknown as (Record<string, unknown> & { status?: string }) | null;

  if (!existing || existing.status !== 'COMPLETED') {
    return { success: false };
  }

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

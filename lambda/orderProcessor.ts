// 注文処理Lambda

// 型定義（依存最小化のためローカルに定義）
type ApiEvent = { body: string | null };
type ApiResult = { statusCode: number; body: string };

interface OrderItem {
  price: number;
  quantity: number;
}
interface OrderRequest {
  orderId: string;
  userId: string;
  items: OrderItem[];
}
interface RefundRequest {
  orderId: string;
  userId: string;
  amount: number;
}

type DynamoPutParams = { TableName: string; Item: Record<string, unknown> };
type DynamoGetParams = { TableName: string; Key: Record<string, unknown> };
type OrderRecord = { status?: string } & Record<string, unknown>;

interface DbClient {
  put: (p: DynamoPutParams) => Promise<unknown>;
  get: (p: DynamoGetParams) => Promise<OrderRecord | null | undefined>;
}
interface SnsClient {
  publish: (p: { TopicArn: string; Message: string; Subject?: string }) => Promise<unknown>;
}

function requireEnvVar(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error('Environment variable ' + name + ' is not set');
  return v;
}

const ORDERS_TABLE = requireEnvVar('ORDERS_TABLE');
const HISTORY_TABLE = requireEnvVar('HISTORY_TABLE');
const SNS_TOPIC = requireEnvVar('SNS_TOPIC');

// モック実装（本番ではAWS SDK v3に差し替え）
const db: DbClient = {
  put: async (p) => p,
  get: async (p) => p as unknown as OrderRecord,
};
const snsClient: SnsClient = { publish: async (p) => p };

const DISCOUNT_THRESHOLD = 1000;
const DISCOUNT_RATE = 0.1;

export const handler = async (event: ApiEvent): Promise<ApiResult> => {
  const parsed = safeParseJson(event.body);
  if (!parsed.ok) {
    return badRequest('Invalid JSON body');
  }

  const validation = validateOrderRequest(parsed.value);
  if (!validation.ok) {
    return badRequest(JSON.stringify({ errors: validation.errors }));
  }

  const { orderId, userId, items } = validation.value;
  const { total, discount, finalTotal } = calculateTotals(items);

  try {
    await persistOrder({ orderId, userId, finalTotal });
    await notifyNewOrder({ orderId, finalTotal });
  } catch {
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to process order' }) };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true, orderId, total, discount, finalTotal }) };
};

async function processRefund({ orderId, userId, amount }: RefundRequest): Promise<{ success: boolean }> {
  if (!orderId || !userId || amount <= 0) return { success: false };

  const existing = (await db.get({ TableName: ORDERS_TABLE, Key: { orderId } })) as OrderRecord | null;
  if (!existing || existing.status !== 'COMPLETED') return { success: false };

  try {
    await db.put({
      TableName: ORDERS_TABLE,
      Item: { ...existing, status: 'REFUNDED', refundAmount: amount, updatedAt: new Date().toISOString() },
    });
    await db.put({
      TableName: HISTORY_TABLE,
      Item: { ...existing, status: 'REFUNDED', refundAmount: amount, updatedAt: new Date().toISOString() },
    });
    await snsClient.publish({ TopicArn: SNS_TOPIC, Message: 'Refund processed: ' + orderId + ' amount: ' + amount });
    return { success: true };
  } catch {
    return { success: false };
  }
}

// ---- helpers ----
function safeParseJson(body: string | null): { ok: false } | { ok: true; value: unknown } {
  if (body == null) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(body) as unknown };
  } catch {
    return { ok: false };
  }
}

function validateOrderRequest(obj: unknown):
  | { ok: true; value: OrderRequest }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!obj || typeof obj !== 'object') return { ok: false, errors: ['Request body must be a JSON object'] };

  const b = obj as Record<string, unknown>;
  const orderId = b.orderId;
  const userId = b.userId;
  const items = b.items;

  if (typeof orderId !== 'string' || orderId.length === 0) errors.push('Missing required field: orderId');
  if (typeof userId !== 'string' || userId.length === 0) errors.push('Missing required field: userId');

  if (!Array.isArray(items)) {
    errors.push('Items must be an array');
  } else if (items.length === 0) {
    errors.push('Items array must not be empty');
  } else {
    for (let i = 0; i < items.length; i++) {
      const it = items[i] as Record<string, unknown> | null;
      const price = it?.price;
      const quantity = it?.quantity;
      if (typeof price !== 'number') errors.push('Item[' + i + '] missing/invalid price');
      if (typeof quantity !== 'number') errors.push('Item[' + i + '] missing/invalid quantity');
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { orderId: orderId as string, userId: userId as string, items: items as OrderItem[] } };
}

function calculateTotals(items: OrderItem[]): { total: number; discount: number; finalTotal: number } {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    total += item.price * item.quantity;
  }
  const discount = total > DISCOUNT_THRESHOLD ? total * DISCOUNT_RATE : 0;
  const finalTotal = total - discount;
  return { total, discount, finalTotal };
}

async function persistOrder(p: { orderId: string; userId: string; finalTotal: number }): Promise<void> {
  const item = {
    orderId: p.orderId,
    userId: p.userId,
    total: p.finalTotal,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  };
  await db.put({ TableName: ORDERS_TABLE, Item: item });
  await db.put({ TableName: HISTORY_TABLE, Item: item });
}

async function notifyNewOrder(p: { orderId: string; finalTotal: number }): Promise<void> {
  await snsClient.publish({
    TopicArn: SNS_TOPIC,
    Message: '注文受付: ' + p.orderId + ' 合計: ' + p.finalTotal,
    Subject: 'New Order',
  });
}

function badRequest(message: string): ApiResult {
  return { statusCode: 400, body: typeof message === 'string' ? message : JSON.stringify({ error: message }) };
}

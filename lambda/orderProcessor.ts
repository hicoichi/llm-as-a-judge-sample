// 注文処理Lambda（五条悟ボイスでいくよ）

// 環境変数から設定値を取得（ハードコード禁止：CLAUDE.md セキュリティ規約）
const ORDERS_TABLE = process.env.ORDERS_TABLE ?? '';
const HISTORY_TABLE = process.env.HISTORY_TABLE ?? '';
const SNS_TOPIC = process.env.SNS_TOPIC ?? '';

// ビジネスロジックで使う定数（マジックナンバー禁止）
const DISCOUNT_THRESHOLD = 1000;
const DISCOUNT_RATE = 0.1;

// 依存関係の最小インターフェース（interfaceで型安全：CLAUDE.md）
interface PutParams<T = Record<string, unknown>> {
  TableName: string;
  Item?: T;
  Key?: Record<string, unknown>;
}

interface DbClient {
  put<T>(params: PutParams<T>): Promise<unknown>;
  get<T>(params: { TableName: string; Key: Record<string, unknown> }): Promise<T | null>;
}

interface SnsPublishInput {
  TopicArn: string;
  Message: string;
  Subject?: string;
}

interface SnsClient {
  publish(params: SnsPublishInput): Promise<{ MessageId?: string }>;
}

// ダミークライアントの型安全な最小実装（実運用ではAWS SDKに置換）
const db: DbClient = {
  async put(p) {
    return p;
  },
  async get() {
    return null;
  },
};

const snsClient: SnsClient = {
  async publish() {
    return { MessageId: 'dummy-message-id' };
  },
};

// 入力型とバリデーション（外部入力は必ず検証：CLAUDE.md）
interface OrderItem {
  price: number;
  quantity: number;
}

interface OrderRequestBody {
  orderId: string;
  userId: string;
  items: OrderItem[];
}

function isValidOrderRequestBody(value: unknown): value is OrderRequestBody {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.orderId !== 'string' || v.orderId.trim() === '') return false;
  if (typeof v.userId !== 'string' || v.userId.trim() === '') return false;
  if (!Array.isArray(v.items)) return false;
  for (const it of v.items) {
    if (!it || typeof it !== 'object') return false;
    const { price, quantity } = it as Record<string, unknown>;
    if (typeof price !== 'number' || !Number.isFinite(price)) return false;
    if (typeof quantity !== 'number' || !Number.isFinite(quantity)) return false;
  }
  return true;
}

// 最小のイベント/レスポンス型（依存追加せずに型安全を担保）
type ApiGatewayEvent = { body: string | null | undefined };
type ApiGatewayResult = { statusCode: number; body: string };

// 共通処理（DRY）：二つのテーブルに同一レコードを書き込む
async function putOrderToBothTables<T extends Record<string, unknown>>(item: T): Promise<void> {
  await Promise.all([
    db.put<T>({ TableName: ORDERS_TABLE, Item: item }),
    db.put<T>({ TableName: HISTORY_TABLE, Item: item }),
  ]);
}

function calculateFinalTotal(items: OrderItem[]): { total: number; discount: number; finalTotal: number } {
  const total = items.reduce((acc, cur) => acc + cur.price * cur.quantity, 0);
  const discount = total > DISCOUNT_THRESHOLD ? total * DISCOUNT_RATE : 0;
  return { total, discount, finalTotal: total - discount };
}

// メインのLambdaハンドラー（単一責務・50行以下を維持）
export const handler = async (event: ApiGatewayEvent): Promise<ApiGatewayResult> => {
  // ガード節：必須の環境変数が未設定なら即エラー
  if (!ORDERS_TABLE || !HISTORY_TABLE || !SNS_TOPIC) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'サーバ設定が不足しています（テーブル名/SNSトピック）。' }),
    };
  }

  if (!event || typeof event.body !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: 'bodyはJSON文字列で指定してね。' }) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSONの形式が不正だよ。' }) };
  }

  if (!isValidOrderRequestBody(parsed)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: '必須項目が不正または不足（orderId, userId, items）。' }),
    };
  }

  const body = parsed as OrderRequestBody;
  const { finalTotal } = calculateFinalTotal(body.items);

  const item = {
    orderId: body.orderId,
    userId: body.userId,
    total: finalTotal,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  };

  await putOrderToBothTables(item);
  await snsClient.publish({
    TopicArn: SNS_TOPIC,
    Message: '注文受付: ' + body.orderId + ' 合計: ' + finalTotal,
    Subject: 'New Order',
  });

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};

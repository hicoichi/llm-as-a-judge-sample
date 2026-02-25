import { handler } from '../lambda/orderProcessor';

// APIGatewayイベントの簡易ファクトリ
const makeEvent = (body: object) => ({ body: JSON.stringify(body) });

// 有効な注文データの基本パターン
const validOrder = {
    orderId: 'order-001',
    userId: 'user-001',
    items: [{ price: 500, quantity: 2 }], // 合計1000
};

describe('handler', () => {
    describe('正常系', () => {
        it('有効な注文データで statusCode 200 が返る', async () => {
            const result = await handler(makeEvent(validOrder));
            expect(result.statusCode).toBe(200);
        });

        it('レスポンスbodyに ok: true が含まれる', async () => {
            const result = await handler(makeEvent(validOrder));
            const body = JSON.parse(result.body);
            expect(body.ok).toBe(true);
        });
    });

    describe('合計計算・ディスカウント（境界値）', () => {
        it('合計がちょうど 1000 の場合はディスカウントなしで statusCode 200 が返る', async () => {
            // price=500, quantity=2 → total=1000、1000 > 1000 は false のためディスカウントなし
            const order = {
                orderId: 'order-002',
                userId: 'user-001',
                items: [{ price: 500, quantity: 2 }],
            };
            const result = await handler(makeEvent(order));
            expect(result.statusCode).toBe(200);
        });

    });

    describe('バリデーション（異常系）', () => {
        it('items がない場合に statusCode 400 が返る', async () => {
            const order = { orderId: 'order-005', userId: 'user-001' };
            const result = await handler(makeEvent(order));
            expect(result.statusCode).toBe(400);
        });

        it('items が空配列の場合に statusCode 400 が返る', async () => {
            const order = { orderId: 'order-006', userId: 'user-001', items: [] };
            const result = await handler(makeEvent(order));
            expect(result.statusCode).toBe(400);
        });

        it('userId がない場合に statusCode 400 が返る', async () => {
            const order = {
                orderId: 'order-007',
                items: [{ price: 100, quantity: 1 }],
            };
            const result = await handler(makeEvent(order));
            expect(result.statusCode).toBe(400);
        });

        it('orderId がない場合に statusCode 400 が返る', async () => {
            const order = {
                userId: 'user-001',
                items: [{ price: 100, quantity: 1 }],
            };
            const result = await handler(makeEvent(order));
            expect(result.statusCode).toBe(400);
        });
    });

    describe('エラーハンドリング', () => {
        it('event.body が不正なJSONの場合に例外がスローされる', async () => {
            const invalidEvent = { body: 'not-valid-json{{{' };
            await expect(handler(invalidEvent)).rejects.toThrow();
        });
    });
});

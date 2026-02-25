# llm-as-a-judge-sample

LLM as a Judge パターンのサンプル実装。AWS CDK + Lambda（TypeScript）構成で、注文処理ハンドラの品質をJestおよび各種静的解析ツールで計測する。

---

## セットアップ

```bash
npm install
```

---

## 一括実行（推奨）

テスト・静的解析・品質チェックをすべてまとめて実行する。いずれかでエラーが出ても最後まで実行しきる。

```bash
npm run ci
```

内部では以下を順番に実行する：

1. `npm run test:coverage` — Jestテスト（カバレッジ付き）
2. `npm run lint:check` — ESLint静的解析
3. `npm run quality` — 型チェック／複雑度／重複／セキュリティ／依存関係チェック
4. `npm run report` — 全指標のサマリーをコンソール出力 + `report.json` に保存

---

## テスト

### 実行（結果のみ）

```bash
npm test
```

### カバレッジ付き実行

```bash
npm run test:coverage
```

カバレッジレポートはターミナルに表示される。計測対象は `lambda/` 配下のファイル。

---

## 静的解析（ESLint）

### ターミナルに結果を表示

```bash
npm run lint:check
```

### JSON形式でファイルに出力（`eslint_results.json`）

```bash
npm run lint
```

適用ルール：

| ルール | 内容 |
|---|---|
| `@typescript-eslint/no-unused-vars` | 未使用変数を警告 |
| `sonarjs/cognitive-complexity` | 認知的複雑度が15を超えた場合に警告 |
| `sonarjs/no-duplicate-string` | 重複文字列リテラルを警告 |

---

## 品質測定ツール

### 全チェックを一括実行

```bash
npm run quality
```

### 個別実行

| コマンド | ツール | 内容 |
|---|---|---|
| `npm run quality:types` | TypeScript | 型エラーチェック（`tsc --noEmit`） |
| `npm run quality:complexity` | ESLint + Node.js | 複雑度ルール違反件数を集計 |
| `npm run quality:duplication` | jscpd | コード重複検出（5行以上の重複を対象） |
| `npm run quality:security` | npm audit | 依存パッケージの脆弱性チェック |
| `npm run quality:deps` | depcheck | 未使用・不足依存パッケージの検出 |

---

## ビルド

```bash
npm run build
```

TypeScriptをコンパイルする。ウォッチモードで実行する場合：

```bash
npm run watch
```

---

## 不要コード検出（knip）

未使用のエクスポート・ファイル・依存パッケージを検出する。結果は `knip_results.json` に出力される。

```bash
npm run knip
```

---

## スクリプト一覧

| スクリプト | 内容 |
|---|---|
| `npm run ci` | テスト・lint・品質チェック・レポート出力を一括実行 |
| `npm run report` | 全指標のサマリーをコンソール出力（`report.json` にも保存） |
| `npm test` | Jestテスト実行 |
| `npm run test:coverage` | Jestテスト実行（カバレッジ付き） |
| `npm run build` | TypeScriptコンパイル |
| `npm run watch` | TypeScriptウォッチモード |
| `npm run lint:check` | ESLint（ターミナル出力） |
| `npm run lint` | ESLint（JSON出力） |
| `npm run quality` | 品質チェック一括実行 |
| `npm run quality:types` | 型チェック |
| `npm run quality:complexity` | 複雑度チェック |
| `npm run quality:duplication` | 重複検出 |
| `npm run quality:security` | 脆弱性チェック |
| `npm run quality:deps` | 依存パッケージチェック |
| `npm run knip` | 不要コード検出 |

# E2E Test Automation Tool

Web・API に対応したチーム内セルフホスト型 E2E テスト自動化プラットフォームです。  
[MagicPod](https://magicpod.com/) 相当の機能をオープンソース・ゼロクラウドコストで実現します。

## 機能一覧

| カテゴリ | 機能 |
|---|---|
| **テスト作成** | ノーコードステップエディタ（GUI）、CSV データドリブンテスト、共有ステップ |
| **実行** | 手動・スケジュール・API トークン・CI/CD トリガー、並列実行（最大10並列）|
| **自動リトライ** | テスト単位で最大3回まで自動リトライ設定 |
| **スクリーンショット** | ステップごとのスクリーンショット保存（ローカル or S3）|
| **ビジュアルリグレッション** | ベースライン比較・差分ハイライト・承認/却下フロー |
| **セルフヒーリング** | セレクタ変更を自動検出し修正候補を提示・ワンクリック適用 |
| **通知** | プロジェクト別 Slack Webhook・SMTP/SES メール通知（成功/失敗/復旧）|
| **スケジュール** | Cron 式によるスケジュール実行、実行対象テストの個別指定 |
| **分析** | 日別合格率トレンド・不安定テスト検出・低速テストランキング |
| **監査ログ** | 実行作成・テスト変更などのキーアクションをプロジェクト別に記録 |
| **チーム管理** | チームとプロジェクトの階層、owner / editor / viewer 権限 |
| **CI/CD 連携** | API トークンで外部 CI からテスト実行・結果ポーリング |

---

## アーキテクチャ

```
┌─────────────────────────────────────────────────┐
│  Browser                                        │
│  Next.js 15 (App Router) — port 3000           │
└──────────────────┬──────────────────────────────┘
                   │ HTTP / WebSocket
┌──────────────────▼──────────────────────────────┐
│  API Server                                     │
│  Fastify 5 + Prisma 6 — port 4000              │
│  JWT 認証 / BullMQ ジョブキュー                 │
└───────┬────────────────────┬────────────────────┘
        │                    │
┌───────▼───────┐   ┌────────▼────────┐
│  PostgreSQL   │   │  Redis          │
│  (データ永続)  │   │  (ジョブキュー) │
└───────────────┘   └────────┬────────┘
                             │ BullMQ
                   ┌─────────▼─────────┐
                   │  Runner Worker    │
                   │  Playwright       │
                   │  (並列実行対応)    │
                   └───────────────────┘
```

**モノレポ構成（pnpm workspaces）:**

```
test-automation-tool/
├── apps/
│   ├── api/          # Fastify API サーバー
│   └── web/          # Next.js フロントエンド
├── packages/
│   ├── runner-web/   # Playwright ランナー (Worker プロセス)
│   └── types/        # 共有型定義
├── infra/            # AWS CDK スタック
└── docker/           # Dockerfile 群
```

---

## クイックスタート（Docker Compose）

**必要なもの:** Docker Desktop のみ（Node.js 不要）

```bash
# 1. リポジトリをクローン
git clone https://github.com/taiyo-swim/test-automation-tool.git
cd test-automation-tool

# 2. 環境変数をコピー（デフォルト値で起動可能）
cp .env.example .env

# 3. 全サービスを起動
docker compose up -d

# 4. ブラウザでアクセス
open http://localhost:3000
```

起動するサービス:

| サービス | URL | 説明 |
|---|---|---|
| Web ダッシュボード | http://localhost:3000 | Next.js フロントエンド |
| API サーバー | http://localhost:4000 | Fastify REST API + WebSocket |
| PostgreSQL | localhost:5432 | データベース |
| Redis | localhost:6379 | ジョブキュー |
| Runner | — | Playwright ワーカー（バックグラウンド）|

### 初期アカウント作成

ブラウザで http://localhost:3000/signup にアクセスし、最初のユーザーを登録してください。

---

## ローカル開発環境（ホットリロード）

```bash
# Node.js 22+ と pnpm が必要
npm install -g pnpm

# 依存関係をインストール
pnpm install

# インフラのみ Docker で起動
docker compose up -d postgres redis

# 環境変数を設定
cp .env.example .env

# DB マイグレーション & 型生成
cd apps/api
pnpm db:migrate
pnpm db:generate

# 各サービスを別ターミナルで起動
pnpm --filter api dev        # API: http://localhost:4000
pnpm --filter web dev        # Web: http://localhost:3000
pnpm --filter runner-web dev # Runner ワーカー
```

---

## 環境変数

`.env.example` をコピーして `.env` を作成してください。

### 必須

| 変数 | 説明 | デフォルト |
|---|---|---|
| `DATABASE_URL` | PostgreSQL 接続 URL | `postgres://postgres:postgres@localhost:5432/e2etool` |
| `REDIS_URL` | Redis 接続 URL | `redis://localhost:6379` |
| `JWT_SECRET` | JWT 署名キー（**本番環境では必ず変更**）| `change-this-...` |
| `RUNNER_SECRET` | API ↔ Runner 間の共有シークレット | `runner-internal-secret` |

### ストレージ

| 変数 | 説明 | デフォルト |
|---|---|---|
| `STORAGE_TYPE` | `local` または `s3` | `local` |
| `STORAGE_LOCAL_PATH` | ローカル保存パス | `./storage` |
| `AWS_S3_BUCKET` | S3 バケット名（`s3` 時）| — |
| `AWS_REGION` | AWS リージョン | `ap-northeast-1` |

### 通知（任意）

| 変数 | 説明 |
|---|---|
| `SMTP_HOST` | SMTP ホスト（設定するとメール通知が有効化）|
| `SMTP_PORT` | SMTP ポート（デフォルト: `587`）|
| `SMTP_USER` / `SMTP_PASS` | SMTP 認証情報 |
| `SMTP_FROM` | 送信元アドレス |

> **AWS SES を使う場合:** `SMTP_HOST=email-smtp.ap-northeast-1.amazonaws.com`  
> Slack 通知はプロジェクト設定画面から Webhook URL を設定します。

---

## テストの作成と実行

### 1. チームとプロジェクトを作成

1. サインアップ後、ダッシュボードから **チームを作成**
2. チーム内に **プロジェクトを作成**（Web / API プラットフォームを選択）

### 2. テストを作成

プロジェクト → **テスト** → **新規テスト**

ステップエディタで以下のアクションを組み合わせ:

| アクション | 説明 |
|---|---|
| `navigate` | URL に遷移 |
| `click` / `double_click` | 要素をクリック |
| `input` / `select` / `check` | フォーム操作 |
| `assert_text` / `assert_visible` / `assert_url` | アサーション |
| `screenshot` | ビジュアルリグレッション用スクリーンショット |
| `wait_for_element` / `wait_for_network` | 待機 |
| `extract_text` / `set_variable` | 変数操作 |
| `if` / `loop` | 条件分岐・繰り返し |
| `shared_step` | 再利用可能な共有ステップ呼び出し |
| `api_request` | API リクエスト送信 |

### 3. テスト設定

テストエディタの **テスト設定** タブ:

- **タグ** — フィルタリング・グループ実行用ラベル
- **リトライ** — 失敗時の自動リトライ回数（0〜3回）

### 4. 実行

**手動実行:** テスト一覧から「全て実行」または選択して実行

- 並列数（1〜10）を選択して複数テストを同時実行
- 実行環境（development / staging / production）を切り替え可能

**スケジュール実行:** プロジェクト → スケジュール → Cron 式を設定

```
# 例: 毎日 AM 9:00 に実行
0 9 * * *

# 例: 毎時実行
0 * * * *
```

**API / CI からの実行:**

```bash
# テスト実行
curl -X POST https://your-domain/api/v1/runs \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"testIds": ["test_id_1", "test_id_2"], "environment": "staging"}'

# 結果ポーリング
curl https://your-domain/api/v1/runs/RUN_ID \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

---

## AWS 本番デプロイ（CDK）

ECS Fargate + RDS PostgreSQL + ElastiCache Redis + S3 + ALB 構成です。

### 前提条件

```bash
npm install -g aws-cdk
cd infra && pnpm install
```

### デプロイ

```bash
# AWS 認証情報を設定
export AWS_PROFILE=your-profile

# CDK ブートストラップ（初回のみ）
cdk bootstrap

# スタックをデプロイ
cdk deploy --all \
  --context prefix=e2etool \
  --context domainName=your-domain.com \    # 任意: カスタムドメイン
  --context certificateArn=arn:aws:acm:...  # 任意: ACM 証明書
```

デプロイされる AWS リソース:

| スタック | リソース |
|---|---|
| NetworkStack | VPC, パブリック/プライベートサブネット, セキュリティグループ |
| StorageStack | RDS PostgreSQL 16, ElastiCache Redis 7, S3 バケット, ECR リポジトリ |
| EcsStack | ECS Fargate (API / Web / Runner サービス), ALB |

### GitHub Actions による自動デプロイ

`.github/workflows/deploy.yml` が設定済みです。以下のシークレットを GitHub に登録してください:

| シークレット | 説明 |
|---|---|
| `AWS_ACCESS_KEY_ID` | デプロイ用 IAM アクセスキー |
| `AWS_SECRET_ACCESS_KEY` | デプロイ用 IAM シークレットキー |
| `ECR_API_REPO` | API の ECR リポジトリ URI |
| `ECR_WEB_REPO` | Web の ECR リポジトリ URI |
| `ECR_RUNNER_REPO` | Runner の ECR リポジトリ URI |
| `ECS_CLUSTER` | ECS クラスター名 |
| `ECS_API_SERVICE` | API サービス名 |
| `ECS_WEB_SERVICE` | Web サービス名 |
| `ECS_RUNNER_SERVICE` | Runner サービス名 |

---

## データベーススキーマ

```
User ─── TeamMember ─── Team ─── Project
                                    │
           ┌────────────────────────┼──────────────────────┐
           │                        │                      │
         Test                   TestRun                Schedule
           │                        │
       TestStep               TestRunResult
                                    │
                              StepResult ─── VisualDiff ─── VisualBaseline
                                    │
                            HealingSuggestion

Project ─── NotificationSetting
        ─── AuditLog
        ─── Environment
        ─── ApiToken
```

Prisma マイグレーション:

```bash
cd apps/api
pnpm db:migrate:deploy   # 本番環境（マイグレーションを適用）
pnpm db:migrate          # 開発環境（schema 変更時）
pnpm db:generate         # Prisma Client 再生成
pnpm db:seed             # サンプルデータ投入
```

---

## 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | Next.js 15 (App Router), TanStack Query v5, Tailwind CSS v3, Lucide Icons |
| バックエンド | Fastify 5, Prisma 6, Zod, @fastify/jwt, @fastify/websocket |
| データベース | PostgreSQL 16 |
| キャッシュ / キュー | Redis 7, BullMQ 5 |
| テスト実行 | Playwright (Chromium / Firefox / WebKit) |
| ストレージ | ローカルファイルシステム or AWS S3 (AWS SDK v3) |
| 通知 | Slack Incoming Webhooks, nodemailer (SMTP / AWS SES) |
| インフラ | AWS CDK v2, ECS Fargate, RDS Aurora / PostgreSQL, ElastiCache, ALB, ACM |
| CI/CD | GitHub Actions |
| コンテナ | Docker, Docker Compose |
| パッケージ管理 | pnpm workspaces (モノレポ) |

---

## ライセンス

MIT

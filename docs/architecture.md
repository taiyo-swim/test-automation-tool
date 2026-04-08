# E2E Test Automation Tool - システム設計書

## 1. 設計方針

**コスト最小化のための原則:**
- OSSのみ使用 ($0ライセンス)
- モノリスファースト (マイクロサービスは将来対応)
- Docker Compose で全サービスを管理 (Kubernetes不要)
- セルフホスト型 (マネージドサービス依存を最小化)
- ローカル/CI実行が主 → クラウドRunnerは将来対応

---

## 2. システム全体アーキテクチャ

```
┌──────────────────────────────────────────────────────┐
│                   クライアント                         │
│  ┌────────────────────┐  ┌────────────────────────┐  │
│  │   Web Dashboard    │  │  Chrome Extension      │  │
│  │   (Next.js)        │  │  (Record & Playback)   │  │
│  └─────────┬──────────┘  └──────────┬─────────────┘  │
└────────────┼─────────────────────────┼────────────────┘
             │ HTTPS                   │ HTTPS
             ▼                         ▼
┌──────────────────────────────────────────────────────┐
│               API Server (Monolith)                   │
│               Node.js + TypeScript + Fastify          │
│                                                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │  Auth       │  │  Projects   │  │  Tests      │  │
│  │  Module     │  │  Module     │  │  Module     │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │  Execution  │  │  Reports    │  │  Team       │  │
│  │  Module     │  │  Module     │  │  Module     │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  │
│                                                       │
│  WebSocket Server (実行ログのリアルタイム配信)          │
└──────────┬───────────────────────────────────────────┘
           │
     ┌─────┴─────┐
     │           │
     ▼           ▼
┌─────────┐  ┌──────────────────────────────────┐
│PostgreSQL│  │  Redis (BullMQ Job Queue)        │
│  (主DB)  │  │  + キャッシュ                    │
└─────────┘  └──────────────┬───────────────────┘
                             │  Job dispatch
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
    ┌──────────────┐ ┌─────────────┐ ┌──────────────┐
    │  Web Runner  │ │Android Runner│ │  API Runner  │
    │  (Playwright)│ │  (Appium)   │ │  (Axios)     │
    │  Docker      │ │  Docker     │ │  Docker      │
    └──────┬───────┘ └──────┬──────┘ └──────┬───────┘
           │               │              │
           └───────────────┴──────────────┘
                           │ 結果・スクリーンショット
                           ▼
                  ┌─────────────────┐
                  │  Local Storage  │
                  │  (スクリーン    │
                  │  ショット/動画) │
                  └─────────────────┘
```

**全コンポーネントを Docker Compose 1ファイルで管理**

---

## 3. 技術スタック

| レイヤー | 技術 | 理由 |
|---|---|---|
| フロントエンド | Next.js 15 (App Router) + TypeScript + Tailwind CSS | フルスタック対応、学習コスト低 |
| API Server | Node.js + TypeScript + Fastify | 高速、型安全 |
| ORM | Prisma | マイグレーション管理が容易 |
| DB | PostgreSQL 16 | 無料、信頼性高 |
| Queue | Redis 7 + BullMQ | ジョブ管理・リトライ・並列制御 |
| Web Runner | Playwright | Microsoft製、Chrome/FF/WebKit対応、無料 |
| Android Runner | Appium 2 + UIAutomator2 | iOS不要、Linux上でエミュレータ動作 |
| API Runner | Axios + JSON Schema | 軽量 |
| リアルタイム | WebSocket (ws ライブラリ) | SSE代替、双方向通信 |
| 認証 | JWT + Passport.js | シンプル、依存少 |
| ビジュアル差分 | Pixelmatch + pngjs | OSSピクセル比較 |
| ストレージ | ローカルファイルシステム (MVP) → MinIO (将来) | 初期コスト$0 |
| コンテナ管理 | Docker Compose | Kubernetes不要 |

---

## 4. ディレクトリ構成

```
test-automation-tool/
├── apps/
│   ├── web/                    # Next.js フロントエンド
│   │   ├── app/
│   │   │   ├── (auth)/         # ログイン/登録ページ
│   │   │   ├── dashboard/      # プロジェクト一覧
│   │   │   ├── projects/
│   │   │   │   └── [id]/
│   │   │   │       ├── tests/          # テスト一覧
│   │   │   │       │   └── [testId]/   # ステップエディタ
│   │   │   │       ├── runs/           # 実行履歴
│   │   │   │       │   └── [runId]/    # 実行詳細レポート
│   │   │   │       └── settings/       # プロジェクト設定
│   │   │   └── settings/       # チーム設定
│   │   └── components/
│   │       ├── step-editor/    # ステップエディタUI
│   │       ├── run-report/     # 実行レポートUI
│   │       └── visual-diff/    # ビジュアル差分UI
│   │
│   └── api/                    # Fastify API Server
│       ├── src/
│       │   ├── modules/
│       │   │   ├── auth/       # 認証
│       │   │   ├── projects/   # プロジェクト管理
│       │   │   ├── tests/      # テスト管理
│       │   │   ├── steps/      # ステップ管理
│       │   │   ├── runs/       # 実行管理
│       │   │   ├── reports/    # レポート
│       │   │   └── team/       # チーム管理
│       │   ├── queue/          # BullMQ ジョブ定義
│       │   ├── websocket/      # WebSocket ハンドラ
│       │   └── storage/        # ファイルストレージ
│       └── prisma/
│           └── schema.prisma
│
├── packages/
│   ├── runner-core/            # 共通Runner基底クラス
│   ├── runner-web/             # Playwright Runner
│   ├── runner-android/         # Appium Runner
│   ├── runner-api/             # API Runner
│   └── types/                  # 共有型定義
│
├── chrome-extension/           # Record & Playback拡張機能
│
├── cli/                        # CLIツール (ローカル実行用)
│
├── docker/
│   ├── docker-compose.yml      # 全サービス定義
│   ├── docker-compose.dev.yml  # 開発用オーバーライド
│   └── Dockerfile.*            # 各サービスのDockerfile
│
└── docs/
    ├── requirements.md
    └── architecture.md
```

---

## 5. データモデル (Prisma Schema)

```prisma
// prisma/schema.prisma

model User {
  id            String   @id @default(cuid())
  email         String   @unique
  name          String
  passwordHash  String?
  avatarUrl     String?
  createdAt     DateTime @default(now())
  teamMembers   TeamMember[]
  triggeredRuns TestRun[]
}

model Team {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())
  members   TeamMember[]
  projects  Project[]
}

model TeamMember {
  team   Team   @relation(fields: [teamId], references: [id])
  teamId String
  user   User   @relation(fields: [userId], references: [id])
  userId String
  role   String // owner | editor | viewer
  @@id([teamId, userId])
}

model Project {
  id          String   @id @default(cuid())
  team        Team     @relation(fields: [teamId], references: [id])
  teamId      String
  name        String
  platform    String   // web | android | api
  baseUrl     String?
  appPackage  String?  // Android package name
  createdAt   DateTime @default(now())
  tests       Test[]
  runs        TestRun[]
  environments Environment[]
  schedules   Schedule[]
  apiTokens   ApiToken[]
  sharedSteps SharedStep[]
}

model Environment {
  id        String   @id @default(cuid())
  project   Project  @relation(fields: [projectId], references: [id])
  projectId String
  name      String   // development | staging | production
  variables Json     // { KEY: VALUE } (暗号化して保存)
}

model Test {
  id          String   @id @default(cuid())
  project     Project  @relation(fields: [projectId], references: [id])
  projectId   String
  name        String
  description String?
  tags        String[] // PostgreSQL配列
  folderId    String?
  status      String   @default("active") // active | archived
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  steps       TestStep[]
  results     TestRunResult[]
  dataSets    TestDataSet[]
}

model TestStep {
  id           String   @id @default(cuid())
  test         Test     @relation(fields: [testId], references: [id])
  testId       String
  order        Int
  action       String   // navigate | click | input | assert_text ...
  params       Json     // アクション固有のパラメータ
  sharedStep   SharedStep? @relation(fields: [sharedStepId], references: [id])
  sharedStepId String?
  createdAt    DateTime @default(now())
  stepResults  StepResult[]
}

model SharedStep {
  id        String   @id @default(cuid())
  project   Project  @relation(fields: [projectId], references: [id])
  projectId String
  name      String
  steps     Json     // ステップ定義の配列
  testSteps TestStep[]
}

model TestDataSet {
  id        String @id @default(cuid())
  test      Test   @relation(fields: [testId], references: [id])
  testId    String
  name      String
  csvContent String
}

model TestRun {
  id            String   @id @default(cuid())
  project       Project  @relation(fields: [projectId], references: [id])
  projectId     String
  trigger       String   // manual | schedule | api | ci
  status        String   // queued | running | passed | failed | cancelled
  environment   String?
  triggeredBy   User?    @relation(fields: [triggeredById], references: [id])
  triggeredById String?
  startedAt     DateTime?
  finishedAt    DateTime?
  createdAt     DateTime @default(now())
  results       TestRunResult[]
}

model TestRunResult {
  id            String   @id @default(cuid())
  run           TestRun  @relation(fields: [runId], references: [id])
  runId         String
  test          Test     @relation(fields: [testId], references: [id])
  testId        String
  status        String   // passed | failed | skipped
  durationMs    Int?
  errorMessage  String?
  startedAt     DateTime?
  finishedAt    DateTime?
  stepResults   StepResult[]
  videoUrl      String?
}

model StepResult {
  id             String   @id @default(cuid())
  runResult      TestRunResult @relation(fields: [runResultId], references: [id])
  runResultId    String
  step           TestStep @relation(fields: [stepId], references: [id])
  stepId         String
  order          Int
  status         String   // passed | failed | skipped
  screenshotPath String?
  logText        String?
  durationMs     Int?
  executedAt     DateTime?
  visualDiff     VisualDiff?
  healingSuggestion HealingSuggestion?
}

model VisualBaseline {
  id          String   @id @default(cuid())
  projectId   String
  testId      String
  stepId      String
  imagePath   String
  createdAt   DateTime @default(now())
  diffs       VisualDiff[]
}

model VisualDiff {
  id             String        @id @default(cuid())
  stepResult     StepResult    @relation(fields: [stepResultId], references: [id])
  stepResultId   String        @unique
  baseline       VisualBaseline @relation(fields: [baselineId], references: [id])
  baselineId     String
  diffImagePath  String?
  diffPercentage Float
  status         String        // pending | approved | rejected
  createdAt      DateTime      @default(now())
}

model HealingSuggestion {
  id               String     @id @default(cuid())
  stepResult       StepResult @relation(fields: [stepResultId], references: [id])
  stepResultId     String     @unique
  originalSelector String
  suggestedSelector String
  confidence       Float
  reason           String
  status           String     // pending | accepted | rejected
  createdAt        DateTime   @default(now())
}

model Schedule {
  id             String   @id @default(cuid())
  project        Project  @relation(fields: [projectId], references: [id])
  projectId      String
  name           String
  cronExpression String
  environmentId  String?
  enabled        Boolean  @default(true)
  lastRunAt      DateTime?
  nextRunAt      DateTime?
}

model ApiToken {
  id         String   @id @default(cuid())
  project    Project  @relation(fields: [projectId], references: [id])
  projectId  String
  name       String
  tokenHash  String   @unique
  lastUsedAt DateTime?
  createdAt  DateTime @default(now())
}
```

---

## 6. API エンドポイント一覧

```
# 認証
POST   /api/auth/signup
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh
GET    /api/auth/me

# チーム
GET    /api/teams/:teamId/members
POST   /api/teams/:teamId/invitations
PATCH  /api/teams/:teamId/members/:userId
DELETE /api/teams/:teamId/members/:userId

# プロジェクト
GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PATCH  /api/projects/:id
DELETE /api/projects/:id

# 環境変数
GET    /api/projects/:id/environments
POST   /api/projects/:id/environments
PATCH  /api/projects/:id/environments/:envId
DELETE /api/projects/:id/environments/:envId

# テスト
GET    /api/projects/:id/tests
POST   /api/projects/:id/tests
GET    /api/projects/:id/tests/:testId
PATCH  /api/projects/:id/tests/:testId
DELETE /api/projects/:id/tests/:testId
POST   /api/projects/:id/tests/:testId/duplicate

# ステップ
GET    /api/projects/:id/tests/:testId/steps
PUT    /api/projects/:id/tests/:testId/steps  # 全置換

# 共有ステップ
GET    /api/projects/:id/shared-steps
POST   /api/projects/:id/shared-steps
PATCH  /api/projects/:id/shared-steps/:stepId
DELETE /api/projects/:id/shared-steps/:stepId

# テストデータセット
GET    /api/projects/:id/tests/:testId/data-sets
POST   /api/projects/:id/tests/:testId/data-sets

# 実行
POST   /api/projects/:id/runs           # 実行開始
GET    /api/projects/:id/runs           # 実行履歴一覧
GET    /api/projects/:id/runs/:runId    # 実行詳細
DELETE /api/projects/:id/runs/:runId/cancel

# 実行結果
GET    /api/projects/:id/runs/:runId/results              # テスト単位の結果
GET    /api/projects/:id/runs/:runId/results/:resultId/steps  # ステップ単位の結果

# ビジュアル差分
GET    /api/projects/:id/runs/:runId/visual-diffs
POST   /api/projects/:id/visual-diffs/:diffId/approve
POST   /api/projects/:id/visual-diffs/:diffId/reject
POST   /api/projects/:id/visual-baselines/:baselineId/update

# セルフヒーリング
GET    /api/projects/:id/runs/:runId/healing-suggestions
POST   /api/healing-suggestions/:id/accept
POST   /api/healing-suggestions/:id/reject

# スケジュール
GET    /api/projects/:id/schedules
POST   /api/projects/:id/schedules
PATCH  /api/projects/:id/schedules/:scheduleId
DELETE /api/projects/:id/schedules/:scheduleId

# APIトークン
GET    /api/projects/:id/api-tokens
POST   /api/projects/:id/api-tokens
DELETE /api/projects/:id/api-tokens/:tokenId

# CI/CD向け外部API (APIトークン認証)
POST   /api/v1/runs
GET    /api/v1/runs/:runId

# 静的ファイル (スクリーンショット等)
GET    /api/files/:projectId/:filename
```

---

## 7. テスト定義 YAML スキーマ

```yaml
version: "1.0"
id: "test-login"
name: "ログインフロー"
platform: web  # web | android | api
tags: [smoke, auth]

# データドリブン (省略可)
data_sets:
  - name: "一般ユーザー"
    variables:
      email: user@example.com
      password: pass123

steps:
  - action: navigate
    url: "{{BASE_URL}}/login"

  - action: input
    selector: "input[type=email]"
    value: "{{email}}"

  - action: input
    selector: "input[type=password]"
    value: "{{password}}"
    secret: true                  # ログに出力しない

  - action: click
    selector: "button[type=submit]"
    wait_for: navigation          # ナビゲーション完了まで待機

  - action: assert_text
    selector: "h1"
    expected: "ダッシュボード"
    mode: contains                # exact | contains | regex

  - action: screenshot
    name: "ログイン後"
    visual_regression: true       # ビジュアルリグレッション有効

  - action: shared_step
    id: "logout-flow"
```

---

## 8. Runner 実行フロー

```
[API Server]
  POST /api/projects/:id/runs
  → TestRun レコード作成 (status: queued)
  → BullMQ にジョブをエンキュー
  → 202 Accepted { runId }

[BullMQ Worker]
  ジョブ取得
  → TestRun status: running に更新
  → WebSocket でフロントに通知

  For each Test in suite:
    → Runnerコンテナ起動 (or 既存コンテナにジョブ送信)
    → TestRunResult レコード作成

    For each Step:
      → ステップ実行
      → スクリーンショット保存
      → StepResult レコード作成
      → WebSocket でリアルタイムログ配信

      失敗時:
        → セルフヒーリング候補を生成
        → HealingSuggestion レコード作成

      ビジュアルアサーション時:
        → ベースラインと比較 (pixelmatch)
        → VisualDiff レコード作成

  → TestRun status: passed | failed に更新
  → WebSocket で完了通知
  → Slack通知 (設定時)
```

---

## 9. Docker Compose 構成

```yaml
# docker-compose.yml
services:
  web:                    # Next.js フロントエンド
    build: ./apps/web
    ports: ["3000:3000"]

  api:                    # Fastify API Server
    build: ./apps/api
    ports: ["4000:4000"]
    depends_on: [postgres, redis]
    volumes:
      - ./storage:/app/storage  # スクリーンショット保存先

  postgres:
    image: postgres:16-alpine
    volumes: [postgres_data:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine

  runner-web:             # Playwright Runner
    build: ./packages/runner-web
    depends_on: [api, redis]
    # Playwrightのブラウザ同梱

  runner-android:         # Appium Runner (オプション)
    build: ./packages/runner-android
    devices:              # Android エミュレータ
      - /dev/kvm:/dev/kvm
    depends_on: [api, redis]

  runner-api:             # API Runner
    build: ./packages/runner-api
    depends_on: [api, redis]

volumes:
  postgres_data:
```

---

## 10. コスト比較

| 項目 | 本ツール (MVP) | MagicPod |
|---|---|---|
| ライセンス | $0 (全OSS) | $400〜/月 |
| Web実行インフラ | $0〜$20/月 (VPS) | 込み |
| Android実行 | $0 (自前エミュレータ) | 込み |
| iOS実行 | 非対応 (将来) | 込み |
| ストレージ | $0 (ローカル) | 込み |
| AI機能 | Claude API従量課金 | 込み |
| **合計** | **$0〜$20/月** | **$400〜/月** |

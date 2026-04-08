# E2E Test Automation Tool - システム設計書

## 1. システム全体アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────────┐
│                          クライアント層                               │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────────┐ │
│  │  Web Dashboard│  │Chrome Extension│  │  CLI / SDK (Python/TS)   │ │
│  │  (Next.js)   │  │  (Record)    │  │                            │ │
│  └──────┬───────┘  └──────┬───────┘  └─────────────┬──────────────┘ │
└─────────┼────────────────┼──────────────────────────┼───────────────┘
          │                │                          │
          ▼                ▼                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          API Gateway (TLS)                           │
│                     (Rate Limiting / Auth)                           │
└────────────────────────────┬────────────────────────────────────────┘
                             │
          ┌──────────────────┼───────────────────┐
          ▼                  ▼                   ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│   Core API       │ │  Execution API   │ │   AI Service     │
│  (Fastify/TS)    │ │  (Fastify/TS)    │ │  (Python/FastAPI)│
│  - CRUD          │ │  - Job dispatch  │ │  - Test gen      │
│  - Auth/RBAC     │ │  - Result ingest │ │  - Self-healing  │
│  - Projects      │ │  - Streaming log │ │  - NL parsing    │
└────────┬─────────┘ └────────┬─────────┘ └────────┬─────────┘
         │                   │                     │
         ▼                   ▼                     ▼
┌──────────────────────────────────────────────────────────────┐
│                        内部インフラ                            │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐ │
│  │  PostgreSQL  │  │  Redis      │  │  Object Storage      │ │
│  │  (主DB)     │  │  (Queue/    │  │  (S3-compatible)     │ │
│  │             │  │   Cache)    │  │  Screenshots/Videos  │ │
│  └─────────────┘  └──────┬──────┘  └──────────────────────┘ │
└──────────────────────────┼───────────────────────────────────┘
                           │  Job Queue (BullMQ)
          ┌────────────────┼───────────────────┐
          ▼                ▼                   ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  Web Runner      │ │  Mobile Runner   │ │  API Runner      │
│  (Playwright)    │ │  (Appium)        │ │  (Axios/Fetch)   │
│  Docker container│ │  Docker container│ │  Docker container│
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

---

## 2. コンポーネント詳細

### 2.1 Web Dashboard (フロントエンド)

**技術スタック:** Next.js 15 (App Router) + TypeScript + Tailwind CSS

**主要画面:**
- `/dashboard` - プロジェクト一覧・ヘルススコア
- `/projects/:id/tests` - テスト一覧・管理
- `/projects/:id/tests/:testId/edit` - ステップエディタ
- `/projects/:id/runs` - 実行履歴・レポート
- `/projects/:id/runs/:runId` - 実行詳細 (ステップ別結果)
- `/projects/:id/settings` - プロジェクト設定
- `/settings/team` - チームメンバー管理

**状態管理:** TanStack Query (サーバー状態) + Zustand (UI状態)

**リアルタイム:** WebSocket (実行ログのストリーミング)

---

### 2.2 Core API

**技術スタック:** Node.js + TypeScript + Fastify + Prisma ORM

**主要エンドポイント:**

```
# 認証
POST   /auth/signup
POST   /auth/login
POST   /auth/logout
POST   /auth/refresh
GET    /auth/oauth/:provider      # Google / GitHub
POST   /auth/saml                 # SAML SSO

# プロジェクト
GET    /projects
POST   /projects
GET    /projects/:id
PATCH  /projects/:id
DELETE /projects/:id

# テスト
GET    /projects/:id/tests
POST   /projects/:id/tests
GET    /projects/:id/tests/:testId
PATCH  /projects/:id/tests/:testId
DELETE /projects/:id/tests/:testId
POST   /projects/:id/tests/:testId/duplicate

# テストステップ
GET    /projects/:id/tests/:testId/steps
PUT    /projects/:id/tests/:testId/steps  # 全ステップ置換

# 共有ステップ
GET    /projects/:id/shared-steps
POST   /projects/:id/shared-steps

# テスト実行
POST   /projects/:id/runs              # 実行開始
GET    /projects/:id/runs
GET    /projects/:id/runs/:runId
DELETE /projects/:id/runs/:runId/cancel

# 実行結果
GET    /projects/:id/runs/:runId/steps  # ステップ別結果

# ビジュアル差分
GET    /projects/:id/runs/:runId/visual-diffs
POST   /projects/:id/runs/:runId/visual-diffs/:diffId/approve

# スケジュール
GET    /projects/:id/schedules
POST   /projects/:id/schedules
PATCH  /projects/:id/schedules/:scheduleId
DELETE /projects/:id/schedules/:scheduleId

# チーム
GET    /teams/:teamId/members
POST   /teams/:teamId/invitations
PATCH  /teams/:teamId/members/:userId/role
DELETE /teams/:teamId/members/:userId

# Webhook / CI連携
GET    /projects/:id/api-token
POST   /projects/:id/api-token/rotate
POST   /v1/runs                   # 外部CIからのトリガー (API token認証)
GET    /v1/runs/:runId            # 実行結果ポーリング
```

---

### 2.3 Execution API

**技術スタック:** Node.js + TypeScript + Fastify

**責務:**
- ジョブの BullMQ キューへのエンキュー
- Runner からの結果受信・DB保存
- WebSocket でフロントへリアルタイムログ配信
- スクリーンショット・動画のオブジェクトストレージへのアップロード

---

### 2.4 AI Service

**技術スタック:** Python + FastAPI + Claude API (claude-opus-4-6)

**機能:**

#### 自然言語 → テストステップ変換
```python
# Input
{
  "instruction": "ログインページでメールとパスワードを入力してログインする",
  "platform": "web",
  "context": { "current_url": "https://example.com/login" }
}

# Output
{
  "steps": [
    { "action": "input", "selector": "input[type=email]", "value": "{{email}}" },
    { "action": "input", "selector": "input[type=password]", "value": "{{password}}" },
    { "action": "click", "selector": "button[type=submit]" },
    { "action": "assert_url", "expected": "https://example.com/dashboard" }
  ]
}
```

#### セルフヒーリング
```python
# Input
{
  "failed_step": { "action": "click", "selector": "#login-btn" },
  "error": "Element not found: #login-btn",
  "page_snapshot": "<html>...</html>",
  "screenshot": "base64..."
}

# Output
{
  "healed_step": { "action": "click", "selector": "button[data-testid=login-button]" },
  "confidence": 0.95,
  "reason": "ボタンのIDが変更されましたが、同じ役割・位置・テキストを持つ要素を発見しました"
}
```

---

### 2.5 Test Runners

#### Web Runner (Playwright)
- Docker イメージ: `mcr.microsoft.com/playwright:latest`
- 対応ブラウザ: chromium / firefox / webkit
- 並列実行: コンテナごとに1テスト
- ステップ実行エンジン:
  ```
  step → Playwrightアクション変換 → 実行 → スクリーンショット → 結果送信
  ```

#### Mobile Runner (Appium)
- Docker イメージ: カスタムビルド (Appium 2 + XCUITest / UIAutomator2)
- iOS: Mac Miniクラスタ (macOS必須) または SauceLabs/BrowserStack連携
- Android: Android エミュレータ (Linux KVM)
- デバイスファーム管理

#### API Runner
- 軽量コンテナ (Node.js)
- HTTP クライアント: Axios
- JSON Schema バリデーション
- OAuth2 / JWT 取得フロー対応

---

## 3. データモデル

```sql
-- ユーザー・チーム
users (id, email, name, avatar_url, created_at)
teams (id, name, plan, created_at)
team_members (team_id, user_id, role: owner|admin|editor|viewer)
invitations (id, team_id, email, role, token, expires_at)

-- プロジェクト
projects (id, team_id, name, platform: web|ios|android|api, 
          base_url, app_package, settings_json, created_at)
environments (id, project_id, name, variables_json)  -- 本番/ステージング/開発

-- テスト
tests (id, project_id, name, description, tags, 
       folder_id, status: active|archived, created_at, updated_at)
test_steps (id, test_id, order, action, params_json, 
            shared_step_id, created_at)
shared_steps (id, project_id, name, steps_json)
test_data_sets (id, test_id, name, csv_content)  -- データドリブン用

-- 実行
test_runs (id, project_id, trigger: manual|schedule|api|ci,
           status: queued|running|passed|failed|cancelled,
           started_at, finished_at, triggered_by_user_id)
test_run_results (id, run_id, test_id, status, duration_ms,
                  error_message, started_at, finished_at)
step_results (id, run_result_id, step_id, order, status,
              screenshot_url, video_clip_url, log_text,
              duration_ms, executed_at)

-- ビジュアルリグレッション
visual_baselines (id, project_id, test_id, step_id,
                  image_url, created_at)
visual_diffs (id, step_result_id, baseline_id,
              diff_image_url, diff_percentage,
              status: pending|approved|rejected)

-- セルフヒーリング
healing_suggestions (id, step_result_id, original_selector,
                     suggested_selector, confidence,
                     reason, status: pending|accepted|rejected,
                     created_at)

-- スケジュール
schedules (id, project_id, name, cron_expression,
           environment_id, enabled, last_run_at, next_run_at)

-- CI/CD
api_tokens (id, project_id, name, token_hash, last_used_at, created_at)
webhooks (id, project_id, url, events_json, secret)
```

---

## 4. テスト定義スキーマ (YAML形式)

```yaml
# test-definition.yaml
version: "1.0"
id: "test-login-flow"
name: "ログインフローのテスト"
platform: web
tags: [smoke, auth]

# データドリブン設定
data_sets:
  - name: "正常ユーザー"
    variables:
      email: "user@example.com"
      password: "password123"
  - name: "管理者ユーザー"
    variables:
      email: "admin@example.com"
      password: "adminpass"

steps:
  - action: navigate
    url: "{{BASE_URL}}/login"

  - action: input
    selector: "input[type=email]"
    value: "{{email}}"

  - action: input
    selector: "input[type=password]"
    value: "{{password}}"
    secret: true

  - action: click
    selector: "button[type=submit]"
    wait_for: navigation

  - action: assert_text
    selector: ".welcome-message"
    expected: "ようこそ"
    mode: contains

  - action: screenshot
    name: "ログイン後のホーム画面"
    visual_regression: true

  - action: shared_step
    id: "logout-flow"
```

---

## 5. ステップアクション定義

### Web / 共通アクション

| カテゴリ | アクション | 説明 |
|---|---|---|
| ナビゲーション | `navigate` | URLに移動 |
| ナビゲーション | `go_back` / `go_forward` | ブラウザ履歴 |
| クリック | `click` | 要素をクリック |
| クリック | `double_click` | ダブルクリック |
| クリック | `right_click` | 右クリック |
| 入力 | `input` | テキスト入力 |
| 入力 | `clear` | 入力クリア |
| 入力 | `select` | ドロップダウン選択 |
| 入力 | `upload_file` | ファイルアップロード |
| スクロール | `scroll` | スクロール |
| スクロール | `scroll_to_element` | 要素までスクロール |
| アサーション | `assert_text` | テキスト確認 |
| アサーション | `assert_visible` | 表示確認 |
| アサーション | `assert_hidden` | 非表示確認 |
| アサーション | `assert_url` | URL確認 |
| アサーション | `assert_attribute` | 属性確認 |
| アサーション | `assert_count` | 要素数確認 |
| 待機 | `wait` | 固定待機 (ms) |
| 待機 | `wait_for_element` | 要素出現待機 |
| 待機 | `wait_for_network` | ネットワーク完了待機 |
| キャプチャ | `screenshot` | スクリーンショット |
| 変数 | `set_variable` | 変数セット |
| 変数 | `extract_text` | テキスト抽出→変数 |
| 変数 | `extract_attribute` | 属性抽出→変数 |
| 制御 | `if` / `else` / `end_if` | 条件分岐 |
| 制御 | `loop` / `end_loop` | ループ |
| 制御 | `shared_step` | 共有ステップ呼び出し |
| API | `api_request` | HTTPリクエスト送信 |
| ユーティリティ | `generate_totp` | TOTP生成 |
| ユーティリティ | `date_format` | 日付フォーマット |
| ユーティリティ | `regex_extract` | 正規表現抽出 |

### モバイル固有アクション

| アクション | 説明 |
|---|---|
| `tap` | タップ |
| `long_press` | 長押し |
| `swipe` | スワイプ (方向指定) |
| `pinch` | ピンチイン/アウト |
| `drag_and_drop` | ドラッグ&ドロップ |
| `rotate` | デバイス回転 |
| `shake` | シェイク |
| `press_key` | ハードウェアキー操作 |
| `assert_image` | 画像認識アサーション |
| `launch_app` | アプリ起動 |
| `kill_app` | アプリ終了 |
| `reset_app` | アプリリセット |

---

## 6. CI/CD連携フロー

```
# GitHub Actions の例
jobs:
  e2e-test:
    runs-on: ubuntu-latest
    steps:
      - name: Run E2E Tests
        uses: your-tool/run-tests@v1
        with:
          api-token: ${{ secrets.E2E_API_TOKEN }}
          project-id: proj_abc123
          test-suite: smoke
          environment: staging
          wait-for-result: true
          fail-on-failure: true
```

**APIトリガーフロー:**
```
CI → POST /v1/runs { project_id, suite, env }
   → 202 Accepted { run_id }
   → polling GET /v1/runs/:run_id (or webhook)
   → { status: "passed" | "failed", report_url }
```

---

## 7. 技術スタック まとめ

| レイヤー | 技術 |
|---|---|
| フロントエンド | Next.js 15, TypeScript, Tailwind CSS, TanStack Query, Zustand |
| Core API | Node.js, TypeScript, Fastify, Prisma, Zod |
| AI Service | Python, FastAPI, Claude API (claude-opus-4-6) |
| Web Runner | Node.js, Playwright, Docker |
| Mobile Runner | Java/Node.js, Appium 2, Docker (Android) / Mac Mini (iOS) |
| API Runner | Node.js, Axios |
| Queue | Redis 7 + BullMQ |
| DB | PostgreSQL 16 |
| Object Storage | MinIO (self-hosted) / AWS S3 |
| Auth | JWT (access/refresh) + Passport.js |
| リアルタイム | WebSocket (ws / Socket.IO) |
| インフラ | Docker Compose (dev) / Kubernetes (prod) |
| モニタリング | Prometheus + Grafana |
| ログ | Loki + Grafana |

---

## 8. 開発フェーズ計画

### Phase 1: Core (MVP)
- [ ] Core API (プロジェクト/テスト/実行 CRUD)
- [ ] PostgreSQL スキーマ + Prisma
- [ ] Web Runner (Playwright, 基本アクション30種)
- [ ] Web Dashboard (テスト一覧・ステップエディタ・実行・レポート)
- [ ] メール認証

### Phase 2: 品質向上
- [ ] ビジュアルリグレッションテスト
- [ ] データドリブンテスト (CSV)
- [ ] 共有ステップ
- [ ] スケジュール実行
- [ ] Slack通知

### Phase 3: モバイル対応
- [ ] Android Runner (Appium)
- [ ] iOS Runner (Appium + Mac Mini)
- [ ] モバイルレコード機能

### Phase 4: AI機能
- [ ] AI Autopilot (自然言語→テスト生成)
- [ ] セルフヒーリング
- [ ] Flaky Test検出

### Phase 5: エンタープライズ
- [ ] SAML SSO
- [ ] RBAC強化
- [ ] API Gateway (Rate Limiting)
- [ ] マルチリージョン対応
- [ ] Audit Log

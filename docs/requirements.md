# E2E Test Automation Tool - 要件定義書

## 1. プロダクト概要

Web・Android・APIに対応したチーム内E2Eテスト自動化ツール。  
**コスト最小化**を最優先としたセルフホスト型プラットフォーム。

### スコープ外 (コスト削減のため除外)
- iOS対応 (Mac Mini等の専用ハードが必要)
- 課金・マルチテナント機能 (チーム内利用のため不要)
- エンタープライズ向けSSO (将来対応)

---

## 2. 対象ユーザー

チーム内のQAエンジニア・開発者。外部公開しない。

---

## 3. 機能要件

### 3.1 対応プラットフォーム

| プラットフォーム | 実装技術 | 追加コスト |
|---|---|---|
| **Web** | Playwright | $0 (OSS) |
| **Android** | Appium 2 + Android Emulator | $0 (Linux上でKVM動作) |
| **API (REST/GraphQL)** | 軽量HTTPクライアント | $0 (OSS) |

**Web ブラウザ:**
- Chrome / Chromium (優先)
- Firefox
- WebKit (Safari相当)

**Android:**
- エミュレータ (AVD) で動作 → 実機不要
- UIAutomator2 ドライバ
- ネイティブアプリ + WebView両対応

---

### 3.2 テスト作成

#### 3.2.1 ノーコード ステップエディタ (GUI)
- ブラウザ上でステップを追加・並べ替え・削除
- 主要アクション (後述) をUIから選択・設定
- セレクタのビジュアルピッカー (スクリーンショット上でクリック)
- CSVによるデータドリブンテスト

#### 3.2.2 レコード&プレイバック (Web)
- Chromeエクステンションで操作を自動記録
- 記録したステップをGUIエディタで編集

#### 3.2.3 YAML定義ファイル
- テストをYAML/JSONファイルで定義
- Gitリポジトリで管理可能
- CLI経由で実行

#### 3.2.4 AI支援 (Phase 2以降)
- 自然言語 → テストステップ自動生成 (Claude API)
- コスト管理: APIコールは明示的にユーザーが実行時のみ課金

---

### 3.3 実行アクション (MVP)

#### Web / 共通

| カテゴリ | アクション |
|---|---|
| ナビゲーション | `navigate`, `go_back`, `go_forward`, `reload` |
| クリック | `click`, `double_click`, `right_click` |
| 入力 | `input`, `clear`, `select`, `check`, `uncheck`, `upload_file` |
| スクロール | `scroll`, `scroll_to_element` |
| アサーション | `assert_text`, `assert_visible`, `assert_hidden`, `assert_url`, `assert_attribute`, `assert_count` |
| 待機 | `wait` (ms), `wait_for_element`, `wait_for_network` |
| キャプチャ | `screenshot` |
| 変数 | `set_variable`, `extract_text`, `extract_attribute` |
| 制御 | `if/else/end_if`, `loop/end_loop` |
| 共有 | `shared_step` |
| API | `api_request` (Web内からHTTPリクエスト) |

#### Android 固有

| アクション | 説明 |
|---|---|
| `tap` | タップ |
| `long_press` | 長押し |
| `swipe` | スワイプ (up/down/left/right) |
| `pinch_in` / `pinch_out` | ピンチ操作 |
| `drag_and_drop` | ドラッグ&ドロップ |
| `press_key` | Backキー等のハードウェアキー |
| `launch_app` / `kill_app` / `reset_app` | アプリ制御 |
| `assert_image` | 画像認識アサーション |

#### API テスト

| アクション | 説明 |
|---|---|
| `http_request` | GET/POST/PUT/PATCH/DELETE |
| `assert_status` | ステータスコード確認 |
| `assert_json` | JSONレスポンス確認 (JSONPath) |
| `assert_header` | レスポンスヘッダー確認 |
| `extract_json` | JSONから変数抽出 |
| `set_auth` | Bearer Token / Basic Auth / API Key |

---

### 3.4 テスト実行

#### 実行モード

| モード | 説明 | コスト |
|---|---|---|
| **ローカル実行** (MVP) | 開発者PCやCIサーバー上でDocker実行 | $0 |
| **スケジュール実行** (MVP) | サーバー上でcron実行 | $0 (自前VPS) |
| **クラウド実行** (将来) | マネージドRunnerクラスタ | 将来検討 |

#### 実行管理
- テストスイート (テストのグループ化)
- 並列実行 (ローカルマシンのCPUコア数に応じて)
- リトライ設定 (失敗時の自動再実行: 0〜3回)
- 環境変数管理 (development / staging / production)
- タイムアウト設定

---

### 3.5 ビジュアルリグレッションテスト

- スクリーンショットのピクセル差分比較
- 差分の可視化 (diff画像)
- 差分閾値の設定
- ベースライン画像の管理・更新

---

### 3.6 セルフヒーリング

- 失敗したセレクタに対して代替セレクタ候補を提示
- ユーザーが承認/拒否を選択
- 承認時にテスト定義を自動更新

---

### 3.7 レポート & 分析

- 実行ごとの詳細レポート (ステップ単位のpass/fail)
- 失敗ステップのスクリーンショット + エラーログ
- 実行動画 (オプション)
- プロジェクト全体の合格率トレンドグラフ
- Flaky Test検出・一覧

---

### 3.8 CI/CD インテグレーション

- **GitHub Actions** (公式Action提供)
- **GitLab CI** (設定サンプル提供)
- **汎用 Web API** (curl等で叩けるREST API)
- **Slack通知** (実行結果の通知)

---

### 3.9 チーム管理

- メンバー招待・管理
- ロール: オーナー / 編集者 / 閲覧者
- 認証: メール/パスワード + Google OAuth

---

## 4. 非機能要件

### コスト目標

| 項目 | MVP時のコスト |
|---|---|
| サーバー | $0 (ローカル実行) 〜 $5/月 (VPS) |
| ストレージ | $0 (ローカルディスク) |
| AI機能 | $0 (Phase 2まで使わない) |
| ツール・ライブラリ | $0 (全てOSS) |

### パフォーマンス
- テスト実行開始: < 10秒 (ローカル)
- 並列実行: マシンスペックに依存 (デフォルト4並列)

### セキュリティ
- TLS (HTTPS) 必須
- シークレット (パスワード等) は暗号化して保存
- API Token認証 (CI/CD用)

### 可用性
- セルフホスト型のためSLA規定なし
- Docker Composeで簡単に起動・復旧できること

---

## 5. 開発フェーズ

### Phase 1: Web MVP (最優先)
コアとなるWeb E2Eテストの作成・実行・確認ができる最小構成。

- [ ] プロジェクト / テスト / ステップの CRUD API
- [ ] Web Runner (Playwright, 基本アクション30種)
- [ ] Web Dashboard (Next.js)
  - テスト一覧・ステップエディタ
  - 実行トリガー・リアルタイムログ
  - 実行レポート (ステップ別 pass/fail + スクリーンショット)
- [ ] 環境変数管理
- [ ] メール認証
- [ ] Docker Compose で一発起動

### Phase 2: 品質・運用向上
- [ ] ビジュアルリグレッションテスト
- [ ] データドリブンテスト (CSV)
- [ ] 共有ステップ (モジュール化)
- [ ] スケジュール実行
- [ ] Slack通知
- [ ] GitHub Actions 公式Action
- [ ] セルフヒーリング (候補提示)

### Phase 3: Android対応
- [ ] Android Runner (Appium 2 + AVD)
- [ ] モバイルUIエディタ (スクリーンショット上でのセレクタ指定)
- [ ] アプリアップロード機能 (.apk)

### Phase 4: API テスト
- [ ] API Runner
- [ ] APIテスト専用エディタ
- [ ] レスポンスアサーション (JSONPath)
- [ ] Auth設定 (Bearer / OAuth2 / API Key)

### Phase 5: AI機能
- [ ] AI Autopilot (自然言語→テストステップ生成)
- [ ] セルフヒーリング高度化 (AIによる意図解析)
- [ ] Flaky Test自動分析

### Phase 6: クラウド実行 (将来)
- [ ] マネージドRunnerクラスタ設計
- [ ] 従量課金モデル (チーム外提供時)

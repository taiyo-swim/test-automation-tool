# セットアップガイド

## フェーズ① : ローカル開発 (完全無料)

### 必要なもの
- Docker Desktop (Mac / Windows / Linux)
- Node.js 22+ + pnpm (ローカル開発時)

### 起動手順

```bash
# 1. リポジトリをクローン
git clone <repo-url>
cd test-automation-tool

# 2. 環境変数をコピー
cp .env.example .env
# .env を編集 (最低限 JWT_SECRET を変更推奨)

# 3. 全サービスを起動
docker compose up -d

# 4. ブラウザでアクセス
open http://localhost:3000
```

**これだけで以下が起動します:**
- `http://localhost:3000` → Web ダッシュボード
- `http://localhost:4000` → API サーバー
- PostgreSQL, Redis, Playwright Runner

---

## フェーズ② : AWS EC2 無料枠 (チーム共有)

### EC2 インスタンス起動
1. AWS コンソール → EC2 → インスタンスを起動
2. **AMI:** Amazon Linux 2023
3. **インスタンスタイプ:** t3.micro (無料枠)
4. **セキュリティグループ:** 22 (SSH), 80 (HTTP), 443 (HTTPS) を開放

### S3 バケット作成
```bash
aws s3 mb s3://your-bucket-name --region ap-northeast-1
```

### EC2 セットアップ
```bash
# SSH接続後
sudo dnf install -y docker git
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# ログアウトして再ログイン (グループ反映)
exit
```

### アプリデプロイ
```bash
# EC2上で
git clone <repo-url>
cd test-automation-tool
cp .env.example .env

# .env を編集
vim .env
# 以下を設定:
# JWT_SECRET=<ランダムな長い文字列>
# JWT_REFRESH_SECRET=<別のランダムな長い文字列>
# STORAGE_TYPE=s3
# AWS_S3_BUCKET=your-bucket-name
# AWS_REGION=ap-northeast-1
# APP_URL=http://<EC2のIPアドレス>:3000

# 起動
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### SSL (HTTPS) を設定する場合
```bash
# ドメインをEC2のIPに向けた後
sudo dnf install -y certbot
sudo certbot certonly --standalone -d your-domain.com

# nginx.conf の ${DOMAIN} を your-domain.com に変更してから起動
```

---

## フェーズ③ : AWS マネージドサービス (本番運用)

ECS Fargate + RDS + ElastiCache + S3 + ALB による完全マネージド構成です。

### アーキテクチャ

```
Internet → ALB (HTTPS) → ECS Fargate
                           ├── web  (Next.js, port 3000)
                           ├── api  (Fastify,  port 4000)
                           └── runner-web (Playwright worker)
                                    ↓
                             RDS PostgreSQL 16
                             ElastiCache Redis 7
                             S3 (screenshots / baselines / diffs)
```

### 前提条件

- AWS CLI v2 + Node.js 22 + pnpm がローカルにインストール済み
- AWS アカウントで CDK ブートストラップ済み
- (任意) カスタムドメインと ACM 証明書

---

### 手順 1 : CDK でインフラを構築

```bash
cd infra
pnpm install

# AWS 認証情報を設定
export AWS_PROFILE=your-profile   # または AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY

# CDK Bootstrap (初回のみ)
npx cdk bootstrap

# インフラをデプロイ (全スタック)
npx cdk deploy --all --require-approval never

# カスタムドメインを使う場合 (ACM 証明書 ARN を指定)
npx cdk deploy --all \
  --context domainName=your-domain.com \
  --context certificateArn=arn:aws:acm:ap-northeast-1:123456789012:certificate/xxxx
```

デプロイ完了後、以下の出力値をメモしてください:
- `e2e-tool-ecs.AlbDnsName` → ドメインの CNAME 先
- `e2e-tool-data.DbSecretArn` → データベース接続情報の Secret ARN
- `e2e-tool-storage.BucketName` → S3 バケット名
- `e2e-tool-storage.ApiRepoUri` → ECR リポジトリ URI (3つ)

---

### 手順 2 : DATABASE_URL を Secrets Manager に登録

RDS の接続パスワードは CDK が自動生成します。以下で取得して DATABASE_URL を設定します。

```bash
# DB 認証情報を取得
SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name e2e-tool-data \
  --query 'Stacks[0].Outputs[?OutputKey==`DbSecretArn`].OutputValue' \
  --output text)

DB_CREDS=$(aws secretsmanager get-secret-value \
  --secret-id "$SECRET_ARN" \
  --query SecretString --output text | jq -r '.')

DB_HOST=$(echo "$DB_CREDS" | jq -r '.host')
DB_PASS=$(echo "$DB_CREDS" | jq -r '.password')

# DATABASE_URL を Secrets Manager に保存
aws secretsmanager put-secret-value \
  --secret-id "e2e-tool/database-url" \
  --secret-string "postgresql://postgres:${DB_PASS}@${DB_HOST}:5432/e2etool"
```

---

### 手順 3 : GitHub Actions で CI/CD を設定

#### 3-1. GitHub OIDC プロバイダーを AWS に登録 (初回のみ)

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

#### 3-2. デプロイ用 IAM ロールを作成

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
GITHUB_ORG=taiyo-swim
GITHUB_REPO=test-automation-tool

# 信頼ポリシー
cat > /tmp/trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
      },
      "StringLike": {
        "token.actions.githubusercontent.com:sub": "repo:${GITHUB_ORG}/${GITHUB_REPO}:ref:refs/heads/main"
      }
    }
  }]
}
EOF

# ロール作成
aws iam create-role \
  --role-name e2e-tool-github-deploy \
  --assume-role-policy-document file:///tmp/trust-policy.json

# デプロイ権限ポリシーをアタッチ
aws iam put-role-policy \
  --role-name e2e-tool-github-deploy \
  --policy-name DeployPolicy \
  --policy-document file://infra/iam-deploy-policy.json

ROLE_ARN=$(aws iam get-role \
  --role-name e2e-tool-github-deploy \
  --query 'Role.Arn' --output text)
echo "Role ARN: $ROLE_ARN"
```

#### 3-3. GitHub シークレットを設定

GitHub リポジトリ → Settings → Secrets and variables → Actions で以下を追加:

| シークレット名 | 値 |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | 上記で出力された Role ARN |

---

### 手順 4 : 初回イメージをビルドして ECR にプッシュ

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=ap-northeast-1

aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin \
  "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

# ビルド & プッシュ (3サービス)
for SVC in api web runner-web; do
  docker build -t "e2e-tool/$SVC" -f "docker/Dockerfile.$SVC" .
  docker tag "e2e-tool/$SVC:latest" \
    "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/e2e-tool/$SVC:latest"
  docker push \
    "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/e2e-tool/$SVC:latest"
done
```

---

### 手順 5 : DB マイグレーション実行 & 動作確認

```bash
ALB_DNS=$(aws cloudformation describe-stacks \
  --stack-name e2e-tool-ecs \
  --query 'Stacks[0].Outputs[?OutputKey==`AlbDnsName`].OutputValue' \
  --output text)

# ヘルスチェック
curl "http://$ALB_DNS/health"

# ブラウザでアクセス
echo "http://$ALB_DNS"
```

---

### コスト見積もり (東京リージョン / 月額概算)

| サービス | スペック | 月額 |
|---|---|---|
| ECS Fargate (api + web) | 0.5 vCPU × 1GB × 2 | ~$15 |
| ECS Fargate (runner-web) | 1 vCPU × 3GB × 1 | ~$15 |
| RDS PostgreSQL | db.t3.small | ~$25 |
| ElastiCache Redis | cache.t3.micro | ~$12 |
| ALB | 1 LCU/h | ~$18 |
| S3 | 10GB | ~$0.25 |
| NAT Gateway | 1台 | ~$32 |
| **合計** | | **~$117/月** |

> コスト削減: 開発環境は夜間停止 (ECS desiredCount=0)、NAT GW → VPC Endpoint に置換でさらに削減可能。

---

### スケーリング

```bash
# API を手動スケールアウト
aws ecs update-service \
  --cluster e2e-tool-cluster \
  --service e2e-tool-api \
  --desired-count 3

# 全サービスを停止 (コスト節約)
for SVC in api web runner-web; do
  aws ecs update-service \
    --cluster e2e-tool-cluster \
    --service "e2e-tool-$SVC" \
    --desired-count 0
done
```

---

## ローカル開発 (コード変更時)

```bash
# 依存関係インストール
pnpm install

# DB起動のみ
docker compose up postgres redis -d

# 各サービスをローカルで起動
cp .env.example .env
pnpm db:migrate     # DBマイグレーション
pnpm dev            # API + Web + Runner を同時起動
```

---

## 主なコマンド

```bash
# 全サービス起動
docker compose up -d

# ログ確認
docker compose logs -f api
docker compose logs -f runner-web

# DB接続
docker compose exec postgres psql -U postgres e2etool

# Prisma Studio (DBブラウザ)
pnpm db:studio

# サービス停止
docker compose down

# データを含めて全削除
docker compose down -v
```

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

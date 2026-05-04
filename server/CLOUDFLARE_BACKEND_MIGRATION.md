# Cloudflare Backend Migration

当前目标已经修正为两部分：
- 将 Supabase 中的业务表迁移到 Cloudflare D1
- 将现有 Python/FastAPI 后端部署到 Cloudflare，采用容器化方案

## 环境变量

### 对象存储

当前不要求把腾讯 COS 迁移到 R2。

如果你继续保留 COS，部署到 Cloudflare 容器时只需要在运行环境中保留：

```bash
export OBJECT_STORAGE_PROVIDER=cos
export COS_SECRET_ID="<cos-secret-id>"
export COS_SECRET_KEY="<cos-secret-key>"
export COS_REGION="<cos-region>"
export COS_BUCKET="<cos-bucket>"
```

如果未来再切到 R2，再额外配置 `R2_*` 变量即可。

### D1

```bash
export PROMPT_STORAGE_PROVIDER=d1
export D1_HTTP_BASE="http://magicart.d1"
```

说明：
- `plugin` 提示词接口已经切换为 `D1` 优先。
- Cloudflare Containers 推荐通过 Worker 的 D1 binding + outbound handler 访问 D1，容器内无需保存 D1 API Token。
- 如果未设置 `PROMPT_STORAGE_PROVIDER`，只要 `D1_HTTP_BASE` 或 `D1_*` 环境变量存在，也会自动使用 D1。
- 其余 Supabase 历史表先通过导出/导入工具迁移到 D1，运行时是否继续改造可分阶段推进。

Wrangler 中需要声明 D1 binding：

```jsonc
"d1_databases": [
  {
    "binding": "MAGICART_D1",
    "database_name": "magicart-db",
    "database_id": "<YOUR_D1_DATABASE_ID>"
  }
]
```

## Supabase -> D1

1. 初始化 D1 表结构：

```bash
wrangler d1 execute <YOUR_D1_DB> --remote --file server/migrations/d1_supabase_schema.sql
```

2. 从 Supabase 导出所有目标表：

```bash
SUPABASE_URL=... \
SUPABASE_KEY=... \
python server/scripts/export_supabase_to_d1.py --output-dir server/data/supabase_export
```

3. 导入到 D1：

```bash
DATABASE_PROVIDER=d1 \
D1_ACCOUNT_ID=... \
D1_DATABASE_ID=... \
D1_API_TOKEN=... \
python server/scripts/import_json_to_d1.py server/localmanus.db server/data/supabase_export
```

也可以直接用 Wrangler 执行建表：

```bash
cd server/cloudflare
./migrate_d1.sh <YOUR_D1_DB_NAME>
```

默认迁移的表：
- `tb_ma_template_prompt`
- `tweet_info`
- `retweet`
- `tweet_card`
- `tweeter`
- `user_lastest_tweet`
- `x_crawl_task`
- `xiaohongshu_info`
- `xiaohongshu_user`
- `media_downloads`

## SQLite -> D1

1. 导出本地 SQLite：

```bash
python server/scripts/export_sqlite_for_d1.py /path/to/localmanus.db /tmp/localmanus.d1.sql
```

2. 导入到 D1：

```bash
DATABASE_PROVIDER=d1 \
D1_ACCOUNT_ID=... \
D1_DATABASE_ID=... \
D1_API_TOKEN=... \
python server/scripts/import_sql_to_d1.py /path/to/localmanus.db /tmp/localmanus.d1.sql
```

## 回滚

- 存储：继续使用 `OBJECT_STORAGE_PROVIDER=cos`
- 提示词库：删除 `PROMPT_STORAGE_PROVIDER=d1`
- 数据库：将 `DATABASE_PROVIDER` 改回 `sqlite`

这两个开关可以独立回滚。

## Cloudflare 部署

当前后端不适合直接改写成纯 Worker，原因包括：
- Python 运行时
- FastAPI + Socket.IO / WebSocket
- 本地文件系统依赖
- Pillow / ffmpeg / 媒体处理
- 长任务执行模型

因此本仓库提供的是 Cloudflare 容器化部署骨架：
- 容器镜像: `server/Dockerfile.cloudflare`
- 容器启动脚本: `server/start_cloudflare.sh`
- Worker 代理: `server/cloudflare/worker.js`
- Wrangler 配置草案: `server/cloudflare/wrangler.jsonc`
- Worker 依赖: `server/cloudflare/package.json`
- 运行时环境模板: `server/cloudflare/.env.cloudflare.example`
- 部署脚本: `server/cloudflare/deploy.sh`
- D1 建表脚本: `server/cloudflare/migrate_d1.sh`

建议部署流程：

```bash
cd server/cloudflare
cp .env.cloudflare.example .env.cloudflare
# 填入真实密钥、域名、D1 参数、COS 参数
./migrate_d1.sh <YOUR_D1_DB_NAME>
./deploy.sh ./.env.cloudflare
```

`deploy.sh` 会做两件事：
- 将 `.env.cloudflare` 整体 base64 编码后写入 Worker Secret `MAGICART_SERVER_ENV_B64`
- 执行 `wrangler deploy`

当前建议的 Cloudflare 运行时变量：

```bash
DATABASE_PROVIDER=sqlite
PROMPT_STORAGE_PROVIDER=d1
D1_HTTP_BASE=http://magicart.d1
OBJECT_STORAGE_PROVIDER=cos
```

原因：
- 线上 `Supabase` 当前只承载 `tb_ma_template_prompt`
- 线上主业务数据仍在 `server/user_data/localmanus.db`
- 在未完成 `localmanus.db` 全量迁移前，不能把 `DATABASE_PROVIDER` 直接切到 `d1`

已确认的本机阻塞项：
- 当前机器 `wrangler whoami` 返回 `Not logged in`
- 当前 shell 中未设置 `SUPABASE_URL` / `SUPABASE_KEY`
- 当前 shell 中未设置 `D1_ACCOUNT_ID` / `D1_DATABASE_ID` / `D1_API_TOKEN`

因此代码和脚本已经补齐，但真实迁移和真实部署还需要先补这些凭证。

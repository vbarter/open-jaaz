# MagicArt 迁移到 Cloudflare R2 + D1 评估

## 结论

可以迁，但要分成两件事看：

1. `COS -> R2` 很适合直接迁，风险中等，基本是存储适配和数据搬运问题。
2. `SQLite -> D1` 可以导入数据，但如果后端仍然是当前这套 `Python + FastAPI + aiosqlite/sqlite3`，那么不是“只迁数据”这么简单，而是需要把数据库访问层改成：
   - 走 `Cloudflare D1 REST API`，或
   - 把这部分服务迁到 `Cloudflare Workers` 上再直接用 D1 binding。

对这个仓库来说，真正的工作量主要在数据库接入层，不在对象存储。

## 当前项目现状

### 1. 对象存储当前强绑定腾讯 COS

- [server/utils/cos_image_service.py](/Users/caijunjie/Dev/magicart/server/utils/cos_image_service.py:15) 提供统一上传入口，但类和行为都按 COS 命名。
- [server/utils/cos.py](/Users/caijunjie/Dev/magicart/server/utils/cos.py:10) 直接使用 `qcloud_cos.CosS3Client`，并硬编码桶名。
- [server/routers/image_router.py](/Users/caijunjie/Dev/magicart/server/routers/image_router.py:109) 上传图片后优先返回 COS 直链。
- [server/routers/image_router.py](/Users/caijunjie/Dev/magicart/server/routers/image_router.py:355) `/api/file/{file_id}` 会优先取 COS，再回退本地文件。
- [server/utils/url_converter.py](/Users/caijunjie/Dev/magicart/server/utils/url_converter.py:20) URL 转换逻辑默认优先 COS。

### 2. 前端也识别了 COS 域名格式

- [react/src/components/chat/Markdown.tsx](/Users/caijunjie/Dev/magicart/react/src/components/chat/Markdown.tsx:311)
- [react/src/components/chat/Message/Image.tsx](/Users/caijunjie/Dev/magicart/react/src/components/chat/Message/Image.tsx:134)
- [react/src/utils/remoteImageProcessor.ts](/Users/caijunjie/Dev/magicart/react/src/utils/remoteImageProcessor.ts:33)

这些地方都在识别 `cos.*.myqcloud.com`，迁移后需要一起兼容 `R2` 域名或统一改成你自己的 CDN/自定义域名。

### 3. 数据库当前不是 Supabase 主线，而是 SQLite

- [server/services/db_service.py](/Users/caijunjie/Dev/magicart/server/services/db_service.py:14) 默认数据库是 `USER_DATA_DIR/localmanus.db`。
- [server/services/db_service.py](/Users/caijunjie/Dev/magicart/server/services/db_service.py:29) 初始化依赖本地 `sqlite3.connect(...)`。
- [server/services/db_service.py](/Users/caijunjie/Dev/magicart/server/services/db_service.py:59) 之后的大部分 CRUD 都是 `aiosqlite.connect(...)`。
- 仓库里还有大量直接依赖 SQLite 语义的 SQL 和迁移脚本，包括 `AUTOINCREMENT`、`STRFTIME(...)`、`cursor.lastrowid`、`PRAGMA ...`、本地事务等。

### 4. 本仓库没有真实业务库样本

仓库里的 [server/localmanus.db](/Users/caijunjie/Dev/magicart/server/localmanus.db:1) 是空文件，默认真实路径是 [server/services/config_service.py](/Users/caijunjie/Dev/magicart/server/services/config_service.py:88) 里的 `server/user_data/localmanus.db`，但当前工作区没有 `server/user_data/`，所以这次评估基于代码结构，不是基于你线上真实数据量。

## 是否适合迁到 R2

适合。

原因：

- R2 提供 S3 兼容接口，适合替换当前“对象存储 + 公开 URL”的用法。
- 你现在的上传/下载逻辑已经抽了一层 `CosImageService`，虽然命名是 COS，但替换成本不高。
- 图片、视频本身并没有强事务关系，适合分批迁移、灰度切流。

### R2 迁移时最重要的两个设计决定

1. 不要继续把“存储厂商”暴露到业务命名里。
   - 建议把 `CosImageService` 重命名成 `ObjectStorageService`。
   - `utils/cos.py` 改成通用 `utils/object_storage.py`。

2. 不要再让前端识别 `cos.myqcloud.com` 这种供应商域名。
   - 最稳妥的做法是前端统一只认：
     - `https://你的静态域名/...`
     - 或后端 `/api/file/{id}` 代理地址
   - 这样以后换供应商不用再改前端。

## 是否适合迁到 D1

“数据导入”适合，“当前 Python 运行时直接切过去”不适合一步到位。

原因：

- D1 本质上是 Cloudflare 托管的 SQLite 语义数据库，导入现有 SQLite 数据是支持的。
- 但 D1 最自然的运行方式是：
  - Worker binding，或者
  - Cloudflare D1 REST API。
- 你现在的代码是直接读本地 `.db` 文件，D1 不能被 `sqlite3.connect()` 或 `aiosqlite.connect()` 当成本地文件使用。

也就是说：

- “把 SQLite 数据导进 D1”没问题。
- “让现在这套 Python 服务无感继续跑”不成立。

## 官方能力核对

根据 Cloudflare 官方文档：

- D1 是托管的 serverless SQL，保留 SQLite 语义，并提供 Worker 和 HTTP API 访问。
  来源：Cloudflare D1 Overview
  https://developers.cloudflare.com/d1/

- D1 支持把现有 SQLite 数据先导出成 `.sql`，再通过 `wrangler d1 execute --remote --file=...` 导入。
  来源：Import and export data
  https://developers.cloudflare.com/d1/best-practices/import-export-data/

- 官方明确说明不能直接导入原始 `.sqlite3` 文件，需要先 `sqlite3 db.sqlite3 .dump > db.sql`，并移除 `BEGIN TRANSACTION` / `COMMIT` 等内容。
  来源：Import and export data
  https://developers.cloudflare.com/d1/best-practices/import-export-data/

- R2 提供 S3 API 兼容端点 `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`，S3 兼容工具可直接接入。
  来源：S3 API compatibility
  https://developers.cloudflare.com/r2/api/s3/api/

- R2 官方提供 `Super Slurper` 和 `Sippy` 两种迁移策略，分别适合一次性全量迁移和按访问渐进迁移。
  来源：R2 Data migration
  https://developers.cloudflare.com/r2/data-migration/

## 针对本项目的推荐迁移策略

### 第一阶段：先迁 R2，不动数据库读写层

这是最值得先做的。

目标：

- 新上传图片/视频写入 R2。
- 旧 COS 资源继续可读。
- 应用层文件 URL 改成统一域名或后端代理。

建议动作：

1. 新建通用存储服务层
   - `ObjectStorageService`
   - `R2StorageBackend`
   - 可选保留 `CosStorageBackend` 只做旧数据回读

2. 接口改造
   - 上传：新文件只写 R2
   - 下载：先查 R2，未命中则查 COS，最后回退本地
   - 返回值不要再写 `storage_type: tencent_cloud`

3. URL 统一
   - 优先上 `R2 自定义域名/CDN 域名`
   - 或统一走 `/api/file/{id}` 代理

4. 数据搬运
   - 全量对象从 COS 同步到 R2
   - 同步完成后做抽样校验：数量、总大小、随机 hash、可访问性

### 第二阶段：数据库先“导入 D1 验证”，不要立刻切生产

目标：

- 先证明 D1 能完整承载当前 schema 和数据。
- 但生产应用仍然先用 SQLite。

建议动作：

1. 从真实 SQLite 导出 SQL
2. 清洗 dump
   - 去掉 `BEGIN TRANSACTION`
   - 去掉 `COMMIT`
   - 检查保留字、触发器、虚表
3. 导入到你的 D1 数据库
4. 做只读验证
   - 表数量
   - 每表行数
   - 主键/索引
   - 关键业务查询结果比对

只有这一步通过，才建议进入第三阶段。

### 第三阶段：重构 Python 数据访问层，再切 D1

你有两个可选路径。

#### 路径 A：Python 保持不动部署位置，改走 D1 REST API

优点：

- 不需要立刻重写整个后端到 Workers。
- 适合渐进迁移。

缺点：

- 你要把现在大量 `sqlite3/aiosqlite` 调用替换成一个 D1 client。
- 连接、事务、返回结果、批量执行方式都要适配。
- Cloudflare 官方也说明 D1 的内建 REST API更偏管理/外部访问；高频业务流量更适合 Worker 侧接入。

适合当前仓库的方式：

- 先封装一个 `DatabaseAdapter`
  - `SQLiteAdapter`
  - `D1HttpAdapter`
- 让 `db_service.py` 不再直接 `aiosqlite.connect(...)`

#### 路径 B：把后端逐步迁到 Workers，再用 D1 binding

优点：

- 这是 Cloudflare 生态下更自然的架构。
- 延迟和访问模型更合理。

缺点：

- 对当前 FastAPI 项目来说改造幅度更大。
- 你现在还有本地文件、PIL、ffmpeg、ComfyUI、长任务等服务逻辑，不能一次性全迁。

结论：

对这个项目，建议先选路径 A，先把数据库访问层抽象出来，再决定以后是否迁 Worker。

## 你当前代码里会卡 D1 的点

下面这些都不是不能做，而是需要改。

1. 直接连接本地 SQLite 文件
   - 例如 [server/services/db_service.py](/Users/caijunjie/Dev/magicart/server/services/db_service.py:29)
   - D1 不支持这一模式

2. 大量 `aiosqlite.connect(...)`
   - 要换成统一 adapter

3. `cursor.lastrowid`
   - D1 REST/HTTP 返回结构不同，需要封装兼容

4. `PRAGMA`
   - 部分本地优化 PRAGMA 对 D1 不成立

5. SQLite 本地性能优化配置
   - 例如 WAL、cache_size、temp_store 等本地参数对 D1 没意义

6. 迁移系统当前假设“本地连接 + 顺序执行 SQL”
   - [server/services/migrations/manager.py](/Users/caijunjie/Dev/magicart/server/services/migrations/manager.py:1)
   - 需要能输出纯 SQL 文件，或者提供 `wrangler d1 execute` 兼容迁移链路

## 推荐实施顺序

### 方案一：稳妥方案

1. 抽象对象存储服务，先支持 R2 写入。
2. 保留 COS 回读，完成历史对象同步。
3. 前端去掉 COS 域名耦合。
4. 导出真实 SQLite，导入 D1 测试库。
5. 做数据一致性校验。
6. 抽象 DB adapter。
7. 在测试环境把读流量切到 D1。
8. 再逐步切写流量。

这是我最推荐的。

### 方案二：一次性大切换

不推荐。

因为你现在同时存在：

- 对象存储迁移
- 数据库迁移
- Python 接入层改造
- 前端 URL 兼容改造

一次做完，回滚会很痛苦。

## R2 迁移的具体做法

### 推荐方式

如果腾讯 COS 这边能用标准 S3 兼容工具访问，优先考虑：

- `rclone sync`
- 或你自己写 Python 批处理脚本：COS 读 -> R2 写

Cloudflare 官方也提供：

- `Super Slurper`
- `Sippy`

但对这个项目，我更偏向你自己可控的同步脚本或 `rclone`，因为你还需要保留 key 命名、抽样校验和断点续传能力。

### 关键要求

1. 保持 object key 不变
   - 现在代码默认 key 就是文件名
   - [server/utils/cos_image_service.py](/Users/caijunjie/Dev/magicart/server/utils/cos_image_service.py:147)

2. 不依赖 COS 的图片处理参数
   - 你现在图片 URL 会拼 `?imageMogr2/thumbnail/avif`
   - [server/utils/cos.py](/Users/caijunjie/Dev/magicart/server/utils/cos.py:40)
   - R2 不提供这套 COS 图片处理语义

3. 图片格式策略要改
   - 现在很多地方默认用 “原图 + COS 查询参数转 avif/webp”
   - 迁移后要么：
     - 上传时直接生成需要的缩略图/avif/webp，
     - 要么接入 Cloudflare Images / Worker 动态处理，
     - 要么短期内先返回原图 URL。

这一点是 R2 迁移里最容易被忽略的坑。

## D1 迁移的具体做法

### 数据导出导入

从真实 SQLite 库导出：

```bash
sqlite3 /path/to/localmanus.db .dump > localmanus.sql
```

清洗：

- 删除 `BEGIN TRANSACTION`
- 删除 `COMMIT;`
- 如果有 `_cf_KV`，删除相关建表

导入 D1：

```bash
npx wrangler d1 execute <your-db-name> --remote --file=localmanus.sql
```

导入后校验：

```bash
npx wrangler d1 execute <your-db-name> --remote --command "SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name;"
```

### 切运行态前必须做的校验

1. 每张表行数一致
2. 主键最大值一致
3. 核心链路查询一致
   - 登录用户
   - 画布列表
   - 会话列表
   - 聊天消息
   - sora/video 记录
   - 订单/积分
4. 写入链路验证
   - 插入
   - 更新
   - 幂等更新
   - 事务回滚

## 高风险点

1. `COS imageMogr2` 参数不兼容 R2
   - 这是对象存储迁移里最容易造成功能退化的点

2. 当前前端和后端都把供应商域名写进了逻辑
   - 不先抽象，后面还会继续污染代码

3. D1 不是本地 SQLite 文件
   - 这不是“改连接字符串”能解决的

4. 本地文件兜底路径仍然存在
   - 生产如果有很多历史文件只在磁盘、不在 COS，需要先盘点再迁

5. 仓库里出现了明文敏感配置
   - 建议一起治理环境变量和密钥注入

## 我建议你现在就做的事情

1. 先盘点真实生产数据
   - SQLite 文件路径
   - 数据库大小
   - 每表行数
   - COS 桶对象数量和总大小
   - 本地磁盘文件数量和总大小

2. 先做 R2 适配，不急着切 D1
   - 这是收益最大、风险可控的一步

3. 同时把 DB 层抽象出来
   - 不要再让业务代码直接 `aiosqlite.connect`

4. 拿真实数据库做一次 D1 试导入
   - 先证明能导进去、能查、能写，再决定是否切生产

## 如果继续往下做

下一步最合适的是两件事一起推进：

1. 我先帮你把代码里的 `COS` 抽成 `R2/通用对象存储` 适配层。
2. 我再补一个 `SQLite -> D1` 的迁移脚本和校验脚本骨架。

这样你就不是只有评估，而是能直接进入实施。

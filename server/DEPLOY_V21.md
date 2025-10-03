# 部署 v21 迁移修复线上点赞功能

## 问题描述

线上 discover 页面点赞功能失效，报错：
```
no such table: tb_sora_feedback
```

实际上表存在，但外键约束错误：
- **错误**: `FOREIGN KEY (video_id) REFERENCES tb_sora2_tasks(id)`
- **正确**: `FOREIGN KEY (video_id) REFERENCES tb_sora2(id)`

## 修复内容

### 新增文件
- `services/migrations/v21_fix_sora_feedback_fk.py` - 修复外键约束的迁移脚本

### 修改文件
- `services/migrations/manager.py`
  - 导入 V21FixSoraFeedbackFk
  - CURRENT_VERSION: 20 → 21
  - 添加 v21 迁移到 ALL_MIGRATIONS 列表

## 部署步骤

### 1. 部署代码
```bash
# 在线上服务器拉取最新代码
git pull origin main
```

### 2. 自动迁移
当服务器重启时，迁移会自动运行（如果使用了 db_service 的初始化逻辑）。

或者手动运行迁移：
```bash
cd /path/to/server
python -c "
import sqlite3
from services.migrations.manager import MigrationManager

db_path = 'user_data/localmanus.db'  # 或线上实际路径
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute('SELECT version FROM db_version')
current_version = cursor.fetchone()[0]
print(f'当前版本: {current_version}')

if current_version < 21:
    manager = MigrationManager()
    manager.migrate(conn, current_version, 21)
    conn.commit()
    print('✅ 迁移成功！')
else:
    print('✅ 数据库已是最新版本')

conn.close()
"
```

### 3. 验证迁移
```bash
sqlite3 /path/to/user_data/localmanus.db "
SELECT version FROM db_version;
.schema tb_sora_feedback
"
```

预期输出：
- version: `21`
- schema 包含: `FOREIGN KEY (video_id) REFERENCES tb_sora2(id)`

### 4. 重启服务
```bash
# 根据你的部署方式重启
systemctl restart your-service
# 或
pm2 restart your-app
# 或
supervisorctl restart your-app
```

### 5. 测试点赞功能
访问线上 discover 页面，点击视频卡片左下角的红色点赞按钮，确认：
- ✅ 无报错
- ✅ 点赞数正确增减
- ✅ 点赞状态正确切换（红色 ↔ 灰色）

## 回滚方案

如果迁移失败，可以手动恢复：

```bash
# 1. 备份数据
sqlite3 localmanus.db "SELECT * FROM tb_sora_feedback" > backup_feedback.csv

# 2. 重建表（使用正确的外键）
sqlite3 localmanus.db "
DROP TABLE IF EXISTS tb_sora_feedback;

CREATE TABLE tb_sora_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL,
    user_uuid TEXT NOT NULL,
    is_liked INTEGER DEFAULT 0,
    ctime TEXT NOT NULL,
    mtime TEXT NOT NULL,
    UNIQUE(video_id, user_uuid),
    FOREIGN KEY (video_id) REFERENCES tb_sora2(id) ON DELETE CASCADE
);

CREATE INDEX idx_sora_feedback_video_id ON tb_sora_feedback(video_id);
CREATE INDEX idx_sora_feedback_user_uuid ON tb_sora_feedback(user_uuid);
CREATE INDEX idx_sora_feedback_is_liked ON tb_sora_feedback(is_liked);
"

# 3. 恢复数据（如果有）
# 根据 backup_feedback.csv 手动恢复
```

## 注意事项

1. **数据安全**: 迁移会自动备份和恢复数据，但建议部署前先备份整个数据库
2. **停机时间**: 迁移速度很快（<1秒），但建议在低峰期部署
3. **监控**: 部署后监控错误日志，确认无 `tb_sora_feedback` 相关报错

## 测试记录

### 本地测试
- ✅ 从 v20 迁移到 v21 成功
- ✅ 备份了 1 条现有记录
- ✅ 外键约束已修复
- ✅ 索引创建成功
- ✅ 数据恢复成功

### 预期线上影响
- 影响范围：点赞功能
- 数据丢失风险：无（自动备份恢复）
- 停机时间：0（热迁移）

# WebSocket 实时推送功能测试指南

## 📋 测试步骤

### 1. 确认服务器正在运行
确保你的FastAPI服务器已经启动（从你的日志看已经在运行）

### 2. 访问 Sora 页面
在浏览器中访问: http://127.0.0.1:8000/sora

### 3. 打开浏览器开发者工具
- Chrome/Edge: F12 或 右键 -> 检查
- 切换到 Console 标签页

### 4. 预期看到的日志

#### 前端日志（浏览器Console）：
```
🎬 [Sora] 组件挂载，建立WebSocket连接
🔌 [Sora WS] 建立WebSocket连接...
✅ [Sora WS] WebSocket连接已建立
📨 [Sora WS] 收到消息: tasks_update
🔄 [Sora WS] 任务列表已更新: X 个任务
```

每2秒会看到新的消息：
```
📨 [Sora WS] 收到消息: tasks_update
🔄 [Sora WS] 任务列表已更新: X 个任务
```

#### 后端日志（服务器终端）：
```
🔌 WebSocket connected - user: 254b0155...
✅ WebSocket authenticated - user: yzcaijunjie@gmail.com
📤 [WS] Sent initial tasks to yzcaijunjie@gmail.com: X tasks
```

### 5. 测试任务提交和实时更新

1. 在Sora页面输入框中输入一个视频描述，例如：
   ```
   A beautiful sunset over the ocean with waves crashing
   ```

2. 点击发送按钮

3. **预期行为**：
   - 立即看到一个"生成中"的卡片出现
   - 浏览器控制台显示：
     ```
     ✅ [Sora] 任务提交成功，任务ID: XXX
     ```
   - **无需刷新页面**，约2秒后WebSocket会推送最新状态
   - 任务完成后会自动显示视频（如果成功）或错误信息（如果失败）
   - 会弹出通知："视频生成完成！" 或 "视频生成失败"

### 6. 检查WebSocket连接（Chrome DevTools）

1. 打开开发者工具 -> Network 标签
2. 刷新页面
3. 在Filter中选择 "WS" (WebSocket)
4. 应该看到一个到 `ws://127.0.0.1:8000/api/ws/sora2/tasks` 的连接
5. 点击该连接，查看 Messages 标签，可以看到实时推送的消息

### 7. 测试断线重连

1. 在浏览器Console中执行：
   ```javascript
   // 强制关闭WebSocket连接（仅用于测试）
   // 注意：正常使用时不要执行这个
   ```

2. 预期行为：
   - 控制台显示：`🔌 [Sora WS] WebSocket连接关闭`
   - 5秒后自动尝试重连
   - 控制台显示：`🔄 [Sora WS] 尝试重新连接...`
   - 连接成功后显示：`✅ [Sora WS] WebSocket连接已建立`

## 🔍 问题排查

### WebSocket连接失败

**症状**: 控制台没有看到任何 `[Sora WS]` 相关日志

**可能原因和解决方案**:
1. **用户未登录**
   - WebSocket需要认证，确保你已登录
   - 检查是否有 `auth_token` cookie

2. **前端代码未更新**
   - 清除浏览器缓存（Ctrl+Shift+Delete）
   - 或者硬刷新页面（Ctrl+F5）

3. **CORS问题**
   - 如果使用不同端口访问，确保main.py中的CORS配置包含你的前端地址

### 后端没有WebSocket日志

**检查**:
```bash
# 确认video_router已注册
grep "video_router" server/main.py

# 应该看到:
# from routers import ... video_router
# app.include_router(video_router.router)
```

### 任务不实时更新

**症状**: 任务提交后需要手动刷新才能看到

**检查**:
1. 确认WebSocket连接已建立（看到 `✅ [Sora WS] WebSocket连接已建立`）
2. 确认每2秒收到 `tasks_update` 消息
3. 检查浏览器Console是否有JavaScript错误

## 🎯 性能对比

### 之前的HTTP轮询方案
- ❌ 每2秒发送一次HTTP请求
- ❌ 即使没有变化也要查询数据库
- ❌ 需要手动处理轮询逻辑

### 现在的WebSocket方案
- ✅ 建立一次连接，持续推送
- ✅ 服务器端统一管理推送
- ✅ 更低的网络开销
- ✅ 更快的响应速度

## 📊 监控WebSocket性能

在浏览器Console中执行：
```javascript
// 查看当前连接状态
console.log('WebSocket状态:',
  wsRef.current?.readyState === 0 ? '连接中' :
  wsRef.current?.readyState === 1 ? '已连接' :
  wsRef.current?.readyState === 2 ? '关闭中' :
  wsRef.current?.readyState === 3 ? '已关闭' : '未知'
)
```

## ✅ 测试检查清单

- [ ] 页面加载时WebSocket自动连接
- [ ] 连接成功后立即收到初始任务列表
- [ ] 每2秒收到一次任务更新
- [ ] 提交新任务后无需刷新即可看到
- [ ] 任务状态变化时显示通知
- [ ] 关闭页面时WebSocket自动断开
- [ ] 重新打开页面时WebSocket自动重连
- [ ] 断网后恢复时自动重连

## 🚀 下一步优化建议

1. **只推送变化的任务**：目前每2秒推送全量任务，可以优化为只推送有变化的任务
2. **增量更新**：前端可以做差异比对，只更新变化的卡片
3. **心跳优化**：将ping/pong频率调整为更合理的值
4. **错误恢复**：增加更完善的错误处理和重试机制

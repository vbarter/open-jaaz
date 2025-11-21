# Canvas Chat 重复调用问题最终修复方案

## 问题现象

- handleCanvasChat 被调用 2 次
- 相同的事件（相同 fileId 和 timestamp）被处理两次
- 导致后端收到重复请求

## 根本原因

### 1. React StrictMode

- 在开发环境下，React.StrictMode 会故意双重渲染组件
- 导致 useEffect 执行两次，事件监听器被注册两次
- 每个监听器实例都有独立的 closure 和 state

### 2. 原有去重机制失效

- 两个监听器几乎同时执行
- 各自的`processingRef`和`lastEventRef`是独立的
- 无法感知彼此的存在

## 实施的解决方案

### 1. 全局事件处理 Map

```typescript
// 全局事件处理记录，防止StrictMode导致的重复处理
const globalEventProcessing = new Map<string, boolean>()
```

### 2. 事件唯一标识

```typescript
const eventKey = `${data.fileId}_${data.timestamp}`
```

### 3. 多层防护机制

#### 第一层：全局 Map 检查

```typescript
if (globalEventProcessing.get(eventKey)) {
  // console.warn('[ChatCanvasHandler] 事件已在全局处理中，忽略重复:', eventKey)
  return
}
```

#### 第二层：本地重复检查

```typescript
if (
  lastEventRef.current &&
  lastEventRef.current.timestamp === data.timestamp &&
  lastEventRef.current.fileId === data.fileId
) {
  // console.warn('[ChatCanvasHandler] 忽略重复事件（本地检查）')
  return
}
```

#### 第三层：并发控制

```typescript
if (processingRef.current) {
  // console.warn('[ChatCanvasHandler] 已有请求正在处理，忽略新请求')
  return
}
```

### 4. 清理机制

```typescript
const cleanupEventProcessing = () => {
  processingRef.current = false
  globalEventProcessing.delete(eventKey)
  // console.log('[ChatCanvasHandler] 清理事件处理标志:', eventKey)
}

// 5秒后自动清理（防止内存泄漏）
const cleanupTimer = setTimeout(() => {
  if (globalEventProcessing.has(eventKey)) {
    cleanupEventProcessing()
  }
}, 5000)
```

### 5. 调试日志增强

```typescript
// 组件挂载/卸载日志
const instanceId = `ChatCanvasHandler_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
// console.log('[ChatCanvasHandler] 组件挂载，注册事件监听器:', {
//   instanceId,
//   sessionId,
//   canvasId,
//   timestamp: new Date().toISOString(),
// })
```

## 关键改进点

1. **全局状态管理**: 使用模块级别的 Map 而不是组件内 state
2. **事件唯一性**: 通过 fileId+timestamp 组合确保唯一
3. **自动清理**: 防止内存泄漏
4. **错误恢复**: 确保错误时也能清理标志
5. **详细日志**: 便于问题追踪

## 测试验证

### 测试场景

1. 单次 Canvas 聊天操作
2. 快速连续多次操作
3. 网络错误情况
4. 未登录状态

### 预期结果

- 每个事件只处理一次
- 控制台显示"事件已在全局处理中"警告
- 后端只收到一次请求

## 生产环境注意事项

1. **禁用 StrictMode**（可选）

   ```tsx
   // main.tsx
   // 生产环境可以考虑移除StrictMode
   ```

2. **监控内存使用**

   - 全局 Map 会保存事件标志 5 秒
   - 高频操作时注意内存占用

3. **日志级别调整**
   - 生产环境可降低日志详细度
   - 保留关键错误日志

## 性能影响

- 增加了 Map 查找操作：O(1)
- 增加了 setTimeout：每个事件一个 timer
- 总体影响：可忽略不计

## 后续优化建议

1. **使用 WeakMap**

   - 如果有合适的对象作为 key
   - 自动垃圾回收

2. **事件队列**

   - 实现真正的事件队列
   - 顺序处理，避免并发

3. **单例模式**
   - 确保 ChatCanvasHandler 只有一个实例
   - 使用 Context 或其他状态管理

## 总结

通过全局 Map 和多层防护机制，成功解决了 React StrictMode 导致的事件重复处理问题，确保每个 Canvas 聊
天事件只被处理一次。

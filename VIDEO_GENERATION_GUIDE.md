# 视频生成功能使用指南

## 功能概述

视频生成功能允许用户通过文字描述生成视频，并自动添加到画布中。视频不会上传到腾讯云，而是直接通过URL在前端渲染。

## 实现架构

### 后端处理流程

1. **意图识别** - 检测用户输入是否包含视频生成请求
2. **视频生成** - 调用视频生成API（如veo3-fast-frames）
3. **事件发送** - 通过WebSocket发送`video_generated`事件到前端
4. **不上传云端** - 视频直接使用生成的URL，不上传到腾讯云

### 前端渲染流程

1. **接收事件** - 监听`Socket::Session::VideoGenerated`事件
2. **创建元素** - 将视频URL转换为Excalidraw的embeddable元素
3. **渲染显示** - 使用`EmbedElement`组件渲染视频内容
4. **支持多种格式** - 支持MP4、YouTube、Vimeo等多种视频源

## 核心文件

### 后端文件
- `/server/services/new_chat/video_handler.py` - 视频生成处理器
- `/server/services/new_chat/logic_agent.py` - 集成视频生成逻辑
- `/server/services/new_chat/tuzi_llm_service.py` - 视频生成API调用

### 前端文件
- `/react/src/components/canvas/CanvasExcali.tsx` - 画布视频处理
- `/react/src/components/canvas/EmbedElement.tsx` - 通用嵌入内容组件
- `/react/src/components/canvas/VideoElement.tsx` - 视频播放组件

## 测试方法

### 方法1：使用测试脚本

```bash
# 在服务器目录下运行
python test_video_generation.py
```

### 方法2：浏览器控制台测试

在画布页面打开浏览器控制台，执行以下代码：

```javascript
// 加载测试工具
const script = document.createElement('script');
script.src = '/test-video.js';
document.head.appendChild(script);

// 等待加载完成后执行
setTimeout(() => {
  addTestVideo();        // 添加测试视频
  // 或
  simulateVideoGeneration(); // 模拟视频生成事件
  // 或
  addYouTubeVideo();     // 添加YouTube视频
  // 或
  addMultipleVideos();   // 批量添加视频
}, 1000);
```

### 方法3：直接测试

在控制台执行以下代码直接添加视频：

```javascript
// 添加测试视频到画布
const videoUrl = 'https://www.w3schools.com/html/mov_bbb.mp4';
const element = {
  id: `video_${Date.now()}`,
  type: 'embeddable',
  x: 100,
  y: 100,
  width: 640,
  height: 360,
  link: videoUrl,
  locked: false,
  isDeleted: false,
  groupIds: [],
  strokeColor: '#000000',
  backgroundColor: 'transparent',
  fillStyle: 'solid',
  strokeWidth: 1,
  strokeStyle: 'solid',
  roughness: 1,
  opacity: 100,
  angle: 0,
  seed: Math.floor(Math.random() * 1000000),
  version: 1,
  versionNonce: Math.floor(Math.random() * 1000000),
  boundElements: [],
  updated: Date.now(),
  frameId: null,
  index: null,
  customData: {}
};

if (window.excalidrawAPI) {
  const api = window.excalidrawAPI;
  const currentElements = api.getSceneElements();
  api.updateScene({
    elements: [...currentElements, element]
  });
  console.log('✅ 视频已添加到画布');
}
```

## 支持的视频类型

### 直接视频文件
- MP4 (`.mp4`)
- WebM (`.webm`)
- OGG (`.ogg`)
- MOV (`.mov`)

### 视频平台
- YouTube (`youtube.com`, `youtu.be`)
- Vimeo (`vimeo.com`)
- 腾讯视频 (`v.qq.com`)
- Bilibili (`bilibili.com`)

### 其他
- 任何可嵌入的iframe链接
- Blob URLs (本地视频)

## 常见问题

### Q: 为什么视频没有显示？
A: 检查以下几点：
1. 确保视频URL可访问
2. 检查浏览器控制台是否有错误
3. 确认画布组件已正确加载

### Q: 如何调整视频大小？
A: 视频元素创建后可以像其他Excalidraw元素一样调整大小和位置。

### Q: 视频会自动播放吗？
A: 默认情况下，视频需要用户交互才会播放（鼠标悬停或点击）。

### Q: 视频数据存储在哪里？
A: 视频URL存储在画布数据中，实际视频文件保存在原始服务器上，不会上传到腾讯云。

## 开发调试

### 启用调试日志

在浏览器控制台查看视频相关日志：
- `🎥` - 视频添加操作
- `🎬` - 视频元素创建
- `👇` - 视频事件处理
- `✅` - 操作成功
- `❌` - 错误信息

### 后端日志

查看服务器日志中的视频生成相关信息：
```bash
tail -f server.log | grep -E "视频|video|Video|VIDEO"
```

## 注意事项

1. **跨域问题** - 某些视频源可能有CORS限制
2. **性能考虑** - 避免在单个画布中添加过多视频
3. **网络要求** - 视频播放需要稳定的网络连接
4. **浏览器兼容性** - 建议使用Chrome、Firefox或Safari最新版本

## 未来优化

- [ ] 支持视频预览缩略图
- [ ] 添加视频控制条
- [ ] 支持视频剪辑功能
- [ ] 视频本地缓存优化
- [ ] 支持更多视频平台
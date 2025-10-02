# FFmpeg视频拼接优化说明

## 测试结果

### 测试目录
- 路径: `/Users/caijunjie/Dev/open-jaaz/server/img2video/anonymous/0bcbc27e119d`
- 帧数: **21个图片帧** (frame_000.png ~ frame_020.png)

### 帧率对比测试

| 帧率 | 视频时长 | 文件大小 | 说明 |
|-----|---------|---------|------|
| 1fps | 21.00秒 | 5.60MB | 太慢 |
| 2fps | 10.50秒 | 4.19MB | 偏慢 |
| **5fps** | **4.20秒** | **2.81MB** | ⭐ **推荐** |
| 10fps | 2.10秒 | 2.08MB | 偏快 |
| 12fps | 1.75秒 | 1.92MB | 太快 |

### 质量对比测试

| 配置 | 文件大小 | 编码时间 | 说明 |
|-----|---------|---------|------|
| 基本拼接 | 2.81MB | 快 | 标准质量 |
| 带padding | 2.81MB | 快 | 推荐使用 ✅ |
| 高质量编码 | 5.22MB | 慢 | 质量提升不明显 |

## 最终方案

### 移除转场效果

**原因**:
- ❌ minterpolate转场效果不理想
- ❌ 增加处理时间（+3-5秒）
- ❌ 增大文件大小（+140%）
- ❌ 对于静态图片序列效果不明显

**改进**:
- ✅ 使用基本拼接
- ✅ 保持5fps帧率
- ✅ 只添加padding确保尺寸符合H.264要求

### 推荐配置

```python
# 最优ffmpeg命令
ffmpeg -framerate 5 \
  -i frame_%03d.png \
  -c:v libx264 \
  -pix_fmt yuv420p \
  -vf "pad=ceil(iw/2)*2:ceil(ih/2)*2" \
  -y output.mp4
```

**参数说明**:
- `-framerate 5`: 5fps（5张图片 = 1秒）
- `-i frame_%03d.png`: 输入文件模式
- `-c:v libx264`: H.264编码
- `-pix_fmt yuv420p`: 兼容性好的像素格式
- `-vf "pad=ceil(iw/2)*2:ceil(ih/2)*2"`: 确保宽高是偶数
- `-y`: 覆盖输出文件

## 时长计算公式

```
视频时长（秒） = 总帧数 ÷ 帧率

例如：
- 21帧 ÷ 5fps = 4.2秒 ✅
- 10帧 ÷ 5fps = 2.0秒
- 25帧 ÷ 5fps = 5.0秒
```

**反推公式**（根据目标时长计算需要的帧数）:
```
需要的帧数 = 目标秒数 × 5

例如：
- 1秒视频 = 5帧
- 5秒视频 = 25帧
- 10秒视频 = 50帧
```

## 代码改进

### 简化前（有转场效果）

```python
# 复杂的滤镜链
video_filter = "pad=ceil(iw/2)*2:ceil(ih/2)*2"
if enable_transitions:
    transition_fps = frame_rate * 5
    video_filter = f"{video_filter},minterpolate=fps={transition_fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir"

# 复杂的时长计算
if enable_transitions:
    probe_cmd = [...]  # 需要ffprobe获取实际时长
    duration_seconds = float(probe_result.stdout.strip())
else:
    duration_seconds = total_frames / frame_rate
```

### 简化后（无转场效果）

```python
# 简单的滤镜
cmd = [
    "ffmpeg",
    "-framerate", str(frame_rate),
    "-i", str(frames_dir / "frame_%03d.png"),
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2",
    "-y",
    str(output_video_path)
]

# 简单的时长计算
duration_seconds = total_frames / frame_rate
```

## 测试脚本使用

### 运行测试

```bash
cd /Users/caijunjie/Dev/open-jaaz/server
python3 test_ffmpeg_concat.py
```

### 查看生成的测试视频

```bash
# 列出所有测试视频
ls -lh img2video/anonymous/0bcbc27e119d/test_*.mp4

# 播放测试视频
open img2video/anonymous/0bcbc27e119d/test_padding.mp4
```

### 测试结果位置

```
img2video/anonymous/0bcbc27e119d/
├── test_basic.mp4          # 基本拼接
├── test_padding.mp4        # 带padding（推荐）
├── test_high_quality.mp4   # 高质量编码
├── test_fps_1.mp4          # 1fps测试
├── test_fps_2.mp4          # 2fps测试
├── test_fps_5.mp4          # 5fps测试 ⭐
├── test_fps_10.mp4         # 10fps测试
└── test_fps_12.mp4         # 12fps测试
```

## 性能对比

### 处理时间

| 配置 | 处理时间 | 说明 |
|-----|---------|------|
| 基本拼接 | ~1秒 | 最快 |
| 带padding | ~1秒 | 推荐 ✅ |
| 带转场效果 | ~5秒 | 已移除 |

### 文件大小（21帧示例）

| 配置 | 文件大小 | 压缩率 |
|-----|---------|--------|
| 原始PNG总大小 | ~24MB | - |
| 基本拼接 | 2.81MB | 88% ↓ |
| 带转场效果 | 6.5MB | 73% ↓ |

## 最佳实践

### 推荐场景配置

| 场景 | num_frames | 预期时长 | 说明 |
|-----|-----------|---------|------|
| 快速测试 | 4 | 1秒 | 验证效果 |
| 社交媒体短视频 | 9 | 2秒 | Instagram |
| 标准演示 | 24 | 5秒 | 完整展示 ⭐ |
| 详细讲解 | 49 | 10秒 | 深度体验 |

### API调用示例

**生成5秒视频**:
```bash
curl -X POST http://127.0.0.1:8000/api/img_video_1 \
  -H "Content-Type: application/json" \
  -d '{
    "image": "https://example.com/image.jpg",
    "mode": "zoom-in",
    "num_frames": 24
  }'

# 结果：25帧 ÷ 5fps = 5.0秒
```

## 响应数据

```json
{
  "video_url": "https://magicart-user-xxx.cos.accelerate.myqcloud.com/videos/xxx.mp4",
  "num_frames": 25,
  "duration_seconds": 5.0,
  "frame_rate": 5,
  "status": "success"
}
```

**注意**: 移除了 `enable_transitions` 字段

## 技术要点

### 为什么5fps？

1. **视觉流畅度**: 5fps对于图片序列展示已足够流畅
2. **精准时长**: 便于计算（5帧=1秒）
3. **文件大小**: 在质量和大小间取得平衡
4. **兼容性**: 所有设备都能流畅播放

### 为什么要padding？

H.264编码要求视频宽度和高度必须是偶数：
```
原始尺寸: 2239×1494 ❌ (宽度是奇数)
padding后: 2240×1494 ✅ (宽度变成偶数)
```

### 不使用转场的原因

1. **静态图片序列**不需要运动补偿
2. **nano-banana生成的图片**变化已经足够平滑
3. **minterpolate**更适合视频帧间插值，不适合静态图片

## 故障排查

### 视频无法播放

**检查**:
```bash
# 查看视频信息
ffprobe -v error -show_format output.mp4

# 验证编码格式
ffprobe -v error -show_streams output.mp4
```

### 时长不对

**原因**: 帧文件缺失或命名错误

**检查**:
```bash
# 查看帧文件
ls -1 frames/frame_*.png | wc -l

# 验证命名格式
ls frames/frame_*.png
```

## 后续优化方向

- [ ] 支持自定义帧率（API参数）
- [ ] 支持高质量模式选项
- [ ] 添加淡入淡出效果（简单滤镜）
- [ ] 支持添加背景音乐
- [ ] 批处理优化

## 相关文件

- 测试脚本: `test_ffmpeg_concat.py`
- 服务代码: `services/video_generation_service.py`
- 路由代码: `routers/video_router.py`
- API文档: `VIDEO_GENERATION_README.md`

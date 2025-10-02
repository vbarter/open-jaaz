# 英文字体优化方案 - 确保单行显示

## 问题
英文 "Hello, Creative Studio!" 在移动端显示成两行

## 解决方案

### LanguageAwareTextFlip 组件优化

#### 1. 更小的英文字体大小
```tsx
// 英文字体大小（更小）
"text-sm",               // < 360px (14px)
"min-[360px]:text-base", // 360px+ (16px)
"min-[390px]:text-lg",   // 390px+ (18px)
"min-[430px]:text-xl",   // 430px+ (20px)
"sm:text-2xl",           // 640px+ (24px)
```

#### 2. 添加 whitespace-nowrap
强制单行显示，防止换行

#### 3. 减小动画位移
从 y: 10 减小到 y: 8，使动画更流畅

## 字体大小对比表

### 英文模式
| 设备宽度 | 字体大小 | 像素值 | 适用设备 |
|---------|---------|--------|----------|
| < 360px | text-sm | 14px | 超小屏幕 |
| 360px+ | text-base | 16px | 小型手机 |
| 390px+ | text-lg | 18px | iPhone 12/13 |
| 430px+ | text-xl | 20px | iPhone Pro Max |
| 640px+ | text-2xl | 24px | 平板 |

### 中文模式（保持不变）
| 设备宽度 | 字体大小 | 像素值 | 适用设备 |
|---------|---------|--------|----------|
| < 375px | text-lg | 18px | 小型手机 |
| 375px+ | text-xl | 20px | iPhone SE |
| 414px+ | text-2xl | 24px | iPhone Plus |
| 640px+ | text-3xl | 30px | 平板 |

## 实际效果

### iPhone 14 Pro (393px)
- 英文: `Hello, Celestial Canvas!` → text-lg (18px) ✅
- 中文: `你好，魔法画布！` → text-xl (20px) ✅

### iPhone SE (375px)
- 英文: `Hello, Creative Studio!` → text-base (16px) ✅
- 中文: `你好，创意工坊！` → text-xl (20px) ✅

## 关键优化点

1. **英文比中文小 2-4px**
   - 确保长词汇不溢出
   - 保持视觉平衡

2. **强制单行**
   - 使用 `whitespace-nowrap`
   - 防止任何情况下换行

3. **渐进式增大**
   - 多个断点，平滑过渡
   - 根据设备宽度逐步增大

## 测试文件
- `test-english-sizes.html` - 测试英文字体大小

## 总结

通过以下优化确保英文单行显示：
- ✅ 英文字体从 text-sm 开始（14px）
- ✅ 添加 whitespace-nowrap 防止换行
- ✅ 多个断点确保适配各种设备
- ✅ 中英文差异化处理，各自优化
# 语言感知的文字翻转方案

## 问题分析
- 英文词汇较长（如 "Celestial Canvas"）在移动端显示拥挤
- 中英文字符宽度不同，需要不同的字体大小策略

## 解决方案：LanguageAwareTextFlip 组件

### 核心特性
1. **自动检测语言**：根据 i18n 当前语言调整字体
2. **差异化字体大小**：英文比中文小一级
3. **保持单行显示**：所有设备都不换行

### 字体大小对比

#### 英文模式（更小）
```tsx
"text-base",             // < 375px (16px)
"min-[375px]:text-lg",   // 375px+ (18px)
"min-[414px]:text-xl",   // 414px+ (20px)
"min-[480px]:text-2xl",  // 480px+ (24px)
```

#### 中文模式（正常）
```tsx
"text-lg",               // < 375px (18px)
"min-[375px]:text-xl",   // 375px+ (20px)
"min-[414px]:text-2xl",  // 414px+ (24px)
"sm:text-3xl",           // 640px+ (30px)
```

### 使用方式
```tsx
<LanguageAwareTextFlip
  prefix={t('home:titlePrefix')}
  words={t('home:flipWords')}
  suffix={t('home:titleSuffix')}
  duration={3000}
  className='mb-6'
/>
```

## 效果对比

### iPhone 14 Pro (393px)

#### 英文
```
Hello, Celestial Canvas!    [text-lg: 18px]
```

#### 中文
```
你好，魔法画布！            [text-xl: 20px]
```

### iPhone 14 Pro Max (428px)

#### 英文
```
Hello, Creative Studio!     [text-xl: 20px]
```

#### 中文
```
你好，创意工坊！           [text-2xl: 24px]
```

## 优势

1. **自动适配**：无需手动判断语言
2. **视觉平衡**：英文较小避免溢出，中文正常保持清晰
3. **统一体验**：两种语言都保持单行显示
4. **平滑切换**：语言切换时自动调整

## 技术实现

```tsx
const { i18n } = useTranslation()
const isEnglish = i18n.language.startsWith('en')

// 根据语言选择不同的字体大小策略
const getFontSizeClasses = () => {
  if (isEnglish) {
    // 英文使用更小的字体
  } else {
    // 中文使用正常字体
  }
}
```

## 总结

通过语言感知的字体大小调整：
- ✅ 英文长词汇不再溢出
- ✅ 中文保持清晰易读
- ✅ 所有设备单行显示
- ✅ 自动适配不同语言
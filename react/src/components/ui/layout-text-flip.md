# LayoutTextFlip 组件文档

基于 Aceternity UI 风格的文字翻转动画组件，用于创建动态的标题效果。

## 基础用法

```tsx
import { LayoutTextFlip } from '@/components/ui/layout-text-flip'

function Example() {
  return (
    <LayoutTextFlip
      text="Welcome to "
      words={["MagicArt!", "Creative Space!", "Art Studio!"]}
      duration={3000}
    />
  )
}
```

## Props 说明

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| text | string | 必需 | 静态文本，显示在翻转词汇之前 |
| words | string[] | 必需 | 要循环显示的词汇数组 |
| duration | number | 3000 | 词汇切换间隔（毫秒） |
| className | string | - | 容器的自定义样式类 |
| textClassName | string | - | 静态文本的样式类 |
| wordClassName | string | - | 翻转词汇的样式类 |

## 高级版本

```tsx
import { LayoutTextFlipAdvanced } from '@/components/ui/layout-text-flip'

function AdvancedExample() {
  return (
    <LayoutTextFlipAdvanced
      text="Build Amazing "
      words={["Landing Pages", "Component Blocks", "Page Sections"]}
      duration={3000}
      animationType="spring" // 'spring' | 'tween' | 'inertia'
    />
  )
}
```

## 动画类型说明

- **spring**: 弹簧动画，自然流畅的过渡效果
- **tween**: 补间动画，线性平滑的过渡
- **inertia**: 惯性动画，带有物理感的运动

## 样式定制示例

### 渐变色文字
```tsx
<LayoutTextFlip
  text="Hello "
  words={["World!", "Developer!", "Designer!"]}
  wordClassName="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent"
/>
```

### 自定义字体大小
```tsx
<LayoutTextFlip
  text="Welcome to "
  words={["Our Platform", "The Future", "Innovation"]}
  textClassName="text-2xl md:text-4xl"
  wordClassName="text-2xl md:text-4xl"
/>
```

### 暗色模式适配
```tsx
<LayoutTextFlip
  text="Explore "
  words={["Creativity", "Innovation", "Design"]}
  className="text-gray-900 dark:text-white"
  wordClassName="text-blue-600 dark:text-blue-400"
/>
```

## 在多语言环境中使用

```tsx
import { useTranslation } from 'react-i18next'

function I18nExample() {
  const { t } = useTranslation()

  return (
    <LayoutTextFlip
      text={t('home:titlePrefix')}
      words={t('home:flipWords', { returnObjects: true })}
      duration={3000}
    />
  )
}
```

## 性能优化建议

1. **词汇数量**: 建议控制在 3-6 个词汇，过多会影响用户体验
2. **切换时间**: 2500-3500ms 是较好的间隔，太快会让用户看不清
3. **词汇长度**: 尽量保持词汇长度相近，避免布局跳动

## 常见问题

### Q: 如何防止布局跳动？
A: 组件内部已经通过占位元素处理了这个问题，会自动使用最长词汇的宽度作为容器宽度。

### Q: 如何调整动画速度？
A: 修改 `duration` 属性控制词汇切换间隔，动画过渡速度在组件内部优化过。

### Q: 支持 RTL 语言吗？
A: 支持，组件会自动适配 RTL 布局。
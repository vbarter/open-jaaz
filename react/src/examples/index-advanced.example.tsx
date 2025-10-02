// 使用 LayoutTextFlipAdvanced 高级版本的示例
// 这个版本有更多动画效果和下划线动画

import { LayoutTextFlipAdvanced } from '@/components/ui/layout-text-flip'

// 在首页中使用：
<div className='mb-6 text-center'>
  <LayoutTextFlipAdvanced
    text={t('home:titlePrefix')}
    words={t('home:flipWords', { returnObjects: true }) as string[]}
    duration={3000}
    animationType='spring' // 可选: 'spring' | 'tween' | 'inertia'
    className='text-gray-800 dark:text-white drop-shadow-sm'
    textClassName='text-3xl sm:text-4xl md:text-5xl lg:text-6xl'
    wordClassName='text-3xl sm:text-4xl md:text-5xl lg:text-6xl'
  />
</div>

// 不同动画类型的效果：
// - spring: 弹簧动画，自然流畅
// - tween: 补间动画，线性过渡
// - inertia: 惯性动画，有物理感
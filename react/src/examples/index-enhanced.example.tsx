// 这是一个使用增强版 TextFlip 的示例
// 将此代码替换到 index.tsx 的标题部分即可使用增强版效果

import EnhancedTextFlip from '@/components/home/EnhancedTextFlip'

// 在组件中使用：
<h1 className='text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 text-center
               text-gray-800 dark:text-white drop-shadow-sm leading-tight flex items-center justify-center flex-wrap'>
  <span className='mr-2'>{t('home:titlePrefix')}</span>
  <EnhancedTextFlip
    words={t('home:flipWords', { returnObjects: true }) as string[]}
    duration={2500}
    animationStyle='flip'  // 可尝试: 'slide', 'fade', 'scale'
    showGlow={true}
    showCursor={true}
    className='bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 dark:from-blue-400 dark:via-purple-400 dark:to-pink-400 bg-clip-text text-transparent inline-block'
    cursorClassName='bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400'
  />
  <span className='ml-1'>{t('home:titleSuffix')}</span>
</h1>
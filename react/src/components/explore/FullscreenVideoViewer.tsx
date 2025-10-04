import React, { useState, useRef, useEffect, useCallback } from 'react'
import { X, Volume2, VolumeX, Eye, Heart, User, Share2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { generateAvatarUrl } from '@/utils/avatarUtils'
import { createShare, recordVideoView, toggleVideoLike } from '@/api/sora'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useConfigs } from '@/contexts/configs'

interface VideoData {
  id: string
  shareId?: string
  videoUrl: string
  prompt: string
  views: number
  likes: number
  userUuid: string
  userImageUrl?: string
  isLiked: boolean
}

interface FullscreenVideoViewerProps {
  videos: VideoData[]
  initialIndex: number
  onClose: () => void
  onLikeChange?: (videoId: string, isLiked: boolean, newLikes: number) => void
}

export const FullscreenVideoViewer: React.FC<FullscreenVideoViewerProps> = ({
  videos,
  initialIndex,
  onClose,
  onLikeChange,
}) => {
  const { t } = useTranslation('explore')
  const { setShowLoginDialog } = useConfigs()
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const isMobileDevice = typeof navigator !== 'undefined' && /iPad|iPhone|iPod|Android/i.test(navigator.userAgent)
  const [isMuted, setIsMuted] = useState(true) // 默认静音，保证移动端自动播放
  const [isPortrait, setIsPortrait] = useState(window.innerHeight > window.innerWidth) // 检测是否竖屏
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchEnd, setTouchEnd] = useState<number | null>(null)
  const [showHint, setShowHint] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false) // 是否在切换中
  const [videoStates, setVideoStates] = useState<Map<number, 'loading' | 'ready' | 'error'>>(new Map())
  const videoStatesRef = useRef(videoStates)
  const [isOnline, setIsOnline] = useState(navigator.onLine) // 网络状态
  const transitionTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const hasInitialScroll = useRef(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map())
  const playPromiseRefs = useRef<Map<number, Promise<void>>>(new Map()) // 跟踪播放Promise
  const lastSwipeTime = useRef<number>(0) // 最后一次滑动时间
  const consecutiveErrors = useRef<number>(0) // 连续错误计数
  const maxConsecutiveErrors = 3 // 最大连续错误次数
  const shareCacheRef = useRef<Map<string, string>>(new Map()) // 缓存已创建的分享ID
  const isCreatingShareRef = useRef(false)

  const currentVideo = videos[currentIndex]

  // 最小滑动距离（px）
  const minSwipeDistance = 50
  // 最小滑动间隔（ms）- 防抖
  const minSwipeInterval = 600
  // 错误提示显示时长（ms）
  const errorDisplayDuration = 2000

  // 处理触摸开始
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientY)
  }

  // 处理触摸移动
  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientY)
  }

  const scheduleTransitionUnlock = useCallback(() => {
    if (transitionTimeoutRef.current) {
      window.clearTimeout(transitionTimeoutRef.current)
    }

    transitionTimeoutRef.current = window.setTimeout(() => {
      setIsTransitioning(false)
      transitionTimeoutRef.current = null
    }, 400)
  }, [])

  // 处理触摸结束
  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return

    const now = Date.now()
    const timeSinceLastSwipe = now - lastSwipeTime.current

    // 防抖: 如果距离上次滑动太近,则忽略
    if (timeSinceLastSwipe < minSwipeInterval) {
      console.log('⏰ 滑动太快,已忽略')
      return
    }

    const distance = touchStart - touchEnd
    const isUpSwipe = distance > minSwipeDistance
    const isDownSwipe = distance < -minSwipeDistance

    if (isUpSwipe && currentIndex < videos.length - 1) {
      // 向上滑动 - 下一个视频
      lastSwipeTime.current = now
      setIsTransitioning(true)
      scheduleTransitionUnlock()
      setCurrentIndex(prev => prev + 1)
    }

    if (isDownSwipe && currentIndex > 0) {
      // 向下滑动 - 上一个视频
      lastSwipeTime.current = now
      setIsTransitioning(true)
      scheduleTransitionUnlock()
      setCurrentIndex(prev => prev - 1)
    }
  }

  // 静音切换
  const toggleMute = useCallback(() => {
    const video = videoRefs.current.get(currentIndex)
    if (video) {
      video.muted = !video.muted
      setIsMuted(video.muted)
    }
  }, [currentIndex])

  // 关闭全屏
  const handleClose = useCallback(() => {
    // 暂停所有视频并清理
    videoRefs.current.forEach((video, index) => {
      const playPromise = playPromiseRefs.current.get(index)
      if (playPromise) {
        playPromise.catch(() => {}).finally(() => {
          video.pause()
          video.currentTime = 0
        })
      } else {
        video.pause()
        video.currentTime = 0
      }
    })

    // 清理所有Promise引用
    playPromiseRefs.current.clear()

    onClose()
  }, [onClose])

  // 点赞切换
  const handleLikeToggle = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()

      const video = currentVideo
      if (!video) return

      try {
        const result = await toggleVideoLike(parseInt(video.id))
        if (result.success && onLikeChange) {
          onLikeChange(video.id, result.is_liked, result.likes)
        }
      } catch (error) {
        console.error('切换点赞失败:', error)
      }
    },
    [currentVideo, onLikeChange]
  )

  // 分享功能
  const handleShare = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()

    const video = currentVideo
    if (!video) return

    let shareIdentifier = video.shareId || shareCacheRef.current.get(video.id)

    if (!shareIdentifier && !isCreatingShareRef.current) {
      const numericId = parseInt(video.id)
      if (Number.isNaN(numericId)) {
        console.error('无法创建分享链接：视频ID无效', video.id)
        toast.error(t('share.failed'))
        return
      }

      try {
        isCreatingShareRef.current = true
        const result = await createShare(numericId)
        shareIdentifier = result.share_id
        shareCacheRef.current.set(video.id, shareIdentifier)
      } catch (error) {
        console.error('创建分享失败:', error)
        const message = error instanceof Error ? error.message : ''
        if (message.includes('401') || message.includes('请先登录')) {
          toast.error(t('share.loginRequired'))
          setShowLoginDialog(true)
        } else {
          toast.error(t('share.failed'))
        }
        return
      } finally {
        isCreatingShareRef.current = false
      }
    }

    shareIdentifier = shareIdentifier || shareCacheRef.current.get(video.id)

    if (!shareIdentifier) {
      toast.error(t('share.failed'))
      return
    }

    const shareUrl = `${window.location.origin}/share?id=${shareIdentifier}`
    const shareText = video.prompt.slice(0, 100)

    if (navigator.share) {
      try {
        await navigator.share({
          title: '精彩视频分享',
          text: shareText,
          url: shareUrl,
        })
        console.log('✅ 分享成功')
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('分享失败:', error)
          toast.error(t('share.failed'))
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl)
        toast.success(t('share.copied'))
      } catch (error) {
        console.error('复制链接失败:', error)
        toast.error(t('share.failed'))
      }
    }
  }, [currentVideo, setShowLoginDialog, t])

  // 更新视频状态
  const updateVideoState = useCallback((index: number, state: 'loading' | 'ready' | 'error') => {
    setVideoStates(prev => {
      const currentState = prev.get(index)
      if (currentState === state) {
        return prev
      }
      const newStates = new Map(prev)
      newStates.set(index, state)
      return newStates
    })
  }, [])

  useEffect(() => {
    videoStatesRef.current = videoStates
  }, [videoStates])

  // 查找下一个可用的视频索引
  const findNextPlayableVideo = useCallback((startIndex: number, direction: 'up' | 'down'): number | null => {
    const step = direction === 'up' ? 1 : -1
    let index = startIndex + step
    let attempts = 0
    const maxAttempts = 5 // 最多尝试5个视频

    while (attempts < maxAttempts) {
      // 检查索引是否有效
      if (index < 0 || index >= videos.length) {
        return null
      }

      // 检查视频状态
      const state = videoStatesRef.current.get(index)
      if (state !== 'error') {
        return index
      }

      index += step
      attempts++
    }

    return null
  }, [videos.length])

  // 安全播放视频
  const playVideo = useCallback(async (index: number, autoSkip: boolean = false): Promise<boolean> => {
    const video = videoRefs.current.get(index)
    if (!video) return false

    try {
      updateVideoState(index, 'loading')

      // 等待之前的播放Promise完成
      const previousPromise = playPromiseRefs.current.get(index)
      if (previousPromise) {
        await previousPromise.catch(() => {}) // 忽略错误
      }

      // 确保视频已加载
      if (video.readyState < 2) {
        await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            cleanup()
            reject(new Error('视频加载超时'))
          }, isMobileDevice ? 20000 : 12000) // 移动端延长等待时间

          const onLoadedData = () => {
            cleanup()
            resolve(undefined)
          }

          const onError = () => {
            cleanup()
            reject(new Error('视频加载失败'))
          }

          const cleanup = () => {
            clearTimeout(timeoutId)
            video.removeEventListener('loadeddata', onLoadedData)
            video.removeEventListener('error', onError)
          }

          video.addEventListener('loadeddata', onLoadedData)
          video.addEventListener('error', onError)
          video.load()
        })
      }

      // 开始播放
      const playPromise = video.play()
      playPromiseRefs.current.set(index, playPromise)

      await playPromise
      playPromiseRefs.current.delete(index)
      updateVideoState(index, 'ready')

      // 播放成功,重置连续错误计数
      consecutiveErrors.current = 0
      return true
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      playPromiseRefs.current.delete(index)

      // 忽略 AbortError (正常的中断)
      if (error.name !== 'AbortError') {
        console.error('视频播放失败:', error)
        updateVideoState(index, 'error')

        // 增加连续错误计数
        consecutiveErrors.current++

        // 如果启用自动跳过且连续错误未超限
        if (autoSkip && consecutiveErrors.current < maxConsecutiveErrors) {
          console.log(`⚠️ 视频${index}播放失败,将自动跳过...`)
          return false
        }
      }
      return false
    }
  }, [updateVideoState, maxConsecutiveErrors, isMobileDevice])

  // 暂停视频
  const pauseVideo = useCallback(async (index: number) => {
    const video = videoRefs.current.get(index)
    if (!video) return

    try {
      // 等待播放Promise完成再暂停
      const playPromise = playPromiseRefs.current.get(index)
      if (playPromise) {
        await playPromise.catch(() => {})
      }

      video.pause()
      video.currentTime = 0
    } catch (err) {
      console.error('视频暂停失败:', err)
    }
  }, [])

  // 当前视频变化时的处理
  useEffect(() => {
    const handleVideoChange = async () => {
      const currentVideoElement = videoRefs.current.get(currentIndex)
      if (!currentVideoElement) return

      console.log(`🔄 [视频切换] 开始切换到视频 ${currentIndex}`)

      // ⭐ 步骤1: 先暂停所有其他视频（确保旧视频完全停止）
      const pausePromises: Promise<void>[] = []
      videoRefs.current.forEach((_, index) => {
        if (index !== currentIndex) {
          pausePromises.push(pauseVideo(index))
        }
      })
      await Promise.all(pausePromises)
      console.log(`✅ [视频切换] 已暂停所有其他视频`)

      // ⭐ 步骤2: 确保当前视频处于初始状态
      currentVideoElement.currentTime = 0
      currentVideoElement.muted = isMuted

      // ⭐ 步骤3: 播放当前视频(启用自动跳过)
      console.log(`▶️ [视频切换] 开始播放视频 ${currentIndex}`)
      const playSuccess = await playVideo(currentIndex, true)

      if (playSuccess) {
        console.log(`✅ [视频切换] 视频 ${currentIndex} 播放成功`)
      } else {
        console.log(`❌ [视频切换] 视频 ${currentIndex} 播放失败`)
      }

      // 如果播放失败,自动跳过到下一个
      if (!playSuccess && consecutiveErrors.current < maxConsecutiveErrors) {
        console.log('🔄 当前视频播放失败,尝试跳过到下一个可播放视频...')

        // 短暂延迟后自动跳过
        setTimeout(() => {
          const lastDirection = currentIndex > (videoRefs.current.size / 2) ? 'down' : 'up'
          const nextIndex = findNextPlayableVideo(currentIndex, lastDirection)

          if (nextIndex !== null) {
            console.log(`✅ 找到下一个可播放视频: ${nextIndex}`)
            setCurrentIndex(nextIndex)
          } else {
            console.log('❌ 没有找到可播放的视频')
            scheduleTransitionUnlock()
          }
        }, errorDisplayDuration) // 显示错误提示2秒后跳过
        scheduleTransitionUnlock()
        return
      }

      // 记录浏览
      if (playSuccess) {
        recordVideoView(parseInt(currentVideo.id)).catch(err => {
          console.error('记录浏览失败:', err)
        })
      }

      // 滚动到当前视频
      if (containerRef.current) {
        const videoHeight = window.innerHeight
        const targetTop = currentIndex * videoHeight
        if (!hasInitialScroll.current) {
          containerRef.current.scrollTop = targetTop
          hasInitialScroll.current = true
        } else {
          containerRef.current.scrollTo({
            top: targetTop,
            behavior: 'smooth',
          })
        }
      }

      // 延迟解除过渡状态
      scheduleTransitionUnlock()
    }

    handleVideoChange()
  }, [currentIndex, currentVideo.id, isMuted, playVideo, pauseVideo, findNextPlayableVideo, maxConsecutiveErrors, errorDisplayDuration, scheduleTransitionUnlock])

  // 阻止默认的滚动行为
  useEffect(() => {
    const preventDefault = (e: Event) => {
      e.preventDefault()
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('touchmove', preventDefault, { passive: false })

    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('touchmove', preventDefault)
    }
  }, [])

  // 智能预加载和内存管理
  useEffect(() => {
    const preloadVideo = (index: number, priority: 'high' | 'medium' | 'low') => {
      const video = videoRefs.current.get(index)
      if (!video) return

      // 只在视频还没加载时才触发预加载
      if (video.readyState < 1 && !video.src.includes('blob:')) {
        // 设置preload属性
        video.preload = priority === 'high' ? 'auto' : 'metadata'

        // 根据优先级延迟加载
        const delay = priority === 'high' ? 0 : priority === 'medium' ? 300 : 500
        setTimeout(() => {
          if (video.readyState < 2) {
            video.load()
          }
        }, delay)
      }
    }

    // 清理距离当前视频超过2个位置的视频(释放内存)
    const cleanupVideo = (index: number) => {
      const video = videoRefs.current.get(index)
      if (video && video.readyState > 0) {
        // 暂停并重置
        video.pause()
        video.currentTime = 0
        // 移除已加载的数据
        video.removeAttribute('src')
        video.load()
      }
    }

    // 预加载当前视频(高优先级)
    preloadVideo(currentIndex, 'high')

    // 预加载下一个视频(中优先级)
    if (currentIndex + 1 < videos.length) {
      preloadVideo(currentIndex + 1, 'medium')
    }

    // 预加载上一个视频(低优先级)
    if (currentIndex - 1 >= 0) {
      preloadVideo(currentIndex - 1, 'low')
    }

    // 清理远离的视频
    videoRefs.current.forEach((_, index) => {
      const distance = Math.abs(index - currentIndex)
      if (distance > 2) {
        cleanupVideo(index)
      }
    })
  }, [currentIndex, videos.length])

  // 3秒后隐藏提示
  // 监听网络状态变化和屏幕方向变化
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      console.log('✅ 网络已连接')
    }

    const handleOffline = () => {
      setIsOnline(false)
      console.log('❌ 网络已断开')
    }

    const handleOrientationChange = () => {
      setIsPortrait(window.innerHeight > window.innerWidth)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('resize', handleOrientationChange)
    window.addEventListener('orientationchange', handleOrientationChange)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('resize', handleOrientationChange)
      window.removeEventListener('orientationchange', handleOrientationChange)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) {
        window.clearTimeout(transitionTimeoutRef.current)
        transitionTimeoutRef.current = null
      }
      hasInitialScroll.current = false
    }
  }, [])

  // 优先使用真实头像
  const getAvatarUrl = (video: VideoData) => {
    return video.userImageUrl || generateAvatarUrl(video.userUuid, 'avataaars')
  }

  return (
    <div className='fixed inset-0 z-50 bg-black'>
      {/* 顶部控制栏 - 无背景 */}
      <div className='absolute top-0 left-0 right-0 z-50 flex items-center justify-between p-4'>
        {/* 关闭按钮 - 无背景 */}
        <button
          onClick={handleClose}
          className='w-10 h-10 flex items-center justify-center rounded-full hover:scale-110 transition-transform active:scale-95'
        >
          <X className='w-7 h-7 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]' />
        </button>

        {/* 静音按钮 - 无背景 */}
        <button
          onClick={toggleMute}
          className='w-10 h-10 flex items-center justify-center rounded-full hover:scale-110 transition-transform active:scale-95'
        >
          {isMuted ? (
            <VolumeX className='w-6 h-6 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]' />
          ) : (
            <Volume2 className='w-6 h-6 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]' />
          )}
        </button>
      </div>

      {/* 网络离线提示 */}
      {!isOnline && (
        <div className='absolute top-20 left-1/2 transform -translate-x-1/2 z-50'>
          <div className='bg-red-500/90 backdrop-blur-sm px-4 py-2 rounded-lg flex items-center gap-2'>
            <span className='text-lg'>📡</span>
            <p className='text-white text-sm font-medium'>网络已断开</p>
          </div>
        </div>
      )}

      {/* 连续失败保护提示 */}
      {consecutiveErrors.current >= maxConsecutiveErrors && (
        <div className='absolute top-20 left-1/2 transform -translate-x-1/2 z-50'>
          <div className='bg-yellow-500/90 backdrop-blur-sm px-4 py-2 rounded-lg flex items-center gap-2'>
            <span className='text-lg'>⚠️</span>
            <p className='text-white text-sm font-medium'>连续加载失败,已停止自动跳过</p>
          </div>
        </div>
      )}

      {/* 视频容器 - 支持滑动 */}
      <div
        ref={containerRef}
        className='h-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide'
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {videos.map((video, index) => {
          const isActive = index === currentIndex
          const shouldRender = Math.abs(index - currentIndex) <= 1 // 只渲染当前和相邻视频

          return (
            <div
              key={video.id}
              className='relative w-full h-screen snap-start snap-always flex items-center justify-center'
            >
              {shouldRender ? (
                <>
                  {/* 视频 */}
                  <video
                    ref={(el) => {
                      if (el) {
                        videoRefs.current.set(index, el)
                      } else {
                        videoRefs.current.delete(index)
                      }
                    }}
                    className={cn(
                      'w-full h-full transition-opacity duration-300',
                      isPortrait ? 'object-cover' : 'object-contain',
                      isActive && !isTransitioning ? 'opacity-100' : 'opacity-50'
                    )}
                    loop
                    playsInline
                    webkit-playsinline='true'
                    x5-playsinline='true'
                    x5-video-player-type='h5'
                    preload={isActive ? 'auto' : 'metadata'}
                    muted={isMuted}
                  >
                    <source src={video.videoUrl} type='video/mp4' />
                  </video>

                  {/* 抖音风格布局 */}
                  {/* 左下角 - 头像和提示词（向上移动） */}
                  <div className='absolute bottom-16 left-0 right-20 p-4 pointer-events-none'>
                    {/* 创作者头像 */}
                    <div className='mb-3'>
                      <img
                        src={getAvatarUrl(video)}
                        alt='User avatar'
                        className='w-12 h-12 rounded-full object-cover border-2 border-white/90 shadow-lg pointer-events-auto'
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                          const fallback = e.currentTarget.nextElementSibling
                          if (fallback instanceof HTMLElement) {
                            fallback.classList.remove('hidden')
                          }
                        }}
                      />
                      <div className='hidden w-12 h-12 rounded-full bg-gray-800/80 backdrop-blur-sm flex items-center justify-center border-2 border-white/90 shadow-lg'>
                        <User className='w-6 h-6 text-white' />
                      </div>
                    </div>

                    {/* 提示词 - 无背景 */}
                    <p className='text-white text-sm line-clamp-3 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]'>
                      {video.prompt}
                    </p>
                  </div>

                  {/* 右下角 - 垂直操作栏（抖音风格） */}
                  <div className='absolute bottom-0 right-0 p-4 flex flex-col items-center gap-8'>
                    {/* 点赞按钮 - 无背景 */}
                    <button
                      onClick={handleLikeToggle}
                      className='flex flex-col items-center gap-1 hover:scale-110 transition-transform active:scale-95'
                    >
                      <Heart
                        className={cn(
                          'w-8 h-8 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]',
                          video.isLiked ? 'fill-red-500 text-red-500' : 'text-white'
                        )}
                      />
                      <span className='text-white text-xs font-bold drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]'>
                        {video.likes}
                      </span>
                    </button>

                    {/* 浏览量 - 无背景 */}
                    <div className='flex flex-col items-center gap-1'>
                      <Eye className='w-8 h-8 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]' />
                      <span className='text-white text-xs font-bold drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]'>
                        {video.views}
                      </span>
                    </div>

                    {/* 分享按钮 - 无背景，与头像底部对齐 */}
                    <button
                      onClick={handleShare}
                      className='flex flex-col items-center gap-1 hover:scale-110 transition-transform active:scale-95 mb-16'
                    >
                      <Share2 className='w-8 h-8 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]' />
                    </button>
                  </div>

                  {/* 加载状态 */}
                  {isActive && videoStates.get(index) === 'loading' && (
                    <div className='absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm z-10'>
                      <div className='flex flex-col items-center gap-3'>
                        <div className='w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin' />
                        <p className='text-white text-sm'>加载中...</p>
                      </div>
                    </div>
                  )}

                  {/* 错误状态 */}
                  {isActive && videoStates.get(index) === 'error' && (
                    <div className='absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm z-10'>
                      <div className='flex flex-col items-center gap-3'>
                        <div className='w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center'>
                          <span className='text-3xl'>⚠️</span>
                        </div>
                        <p className='text-white text-sm font-medium'>视频加载失败</p>
                        {consecutiveErrors.current < maxConsecutiveErrors ? (
                          <p className='text-white/70 text-xs'>正在自动跳过...</p>
                        ) : (
                          <div className='flex gap-2'>
                            <button
                              onClick={() => playVideo(index, false)}
                              className='px-4 py-2 bg-white/20 rounded-lg text-white text-sm hover:bg-white/30 transition-colors'
                            >
                              重试
                            </button>
                            <button
                              onClick={() => {
                                const nextIndex = findNextPlayableVideo(index, 'up')
                                if (nextIndex !== null) {
                                  setCurrentIndex(nextIndex)
                                }
                              }}
                              className='px-4 py-2 bg-blue-500/30 rounded-lg text-white text-sm hover:bg-blue-500/40 transition-colors'
                            >
                              下一个
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 滑动提示 */}
                  {index === initialIndex && isActive && showHint && (
                    <div className='absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-500 z-20'>
                      <div className='text-white text-center bg-black/50 backdrop-blur-sm px-4 py-2 rounded-lg animate-bounce'>
                        <p className='text-sm'>{t('fullscreen.swipeHint')}</p>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                // 占位符 - 透明背景
                <div className='w-full h-full bg-transparent flex items-center justify-center'>
                  <div className='text-white text-sm drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]'>加载中...</div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 滚动指示器 - 仅在横屏模式下显示 */}
      {!isPortrait && (
        <div className='absolute right-2 top-1/2 transform -translate-y-1/2 z-50 flex flex-col gap-1.5'>
          {videos.map((_, index) => (
            <div
              key={index}
              className={cn(
                'rounded-full transition-all duration-300',
                index === currentIndex
                  ? 'w-1.5 h-10 bg-white shadow-lg'
                  : 'w-1 h-6 bg-white/20 hover:bg-white/40'
              )}
            />
          ))}
        </div>
      )}

      {/* 添加隐藏滚动条的样式 */}
      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  )
}

export default FullscreenVideoViewer

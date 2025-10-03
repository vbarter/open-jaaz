import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2, Heart, Eye, User, Compass, VolumeX, Volume2, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { getShareVideo, incrementShareView, ShareVideoDetail, toggleVideoLike, getShareShowVideo, getDiscoverVideos, Sora2TaskDetail, getUserLikes } from '@/api/sora'
import { generateAvatarUrl } from '@/utils/avatarUtils'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'

interface VideoData {
  id: string
  videoUrl: string
  prompt: string
  views: number
  likes: number
  userUuid: string
  userImageUrl?: string
  isLiked: boolean
}

export const Route = createFileRoute('/share')({
  component: SharePage,
  validateSearch: (search: Record<string, unknown>): { id?: string } => {
    return {
      id: search.id as string | undefined,
    }
  },
})

function SharePage() {
  const { id: shareId } = Route.useSearch()
  const navigate = useNavigate()
  const { t } = useTranslation('share')
  const [videos, setVideos] = useState<VideoData[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [isMuted, setIsMuted] = useState(true)
  const [isPortrait, setIsPortrait] = useState(window.innerHeight > window.innerWidth)
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchEnd, setTouchEnd] = useState<number | null>(null)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [videoStates, setVideoStates] = useState<Map<number, 'loading' | 'ready' | 'error'>>(new Map())

  const viewIncrementedRef = useRef(false)
  const hasPreloadedRef = useRef(false)
  const useFallbackRef = useRef(false) // 是否使用降级方案（discover接口）
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map())
  const playPromiseRefs = useRef<Map<number, Promise<void>>>(new Map())
  const lastSwipeTime = useRef<number>(0)
  const hasInitialScroll = useRef(false)
  const transitionTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const videosRef = useRef<VideoData[]>([]) // 使用 ref 缓存视频数据
  const isLoadingMoreRef = useRef(false)
  const hasMoreRef = useRef(true)

  const isMobileDevice = typeof navigator !== 'undefined' && /iPad|iPhone|iPod|Android/i.test(navigator.userAgent)

  const minSwipeDistance = 50
  const minSwipeInterval = 600

  const currentVideo = videos[currentIndex]

  // 转换任务到视频对象
  const taskToVideo = useCallback((task: Sora2TaskDetail, isLiked: boolean = false): VideoData => ({
    id: task.id.toString(),
    videoUrl: task.video_url,
    prompt: task.prompt,
    views: task.views ?? 0,
    likes: task.likes ?? 0,
    userUuid: task.user_uuid,
    userImageUrl: task.user_image_url,
    isLiked: isLiked,
  }), [])

  // 静音切换
  const toggleMute = useCallback(() => {
    const video = videoRefs.current.get(currentIndex)
    if (video) {
      video.muted = !video.muted
      setIsMuted(video.muted)
    }
  }, [currentIndex])

  // 点赞切换
  const handleLikeToggle = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!currentVideo) return

      try {
        // 尝试解析为数字ID，如果失败则忽略（分享页面可能没有数字ID）
        const videoId = parseInt(currentVideo.id)
        if (isNaN(videoId)) {
          console.warn('无法点赞：视频ID无效')
          toast.error('该视频暂不支持点赞功能')
          return
        }

        const result = await toggleVideoLike(videoId)
        if (result.success) {
          // 同时更新 ref 和 state
          videosRef.current = videosRef.current.map((v, idx) =>
            idx === currentIndex
              ? { ...v, isLiked: result.is_liked, likes: result.likes }
              : v
          )
          setVideos(prev =>
            prev.map((v, idx) =>
              idx === currentIndex
                ? { ...v, isLiked: result.is_liked, likes: result.likes }
                : v
            )
          )
        }
      } catch (error) {
        console.error('切换点赞失败:', error)
        toast.error('点赞失败，请稍后重试')
      }
    },
    [currentVideo, currentIndex]
  )

  // 分享功能
  const handleShare = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!currentVideo) return

    const shareUrl = window.location.origin + '/share?id=' + currentVideo.id
    const shareText = currentVideo.prompt.slice(0, 100)

    if (navigator.share) {
      try {
        await navigator.share({
          title: t('shareTitle'),
          text: shareText,
          url: shareUrl,
        })
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('分享失败:', error)
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl)
        toast.success(t('linkCopied'))
      } catch (error) {
        console.error('复制链接失败:', error)
      }
    }
  }, [currentVideo, t])

  // 触摸事件处理
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientY)
  }

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

  const onTouchEnd = useCallback(() => {
    if (!touchStart || !touchEnd) return

    const now = Date.now()
    const timeSinceLastSwipe = now - lastSwipeTime.current

    if (timeSinceLastSwipe < minSwipeInterval) {
      console.log('⏰ 滑动太快,已忽略')
      return
    }

    const distance = touchStart - touchEnd
    const isUpSwipe = distance > minSwipeDistance
    const isDownSwipe = distance < -minSwipeDistance

    if (isUpSwipe && currentIndex < videos.length - 1) {
      lastSwipeTime.current = now
      setIsTransitioning(true)
      scheduleTransitionUnlock()
      setCurrentIndex(prev => prev + 1)
    }

    if (isDownSwipe && currentIndex > 0) {
      lastSwipeTime.current = now
      setIsTransitioning(true)
      scheduleTransitionUnlock()
      setCurrentIndex(prev => prev - 1)
    }
  }, [touchStart, touchEnd, currentIndex, videos.length, minSwipeInterval, minSwipeDistance, scheduleTransitionUnlock])

  // 更新视频状态
  const updateVideoState = useCallback((index: number, state: 'loading' | 'ready' | 'error') => {
    setVideoStates(prev => {
      const currentState = prev.get(index)
      if (currentState === state) return prev
      const newStates = new Map(prev)
      newStates.set(index, state)
      return newStates
    })
  }, [])

  // 播放视频
  const playVideo = useCallback(async (index: number): Promise<boolean> => {
    const video = videoRefs.current.get(index)
    if (!video) return false

    try {
      // Only surface the loading state when the browser still needs to fetch data.
      if (video.readyState < 2) {
        updateVideoState(index, 'loading')
      } else {
        updateVideoState(index, 'ready')
      }

      const previousPromise = playPromiseRefs.current.get(index)
      if (previousPromise) {
        await previousPromise.catch(() => {})
      }

      if (video.readyState < 2) {
        await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            cleanup()
            reject(new Error('视频加载超时'))
          }, isMobileDevice ? 20000 : 12000)

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

      const playPromise = video.play()
      playPromiseRefs.current.set(index, playPromise)

      await playPromise
      playPromiseRefs.current.delete(index)
      updateVideoState(index, 'ready')
      return true
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      playPromiseRefs.current.delete(index)

      if (error.name !== 'AbortError') {
        console.error('视频播放失败:', error)
        updateVideoState(index, 'error')
      }
      return false
    }
  }, [updateVideoState, isMobileDevice])

  // 暂停视频
  const pauseVideo = useCallback(async (index: number) => {
    const video = videoRefs.current.get(index)
    if (!video) return

    try {
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

  // 加载下一个随机视频（按需加载，每次只加载一个）
  const loadMoreVideos = useCallback(async () => {
    if (isLoadingMore || !hasMore) {
      console.log('⏸️ [Share] 跳过加载更多:', { isLoadingMore, hasMore })
      return
    }

    setIsLoadingMore(true)
    isLoadingMoreRef.current = true
    try {
      // 如果使用降级方案
      if (useFallbackRef.current) {
        console.log('📋 [Share] 使用降级方案 (discover接口) 加载视频')
        const currentLength = videosRef.current.length

        const response = await getDiscoverVideos({
          limit: 1, // 每次只加载一个
          offset: currentLength,
          sort_by: 'time',
        })

        if (response.tasks.length > 0) {
          const task = response.tasks[0]
          const videoId = parseInt(task.id.toString())

          let isLiked = false
          try {
            const likesResult = await getUserLikes([videoId])
            isLiked = likesResult.liked_video_ids.includes(videoId)
          } catch (error) {
            console.error('获取点赞状态失败:', error)
          }

          const videoData = taskToVideo(task, isLiked)
          videosRef.current.push(videoData)
          setVideos([...videosRef.current])
          const more = currentLength + 1 < response.total
          setHasMore(more)
          hasMoreRef.current = more
          console.log(`✅ [Share] 降级方案加载成功: 视频 ${videoId}`)
        } else {
          setHasMore(false)
          hasMoreRef.current = false
        }
        return
      }

      // 使用随机推荐接口，每次只加载一个视频
      console.log('📋 [Share] 加载下一个随机视频')

      try {
        const randomTask = await getShareShowVideo({})

        if (!randomTask) {
          // 如果是第一次调用就返回null，可能是接口未实现
          if (videosRef.current.length <= 1) {
            console.warn('⚠️ [Share] share_show接口未实现，切换到降级方案')
            useFallbackRef.current = true
            setIsLoadingMore(false)
            isLoadingMoreRef.current = false
            loadMoreVideos()
            return
          }

          console.log('⚠️ [Share] 没有更多可用视频')
          setHasMore(false)
          hasMoreRef.current = false
          return
        }

        const videoId = parseInt(randomTask.id.toString())

        // 获取用户点赞状态
        let isLiked = false
        try {
          const likesResult = await getUserLikes([videoId])
          isLiked = likesResult.liked_video_ids.includes(videoId)
        } catch (error) {
          console.error('获取点赞状态失败:', error)
        }

        const videoData = taskToVideo(randomTask, isLiked)
        videosRef.current.push(videoData)
        setVideos([...videosRef.current])
        console.log(`✅ [Share] 加载随机视频: ${videoId}`)
      } catch (error) {
        console.error('❌ [Share] 加载视频失败:', error)
        setHasMore(false)
        hasMoreRef.current = false
      }
    } catch (error) {
      console.error('加载更多视频失败:', error)
    } finally {
      setIsLoadingMore(false)
      isLoadingMoreRef.current = false
    }
  }, [isLoadingMore, hasMore, taskToVideo])

  useEffect(() => {
    isLoadingMoreRef.current = isLoadingMore
  }, [isLoadingMore])

  useEffect(() => {
    hasMoreRef.current = hasMore
  }, [hasMore])

  const loadMoreVideosRef = useRef(loadMoreVideos)
  useEffect(() => {
    loadMoreVideosRef.current = loadMoreVideos
  }, [loadMoreVideos])

  const handleVideoReady = useCallback((index: number) => {
    if (index !== currentIndex) return
    const video = videoRefs.current.get(index)
    if (!video) return

    video.muted = isMuted
    playVideo(index)
  }, [currentIndex, isMuted, playVideo])

  // 加载初始分享视频
  useEffect(() => {
    const loadInitialVideo = async () => {
      if (!shareId) {
        toast.error(t('invalidLink'))
        setIsLoading(false)
        return
      }

      try {
        const videoData = await getShareVideo(shareId)

        // 如果有id则获取点赞状态，否则默认为未点赞
        let isLiked = false
        if (videoData.id) {
          try {
            const likesResult = await getUserLikes([videoData.id])
            isLiked = likesResult.liked_video_ids.includes(videoData.id)
          } catch (error) {
            console.error('获取点赞状态失败:', error)
          }
        }

        // 转换为VideoData格式（使用share_id作为唯一标识）
        const initialVideo: VideoData = {
          id: videoData.id?.toString() || videoData.share_id,
          videoUrl: videoData.video_url,
          prompt: videoData.prompt,
          views: videoData.views,
          likes: videoData.likes,
          userUuid: videoData.user_uuid,
          userImageUrl: videoData.user_image_url,
          isLiked: isLiked,
        }

        videosRef.current = [initialVideo]
        setVideos([initialVideo])

        // 增加访问量（只调用一次）
        if (!viewIncrementedRef.current) {
          viewIncrementedRef.current = true
          try {
            const result = await incrementShareView(shareId)
            videosRef.current[0] = { ...videosRef.current[0], views: result.views }
            setVideos(prev => prev.map((v, idx) =>
              idx === 0 ? { ...v, views: result.views } : v
            ))
          } catch (error) {
            console.error('❌ [Share] 增加访问量失败:', error)
          }
        }
      } catch (error) {
        console.error('❌ [Share] Load failed:', error)
        toast.error(t('loadFailed'), {
          description:
            error instanceof Error ? error.message : t('notFound'),
        })
      } finally {
        setIsLoading(false)
      }
    }

    loadInitialVideo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareId, t])

  // 初始加载完成后，预加载下一个视频（只执行一次）
  useEffect(() => {
    if (!isLoading && videos.length === 1 && !hasPreloadedRef.current) {
      console.log('📥 [Share] 预加载下一个视频')
      hasPreloadedRef.current = true
      const timer = setTimeout(() => {
        loadMoreVideosRef.current?.()
      }, 500) // 缩短预加载时间
      return () => clearTimeout(timer)
    }
  }, [isLoading, videos.length])

  // 当前视频变化时处理
  useEffect(() => {
    // 防止在加载中重复触发
    if (isLoadingMoreRef.current) return

    const handleVideoChange = async () => {
      const currentVideoElement = videoRefs.current.get(currentIndex)
      if (!currentVideoElement) return

      console.log(`🔄 [Share] 切换到视频 ${currentIndex}`)

      // ⭐ 步骤1: 先滚动到目标位置
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
          // 等待滚动动画完成
          await new Promise(resolve => setTimeout(resolve, 300))
        }
      }

      // ⭐ 步骤2: 暂停所有其他视频
      const pausePromises: Promise<void>[] = []
      videoRefs.current.forEach((_, index) => {
        if (index !== currentIndex) {
          pausePromises.push(pauseVideo(index))
        }
      })
      await Promise.all(pausePromises)

      // ⭐ 步骤3: 准备并播放当前视频
      currentVideoElement.currentTime = 0
      currentVideoElement.muted = isMuted
      const playSuccess = await playVideo(currentIndex)

      if (playSuccess) {
        console.log(`✅ [Share] 视频 ${currentIndex} 播放成功`)
      }

      // 如果是最后一个视频，加载下一个
      if (
        currentIndex === videosRef.current.length - 1 &&
        hasMoreRef.current &&
        !isLoadingMoreRef.current
      ) {
        loadMoreVideosRef.current?.()
      }

      scheduleTransitionUnlock()
    }

    handleVideoChange()
    // 注意：移除 videos.length 依赖，防止加载新视频时重复触发
  }, [currentIndex, isMuted, playVideo, pauseVideo, scheduleTransitionUnlock])

  // 智能预加载
  useEffect(() => {
    const preloadVideo = (index: number) => {
      const video = videoRefs.current.get(index)
      if (!video || video.readyState >= 2) return
      video.preload = 'auto'
      video.load()
    }

    // 预加载当前、下一个、上一个视频
    preloadVideo(currentIndex)
    if (currentIndex + 1 < videos.length) preloadVideo(currentIndex + 1)
    if (currentIndex - 1 >= 0) preloadVideo(currentIndex - 1)
  }, [currentIndex, videos.length])

  // 监听屏幕方向变化
  useEffect(() => {
    const handleOrientationChange = () => {
      setIsPortrait(window.innerHeight > window.innerWidth)
    }

    window.addEventListener('resize', handleOrientationChange)
    window.addEventListener('orientationchange', handleOrientationChange)

    return () => {
      window.removeEventListener('resize', handleOrientationChange)
      window.removeEventListener('orientationchange', handleOrientationChange)
    }
  }, [])

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

  // 清理定时器
  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) {
        window.clearTimeout(transitionTimeoutRef.current)
        transitionTimeoutRef.current = null
      }
      hasInitialScroll.current = false
    }
  }, [])

  // 加载中
  if (isLoading) {
    return (
      <div className='fixed inset-0 z-50 bg-black flex items-center justify-center'>
        <div className='flex flex-col items-center gap-3'>
          <div className='w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin' />
          <p className='text-white text-sm'>{t('loading')}</p>
        </div>
      </div>
    )
  }

  // 加载失败
  if (videos.length === 0) {
    return (
      <div className='fixed inset-0 z-50 bg-black flex items-center justify-center'>
        <div className='text-center max-w-md p-8'>
          <div className='w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4'>
            <span className='text-3xl'>⚠️</span>
          </div>
          <p className='text-xl text-white mb-2'>{t('notFound')}</p>
          <p className='text-white/70 mb-6'>{t('notFoundDesc')}</p>
          <Button
            onClick={() => navigate({ to: '/discover' })}
            className='bg-white/20 hover:bg-white/30'
          >
            <Compass className='w-4 h-4 mr-2' />
            {t('exploreMore')}
          </Button>
        </div>
      </div>
    )
  }

  // 生成头像URL
  const getAvatarUrl = (video: VideoData) => {
    return video.userImageUrl || generateAvatarUrl(video.userUuid, 'avataaars')
  }

  // 显示视频 - 竖屏全屏模式（支持滑动切换）
  return (
    <div className='fixed inset-0 z-50 bg-black'>
      {/* 顶部控制栏 */}
      <div className='absolute top-0 left-0 right-0 z-50 flex items-center justify-between p-4'>
        {/* Explore 按钮 */}
        <button
          onClick={() => navigate({ to: '/discover' })}
          className='px-4 py-2 flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm hover:bg-white/20 transition-all active:scale-95'
        >
          <Compass className='w-5 h-5 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]' />
          <span className='text-white text-sm font-medium drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]'>
            {t('exploreMore')}
          </span>
        </button>

        {/* 静音按钮 */}
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

      {/* 视频容器 - 支持滑动 */}
      <div
        ref={containerRef}
        className='h-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide scroll-smooth'
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {videos.map((video, index) => {
          const isActive = index === currentIndex
          const shouldRender = Math.abs(index - currentIndex) <= 1

          return (
            <div
              key={index}
              className='relative w-full h-screen snap-start snap-always flex items-center justify-center'
            >
              {shouldRender ? (
                <>
                  {/* 视频 */}
                  <video
                    key={index}
                    ref={(el) => {
                      if (el) {
                        videoRefs.current.set(index, el)
                      } else {
                        videoRefs.current.delete(index)
                      }
                    }}
                    className={cn(
                      'w-full h-full',
                      isPortrait ? 'object-cover' : 'object-contain',
                      // 只在当前和相邻视频上添加过渡效果
                      isActive ? 'opacity-100' : 'opacity-0',
                      shouldRender ? 'transition-opacity duration-300 ease-in-out' : ''
                    )}
                    style={{
                      willChange: isActive ? 'opacity' : 'auto',
                      // 使用 transform 创建新的层叠上下文，避免重绘
                      transform: 'translateZ(0)',
                    }}
                    loop
                    playsInline
                    webkit-playsinline='true'
                    x5-playsinline='true'
                    x5-video-player-type='h5'
                    preload={isActive ? 'auto' : 'metadata'}
                    muted={isMuted}
                    onLoadedData={() => handleVideoReady(index)}
                    onCanPlay={() => handleVideoReady(index)}
                  >
                    <source src={video.videoUrl} type='video/mp4' />
                  </video>

                  {/* 左下角 - 头像和提示词 */}
                  <div className='absolute bottom-20 left-0 right-20 p-4 pointer-events-none'>
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

                    {/* 提示词 */}
                    <p className='text-white text-sm line-clamp-3 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]'>
                      {video.prompt}
                    </p>
                  </div>

                  {/* 右下角 - 垂直操作栏（调整间距） */}
                  <div className='absolute bottom-20 right-0 p-4 flex flex-col items-center gap-6'>
                    {/* 点赞按钮 */}
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

                    {/* 浏览量 */}
                    <div className='flex flex-col items-center gap-1'>
                      <Eye className='w-8 h-8 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]' />
                      <span className='text-white text-xs font-bold drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]'>
                        {video.views}
                      </span>
                    </div>

                    {/* 分享按钮 - 与头像水平对齐 */}
                    <button
                      onClick={handleShare}
                      className='flex flex-col items-center gap-1 hover:scale-110 transition-transform active:scale-95'
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
                        <button
                          onClick={() => playVideo(index)}
                          className='px-4 py-2 bg-white/20 rounded-lg text-white text-sm hover:bg-white/30 transition-colors'
                        >
                          重试
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className='w-full h-full bg-transparent flex items-center justify-center'>
                  <div className='text-white text-sm drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]'>加载中...</div>
                </div>
              )}
            </div>
          )
        })}

        {/* 加载更多指示器 */}
        {isLoadingMore && (
          <div className='absolute bottom-24 left-1/2 transform -translate-x-1/2 z-50'>
            <div className='bg-black/50 backdrop-blur-sm px-4 py-2 rounded-lg flex items-center gap-2'>
              <Loader2 className='w-4 h-4 animate-spin text-white' />
              <span className='text-white text-sm'>加载更多...</span>
            </div>
          </div>
        )}
      </div>

      {/* 隐藏滚动条样式 */}
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

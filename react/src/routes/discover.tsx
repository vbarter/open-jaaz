import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import TopMenu from '@/components/TopMenu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, Sparkles, Clock, Heart, Eye, ArrowDown } from 'lucide-react'
import { getDiscoverVideos, getUserLikes, Sora2TaskDetail } from '@/api/sora'
import { DiscoverVideoCard } from '@/components/discover/DiscoverVideoCard'
import { FullscreenVideoViewer } from '@/components/discover/FullscreenVideoViewer'
import { generateAvatarUrl } from '@/utils/avatarUtils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export const Route = createFileRoute('/discover')({
  component: DiscoverPage,
})

interface DiscoverVideo {
  id: string
  prompt: string
  videoUrl: string
  createdAt: Date
  views: number
  likes: number
  userUuid: string // 用户 UUID（用于fallback）
  userImageUrl?: string // 用户真实头像 URL
  shareId?: string // 分享ID
}

// 任务详情 -> 前端视频对象
const taskToVideo = (task: Sora2TaskDetail): DiscoverVideo => ({
  id: task.id.toString(),
  prompt: task.prompt,
  videoUrl: task.video_url,
  createdAt: new Date(task.ctime),
  views: task.views ?? 0,
  likes: task.likes ?? 0,
  userUuid: task.user_uuid,
  userImageUrl: task.user_image_url, // 从数据库获取的真实头像
  shareId: task.share_id, // 分享ID
})

function DiscoverPage() {
  const { t } = useTranslation('discover')
  const [videos, setVideos] = useState<DiscoverVideo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [sortBy, setSortBy] = useState<'time' | 'likes' | 'views'>('time')
  const [likedVideoIds, setLikedVideoIds] = useState<Set<number>>(new Set())
  const [fullscreenVideoId, setFullscreenVideoId] = useState<string | null>(null)
  const [isPullRefreshing, setIsPullRefreshing] = useState(false)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const pullStartY = useRef<number>(0)
  const pullDistance = useRef<number>(0)

  const INITIAL_LIMIT = 10 // 初始加载10个视频
  const PAGE_SIZE = 5 // 每次分页加载5个视频
  const PULL_THRESHOLD = 80 // 下拉刷新触发距离

  // 加载用户点赞状态
  const loadUserLikes = useCallback(async (videoIds: number[]) => {
    if (videoIds.length === 0) return

    try {
      const result = await getUserLikes(videoIds)
      setLikedVideoIds(new Set(result.liked_video_ids))
      console.log('✅ [Discover] 加载用户点赞状态:', result.liked_video_ids.length)
    } catch (error) {
      console.error('❌ [Discover] 加载用户点赞状态失败:', error)
    }
  }, [])

  // 点赞变化回调
  const handleLikeChange = useCallback((videoId: string, isLiked: boolean, newLikes: number) => {
    const numId = parseInt(videoId)

    // 更新点赞状态
    setLikedVideoIds(prev => {
      const newSet = new Set(prev)
      if (isLiked) {
        newSet.add(numId)
      } else {
        newSet.delete(numId)
      }
      return newSet
    })

    // 更新视频点赞数
    setVideos(prev =>
      prev.map(v =>
        v.id === videoId
          ? { ...v, likes: newLikes }
          : v
      )
    )
  }, [])

  // 加载视频列表
  const loadVideos = useCallback(
    async (offset: number = 0, append: boolean = false) => {
      try {
        if (append) {
          setIsLoadingMore(true)
        } else {
          setIsLoading(true)
        }

        // 根据是否追加，使用不同的limit
        const limit = append ? PAGE_SIZE : INITIAL_LIMIT

        const response = await getDiscoverVideos({
          limit: limit,
          offset: offset,
          sort_by: sortBy,
        })

        console.log('📋 [Discover] API Response:', {
          append,
          offset,
          limit,
          total: response.total,
          tasksCount: response.tasks.length,
          sortBy: sortBy,
        })

        const newVideos = response.tasks.map(taskToVideo)

        if (append) {
          setVideos((prev) => {
            const updated = [...prev, ...newVideos]
            console.log('➕ [Discover] 追加视频:', {
              before: prev.length,
              added: newVideos.length,
              after: updated.length,
            })
            return updated
          })
        } else {
          setVideos(newVideos)
          console.log('🔄 [Discover] 重置视频列表:', newVideos.length)
        }

        // 检查是否还有更多数据
        const hasMoreData = offset + limit < response.total
        setHasMore(hasMoreData)
        console.log('📊 [Discover] 更新状态:', {
          offset,
          limit,
          total: response.total,
          hasMore: hasMoreData,
        })

        // 加载用户点赞状态
        await loadUserLikes(newVideos.map(v => parseInt(v.id)))
      } catch (error) {
        console.error(t('loadError'), error)
      } finally {
        setIsLoading(false)
        setIsLoadingMore(false)
      }
    },
    [sortBy, loadUserLikes, t]
  )

  // 排序变化时重新加载
  useEffect(() => {
    loadVideos(0, false)
  }, [loadVideos])

  // 处理排序变化
  const handleSortChange = useCallback((value: string) => {
    setSortBy(value as 'time' | 'likes' | 'views')
  }, [])

  // 打开全屏播放
  const handleFullscreen = useCallback((videoId: string) => {
    setFullscreenVideoId(videoId)
  }, [])

  // 关闭全屏播放
  const handleCloseFullscreen = useCallback(() => {
    setFullscreenVideoId(null)
  }, [])

  // 下拉刷新处理
  const handlePullRefresh = useCallback(async () => {
    if (isPullRefreshing || isLoading) return

    setIsPullRefreshing(true)
    console.log('🔄 [Discover] 下拉刷新中...')

    try {
      // 重新加载第一页
      await loadVideos(0, false)
    } finally {
      setIsPullRefreshing(false)
    }
  }, [isPullRefreshing, isLoading, loadVideos])

  // 触摸事件处理（移动端下拉刷新）
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const scrollElement = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]')
    if (scrollElement && scrollElement.scrollTop === 0) {
      pullStartY.current = e.touches[0].clientY
    }
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const scrollElement = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]')
    if (!scrollElement || scrollElement.scrollTop > 0) return

    const currentY = e.touches[0].clientY
    const distance = currentY - pullStartY.current

    if (distance > 0 && distance < 120) {
      pullDistance.current = distance
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (pullDistance.current >= PULL_THRESHOLD) {
      handlePullRefresh()
    }
    pullStartY.current = 0
    pullDistance.current = 0
  }, [PULL_THRESHOLD, handlePullRefresh])

  // 滚动加载更多 - 使用滚动事件监听
  const handleScroll = useCallback(() => {
    const scrollElement = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]')
    if (!scrollElement || isLoadingMore || !hasMore) return

    const { scrollTop, scrollHeight, clientHeight } = scrollElement
    const distanceToBottom = scrollHeight - scrollTop - clientHeight

    // 距离底部小于 300px 时触发加载
    if (distanceToBottom < 300) {
      console.log('📍 [Discover] 滚动到底部，触发加载更多', {
        distanceToBottom,
        currentVideos: videos.length,
        hasMore,
      })
      loadVideos(videos.length, true)
    }
  }, [isLoadingMore, hasMore, videos.length, loadVideos])

  // 绑定滚动事件
  useEffect(() => {
    const scrollElement = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]')
    if (!scrollElement) return

    console.log('🔧 [Discover] 绑定滚动事件监听')
    scrollElement.addEventListener('scroll', handleScroll)

    return () => {
      console.log('🧹 [Discover] 移除滚动事件监听')
      scrollElement.removeEventListener('scroll', handleScroll)
    }
  }, [handleScroll])

  return (
    <div className='flex flex-col h-screen relative overflow-hidden bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 dark:from-gray-900 dark:via-purple-900/20 dark:to-blue-900/20'>
      <TopMenu />

      <ScrollArea
        className='h-full relative z-10'
        ref={scrollAreaRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className='relative flex flex-col items-center pt-8 px-4 sm:px-6 pb-8'>
          {/* 下拉刷新指示器 */}
          {isPullRefreshing && (
            <div className='absolute top-2 left-1/2 transform -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-full shadow-lg'>
              <Loader2 className='w-4 h-4 animate-spin text-purple-500' />
              <span className='text-sm text-gray-700 dark:text-gray-300'>{t('refreshing') || '刷新中...'}</span>
            </div>
          )}

          {/* 标题区域 */}
          <div className='w-full max-w-[1400px] mx-auto mb-8'>
            <div className='flex items-center justify-center'>
              <h1 className='text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100'>
                {t('title')}
              </h1>
            </div>
          </div>

          {/* 视频网格 */}
          <div className='w-full max-w-[1400px] mx-auto'>
            {/* 排序选择器 */}
            <div className='flex justify-start mb-4'>
              <Select value={sortBy} onValueChange={handleSortChange}>
                <SelectTrigger className='w-[140px]'>
                  <SelectValue placeholder={t('sort.label')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='time'>
                    <div className='flex items-center gap-2'>
                      <Clock className='w-4 h-4' />
                      <span>{t('sort.time')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value='likes'>
                    <div className='flex items-center gap-2'>
                      <Heart className='w-4 h-4' />
                      <span>{t('sort.likes')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value='views'>
                    <div className='flex items-center gap-2'>
                      <Eye className='w-4 h-4' />
                      <span>{t('sort.views')}</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isLoading ? (
              <div className='flex flex-col items-center justify-center py-20 text-gray-400'>
                <Loader2 className='w-16 h-16 mb-4 opacity-50 animate-spin' />
                <p className='text-lg'>{t('loading')}</p>
              </div>
            ) : videos.length === 0 ? (
              <div className='flex flex-col items-center justify-center py-20 text-gray-400'>
                <Sparkles className='w-16 h-16 mb-4 opacity-50' />
                <p className='text-lg'>{t('noVideos')}</p>
              </div>
            ) : (
              <>
                {/* 网格布局 - 一行5个 */}
                <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3'>
                  {videos.map((video) => (
                    <div key={video.id} className='w-full aspect-[9/16] overflow-hidden bg-black rounded-lg'>
                      <DiscoverVideoCard
                        videoId={video.id}
                        videoUrl={video.videoUrl}
                        prompt={video.prompt}
                        views={video.views}
                        likes={video.likes}
                        userUuid={video.userUuid}
                        userImageUrl={video.userImageUrl}
                        isLiked={likedVideoIds.has(parseInt(video.id))}
                        onLikeChange={handleLikeChange}
                        onFullscreen={handleFullscreen}
                      />
                    </div>
                  ))}
                </div>

                {/* 加载状态指示器 */}
                <div className='w-full py-8'>
                  {isLoadingMore && (
                    <div className='flex flex-col items-center justify-center text-gray-400'>
                      <Loader2 className='w-8 h-8 mb-2 animate-spin' />
                      <p className='text-sm'>{t('loadingMore')}</p>
                    </div>
                  )}
                  {!hasMore && videos.length > 0 && (
                    <div className='text-center text-gray-400 text-sm'>{t('allLoaded')}</div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* 全屏视频查看器 */}
      {fullscreenVideoId && (
        <FullscreenVideoViewer
          videos={videos.map(v => ({
            id: v.id,
            shareId: v.shareId,
            videoUrl: v.videoUrl,
            prompt: v.prompt,
            views: v.views,
            likes: v.likes,
            userUuid: v.userUuid,
            userImageUrl: v.userImageUrl,
            isLiked: likedVideoIds.has(parseInt(v.id)),
          }))}
          initialIndex={videos.findIndex(v => v.id === fullscreenVideoId)}
          onClose={handleCloseFullscreen}
          onLikeChange={handleLikeChange}
        />
      )}
    </div>
  )
}

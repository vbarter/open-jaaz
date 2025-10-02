import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import TopMenu from '@/components/TopMenu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, Sparkles, Clock, Heart, Eye } from 'lucide-react'
import { getDiscoverVideos, Sora2TaskDetail } from '@/api/sora'
import { DiscoverVideoCard } from '@/components/discover/DiscoverVideoCard'
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
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null)

  const LIMIT = 60 // 一次加载60个视频（10行，每行6个）

  // 加载视频列表
  const loadVideos = useCallback(
    async (offset: number = 0, append: boolean = false) => {
      try {
        if (append) {
          setIsLoadingMore(true)
        } else {
          setIsLoading(true)
        }

        const response = await getDiscoverVideos({
          limit: LIMIT,
          offset: offset,
          sort_by: sortBy,
        })

        console.log('📋 [Discover] API Response:', {
          total: response.total,
          tasksCount: response.tasks.length,
          firstTask: response.tasks[0],
          sortBy: sortBy,
        })

        const newVideos = response.tasks.map(taskToVideo)
        console.log('📋 [Discover] Mapped Videos:', {
          count: newVideos.length,
          firstVideo: newVideos[0]
        })

        if (append) {
          setVideos((prev) => [...prev, ...newVideos])
        } else {
          setVideos(newVideos)
        }

        // 检查是否还有更多数据
        setHasMore(offset + LIMIT < response.total)
      } catch (error) {
        console.error(t('loadError'), error)
      } finally {
        setIsLoading(false)
        setIsLoadingMore(false)
      }
    },
    [sortBy]
  )

  // 排序变化时重新加载
  useEffect(() => {
    loadVideos(0, false)
  }, [loadVideos])

  // 处理排序变化
  const handleSortChange = useCallback((value: string) => {
    setSortBy(value as 'time' | 'likes' | 'views')
  }, [])

  // 滚动加载更多 - 使用 IntersectionObserver
  useEffect(() => {
    if (!loadMoreTriggerRef.current) return

    // 创建 IntersectionObserver
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        // 当触发元素进入视口且有更多数据且不在加载中时，加载更多
        if (entry.isIntersecting && hasMore && !isLoadingMore) {
          console.log('📍 [Discover] 触发加载更多')
          loadVideos(videos.length, true)
        }
      },
      {
        root: null, // 使用视口作为根元素
        rootMargin: '400px', // 提前400px触发加载
        threshold: 0,
      }
    )

    // 开始观察
    observerRef.current.observe(loadMoreTriggerRef.current)

    // 清理
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [videos.length, hasMore, isLoadingMore, loadVideos])

  return (
    <div className='flex flex-col h-screen relative overflow-hidden bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 dark:from-gray-900 dark:via-purple-900/20 dark:to-blue-900/20'>
      <TopMenu />

      <ScrollArea className='h-full relative z-10' ref={scrollAreaRef}>
        <div className='relative flex flex-col items-center pt-8 px-4 sm:px-6 pb-8'>
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
                {/* 网格布局 - 一行6个 */}
                <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5 sm:gap-2'>
                  {videos.map((video) => (
                    <div key={video.id} className='w-full aspect-[9/16] overflow-hidden bg-black rounded-lg'>
                      <DiscoverVideoCard
                        videoUrl={video.videoUrl}
                        prompt={video.prompt}
                        views={video.views}
                        likes={video.likes}
                        userUuid={video.userUuid}
                        userImageUrl={video.userImageUrl}
                        shareId={video.shareId}
                      />
                    </div>
                  ))}
                </div>

                {/* 加载更多触发器 */}
                <div ref={loadMoreTriggerRef} className='w-full py-8'>
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
    </div>
  )
}

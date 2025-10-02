import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useMemo, useRef } from 'react'
import { Loader2, Heart, Eye, User, Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { getShareVideo, incrementShareView, ShareVideoDetail } from '@/api/sora'
import { EnhancedVideoPlayer } from '@/components/chat/EnhancedVideoPlayer'
import { generateAvatarUrl } from '@/utils/avatarUtils'

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
  const [video, setVideo] = useState<ShareVideoDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const viewIncrementedRef = useRef(false) // 防止重复增加访问量

  // 生成头像URL（优先使用真实头像，否则使用虚拟头像）
  const avatarUrl = useMemo(() => {
    if (!video) return ''
    if (video.user_image_url) return video.user_image_url
    return generateAvatarUrl(video.user_uuid, 'avataaars')
  }, [video])

  // 格式化创建时间 (YYYY-MM-DD HH:mm:ss)
  const formattedTime = useMemo(() => {
    if (!video?.ctime) return ''
    const date = new Date(video.ctime)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
  }, [video])

  // 加载分享视频
  useEffect(() => {
    const loadVideo = async () => {
      if (!shareId) {
        toast.error('Invalid share link')
        setIsLoading(false)
        return
      }

      try {
        // console.log('🔍 [Share] Loading video:', shareId)
        const videoData = await getShareVideo(shareId)
        setVideo(videoData)
        // console.log('✅ [Share] Video loaded:', videoData)

        // 增加访问量（只调用一次，使用 ref 防止 StrictMode 重复调用）
        if (!viewIncrementedRef.current) {
          viewIncrementedRef.current = true
          try {
            const result = await incrementShareView(shareId)
            // 更新本地显示的 views
            setVideo((prev) => (prev ? { ...prev, views: result.views } : null))
          } catch (error) {
            console.error('❌ [Share] 增加访问量失败:', error)
            // 失败不影响页面显示
          }
        }
      } catch (error) {
        console.error('❌ [Share] Load failed:', error)
        toast.error('Loading failed', {
          description:
            error instanceof Error ? error.message : 'Share does not exist or has expired',
        })
      } finally {
        setIsLoading(false)
      }
    }

    loadVideo()
  }, [shareId])

  // 加载中
  if (isLoading) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900'>
        <div className='text-center'>
          <Loader2 className='w-12 h-12 animate-spin text-gray-400 mx-auto mb-4' />
          <p className='text-gray-600 dark:text-gray-400'>Loading...</p>
        </div>
      </div>
    )
  }

  // 加载失败
  if (!video) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900'>
        <div className='text-center max-w-md p-8'>
          <p className='text-xl text-gray-800 dark:text-gray-200 mb-2'>Share does not exist</p>
          <p className='text-gray-600 dark:text-gray-400'>This share link may have expired</p>
        </div>
      </div>
    )
  }

  // 显示视频
  return (
    <div className='min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4'>
      <div className='max-w-2xl mx-auto'>
        {/* 视频播放器 */}
        <div className='bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden'>
          <div className='aspect-[9/16] max-h-[80vh] mx-auto bg-black'>
            <EnhancedVideoPlayer content='' videoUrl={video.video_url} fillContainer={true} />
          </div>

          {/* 信息区域 */}
          <div className='p-6 space-y-4'>
            {/* 用户信息和创建时间 */}
            <div className='flex items-center justify-between'>
              {/* 用户头像 */}
              <div className='flex items-center gap-3'>
                <img
                  src={avatarUrl}
                  alt='User avatar'
                  className='w-10 h-10 rounded-full object-cover border-2 border-gray-200 dark:border-gray-700 bg-white'
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                    const fallback = e.currentTarget.nextElementSibling
                    if (fallback) {
                      fallback.classList.remove('hidden')
                    }
                  }}
                />
                <div className='hidden w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center border-2 border-gray-200 dark:border-gray-600'>
                  <User className='w-5 h-5 text-gray-500 dark:text-gray-400' />
                </div>
                {/* 创建时间 */}
                <span className='text-sm text-gray-500 dark:text-gray-400'>{formattedTime}</span>
              </div>
            </div>

            {/* 提示词 */}
            <div>
              <p className='text-base text-gray-900 dark:text-gray-100'>{video.prompt}</p>
            </div>

            {/* 统计和操作 */}
            <div className='flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700'>
              {/* 统计 */}
              <div className='flex items-center gap-6 text-sm text-gray-600 dark:text-gray-400'>
                <div className='flex items-center gap-1.5'>
                  <Eye className='w-4 h-4' />
                  <span>{video.views}</span>
                </div>
                <div className='flex items-center gap-1.5'>
                  <Heart className='w-4 h-4' />
                  <span>{video.likes}</span>
                </div>
              </div>

              {/* Explore按钮 */}
              <Button
                onClick={() => navigate({ to: '/discover' })}
                variant='outline'
                className='border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'
              >
                <Compass className='w-4 h-4 mr-2' />
                Explore
              </Button>
            </div>
          </div>
        </div>

        {/* Powered by */}
        <div className='text-center mt-8'>
          <p className='text-sm text-gray-500 dark:text-gray-400'>
            Powered by{' '}
            <a
              href='https://www.magicart.cc/sora'
              className='hover:text-gray-700 dark:hover:text-gray-300 underline'
            >
              Sora2
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}

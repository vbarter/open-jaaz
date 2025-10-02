import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { Loader2, Heart, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { getShareVideo, likeShareVideo, ShareVideoDetail } from '@/api/sora'
import { EnhancedVideoPlayer } from '@/components/chat/EnhancedVideoPlayer'

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
  const [video, setVideo] = useState<ShareVideoDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLiking, setIsLiking] = useState(false)
  const [currentLikes, setCurrentLikes] = useState(0)

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
        setCurrentLikes(videoData.likes)
        // console.log('✅ [Share] Video loaded:', videoData)
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

  // 点赞
  const handleLike = async () => {
    if (!shareId || isLiking) return

    setIsLiking(true)
    try {
      const result = await likeShareVideo(shareId)
      setCurrentLikes(result.likes)
      toast.success('Liked successfully!')
    } catch (error) {
      console.error('点赞失败:', error)
      toast.error('Like failed', {
        description: 'Please try again later',
      })
    } finally {
      setIsLiking(false)
    }
  }

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
            {/* 提示词 */}
            <div>
              <h2 className='text-sm font-medium text-gray-500 dark:text-gray-400 mb-2'>
                Video Description
              </h2>
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
                  <span>{currentLikes}</span>
                </div>
              </div>

              {/* 点赞按钮 */}
              <Button
                onClick={handleLike}
                disabled={isLiking}
                className='bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-gray-200 text-white dark:text-gray-900'
              >
                {isLiking ? (
                  <Loader2 className='w-4 h-4 animate-spin mr-2' />
                ) : (
                  <Heart className='w-4 h-4 mr-2' />
                )}
                Like
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

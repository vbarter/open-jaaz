import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Loader2, Play, Volume2, VolumeX, Eye, Heart, User, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { generateAvatarUrl } from '@/utils/avatarUtils'
import { recordVideoView, toggleVideoLike } from '@/api/sora'
import { toast } from 'sonner'
import { useConfigs } from '@/contexts/configs'
import { useTranslation } from 'react-i18next'

interface DiscoverVideoCardProps {
  videoId: string // 视频ID
  videoUrl: string
  prompt: string
  views: number
  likes: number
  userUuid: string // 用户 UUID（用于fallback）
  userImageUrl?: string // 用户真实头像 URL
  isLiked?: boolean // 是否已点赞
  onLikeChange?: (videoId: string, isLiked: boolean, newLikes: number) => void // 点赞变化回调
  onFullscreen?: (videoId: string) => void // 全屏回调
  className?: string
}

export const DiscoverVideoCard: React.FC<DiscoverVideoCardProps> = ({
  videoId,
  videoUrl,
  prompt,
  views: initialViews,
  likes: initialLikes,
  userUuid,
  userImageUrl,
  isLiked: initialIsLiked = false,
  onLikeChange,
  onFullscreen,
  className,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { setShowLoginDialog } = useConfigs()
  const { t } = useTranslation('discover')
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(true) // 默认静音
  const [showPrompt, setShowPrompt] = useState(false)

  // 本地状态管理
  const [views, setViews] = useState(initialViews)
  const [likes, setLikes] = useState(initialLikes)
  const [isLiked, setIsLiked] = useState(initialIsLiked)
  const [isRecordingView, setIsRecordingView] = useState(false)
  const [isTogglingLike, setIsTogglingLike] = useState(false)

  // 检测是否为移动设备
  const isMobile = /iPad|iPhone|iPod|Android/.test(navigator.userAgent)

  // 优先使用真实头像，如果没有则使用虚拟头像
  const avatarUrl = useMemo(() => {
    if (userImageUrl) {
      return userImageUrl
    }
    // Fallback: 使用虚拟头像
    return generateAvatarUrl(userUuid, 'avataaars')
  }, [userImageUrl, userUuid])

  // 处理视频元数据加载
  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current
    if (video) {
      setIsLoading(false)
      setHasError(false)
      // 移动设备默认静音以允许自动播放
      if (isMobile) {
        video.muted = true
        setIsMuted(true)
      }
    }
  }, [isMobile])

  // 处理视频可以播放
  const handleCanPlay = useCallback(() => {
    setIsLoading(false)
  }, [])

  // 处理视频加载错误
  const handleError = useCallback(() => {
    console.error('Video load error:', videoUrl)
    setIsLoading(false)
    setHasError(true)
  }, [videoUrl])

  // 播放/暂停切换 + 记录浏览
  const togglePlay = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation() // 防止事件冒泡
      const video = videoRef.current
      if (!video || hasError) return

      try {
        if (isPlaying) {
          video.pause()
          setIsPlaying(false)
        } else {
          await video.play()
          setIsPlaying(true)

          // 记录播放次数（支持重复点击）
          if (!isRecordingView) {
            setIsRecordingView(true)
            try {
              const result = await recordVideoView(parseInt(videoId))
              if (result.success) {
                setViews(result.views)
                console.log(`✅ 浏览量更新: ${result.views}`)
              }
            } catch (error) {
              console.error('记录浏览失败:', error)
            } finally {
              setIsRecordingView(false)
            }
          }
        }
      } catch (error) {
        console.error('Playback error:', error)
        setIsPlaying(false)
      }
    },
    [isPlaying, hasError, videoId, isRecordingView]
  )

  // 静音切换
  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation() // 防止触发播放/暂停
    const video = videoRef.current
    if (video) {
      video.muted = !video.muted
      setIsMuted(video.muted)
    }
  }, [])

  // 点赞切换
  const handleLikeToggle = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()

      if (isTogglingLike) return

      setIsTogglingLike(true)

      try {
        const result = await toggleVideoLike(parseInt(videoId))
        if (result.success) {
          setIsLiked(result.is_liked)
          setLikes(result.likes)
          console.log(`✅ 点赞状态更新: ${result.is_liked}, 点赞数: ${result.likes}`)

          // 通知父组件
          if (onLikeChange) {
            onLikeChange(videoId, result.is_liked, result.likes)
          }
        }
      } catch (error) {
        console.error('切换点赞失败:', error)
        const message = error instanceof Error ? error.message : ''
        if (message.includes('401') || message.includes('请先登录')) {
          toast.error(t('like.loginRequired'))
          setShowLoginDialog(true)
        } else {
          toast.error(t('like.failed'))
        }
      } finally {
        setIsTogglingLike(false)
      }
    },
    [videoId, isTogglingLike, onLikeChange]
  )

  // 全屏播放
  const handleFullscreen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (onFullscreen) {
      onFullscreen(videoId)
    }
  }, [videoId, onFullscreen])

  // 监听视频播放状态
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleEnded = () => setIsPlaying(false)

    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('ended', handleEnded)

    return () => {
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('ended', handleEnded)
    }
  }, [])

  return (
    <div
      className={cn('relative group w-full h-full', className)}
      onMouseEnter={() => setShowPrompt(true)}
      onMouseLeave={() => setShowPrompt(false)}
    >
      {/* 加载指示器 */}
      {isLoading && !hasError && (
        <div className='absolute inset-0 flex items-center justify-center bg-gray-800 z-10'>
          <Loader2 className='w-8 h-8 animate-spin text-white' />
        </div>
      )}

      {/* 错误提示 */}
      {hasError && (
        <div className='absolute inset-0 flex items-center justify-center bg-gray-900 z-10'>
          <div className='text-white text-center'>
            <p className='text-xs'>加载失败</p>
          </div>
        </div>
      )}

      {/* 视频元素 */}
      <video
        ref={videoRef}
        className='w-full h-full object-cover cursor-pointer'
        preload='metadata'
        playsInline
        loop
        muted={isMuted}
        webkit-playsinline='true'
        x5-playsinline='true'
        x5-video-player-type='h5'
        onLoadedMetadata={handleLoadedMetadata}
        onCanPlay={handleCanPlay}
        onError={handleError}
        onClick={togglePlay}
        style={{ display: hasError ? 'none' : 'block' }}
      >
        <source src={videoUrl} type='video/mp4' />
      </video>

      {/* 左上角 - 用户头像 */}
      <div className='absolute top-2 left-2 z-20'>
        <img
          src={avatarUrl}
          alt='User avatar'
          className='w-8 h-8 rounded-full object-cover border border-white/20 bg-white'
          onError={(e) => {
            // 如果头像加载失败，显示默认图标
            e.currentTarget.style.display = 'none'
            const fallback = e.currentTarget.nextElementSibling
            if (fallback) {
              fallback.classList.remove('hidden')
            }
          }}
        />
        <div className='hidden w-8 h-8 rounded-full bg-gray-800/60 backdrop-blur-sm flex items-center justify-center border border-white/20'>
          <User className='w-4 h-4 text-white' />
        </div>
      </div>

      {/* 右上角 - 音量图标 */}
      <div className='absolute top-2 right-2 z-20'>
        <button
          onClick={toggleMute}
          className='w-8 h-8 rounded-full bg-gray-800/60 backdrop-blur-sm flex items-center justify-center hover:bg-gray-700/60 transition-colors border border-white/20'
          title={isMuted ? '取消静音' : '静音'}
        >
          {isMuted ? (
            <VolumeX className='w-4 h-4 text-white' />
          ) : (
            <Volume2 className='w-4 h-4 text-white' />
          )}
        </button>
      </div>

      {/* 中央播放按钮（暂停时显示） */}
      {!isPlaying && !isLoading && !hasError && (
        <div
          className='absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer z-10'
          onClick={togglePlay}
        >
          <div className='bg-white/20 backdrop-blur-sm rounded-full p-3 hover:bg-white/30 transition-colors'>
            <Play className='w-8 h-8 text-white fill-white' />
          </div>
        </div>
      )}

      {/* 底部信息栏 */}
      <div className='absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/70 to-transparent p-3'>
        {/* 鼠标悬停时显示提示词 */}
        {showPrompt && (
          <div className='mb-2'>
            <p className='text-white text-xs line-clamp-2'>{prompt}</p>
          </div>
        )}

        {/* 播放量、点赞量和详情按钮 */}
        <div className='flex items-center justify-between'>
          {/* 左侧 - 播放量和点赞量 */}
          <div className='flex items-center gap-3'>
            {/* 播放量 */}
            <div className='flex items-center gap-1 text-white'>
              <Eye className='w-3.5 h-3.5' />
              <span className='text-xs font-medium'>{views}</span>
            </div>
            {/* 点赞按钮 - 可点击切换 */}
            <button
              onClick={handleLikeToggle}
              disabled={isTogglingLike}
              className='flex items-center gap-1 text-white hover:scale-110 transition-transform disabled:opacity-50'
              title={isLiked ? '取消点赞' : '点赞'}
            >
              <Heart
                className={`w-3.5 h-3.5 ${isLiked ? 'fill-red-500 text-red-500' : ''}`}
              />
              <span className='text-xs font-medium'>{likes}</span>
            </button>
          </div>

          {/* 右侧 - 仅保留全屏按钮 */}
          <div className='flex items-center'>
            {onFullscreen && (
              <button
                onClick={handleFullscreen}
                className='w-7 h-7 flex items-center justify-center hover:scale-110 transition-transform'
                title='全屏播放'
              >
                <Maximize2 className='w-4 h-4 text-white drop-shadow-lg' />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default DiscoverVideoCard

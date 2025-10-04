import React, { useState, useRef, useEffect, useCallback } from 'react'
import { X, Heart, Eye, FileText, Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { generateAvatarUrl } from '@/utils/avatarUtils'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

interface VideoData {
  id: string
  prompt: string
  videoUrl: string
  views: number
  likes: number
  userUuid?: string
  userImageUrl?: string
  createdAt: Date
}

interface MobileFullscreenVideoViewerProps {
  video: VideoData
  onClose: () => void
}

export const MobileFullscreenVideoViewer: React.FC<MobileFullscreenVideoViewerProps> = ({
  video,
  onClose,
}) => {
  const { t } = useTranslation('sora')
  const videoRef = useRef<HTMLVideoElement>(null)
  const [showPromptPanel, setShowPromptPanel] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)

  // 生成用户头像
  const avatarUrl = video.userImageUrl ||
    (video.userUuid ? generateAvatarUrl(video.userUuid, 'avataaars') : '/default-avatar.png')

  // 切换提示词面板
  const togglePromptPanel = useCallback(() => {
    setShowPromptPanel(prev => !prev)
  }, [])

  // 复制提示词
  const handleCopyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(video.prompt)
      setIsCopied(true)
      toast.success(t('toast.copySuccess'))
      setTimeout(() => setIsCopied(false), 2000)
    } catch (error) {
      toast.error(t('toast.copyError'))
    }
  }, [video.prompt, t])

  // 播放/暂停切换
  const togglePlay = useCallback(() => {
    const videoElement = videoRef.current
    if (!videoElement) return

    if (isPlaying) {
      videoElement.pause()
    } else {
      videoElement.play()
    }
  }, [isPlaying])

  // 监听视频播放状态
  useEffect(() => {
    const videoElement = videoRef.current
    if (!videoElement) return

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)

    videoElement.addEventListener('play', handlePlay)
    videoElement.addEventListener('pause', handlePause)

    return () => {
      videoElement.removeEventListener('play', handlePlay)
      videoElement.removeEventListener('pause', handlePause)
    }
  }, [])

  // 关闭时暂停视频
  useEffect(() => {
    return () => {
      if (videoRef.current) {
        videoRef.current.pause()
      }
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-black" style={{ height: '100dvh' }}>
      {/* 视频容器 - 9:16 竖屏居中 */}
      <div className="relative w-full h-full flex items-center justify-center">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          src={video.videoUrl}
          playsInline
          loop
          autoPlay
          onClick={togglePlay}
        />

        {/* 关闭按钮 - 右上角，缩小尺寸 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-40 p-1.5 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-sm transition-all"
        >
          <X className="w-5 h-5 text-white" />
        </button>

        {/* 左下角垂直图标栏 */}
        <div className="absolute bottom-6 left-4 z-40 flex flex-col gap-4">
          {/* 用户头像 */}
          <button className="flex items-center justify-center">
            <img
              src={avatarUrl}
              alt="User"
              className="w-10 h-10 rounded-full border-2 border-white object-cover"
            />
          </button>

          {/* 点赞数 */}
          <button className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
              <Heart className="w-5 h-5 text-white" />
            </div>
            <span className="text-white text-xs font-medium">{video.likes || 0}</span>
          </button>

          {/* 浏览量 */}
          <button className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
              <Eye className="w-5 h-5 text-white" />
            </div>
            <span className="text-white text-xs font-medium">{video.views || 0}</span>
          </button>

          {/* 文本按钮 */}
          <button
            onClick={togglePromptPanel}
            className={cn(
              "flex flex-col items-center gap-1 transition-all",
              showPromptPanel && "scale-110"
            )}
          >
            <div className={cn(
              "w-10 h-10 rounded-full backdrop-blur-sm flex items-center justify-center transition-colors",
              showPromptPanel ? "bg-white" : "bg-black/50"
            )}>
              <FileText className={cn(
                "w-5 h-5 transition-colors",
                showPromptPanel ? "text-black" : "text-white"
              )} />
            </div>
          </button>
        </div>
      </div>

      {/* 提示词弹窗 - 从按钮右侧展开，玻璃态设计 */}
      {showPromptPanel && (
        <>
          {/* 遮罩层 - 点击关闭提示词面板 */}
          <div
            className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm"
            onClick={togglePromptPanel}
          />

          {/* 提示词卡片 - 定位在按钮右侧 */}
          <div
            className={cn(
              "fixed left-20 bottom-20 w-80 z-50",
              "bg-black/90 backdrop-blur-2xl",
              "rounded-2xl shadow-2xl border border-white/5",
              "transform transition-all duration-300 ease-out",
              "flex flex-col",
              "max-h-[calc(100dvh-10rem)]",
              showPromptPanel ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
            )}
          >

            {/* 磨砂玻璃效果增强层 */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent rounded-2xl pointer-events-none" />

            <div className="relative flex flex-col min-h-0">
              {/* 标题栏 */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  {t('promptModal.title')}
                </h3>
                <button
                  onClick={togglePromptPanel}
                  className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <X className="w-4 h-4 text-gray-300" />
                </button>
              </div>

              {/* 提示词内容区 - 可滚动 */}
              <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-white/30">
                <p className="text-sm text-gray-100 leading-relaxed whitespace-pre-wrap break-words">
                  {video.prompt}
                </p>
              </div>

              {/* 底部操作区 */}
              <div className="px-5 py-4 border-t border-white/10 space-y-3 flex-shrink-0">
                {/* 复制按钮 */}
                <button
                  onClick={handleCopyPrompt}
                  className={cn(
                    "w-full py-3 px-4 rounded-xl font-medium transition-all flex items-center justify-center gap-2",
                    "shadow-lg hover:shadow-xl transform hover:scale-[1.02]",
                    isCopied
                      ? "bg-gradient-to-r from-green-500 to-emerald-500 text-white"
                      : "bg-white hover:bg-gray-50 text-black"
                  )}
                >
                  {isCopied ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span className="text-sm">{t('promptModal.copied')}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span className="text-sm">{t('promptModal.copyButton')}</span>
                    </>
                  )}
                </button>

                {/* 创建时间 */}
                <div className="text-center">
                  <p className="text-xs text-gray-400">
                    {new Date(video.createdAt).toLocaleString('zh-CN', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: false
                    })}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default MobileFullscreenVideoViewer

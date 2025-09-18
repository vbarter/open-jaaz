import React, { useState, useRef, useEffect } from 'react'
import { Download, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface VideoMessageProps {
  content: string
  videoUrl?: string
  videoId?: string
  metadata?: {
    width?: number
    height?: number
    duration?: number
  }
  className?: string
}

export const VideoMessage: React.FC<VideoMessageProps> = ({
  content,
  videoUrl,
  videoId,
  metadata,
  className
}) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [videoReady, setVideoReady] = useState(false)

  // 处理视频加载完成
  const handleLoadedData = () => {
    setIsLoading(false)
    setVideoReady(true)
    setHasError(false)
  }

  // 处理视频加载错误
  const handleError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    console.error('视频加载错误:', e)
    setIsLoading(false)
    setHasError(true)
    setVideoReady(false)
  }

  // 处理下载
  const handleDownload = async () => {
    if (!videoUrl) return

    try {
      // 尝试使用 fetch 下载（支持跨域）
      const response = await fetch(videoUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = videoId ? `video_${videoId}.mp4` : 'video.mp4'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      // 如果跨域失败，尝试直接下载
      const a = document.createElement('a')
      a.href = videoUrl
      a.download = videoId ? `video_${videoId}.mp4` : 'video.mp4'
      a.target = '_blank'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
  }

  // 格式化时长
  const formatDuration = (seconds?: number) => {
    if (!seconds) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // 监听视频元数据加载
  useEffect(() => {
    const video = videoRef.current
    if (video) {
      // 强制加载视频元数据
      video.load()
    }
  }, [videoUrl])

  return (
    <div className={cn('space-y-2 max-w-full', className)}>
      {/* 文本内容 - 只在有内容时显示 */}
      {content && content.trim() && (
        <div className="text-sm text-gray-700 dark:text-gray-300">{content}</div>
      )}

      {/* 视频播放器 */}
      {videoUrl && (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden shadow-sm w-full max-w-2xl">
          {/* 视频容器 - 保持16:9宽高比，最大尺寸640x360以匹配后端 */}
          <div className="relative bg-black mx-auto" style={{ maxWidth: '640px', width: '100%', aspectRatio: '16/9' }}>
            {/* 加载指示器 */}
            {isLoading && !hasError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                <div className="text-white text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                  <p className="text-sm">加载视频中...</p>
                </div>
              </div>
            )}

            {/* 错误提示 */}
            {hasError && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
                <div className="text-white text-center p-4">
                  <AlertCircle className="w-12 h-12 mx-auto mb-2 text-red-400" />
                  <p className="text-sm mb-2">视频加载失败</p>
                  <p className="text-xs text-gray-400">请检查网络连接或视频地址</p>
                  <Button
                    onClick={() => {
                      setHasError(false)
                      setIsLoading(true)
                      videoRef.current?.load()
                    }}
                    variant="outline"
                    size="sm"
                    className="mt-3"
                  >
                    重试
                  </Button>
                </div>
              </div>
            )}

            {/* HTML5 视频播放器 - 保持16:9宽高比，与后端一致 */}
            <video
              ref={videoRef}
              className="w-full h-full object-contain bg-black"
              controls
              controlsList="nodownload" // 隐藏下载按钮（我们提供自定义的）
              preload="metadata" // 预加载元数据
              playsInline // iOS 内联播放
              webkit-playsinline // iOS Safari 兼容
              x5-playsinline // 微信浏览器兼容
              crossOrigin="anonymous" // 支持跨域
              onLoadedData={handleLoadedData}
              onLoadedMetadata={handleLoadedData}
              onError={handleError}
              onLoadStart={() => setIsLoading(true)}
              style={{
                display: hasError ? 'none' : 'block',
                maxWidth: '640px',
                width: '100%',
                aspectRatio: '16/9'
              }}
            >
              <source src={videoUrl} type="video/mp4" />
              {/* 添加其他格式支持 */}
              {videoUrl.includes('.webm') && (
                <source src={videoUrl} type="video/webm" />
              )}
              {videoUrl.includes('.ogg') && (
                <source src={videoUrl} type="video/ogg" />
              )}
              您的浏览器不支持 HTML5 视频播放
            </video>
          </div>

          {/* 视频信息和操作栏 */}
          <div className="p-3 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              {/* 视频信息 */}
              <div className="text-xs text-gray-600 dark:text-gray-400 space-x-3">
                {metadata?.width && metadata?.height ? (
                  <span>{metadata.width}x{metadata.height}</span>
                ) : (
                  <span>640x360 (16:9)</span>
                )}
                {metadata?.duration && (
                  <span>{formatDuration(metadata.duration)}</span>
                )}
                {!metadata?.duration && videoReady && (
                  <span>视频已就绪</span>
                )}
              </div>

              {/* 下载按钮 */}
              <Button
                onClick={handleDownload}
                variant="ghost"
                size="sm"
                className="gap-1.5 h-7 px-2"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">下载</span>
              </Button>
            </div>

            {/* 视频ID（仅在开发模式显示） */}
            {process.env.NODE_ENV === 'development' && videoId && (
              <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-500 font-mono truncate">
                  ID: {videoId}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default VideoMessage
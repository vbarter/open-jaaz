import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Download, AlertCircle, Loader2, Play, Pause, Volume2, VolumeX, Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'

interface EnhancedVideoPlayerProps {
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

export const EnhancedVideoPlayer: React.FC<EnhancedVideoPlayerProps> = ({
  content,
  videoUrl,
  videoId,
  metadata,
  className
}) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // 状态管理
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(metadata?.duration || 0)
  const [volume, setVolume] = useState(1)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [canPlay, setCanPlay] = useState(false)

  // 检测是否为iOS设备
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const isAndroid = /Android/.test(navigator.userAgent)
  const isMobile = isIOS || isAndroid

  // 处理视频元数据加载
  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current
    if (video) {
      setDuration(video.duration)
      setCanPlay(true)
      setIsLoading(false)
      setHasError(false)

      // 在移动设备上设置静音以允许自动播放
      if (isMobile) {
        video.muted = true
        setIsMuted(true)
      }
    }
  }, [isMobile])

  // 处理视频可以播放
  const handleCanPlay = useCallback(() => {
    setCanPlay(true)
    setIsLoading(false)
  }, [])

  // 处理视频加载错误
  const handleError = useCallback((e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const video = e.currentTarget
    const error = video.error

    let errorMsg = '视频加载失败'
    if (error) {
      switch (error.code) {
        case 1:
          errorMsg = '视频加载被中止'
          break
        case 2:
          errorMsg = '网络错误'
          break
        case 3:
          errorMsg = '视频解码失败'
          break
        case 4:
          errorMsg = '不支持的视频格式'
          break
      }
    }

    console.error('视频加载错误:', errorMsg, error)
    setErrorMessage(errorMsg)
    setIsLoading(false)
    setHasError(true)
    setCanPlay(false)
  }, [])

  // 播放/暂停切换
  const togglePlay = useCallback(async () => {
    const video = videoRef.current
    if (!video || !canPlay) return

    try {
      if (isPlaying) {
        video.pause()
        setIsPlaying(false)
      } else {
        // iOS需要用户交互才能播放
        await video.play()
        setIsPlaying(true)

        // 首次播放后可以取消静音
        if (isMobile && video.muted) {
          setTimeout(() => {
            video.muted = false
            setIsMuted(false)
          }, 100)
        }
      }
    } catch (error) {
      console.error('播放错误:', error)
      // 如果自动播放失败，显示播放按钮
      setIsPlaying(false)
    }
  }, [canPlay, isPlaying, isMobile])

  // 静音切换
  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (video) {
      video.muted = !video.muted
      setIsMuted(!video.muted)
    }
  }, [])

  // 音量调节
  const handleVolumeChange = useCallback((value: number[]) => {
    const video = videoRef.current
    if (video) {
      const newVolume = value[0]
      video.volume = newVolume
      setVolume(newVolume)
      setIsMuted(newVolume === 0)
    }
  }, [])

  // 进度调节
  const handleSeek = useCallback((value: number[]) => {
    const video = videoRef.current
    if (video) {
      const newTime = value[0]
      video.currentTime = newTime
      setCurrentTime(newTime)
    }
  }, [])

  // 全屏切换
  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return

    try {
      if (!isFullscreen) {
        if (containerRef.current.requestFullscreen) {
          await containerRef.current.requestFullscreen()
        } else if ((containerRef.current as any).webkitRequestFullscreen) {
          await (containerRef.current as any).webkitRequestFullscreen()
        } else if ((containerRef.current as any).mozRequestFullScreen) {
          await (containerRef.current as any).mozRequestFullScreen()
        }
        setIsFullscreen(true)
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen()
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen()
        } else if ((document as any).mozCancelFullScreen) {
          await (document as any).mozCancelFullScreen()
        }
        setIsFullscreen(false)
      }
    } catch (error) {
      console.error('全屏切换失败:', error)
    }
  }, [isFullscreen])

  // 下载视频
  const handleDownload = useCallback(async () => {
    if (!videoUrl) return

    try {
      // 尝试使用 fetch 下载
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
      // 跨域失败时直接打开链接
      window.open(videoUrl, '_blank')
    }
  }, [videoUrl, videoId])

  // 格式化时间
  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // 监听视频事件
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime)
    }

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }

    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('ended', handleEnded)

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('ended', handleEnded)
    }
  }, [])

  // 监听全屏变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
    }
  }, [])

  // 自动隐藏控制条
  useEffect(() => {
    let timer: NodeJS.Timeout

    const handleMouseMove = () => {
      setShowControls(true)
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (isPlaying) {
          setShowControls(false)
        }
      }, 3000)
    }

    const container = containerRef.current
    if (container) {
      container.addEventListener('mousemove', handleMouseMove)
      container.addEventListener('touchstart', handleMouseMove)
    }

    return () => {
      if (container) {
        container.removeEventListener('mousemove', handleMouseMove)
        container.removeEventListener('touchstart', handleMouseMove)
      }
      clearTimeout(timer)
    }
  }, [isPlaying])

  return (
    <div className={cn('space-y-2 max-w-full', className)}>
      {/* 文本内容 */}
      <div className="text-sm text-gray-700 dark:text-gray-300">{content}</div>

      {/* 视频播放器 */}
      {videoUrl && (
        <div
          ref={containerRef}
          className="bg-gray-900 rounded-lg overflow-hidden shadow-lg relative group"
          onMouseEnter={() => setShowControls(true)}
          onMouseLeave={() => isPlaying && setShowControls(false)}
        >
          {/* 视频容器 */}
          <div className="relative bg-black">
            {/* 加载指示器 */}
            {isLoading && !hasError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-20">
                <div className="text-white text-center">
                  <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3" />
                  <p className="text-sm">加载视频中...</p>
                </div>
              </div>
            )}

            {/* 错误提示 */}
            {hasError && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-20">
                <div className="text-white text-center p-6">
                  <AlertCircle className="w-14 h-14 mx-auto mb-3 text-red-400" />
                  <p className="text-base mb-2">{errorMessage}</p>
                  <p className="text-xs text-gray-400 mb-4">请检查视频地址或网络连接</p>
                  <Button
                    onClick={() => {
                      setHasError(false)
                      setIsLoading(true)
                      videoRef.current?.load()
                    }}
                    variant="outline"
                    size="sm"
                  >
                    重试
                  </Button>
                </div>
              </div>
            )}

            {/* HTML5 视频元素 */}
            <video
              ref={videoRef}
              className="w-full h-auto max-h-[500px] cursor-pointer"
              preload="metadata"
              playsInline
              webkit-playsinline="true"
              x5-playsinline="true"
              x5-video-player-type="h5"
              x5-video-player-fullscreen="true"
              crossOrigin="anonymous"
              onLoadedMetadata={handleLoadedMetadata}
              onCanPlay={handleCanPlay}
              onError={handleError}
              onClick={togglePlay}
              style={{ display: hasError ? 'none' : 'block' }}
            >
              <source src={videoUrl} type="video/mp4" />
              {videoUrl.includes('.webm') && <source src={videoUrl} type="video/webm" />}
              {videoUrl.includes('.ogg') && <source src={videoUrl} type="video/ogg" />}
              您的浏览器不支持视频播放
            </video>

            {/* 中央播放按钮（视频暂停时显示） */}
            {!isPlaying && canPlay && !isLoading && (
              <div
                className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer z-10"
                onClick={togglePlay}
              >
                <div className="bg-white/20 backdrop-blur-sm rounded-full p-4 hover:bg-white/30 transition-colors">
                  <Play className="w-12 h-12 text-white fill-white" />
                </div>
              </div>
            )}

            {/* 自定义控制条 */}
            <div className={cn(
              "absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 transition-opacity duration-300",
              showControls && canPlay ? "opacity-100" : "opacity-0 pointer-events-none"
            )}>
              {/* 进度条 */}
              <div className="mb-3">
                <Slider
                  value={[currentTime]}
                  max={duration}
                  step={0.1}
                  onValueChange={handleSeek}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-white/80 mt-1">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* 控制按钮 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {/* 播放/暂停 */}
                  <Button
                    onClick={togglePlay}
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20"
                  >
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                  </Button>

                  {/* 音量控制 */}
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={toggleMute}
                      variant="ghost"
                      size="icon"
                      className="text-white hover:bg-white/20"
                    >
                      {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                    </Button>
                    {!isMobile && (
                      <Slider
                        value={[isMuted ? 0 : volume]}
                        max={1}
                        step={0.1}
                        onValueChange={handleVolumeChange}
                        className="w-20"
                      />
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* 下载按钮 */}
                  <Button
                    onClick={handleDownload}
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20"
                  >
                    <Download className="w-5 h-5" />
                  </Button>

                  {/* 全屏按钮 */}
                  <Button
                    onClick={toggleFullscreen}
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20"
                  >
                    <Maximize2 className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* 视频信息栏 */}
          {metadata && (
            <div className="p-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
                <div className="space-x-3">
                  {metadata.width && metadata.height && (
                    <span>{metadata.width}x{metadata.height}</span>
                  )}
                  <span>{formatTime(duration)}</span>
                </div>
                {process.env.NODE_ENV === 'development' && videoId && (
                  <span className="font-mono text-xs truncate max-w-[200px]">
                    {videoId}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default EnhancedVideoPlayer
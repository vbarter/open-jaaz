import { createFileRoute, useNavigate } from '@tanstack/react-router'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import TopMenu from '@/components/TopMenu'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { getCookie } from '@/utils/cookies'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Loader2,
  Send,
  Sparkles,
  Trash2,
  AlertTriangle,
  Share2,
  Eye,
  Heart,
  ArrowUpRight,
  Video,
  MessageCircle,
  Volume2,
  VolumeX,
  Maximize2,
  Download,
  Clock,
  Plus,
  SlidersHorizontal,
  ArrowUp,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  generateSora2Video,
  getSora2Tasks,
  Sora2TaskDetail,
  deleteSora2Task,
  createShare,
  CreateShareResponse,
} from '@/api/sora'
import { EnhancedVideoPlayer } from '@/components/chat/EnhancedVideoPlayer'
import { useAuth } from '@/contexts/AuthContext'
import { useConfigs } from '@/contexts/configs'
import { refreshUserAvatar, logout } from '@/api/auth'

export const Route = createFileRoute('/sora')({
  component: SoraPage,
})

interface GeneratedVideo {
  id: string
  prompt: string
  videoUrl: string
  status: 'processing' | 'completed' | 'failed'
  createdAt: Date
  remark?: string // 错误信息或备注
  views?: number // 访问量
  likes?: number // 点赞量
}

// 状态映射：后端状态 -> 前端状态
const mapStatus = (
  backendStatus: 'running' | 'success' | 'failed'
): 'processing' | 'completed' | 'failed' => {
  if (backendStatus === 'running') return 'processing'
  if (backendStatus === 'success') return 'completed'
  return 'failed'
}

// 任务详情 -> 前端视频对象
const taskToVideo = (task: Sora2TaskDetail): GeneratedVideo => ({
  id: task.id.toString(),
  prompt: task.prompt,
  videoUrl: task.video_url,
  status: mapStatus(task.status),
  createdAt: new Date(task.ctime),
  remark: task.remark,
  views: task.views ?? 0,
  likes: task.likes ?? 0,
})

// 视频卡片底部操作按钮组件
interface VideoCardActionsProps {
  videoUrl: string
  videoId: string
}

const VideoCardActions: React.FC<VideoCardActionsProps> = ({ videoUrl, videoId }) => {
  const [isMuted, setIsMuted] = useState(true)
  const [isExpanded, setIsExpanded] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  // 查找视频元素（通过videoId）
  useEffect(() => {
    const findVideo = () => {
      // 查找父容器中的 video 元素
      const container = document.querySelector(`[data-video-id="${videoId}"]`)
      if (container) {
        const video = container.querySelector('video')
        if (video) {
          videoRef.current = video
          setIsMuted(video.muted)
        }
      }
    }

    // 延迟查找，确保视频元素已渲染
    setTimeout(findVideo, 100)
  }, [videoId])

  // 音量切换
  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation()
    const video = videoRef.current
    if (video) {
      video.muted = !video.muted
      setIsMuted(video.muted)
    }
  }

  // 页面内放大切换（9:16比例）
  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsExpanded(!isExpanded)

    // 触发自定义事件通知父组件
    const event = new CustomEvent('video-expand-toggle', {
      detail: { videoId, isExpanded: !isExpanded }
    })
    window.dispatchEvent(event)
  }

  // 下载视频
  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const response = await fetch(videoUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `video_${videoId}.mp4`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      // 跨域失败时直接打开链接
      window.open(videoUrl, '_blank')
    }
  }

  return (
    <div className='absolute bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black/80 via-black/60 to-transparent px-3 py-2'>
      {/* 按钮组 - 均匀分布 */}
      <div className='flex items-center justify-between gap-2'>
        {/* 音量按钮 */}
        <button
          onClick={toggleMute}
          className='flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all duration-200 group'
          title={isMuted ? '取消静音' : '静音'}
        >
          {isMuted ? (
            <VolumeX className='w-4 h-4 text-white group-hover:scale-110 transition-transform' />
          ) : (
            <Volume2 className='w-4 h-4 text-white group-hover:scale-110 transition-transform' />
          )}
        </button>

        {/* 放大按钮 */}
        <button
          onClick={toggleExpand}
          className='flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all duration-200 group'
          title={isExpanded ? '缩小' : '放大'}
        >
          <Maximize2 className={`w-4 h-4 text-white group-hover:scale-110 transition-transform ${isExpanded ? 'text-blue-400' : ''}`} />
        </button>

        {/* 下载按钮 */}
        <button
          onClick={handleDownload}
          className='flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all duration-200 group'
          title='下载视频'
        >
          <Download className='w-4 h-4 text-white group-hover:scale-110 transition-transform' />
        </button>
      </div>
    </div>
  )
}

function SoraPage() {
  const { t } = useTranslation('sora')
  const { t: tCommon } = useTranslation('common')
  const navigate = useNavigate()
  const { authStatus, isLoading: isAuthLoading } = useAuth()
  const { setShowLoginDialog } = useConfigs()
  const [prompt, setPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [videos, setVideos] = useState<GeneratedVideo[]>([])
  const [isLoadingTasks, setIsLoadingTasks] = useState(true)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [_wsConnected, setWsConnected] = useState(false)
  const [runningTasksCount, setRunningTasksCount] = useState(0) // 运行中任务计数

  // 检查是否达到运行上限（3个）
  const MAX_RUNNING_TASKS = 3
  const hasReachedLimit = runningTasksCount >= MAX_RUNNING_TASKS

  // 删除确认对话框状态
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [videoToDelete, setVideoToDelete] = useState<string | null>(null)

  // 视频放大状态
  const [expandedVideoId, setExpandedVideoId] = useState<string | null>(null)

  // 检查登录状态 & image_url
  useEffect(() => {
    const checkAuthAndImageUrl = async () => {
      if (!isAuthLoading) {
        // 检查是否未登录
        if (!authStatus.is_logged_in) {
          console.log('🔒 [Sora] 用户未登录，显示登录对话框')
          setShowLoginDialog(true)
          return
        }

        // 检查image_url是否缺失（直接从user_info检查）
        const imageUrl = authStatus.user_info?.image_url
        const isImageUrlMissing = !imageUrl || imageUrl.trim() === ''

        // console.log('🖼️ [Sora] 检查用户头像:', {
        //   imageUrl,
        //   isImageUrlMissing,
        //   userInfo: authStatus.user_info,
        // })

        if (isImageUrlMissing) {
          // console.log('🖼️ [Sora] 用户image_url缺失，静默退出登录')

          // 静默退出登录（不显示错误提示）
          try {
            await logout()
            // console.log('✅ [Sora] 退出登录成功')
            // 退出后显示登录对话框
            setShowLoginDialog(true)
          } catch (error) {
            console.error('❌ [Sora] 退出登录失败:', error)
            // 即使退出失败也显示登录对话框
            setShowLoginDialog(true)
          }
        }
      }
    }

    checkAuthAndImageUrl()
  }, [isAuthLoading, authStatus.is_logged_in, authStatus.user_info, setShowLoginDialog, t])

  // 刷新用户头像（如果需要）
  useEffect(() => {
    const checkAndRefreshAvatar = async () => {
      // 只在用户已登录时检查头像
      if (!isAuthLoading && authStatus.is_logged_in) {
        try {
          // console.log('📸 [Sora] 检查用户头像...')
          const result = await refreshUserAvatar()
          if (result.success && result.image_url) {
            // console.log('✅ [Sora] 用户头像存在:', result.image_url)
          } else {
            console.warn('⚠️ [Sora] 用户头像为空:', result.message)
          }
        } catch (error) {
          console.error('❌ [Sora] 刷新头像时出错:', error)
        }
      }
    }

    checkAndRefreshAvatar()
  }, [isAuthLoading, authStatus.is_logged_in])

  // 分享对话框状态
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [shareData, setShareData] = useState<CreateShareResponse | null>(null)
  const [_isCreatingShare, setIsCreatingShare] = useState(false)

  // 积分不足对话框状态
  const [pointsDialogOpen, setPointsDialogOpen] = useState(false)
  const [currentPoints, setCurrentPoints] = useState<number>(0)

  // 监听视频放大事件
  useEffect(() => {
    const handleExpandToggle = (event: Event) => {
      const customEvent = event as CustomEvent<{ videoId: string; isExpanded: boolean }>
      const { videoId, isExpanded } = customEvent.detail
      setExpandedVideoId(isExpanded ? videoId : null)
    }

    window.addEventListener('video-expand-toggle', handleExpandToggle)
    return () => window.removeEventListener('video-expand-toggle', handleExpandToggle)
  }, [])

  // 键盘ESC关闭支持
  useEffect(() => {
    if (!expandedVideoId) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExpandedVideoId(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [expandedVideoId])

  // WebSocket连接逻辑
  const connectWebSocket = useCallback(() => {
    // 如果已经连接，不重复连接
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // console.log('⚠️ [Sora WS] 已存在活跃连接，跳过重连')
      return
    }

    // console.log('🔌 [Sora WS] 建立WebSocket连接...')

    // 从 cookie 中获取 client_auth_token（非httpOnly，供前端使用）
    const authToken = getCookie('client_auth_token')
    if (!authToken) {
      console.error('❌ [Sora WS] 无法获取认证token，取消WebSocket连接')
      setIsLoadingTasks(false)
      return
    }

    // 构建WebSocket URL（HTTP协议对应ws，HTTPS对应wss）
    // 使用独立路径 /ws-sora2/tasks，避免被 Nginx location / 的错误配置捕获
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    // 🔑 将token作为query参数传递
    const wsUrl = `${protocol}//${window.location.host}/ws-sora2/tasks?token=${encodeURIComponent(authToken)}`

    try {
      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        // console.log('✅ [Sora WS] WebSocket连接已建立')
        setWsConnected(true)
        setIsLoadingTasks(false)

        // 发送ping保持连接
        const pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping')
          } else {
            clearInterval(pingInterval)
          }
        }, 30000) // 每30秒ping一次
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          // console.log('📨 [Sora WS] 收到消息:', message.type)

          if (message.type === 'tasks_update') {
            const { tasks, running_count } = message.data
            const loadedVideos = tasks.map(taskToVideo)

            // 更新运行中任务计数
            if (typeof running_count === 'number') {
              setRunningTasksCount(running_count)
            }

            // 检测状态变化（用于通知）
            setVideos((previousVideos) => {
              loadedVideos.forEach((newVideo: GeneratedVideo) => {
                const oldVideo = previousVideos.find((v) => v.id === newVideo.id)
                if (oldVideo && oldVideo.status === 'processing') {
                  if (newVideo.status === 'completed') {
                    // console.log(`  ✅ [Sora WS] 任务 #${newVideo.id} 生成成功`)
                    toast.success(t('toast.videoCompleted'), {
                      description: newVideo.prompt.substring(0, 50) + '...',
                    })
                  } else if (newVideo.status === 'failed') {
                    // console.log(`  ❌ [Sora WS] 任务 #${newVideo.id} 生成失败`)
                    toast.error(t('toast.videoFailed'), {
                      description: newVideo.remark || t('toast.retryHint'),
                    })
                  }
                }
              })

              return loadedVideos
            })

            // console.log(`🔄 [Sora WS] 任务列表已更新: ${loadedVideos.length} 个任务`)
          } else if (message.type === 'pong') {
            // ping/pong心跳响应
            // console.log('💓 [Sora WS] Pong received')
          }
        } catch (error) {
          console.error('❌ [Sora WS] 解析消息失败:', error)
        }
      }

      ws.onerror = (error) => {
        console.error('❌ [Sora WS] WebSocket错误:', error)
        setWsConnected(false)
      }

      ws.onclose = (event) => {
        console.log(`🔌 [Sora WS] WebSocket连接关闭 - code: ${event.code}, reason: ${event.reason}`)
        setWsConnected(false)

        // 5秒后自动重连
        console.log('⏰ [Sora WS] 将在5秒后尝试重连...')
        reconnectTimerRef.current = setTimeout(() => {
          console.log('🔄 [Sora WS] 尝试重新连接...')
          connectWebSocket()
        }, 5000)
      }

      wsRef.current = ws
    } catch (error) {
      console.error('❌ [Sora WS] 创建WebSocket连接失败:', error)
      setWsConnected(false)

      // 失败后也尝试重连
      reconnectTimerRef.current = setTimeout(() => {
        connectWebSocket()
      }, 5000)
    }
  }, [t])

  // 页面加载时建立WebSocket连接（仅在用户登录后）
  useEffect(() => {
    // 只有在认证完成且用户已登录时才建立连接
    if (isAuthLoading) {
      // console.log('⏳ [Sora] 等待认证完成...')
      return
    }

    if (!authStatus.is_logged_in) {
      // console.log('🔒 [Sora] 用户未登录，跳过WebSocket连接')
      setIsLoadingTasks(false)
      return
    }

    // console.log('🎬 [Sora] 用户已登录，建立WebSocket连接')
    connectWebSocket()

    // 组件卸载时清理连接
    return () => {
      // console.log('🧹 [Sora] 组件卸载，清理WebSocket连接')

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }

      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connectWebSocket, isAuthLoading, authStatus.is_logged_in])

  const handleGenerate = async () => {
    // 检查登录状态
    if (!authStatus.is_logged_in) {
      // console.log('🔒 [Sora] 用户未登录，显示登录对话框')
      setShowLoginDialog(true)
      return
    }

    if (!prompt.trim()) {
      toast.error(tCommon('messages.error'), {
        description: t('toast.enterPrompt'),
      })
      return
    }

    setIsGenerating(true)
    const tempId = `temp-${Date.now()}`

    // 添加临时视频卡片
    const newVideo: GeneratedVideo = {
      id: tempId,
      prompt: prompt,
      videoUrl: '',
      status: 'processing',
      createdAt: new Date(),
    }
    setVideos((prev) => [newVideo, ...prev])

    try {
      const result = await generateSora2Video({
        prompt: prompt.trim(),
        model: 'sora2',
        aspect_ratio: '9:16',
        duration: 5,
      })

      // 检查是否积分不足
      if (result.status === 'insufficient_points') {
        // 提取当前积分数
        const match = result.message.match(/当前积分[：:]\s*(\d+)/)
        if (match) {
          setCurrentPoints(parseInt(match[1]))
        }
        setPointsDialogOpen(true)

        // 移除临时视频卡片
        setVideos((prev) => prev.filter((v) => v.id !== tempId))
        setIsGenerating(false)
        return
      }

      // 检查是否达到运行上限
      if (result.status === 'running_limit_exceeded') {
        toast.error(tCommon('messages.error'), {
          description: result.message || '同时运行的任务已达上限，请等待当前任务完成后再试',
        })

        // 移除临时视频卡片
        setVideos((prev) => prev.filter((v) => v.id !== tempId))
        setIsGenerating(false)
        return
      }

      // 更新视频状态（使用真实的任务ID）
      setVideos((prev) =>
        prev.map((v) =>
          v.id === tempId
            ? {
                ...v,
                id: result.task_id,
                status: 'processing', // 异步模式下总是 processing
              }
            : v
        )
      )

      toast.success(t('toast.submitted'), {
        description: t('toast.generating'),
      })

      // 清空输入框并重置高度
      setPrompt('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }

      // 任务提交后，后端会通过WebSocket推送最新状态
      // console.log('✅ [Sora] 任务提交成功，任务ID:', result.task_id)
    } catch (error) {
      console.error('视频生成失败:', error)

      const errorMessage = error instanceof Error ? error.message : String(error || '任务提交失败')
      toast.error(tCommon('messages.error'), {
        description: errorMessage,
      })

      // 移除失败的临时视频
      setVideos((prev) => prev.filter((v) => v.id !== tempId))
    } finally {
      setIsGenerating(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleGenerate()
    }
  }

  // 打开删除确认对话框
  const openDeleteDialog = (videoId: string) => {
    setVideoToDelete(videoId)
    setDeleteDialogOpen(true)
  }

  // 执行删除操作
  const handleDelete = async () => {
    if (!videoToDelete) return

    try {
      // console.log(`🗑️ [Sora] 删除任务 #${videoToDelete}`)
      await deleteSora2Task(videoToDelete)

      // 从列表中移除
      setVideos((prev) => prev.filter((v) => v.id !== videoToDelete))

      toast.success(t('toast.deleteSuccess'))

      // console.log(`✅ [Sora] 任务 #${videoToDelete} 删除成功`)
    } catch (error) {
      console.error('删除任务失败:', error)
      toast.error(t('toast.deleteFailed'), {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setDeleteDialogOpen(false)
      setVideoToDelete(null)
    }
  }

  // 分享功能 - 创建分享链接
  const handleShare = async (video: GeneratedVideo) => {
    if (video.status !== 'completed' || !video.videoUrl) {
      toast.error(t('toast.shareFailed'))
      return
    }

    setIsCreatingShare(true)
    try {
      // 调用API创建分享
      const shareResponse = await createShare(parseInt(video.id))
      setShareData(shareResponse)
      setShareDialogOpen(true)

      // console.log('✅ [Sora] 分享创建成功:', shareResponse)
    } catch (error) {
      console.error('分享失败:', error)
      toast.error(t('toast.shareFailed'), {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setIsCreatingShare(false)
    }
  }

  // 复制分享链接
  const copyShareLink = async () => {
    if (!shareData) return

    try {
      await navigator.clipboard.writeText(shareData.share_url)
      toast.success(t('toast.copySuccess'))
    } catch (error) {
      console.error('复制失败:', error)
      toast.error(t('toast.copyFailed'))
    }
  }

  return (
    <div className='flex flex-col h-screen relative overflow-hidden bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 dark:from-gray-900 dark:via-purple-900/20 dark:to-blue-900/20'>
      <TopMenu />

      <ScrollArea className='flex-1 relative z-10'>
        <div className='relative flex flex-col items-center pt-8 px-4 sm:px-6 pb-40'>
          {/* 标题区域 */}
          <div className='w-full max-w-6xl mx-auto mb-8'>
            <div className='flex items-center justify-center gap-3 mb-4'>
              <h1 className='text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100'>
                {t('title')}
              </h1>
            </div>
            <p className='text-center text-gray-600 dark:text-gray-400 text-sm sm:text-base mb-2'>
              {t('subtitle')}
            </p>


            {/* 操作按钮组 */}
            <div className='flex justify-center gap-3'>
              {/* 广场视频按钮 */}
              <Button
                variant='outline'
                onClick={() => navigate({ to: '/discover' })}
                className='group bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600 transition-all'
              >
                <Video className='w-4 h-4 mr-2 text-purple-600 dark:text-purple-400' />
                <span className='text-gray-900 dark:text-gray-100'>{t('discoverButton')}</span>
              </Button>

              {/* 反馈问题按钮 */}
              <Button
                variant='outline'
                onClick={() =>
                  window.open('https://twitter.com/intent/tweet?text=@vbarter', '_blank')
                }
                className='group bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition-all'
              >
                <MessageCircle className='w-4 h-4 mr-2 text-blue-600 dark:text-blue-400' />
                <span className='text-gray-900 dark:text-gray-100'>{t('feedbackButton')}</span>
                <ArrowUpRight className='w-3 h-3 ml-1 text-gray-500 dark:text-gray-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform' />
              </Button>
            </div>
          </div>

          {/* 视频列表 */}
          <div className='w-full max-w-6xl mx-auto'>
            {isLoadingTasks ? (
              <div className='flex flex-col items-center justify-center py-20 text-gray-400'>
                <Loader2 className='w-16 h-16 mb-4 opacity-50 animate-spin' />
                <p className='text-lg'>{t('loadingTasks')}</p>
              </div>
            ) : videos.length === 0 ? (
              <div className='flex flex-col items-center justify-center py-20 text-gray-400'>
                <Sparkles className='w-16 h-16 mb-4 opacity-50' />
                <p className='text-lg'>{t('emptyState')}</p>
              </div>
            ) : (
              <>
                {/* 沉浸式全屏视频查看器 */}
                {expandedVideoId && videos.find(v => v.id === expandedVideoId) && (
                  <div
                    className='fixed inset-0 z-50 bg-black flex items-center justify-center'
                    onClick={(e) => {
                      // 点击背景区域关闭（不包括视频和信息面板）
                      if (e.target === e.currentTarget) {
                        setExpandedVideoId(null)
                      }
                    }}
                  >
                    {(() => {
                      const currentIndex = videos.findIndex(v => v.id === expandedVideoId)
                      const video = videos[currentIndex]

                      return (
                        <>

                          {/* 主内容区域 */}
                          <div className='flex items-center justify-center gap-8 h-full max-w-7xl mx-auto px-4'>
                            {/* 视频容器 */}
                            <div className='flex-shrink-0 h-[90vh] aspect-[9/16] relative bg-black rounded-lg overflow-hidden shadow-2xl'>
                              <div className='absolute inset-0' data-video-id={video.id}>
                                <EnhancedVideoPlayer
                                  content=''
                                  videoUrl={video.videoUrl}
                                  videoId={video.id}
                                  fillContainer={true}
                                />
                              </div>

                              {/* 底部控制按钮 */}
                              <VideoCardActions videoUrl={video.videoUrl} videoId={video.id} />
                            </div>

                            {/* 右侧信息面板 */}
                            <div className='flex-shrink-0 w-80 h-[90vh] flex flex-col gap-6 text-white'>
                              {/* 用户信息 */}
                              <div className='flex flex-col gap-2'>
                                <p className='font-semibold text-xl'>创作者</p>
                                <div className='flex items-center gap-2 text-sm text-gray-400'>
                                  <Clock className='w-4 h-4' />
                                  <span>{new Date(video.createdAt).toLocaleDateString('zh-CN', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                  })}</span>
                                </div>
                              </div>

                              {/* 分隔线 */}
                              <div className='h-px bg-gray-700' />

                              {/* 提示词 */}
                              <div className='flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent'>
                                <h3 className='text-sm font-semibold text-gray-400 mb-2'>视频提示词</h3>
                                <p className='text-base leading-relaxed text-gray-200'>
                                  {video.prompt}
                                </p>
                              </div>

                              {/* 分隔线 */}
                              <div className='h-px bg-gray-700' />

                              {/* 互动数据 */}
                              <div className='flex items-center gap-6'>
                                <div className='flex items-center gap-2'>
                                  <Heart className='w-5 h-5 text-red-400' />
                                  <span className='text-lg font-semibold'>{video.likes ?? 0}</span>
                                </div>
                                <div className='flex items-center gap-2'>
                                  <Eye className='w-5 h-5 text-blue-400' />
                                  <span className='text-lg font-semibold'>{video.views ?? 0}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </>
                      )
                    })()}
                  </div>
                )}

                {/* 视频网格 */}
                <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5 sm:gap-2'>
                  {videos.map((video) => (
                    <div key={video.id} className='relative group'>
                        {/* 统一的9:16容器 - 确保所有卡片尺寸一致 */}
                        <div className='w-full aspect-[9/16] relative overflow-hidden bg-black rounded-lg'>
                      {/* 统计信息 - 左上角 */}
                      <div className='absolute top-2 left-2 z-30 flex items-center gap-0.5 sm:gap-1'>
                        {/* 播放量 */}
                        <div className='flex items-center gap-0.5 sm:gap-1 px-1 sm:px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm text-white'>
                          <Eye className='w-2.5 h-2.5 sm:w-3 sm:h-3' />
                          <span className='text-[10px] sm:text-xs font-medium'>
                            {video.views ?? 0}
                          </span>
                        </div>
                        {/* 点赞量 */}
                        <div className='flex items-center gap-0.5 sm:gap-1 px-1 sm:px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm text-white'>
                          <Heart className='w-2.5 h-2.5 sm:w-3 sm:h-3' />
                          <span className='text-[10px] sm:text-xs font-medium'>
                            {video.likes ?? 0}
                          </span>
                        </div>
                      </div>

                      {/* 操作按钮组 - 右上角 */}
                      <div className='absolute top-2 right-2 z-30 flex gap-1.5'>
                        {/* 分享按钮 */}
                        {video.status === 'completed' && (
                          <button
                            onClick={() => handleShare(video)}
                            className='p-1.5 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-sm text-white transition-all duration-200 hover:scale-110'
                            title={t('shareVideo')}
                          >
                            <Share2 className='w-3.5 h-3.5' />
                          </button>
                        )}

                        {/* 删除按钮 */}
                        <button
                          onClick={() => openDeleteDialog(video.id)}
                          className='p-1.5 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-sm text-white transition-all duration-200 hover:scale-110'
                          title={t('deleteTask')}
                        >
                          <Trash2 className='w-3.5 h-3.5' />
                        </button>
                      </div>

                      {/* 内容区域 - 填充整个容器 */}
                      {video.status === 'processing' ? (
                        <div className='absolute inset-0 bg-gray-100 dark:bg-gray-800 flex flex-col items-center justify-center'>
                          <Loader2 className='w-8 h-8 animate-spin text-gray-900 dark:text-gray-100 mb-2' />
                          <p className='text-xs text-gray-600 dark:text-gray-300 text-center px-4'>
                            {t('generating')}
                          </p>
                        </div>
                      ) : video.status === 'completed' && video.videoUrl ? (
                        <>
                          <div className='absolute inset-0' data-video-id={video.id}>
                            <EnhancedVideoPlayer
                              content=''
                              videoUrl={video.videoUrl}
                              videoId={video.id}
                              fillContainer={true}
                            />
                          </div>

                          {/* 底部固定按钮组 */}
                          <VideoCardActions videoUrl={video.videoUrl} videoId={video.id} />
                        </>
                      ) : (
                        <div
                          className='absolute inset-0 z-10 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 flex flex-col items-center justify-center'
                          style={{
                            backgroundImage: 'url(/magicart.png)',
                            backgroundSize: '50%',
                            backgroundPosition: 'center',
                            backgroundRepeat: 'no-repeat',
                          }}
                        >
                          {/* 半透明遮罩 */}
                          <div className='absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm' />

                          {/* 错误提示 - 只显示"生成失败" */}
                          <div className='relative z-10 text-center'>
                            <div className='text-red-400 mb-2'>
                              <AlertTriangle className='w-12 h-12 mx-auto' />
                            </div>
                            <p className='text-base font-semibold text-white'>
                              {t('generationFailed')}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* 固定在底部的输入框 - 只在非放大模式下显示 */}
      {!expandedVideoId && (
        <div className='fixed bottom-0 left-0 right-0 z-50 pb-6 px-4'>
          <div className='max-w-4xl mx-auto'>
            <div
              className={`relative backdrop-blur-xl bg-gray-900/90 dark:bg-gray-800/90 rounded-2xl shadow-2xl border border-gray-700/50 dark:border-gray-600/50 ${
                !authStatus.is_logged_in
                  ? 'cursor-pointer hover:border-gray-600 dark:hover:border-gray-500 transition-colors'
                  : ''
              }`}
              onClick={() => {
                if (!authStatus.is_logged_in) {
                  setShowLoginDialog(true)
                }
              }}
            >
              {/* 输入框容器 */}
              <div className='relative px-4 py-3'>
                {/* 输入框 */}
                <Textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => {
                    setPrompt(e.target.value)
                    // Auto-resize with screen height limit
                    e.target.style.height = 'auto'
                    const maxHeight = window.innerHeight * 0.4 // 最大高度为屏幕高度的40%
                    const scrollHeight = e.target.scrollHeight
                    e.target.style.height = Math.min(scrollHeight, maxHeight) + 'px'

                    // 动态控制overflow - 只在达到最大高度时才允许滚动
                    if (scrollHeight > maxHeight) {
                      e.target.style.overflowY = 'auto'
                    } else {
                      e.target.style.overflowY = 'hidden'
                    }
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    !authStatus.is_logged_in
                      ? tCommon('auth.loginDescription')
                      : hasReachedLimit
                      ? `正在生成: ${runningTasksCount}/${MAX_RUNNING_TASKS} 已达上限，请等待任务完成后再试`
                      : runningTasksCount > 0
                      ? `${t('placeholder')} (正在生成: ${runningTasksCount}/${MAX_RUNNING_TASKS})`
                      : t('placeholder')
                  }
                  className='w-full min-h-[40px] resize-none bg-transparent border-none text-gray-100 dark:text-gray-100 placeholder:text-gray-500 focus-visible:ring-0 focus-visible:ring-offset-0 pr-14 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]'
                  style={{ maxHeight: `${window.innerHeight * 0.4}px`, overflowY: 'hidden' }}
                  disabled={!authStatus.is_logged_in || isGenerating || hasReachedLimit}
                />

                {/* 发送按钮 - 固定在右下角 */}
                <Button
                  onClick={handleGenerate}
                  disabled={
                    !authStatus.is_logged_in || isGenerating || hasReachedLimit || !prompt.trim()
                  }
                  size='icon'
                  className='absolute bottom-4 right-5 h-10 w-10 rounded-xl bg-gray-200/90 hover:bg-gray-300/90 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all'
                  title={hasReachedLimit ? '已达运行上限（3个），请等待任务完成' : ''}
                >
                  {isGenerating || hasReachedLimit ? (
                    <Loader2 className='w-5 h-5 animate-spin' />
                  ) : (
                    <ArrowUp className='w-5 h-5' />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认对话框 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              <AlertTriangle className='w-5 h-5 text-red-500' />
              {t('deleteDialog.title')}
            </DialogTitle>
            <DialogDescription className='text-base pt-2'>
              {t('deleteDialog.description')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className='flex-row gap-2 sm:gap-2'>
            <Button variant='outline' onClick={() => setDeleteDialogOpen(false)} className='flex-1'>
              {t('buttons.cancel')}
            </Button>
            <Button variant='destructive' onClick={handleDelete} className='flex-1'>
              {t('buttons.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 分享对话框 */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              <Share2 className='w-5 h-5 text-gray-900 dark:text-gray-100' />
              {t('shareDialog.title')}
            </DialogTitle>
            <DialogDescription className='text-base pt-2'>
              {t('shareDialog.copyLink')}
            </DialogDescription>
          </DialogHeader>

          {shareData && (
            <div className='space-y-4'>
              {/* 分享链接 */}
              <div className='flex items-center gap-2 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700'>
                <input
                  type='text'
                  value={shareData.share_url}
                  readOnly
                  className='flex-1 bg-transparent text-sm font-mono text-gray-900 dark:text-gray-100 outline-none'
                />
                <Button
                  size='sm'
                  onClick={copyShareLink}
                  className='bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-gray-200 text-white dark:text-gray-900'
                >
                  {t('buttons.copy')}
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant='outline' onClick={() => setShareDialogOpen(false)} className='w-full'>
              {t('buttons.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 积分不足对话框 */}
      <Dialog open={pointsDialogOpen} onOpenChange={setPointsDialogOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2 text-gray-900 dark:text-gray-100'>
              <AlertTriangle className='w-5 h-5 text-gray-900 dark:text-gray-100' />
              {t('pointsDialog.title')}
            </DialogTitle>
            <DialogDescription className='text-base pt-2 text-gray-600 dark:text-gray-400'>
              {t('pointsDialog.description', { points: currentPoints })}
            </DialogDescription>
          </DialogHeader>

          <div className='py-4'>
            {/* 免费获取提示 */}
            <div className='bg-gray-100 dark:bg-gray-800 p-4 rounded-lg border border-gray-300 dark:border-gray-700'>
              <div className='flex items-start gap-3'>
                <div className='text-2xl'>🎁</div>
                <div className='flex-1'>
                  <h4 className='font-semibold text-gray-900 dark:text-gray-100 mb-1'>
                    {t('pointsDialog.freeTitle')}
                  </h4>
                  <p className='text-sm text-gray-600 dark:text-gray-400'>
                    {t('pointsDialog.freeDescription')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className='flex flex-col gap-2 pt-2'>
            <Button
              onClick={() => {
                setPointsDialogOpen(false)
                // 跳转到邀请页面
                window.location.href = '/invite'
              }}
              variant='outline'
              className='w-full border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800'
            >
              {t('buttons.inviteFriends')}
            </Button>
            <Button
              variant='ghost'
              onClick={() => setPointsDialogOpen(false)}
              className='w-full text-gray-600 dark:text-gray-400'
            >
              {t('buttons.cancel')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

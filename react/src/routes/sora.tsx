import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import TopMenu from '@/components/TopMenu'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, Send, Sparkles, Trash2, AlertTriangle, Share2, Eye, Heart, ArrowUpRight } from 'lucide-react'
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

function SoraPage() {
  const { t } = useTranslation('sora')
  const { t: tCommon } = useTranslation('common')
  const [prompt, setPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [videos, setVideos] = useState<GeneratedVideo[]>([])
  const [isLoadingTasks, setIsLoadingTasks] = useState(true)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [wsConnected, setWsConnected] = useState(false)

  // 检查是否有视频正在生成中
  const hasProcessingVideo = videos.some(video => video.status === 'processing')

  // 删除确认对话框状态
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [videoToDelete, setVideoToDelete] = useState<string | null>(null)

  // 分享对话框状态
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [shareData, setShareData] = useState<CreateShareResponse | null>(null)
  const [isCreatingShare, setIsCreatingShare] = useState(false)

  // 积分不足对话框状态
  const [pointsDialogOpen, setPointsDialogOpen] = useState(false)
  const [currentPoints, setCurrentPoints] = useState<number>(0)

  // WebSocket连接逻辑
  const connectWebSocket = useCallback(() => {
    // 如果已经连接，不重复连接
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('⚠️ [Sora WS] 已存在活跃连接，跳过重连')
      return
    }

    console.log('🔌 [Sora WS] 建立WebSocket连接...')

    // 构建WebSocket URL（HTTP协议对应ws，HTTPS对应wss）
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/api/ws/sora2/tasks`

    try {
      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        console.log('✅ [Sora WS] WebSocket连接已建立')
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
          console.log('📨 [Sora WS] 收到消息:', message.type)

          if (message.type === 'tasks_update') {
            const { tasks } = message.data
            const loadedVideos = tasks.map(taskToVideo)

            // 检测状态变化（用于通知）
            setVideos((previousVideos) => {
              loadedVideos.forEach((newVideo: GeneratedVideo) => {
                const oldVideo = previousVideos.find((v) => v.id === newVideo.id)
                if (oldVideo && oldVideo.status === 'processing') {
                  if (newVideo.status === 'completed') {
                    console.log(`  ✅ [Sora WS] 任务 #${newVideo.id} 生成成功`)
                    toast.success(t('toast.videoCompleted'), {
                      description: newVideo.prompt.substring(0, 50) + '...',
                    })
                  } else if (newVideo.status === 'failed') {
                    console.log(`  ❌ [Sora WS] 任务 #${newVideo.id} 生成失败`)
                    toast.error(t('toast.videoFailed'), {
                      description: newVideo.remark || t('toast.retryHint'),
                    })
                  }
                }
              })

              return loadedVideos
            })

            console.log(`🔄 [Sora WS] 任务列表已更新: ${loadedVideos.length} 个任务`)
          } else if (message.type === 'pong') {
            // ping/pong心跳响应
            console.log('💓 [Sora WS] Pong received')
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
        console.log(
          `🔌 [Sora WS] WebSocket连接关闭 - code: ${event.code}, reason: ${event.reason}`
        )
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
  }, [])

  // 页面加载时建立WebSocket连接
  useEffect(() => {
    console.log('🎬 [Sora] 组件挂载，建立WebSocket连接')
    connectWebSocket()

    // 组件卸载时清理连接
    return () => {
      console.log('🧹 [Sora] 组件卸载，清理WebSocket连接')

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }

      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connectWebSocket])

  const handleGenerate = async () => {
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

      // 清空输入框
      setPrompt('')

      // 任务提交后，后端会通过WebSocket推送最新状态
      console.log('✅ [Sora] 任务提交成功，任务ID:', result.task_id)
    } catch (error: any) {
      console.error('视频生成失败:', error)

      const errorMessage = error?.message || error?.toString() || '任务提交失败'
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
      console.log(`🗑️ [Sora] 删除任务 #${videoToDelete}`)
      await deleteSora2Task(videoToDelete)

      // 从列表中移除
      setVideos((prev) => prev.filter((v) => v.id !== videoToDelete))

      toast.success(t('toast.deleteSuccess'), {
        description: t('toast.deleteSuccess'),
      })

      console.log(`✅ [Sora] 任务 #${videoToDelete} 删除成功`)
    } catch (error) {
      console.error('删除任务失败:', error)
      toast.error(t('toast.deleteFailed'), {
        description: error instanceof Error ? error.message : t('toast.deleteFailed'),
      })
    } finally {
      setDeleteDialogOpen(false)
      setVideoToDelete(null)
    }
  }

  // 分享功能 - 创建分享链接
  const handleShare = async (video: GeneratedVideo) => {
    if (video.status !== 'completed' || !video.videoUrl) {
      toast.error(t('toast.shareFailed'), {
        description: t('toast.shareFailed'),
      })
      return
    }

    setIsCreatingShare(true)
    try {
      // 调用API创建分享
      const shareResponse = await createShare(parseInt(video.id))
      setShareData(shareResponse)
      setShareDialogOpen(true)

      console.log('✅ [Sora] 分享创建成功:', shareResponse)
    } catch (error) {
      console.error('分享失败:', error)
      toast.error(t('toast.shareFailed'), {
        description: error instanceof Error ? error.message : t('toast.shareFailed'),
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
    <div className="flex flex-col h-screen relative overflow-hidden bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 dark:from-gray-900 dark:via-purple-900/20 dark:to-blue-900/20">
      <TopMenu />

      <ScrollArea className="h-full relative z-10 pb-32">
        <div className="relative flex flex-col items-center pt-8 px-4 sm:px-6">
          {/* 标题区域 */}
          <div className="w-full max-w-6xl mx-auto mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100">
                {t('title')}
              </h1>
            </div>
            <p className="text-center text-gray-600 dark:text-gray-400 text-sm sm:text-base mb-4">
              {t('subtitle')}
            </p>

            {/* 反馈按钮 */}
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => window.open('https://twitter.com/intent/tweet?text=@vbarter', '_blank')}
                className="group bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-all"
              >
                <svg className="w-4 h-4 mr-2 text-gray-700 dark:text-gray-300" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                <span className="text-gray-900 dark:text-gray-100">{t('feedbackButton')}</span>
                <ArrowUpRight className="w-3 h-3 ml-1 text-gray-500 dark:text-gray-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </Button>
            </div>
          </div>

          {/* 视频列表 */}
          <div className="w-full max-w-6xl mx-auto">
            {isLoadingTasks ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <Loader2 className="w-16 h-16 mb-4 opacity-50 animate-spin" />
                <p className="text-lg">加载任务列表...</p>
              </div>
            ) : videos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <Sparkles className="w-16 h-16 mb-4 opacity-50" />
                <p className="text-lg">开始创作你的第一个视频吧！</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5 sm:gap-2">
                {videos.map((video) => (
                  <div key={video.id} className="relative group">
                    {/* 统一的9:16容器 - 确保所有卡片尺寸一致 */}
                    <div className="w-full aspect-[9/16] relative overflow-hidden bg-black rounded-lg">
                      {/* 统计信息 - 左上角 */}
                      <div className="absolute top-2 left-2 z-20 flex items-center gap-1">
                        {/* 播放量 */}
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm text-white">
                          <Eye className="w-3 h-3" />
                          <span className="text-xs font-medium">{video.views ?? 0}</span>
                        </div>
                        {/* 点赞量 */}
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm text-white">
                          <Heart className="w-3 h-3" />
                          <span className="text-xs font-medium">{video.likes ?? 0}</span>
                        </div>
                      </div>

                      {/* 操作按钮组 - 右上角 */}
                      <div className="absolute top-2 right-2 z-20 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        {/* 分享按钮 */}
                        {video.status === 'completed' && (
                          <button
                            onClick={() => handleShare(video)}
                            className="p-1.5 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-sm text-white transition-all duration-200 hover:scale-110"
                            title="分享"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* 删除按钮 */}
                        <button
                          onClick={() => openDeleteDialog(video.id)}
                          className="p-1.5 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-sm text-white transition-all duration-200 hover:scale-110"
                          title="删除任务"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* 内容区域 - 填充整个容器 */}
                      {video.status === 'processing' ? (
                        <div className="absolute inset-0 bg-gray-100 dark:bg-gray-800 flex flex-col items-center justify-center">
                          <Loader2 className="w-8 h-8 animate-spin text-gray-900 dark:text-gray-100 mb-2" />
                          <p className="text-xs text-gray-600 dark:text-gray-300 text-center px-4">
                            {t('generating')}
                          </p>
                        </div>
                      ) : video.status === 'completed' && video.videoUrl ? (
                        <div className="absolute inset-0">
                          <EnhancedVideoPlayer
                            content=""
                            videoUrl={video.videoUrl}
                            fillContainer={true}
                          />
                        </div>
                      ) : (
                        <div
                          className="absolute inset-0 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 flex flex-col items-center justify-center"
                          style={{
                            backgroundImage: 'url(/magicart.png)',
                            backgroundSize: '50%',
                            backgroundPosition: 'center',
                            backgroundRepeat: 'no-repeat',
                          }}
                        >
                          {/* 半透明遮罩 */}
                          <div className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm" />

                          {/* 错误提示 - 只显示"生成失败" */}
                          <div className="relative z-10 text-center">
                            <div className="text-red-400 mb-2">
                              <AlertTriangle className="w-12 h-12 mx-auto" />
                            </div>
                            <p className="text-base font-semibold text-white">
                              生成失败
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* 固定在底部的输入框 */}
      <div className="fixed bottom-0 left-0 right-0 z-50 pb-6 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="relative backdrop-blur-xl bg-white/80 dark:bg-gray-800/80 rounded-xl px-6 py-4 shadow-2xl border border-gray-200/50 dark:border-gray-700/50">
            <Textarea
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value)
                // Auto-resize
                e.target.style.height = 'auto'
                e.target.style.height = e.target.scrollHeight + 'px'
              }}
              onKeyDown={handleKeyDown}
              placeholder={t('placeholder')}
              className="w-full min-h-[56px] resize-none bg-transparent border-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0 pr-16 overflow-hidden"
              style={{ maxHeight: 'none' }}
              disabled={isGenerating || hasProcessingVideo}
            />
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || hasProcessingVideo || !prompt.trim()}
              size="icon"
              className="absolute bottom-4 right-4 rounded-full bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-gray-200 text-white dark:text-gray-900 h-12 w-12 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating || hasProcessingVideo ? (
                <Loader2 className="w-5 h-5 animate-spin text-gray-900 dark:text-gray-100" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* 删除确认对话框 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              {t('deleteDialog.title')}
            </DialogTitle>
            <DialogDescription className="text-base pt-2">
              {t('deleteDialog.description')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              className="flex-1"
            >
              {t('buttons.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              className="flex-1"
            >
              {t('buttons.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 分享对话框 */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="w-5 h-5 text-gray-900 dark:text-gray-100" />
              {t('shareDialog.title')}
            </DialogTitle>
            <DialogDescription className="text-base pt-2">
              {t('shareDialog.copyLink')}
            </DialogDescription>
          </DialogHeader>

          {shareData && (
            <div className="space-y-4">
              {/* 分享链接 */}
              <div className="flex items-center gap-2 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <input
                  type="text"
                  value={shareData.share_url}
                  readOnly
                  className="flex-1 bg-transparent text-sm font-mono text-gray-900 dark:text-gray-100 outline-none"
                />
                <Button
                  size="sm"
                  onClick={copyShareLink}
                  className="bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-gray-200 text-white dark:text-gray-900"
                >
                  {t('buttons.copy')}
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShareDialogOpen(false)}
              className="w-full"
            >
              {t('buttons.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 积分不足对话框 */}
      <Dialog open={pointsDialogOpen} onOpenChange={setPointsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
              <AlertTriangle className="w-5 h-5 text-gray-900 dark:text-gray-100" />
              {t('pointsDialog.title')}
            </DialogTitle>
            <DialogDescription className="text-base pt-2 text-gray-600 dark:text-gray-400">
              {t('pointsDialog.description', { points: currentPoints })}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {/* 免费获取提示 */}
            <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg border border-gray-300 dark:border-gray-700">
              <div className="flex items-start gap-3">
                <div className="text-2xl">🎁</div>
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                    {t('pointsDialog.freeTitle')}
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t('pointsDialog.freeDescription')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Button
              onClick={() => {
                setPointsDialogOpen(false)
                // 跳转到邀请页面
                window.location.href = '/invite'
              }}
              variant="outline"
              className="w-full border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              {t('buttons.inviteFriends')}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setPointsDialogOpen(false)}
              className="w-full text-gray-600 dark:text-gray-400"
            >
              {t('buttons.cancel')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

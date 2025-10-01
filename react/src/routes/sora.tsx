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
import { Loader2, Send, Sparkles, Trash2, AlertTriangle, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  generateSora2Video,
  getSora2Tasks,
  Sora2TaskDetail,
  deleteSora2Task,
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
})

function SoraPage() {
  const { t } = useTranslation('common')
  const [prompt, setPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [videos, setVideos] = useState<GeneratedVideo[]>([])
  const [isLoadingTasks, setIsLoadingTasks] = useState(true)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [wsConnected, setWsConnected] = useState(false)

  // 删除确认对话框状态
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [videoToDelete, setVideoToDelete] = useState<string | null>(null)

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
                    toast.success('视频生成完成！', {
                      description: newVideo.prompt.substring(0, 50) + '...',
                    })
                  } else if (newVideo.status === 'failed') {
                    console.log(`  ❌ [Sora WS] 任务 #${newVideo.id} 生成失败`)
                    toast.error('视频生成失败', {
                      description: newVideo.remark || '请重试',
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
      toast.error(t('messages.error'), {
        description: '请输入视频描述',
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

      toast.success('任务已提交！', {
        description: '视频正在后台生成中，将通过WebSocket实时推送状态...',
      })

      // 清空输入框
      setPrompt('')

      // 任务提交后，后端会通过WebSocket推送最新状态
      console.log('✅ [Sora] 任务提交成功，任务ID:', result.task_id)
    } catch (error) {
      console.error('视频生成失败:', error)
      toast.error(t('messages.error'), {
        description: error instanceof Error ? error.message : '任务提交失败',
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

      toast.success('任务已删除', {
        description: '视频任务已成功删除',
      })

      console.log(`✅ [Sora] 任务 #${videoToDelete} 删除成功`)
    } catch (error) {
      console.error('删除任务失败:', error)
      toast.error('删除失败', {
        description: error instanceof Error ? error.message : '删除任务失败',
      })
    } finally {
      setDeleteDialogOpen(false)
      setVideoToDelete(null)
    }
  }

  // 分享功能
  const handleShare = async (video: GeneratedVideo) => {
    if (video.status !== 'completed' || !video.videoUrl) {
      toast.error('无法分享', {
        description: '只能分享已完成的视频',
      })
      return
    }

    try {
      // 如果浏览器支持 Web Share API
      if (navigator.share) {
        await navigator.share({
          title: 'Sora2 视频',
          text: video.prompt,
          url: video.videoUrl,
        })
        toast.success('分享成功')
      } else {
        // 复制链接到剪贴板
        await navigator.clipboard.writeText(video.videoUrl)
        toast.success('链接已复制', {
          description: '视频链接已复制到剪贴板',
        })
      }
    } catch (error) {
      console.error('分享失败:', error)
      // 如果取消分享，不显示错误
      if (error instanceof Error && error.name !== 'AbortError') {
        toast.error('分享失败', {
          description: '请稍后重试',
        })
      }
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
              <Sparkles className="w-8 h-8 text-gray-800 dark:text-gray-200" />
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100">
                Sora2 视频生成
              </h1>
            </div>
            <p className="text-center text-gray-600 dark:text-gray-400 text-sm sm:text-base">
              使用 AI 将你的想象力转化为精彩视频
            </p>
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
                          <Loader2 className="w-8 h-8 animate-spin text-purple-600 dark:text-purple-400 mb-2" />
                          <p className="text-xs text-gray-600 dark:text-gray-300">
                            视频生成中...
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
          <div className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-full px-6 py-3 shadow-2xl border border-gray-200 dark:border-gray-700">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your video..."
              className="flex-1 min-h-[56px] max-h-[140px] resize-none bg-transparent border-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0 px-2"
              disabled={isGenerating}
            />
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              size="icon"
              className="rounded-full bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-gray-200 text-white dark:text-gray-900 shrink-0 h-12 w-12"
            >
              {isGenerating ? (
                <Loader2 className="w-5 h-5 animate-spin" />
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
              确认删除
            </DialogTitle>
            <DialogDescription className="text-base pt-2">
              确定要删除这个视频任务吗？此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              className="flex-1"
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              className="flex-1"
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { eventBus } from '@/lib/event'
import { PosterOutline } from '@/types/types'

export interface GeneratedImage {
  index: number
  success: boolean
  image_url?: string
  error?: string
}

export interface PosterImage {
  url: string
  index: number
}

export function usePosterPlugin() {
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState<string | number>('')

  // 监听进度更新事件
  useEffect(() => {
    const handleProgressUpdate = (data: { completed: number; total: number; success: boolean }) => {
      setProgress(`正在生成中... ${data.completed}/${data.total}`)
    }

    const handleCompleted = (data: { successCount: number; totalCount: number }) => {
      setIsGenerating(false)
      setProgress('')
    }

    eventBus.on('Poster::ProgressUpdate', handleProgressUpdate)
    eventBus.on('Poster::Completed', handleCompleted)

    return () => {
      eventBus.off('Poster::ProgressUpdate', handleProgressUpdate)
      eventBus.off('Poster::Completed', handleCompleted)
    }
  }, [])

  const generateOutline = async (topic: string): Promise<PosterOutline> => {
    setIsGenerating(true)
    setProgress('正在生成大纲...')
    
    try {
      const outlineResponse = await fetch('/api/plugin/poster/outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic })
      })
      const outlineData = await outlineResponse.json()
      
      if (outlineData.code !== 0) {
        throw new Error(outlineData.message || '生成大纲失败')
      }

      return {
        pages: outlineData.data.pages,
        outline: outlineData.data.outline
      }
    } catch (error) {
      console.error('Poster outline generation failed:', error)
      toast.error(error instanceof Error ? error.message : '生成大纲失败')
      throw error
    } finally {
      setIsGenerating(false)
      setProgress('')
    }
  }

  const generateImages = useCallback(async (
    pages: any[],
    fullOutline: string,
    topic: string,
    sessionId: string,
    canvasId?: string
  ) => {
    setIsGenerating(true)
    setProgress('正在生成中...')
    
    try {
      // 1. 调用生成接口
      const response = await fetch('/api/plugin/poster/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pages,
          full_outline: fullOutline,
          user_topic: topic,
          style: 'default',
          session_id: sessionId,
          canvas_id: canvasId
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to start generation')
      }

      const data = await response.json()

      // 后端返回格式: { code: 0, message: "success", data: { success: true, ... } }
      if (data.code !== 0 || !data.data?.success) {
        throw new Error(data.message || data.data?.message || 'Failed to start generation')
      }

      // 2. 立即返回成功，后续通过WebSocket接收结果
      // 保持 isGenerating 为 true，直到收到 WebSocket 事件
      return true

    } catch (error) {
      console.error('Failed to generate images:', error)
      setIsGenerating(false)
      toast.error(error instanceof Error ? error.message : '生成图片失败')
      throw error
    }
  }, [])

  return {
    generateOutline,
    generateImages,
    isGenerating,
    progress
  }
}

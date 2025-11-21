import React, { useEffect, useState } from 'react'
import { eventBus } from '@/lib/event'
import type { TEvents } from '@/lib/event-types'

interface ThinkingIndicatorProps {
  sessionId: string
  canvasId?: string | null
}

const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({ sessionId, canvasId }) => {
  const [isThinking, setIsThinking] = useState(false)

  useEffect(() => {
    // console.log('🎯 [ThinkingIndicator] Component mounted', { sessionId, canvasId })

    const handleThinkingStarted = (data: TEvents['Socket::Session::ThinkingStarted']) => {
      // console.log('🔥 [ThinkingIndicator] Thinking Started:', data)
      if (data.session_id !== sessionId) return
      if (canvasId && data.canvas_id && data.canvas_id !== canvasId) return
      setIsThinking(true)
    }

    const handleThinkingUpdate = (data: TEvents['Socket::Session::ThinkingUpdate']) => {
      // console.log('🔥 [ThinkingIndicator] Thinking Update:', data)
      if (data.session_id !== sessionId) return
      if (canvasId && data.canvas_id && data.canvas_id !== canvasId) return
      // 保持thinking状态
      setIsThinking(true)
    }

    const handleThinkingComplete = (data: TEvents['Socket::Session::ThinkingComplete']) => {
      // console.log('🔥 [ThinkingIndicator] Thinking Complete:', data)
      if (data.session_id !== sessionId) return
      if (canvasId && data.canvas_id && data.canvas_id !== canvasId) return
      setIsThinking(false)
    }

    // 处理 done 事件（生成完成）
    const handleDone = (data: any) => {
      // console.log('🔥 [ThinkingIndicator] Done event:', data)
      if (data.session_id !== sessionId) return
      if (canvasId && data.canvas_id && data.canvas_id !== canvasId) return
      setIsThinking(false)
    }

    // 处理取消事件
    const handleCancelled = () => {
      // console.log('🔥 [ThinkingIndicator] Generation cancelled')
      setIsThinking(false)
    }

    // 注册事件监听
    eventBus.on('Socket::Session::ThinkingStarted', handleThinkingStarted)
    eventBus.on('Socket::Session::ThinkingUpdate', handleThinkingUpdate)
    eventBus.on('Socket::Session::ThinkingComplete', handleThinkingComplete)
    eventBus.on('Socket::Session::Done', handleDone)
    eventBus.on('generation:cancelled', handleCancelled)

    return () => {
      eventBus.off('Socket::Session::ThinkingStarted', handleThinkingStarted)
      eventBus.off('Socket::Session::ThinkingUpdate', handleThinkingUpdate)
      eventBus.off('Socket::Session::ThinkingComplete', handleThinkingComplete)
      eventBus.off('Socket::Session::Done', handleDone)
      eventBus.off('generation:cancelled', handleCancelled)
    }
  }, [sessionId, canvasId])

  if (!isThinking) {
    return null
  }

  return (
    <div className='flex items-center gap-2 text-gray-600 dark:text-gray-400'>
      {/* 脉冲转圈动画 */}
      <div className='relative w-5 h-5'>
        <div className='absolute inset-0 rounded-full border-2 border-gray-300 dark:border-gray-600'></div>
        <div className='absolute inset-0 rounded-full border-2 border-t-blue-500 animate-spin'></div>
        <div className='absolute inset-0 rounded-full bg-blue-500 opacity-20 animate-ping'></div>
      </div>

      {/* 简单的文本 */}
      <span className='text-sm font-medium animate-pulse'>Thinking...</span>
    </div>
  )
}

export default ThinkingIndicator

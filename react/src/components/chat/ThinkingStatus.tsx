import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { eventBus, TEvents } from '@/lib/event'
import { Brain, Loader2, Sparkles, Zap, Search, Code, Palette, FileSearch } from 'lucide-react'
import ShinyText from '../ui/shiny-text'

interface ThinkingState {
  isThinking: boolean
  message: string
  step?: string
  details?: string[]
  startTime?: number
}

interface ThinkingStatusProps {
  sessionId: string | null
  canvasId?: string
}

const ThinkingStatus: React.FC<ThinkingStatusProps> = ({ sessionId, canvasId }) => {
  const [thinkingState, setThinkingState] = useState<ThinkingState>({
    isThinking: false,
    message: 'Thinking...',
  })

  const [dots, setDots] = useState(0)
  const [currentIcon, setCurrentIcon] = useState(0)

  // 动态图标列表
  const icons = [
    <Brain className="size-4" />,
    <Sparkles className="size-4" />,
    <Zap className="size-4" />,
    <Search className="size-4" />,
    <Code className="size-4" />,
    <Palette className="size-4" />,
    <FileSearch className="size-4" />,
  ]

  // 动态点动画
  useEffect(() => {
    if (thinkingState.isThinking) {
      const interval = setInterval(() => {
        setDots((prev) => (prev + 1) % 4)
      }, 500)
      return () => clearInterval(interval)
    }
  }, [thinkingState.isThinking])

  // 图标轮换动画
  useEffect(() => {
    if (thinkingState.isThinking) {
      const interval = setInterval(() => {
        setCurrentIcon((prev) => (prev + 1) % icons.length)
      }, 2000)
      return () => clearInterval(interval)
    }
  }, [thinkingState.isThinking, icons.length])

  // 处理 Thinking Started 事件
  const handleThinkingStarted = (data: TEvents['Socket::Session::ThinkingStarted']) => {
    console.log('🧠 [ThinkingStatus] Received ThinkingStarted:', data)

    // 修复条件判断：只要有一个匹配就处理
    if (!sessionId && !canvasId) {
      console.warn('🧠 [ThinkingStatus] No sessionId or canvasId provided')
      return
    }

    if (data.session_id !== sessionId && data.canvas_id !== canvasId) {
      console.log('🧠 [ThinkingStatus] Event not for this session/canvas', {
        eventSession: data.session_id,
        eventCanvas: data.canvas_id,
        componentSession: sessionId,
        componentCanvas: canvasId
      })
      return
    }

    setThinkingState({
      isThinking: true,
      message: data.message || 'AI is thinking...',
      startTime: data.timestamp,
    })
  }

  // 处理 Thinking Update 事件
  const handleThinkingUpdate = (data: TEvents['Socket::Session::ThinkingUpdate']) => {
    console.log('🧠 [ThinkingStatus] Received ThinkingUpdate:', data)

    if (data.session_id !== sessionId && data.canvas_id !== canvasId) {
      return
    }

    setThinkingState((prev) => ({
      ...prev,
      message: data.message || prev.message,
      step: data.step,
      details: data.details,
    }))
  }

  // 处理 Thinking Complete 事件
  const handleThinkingComplete = (data: TEvents['Socket::Session::ThinkingComplete']) => {
    console.log('🧠 [ThinkingStatus] Received ThinkingComplete:', data)

    if (data.session_id !== sessionId && data.canvas_id !== canvasId) {
      return
    }

    // 淡出动画后清除状态
    setTimeout(() => {
      setThinkingState({
        isThinking: false,
        message: '',
      })
    }, 500)
  }

  // 注册事件监听器
  useEffect(() => {
    eventBus.on('Socket::Session::ThinkingStarted', handleThinkingStarted)
    eventBus.on('Socket::Session::ThinkingUpdate', handleThinkingUpdate)
    eventBus.on('Socket::Session::ThinkingComplete', handleThinkingComplete)

    return () => {
      eventBus.off('Socket::Session::ThinkingStarted', handleThinkingStarted)
      eventBus.off('Socket::Session::ThinkingUpdate', handleThinkingUpdate)
      eventBus.off('Socket::Session::ThinkingComplete', handleThinkingComplete)
    }
  }, [sessionId, canvasId])

  // 计算经过的时间
  const getElapsedTime = () => {
    if (!thinkingState.startTime) return ''
    const elapsed = Math.floor((Date.now() - thinkingState.startTime) / 1000)
    if (elapsed < 60) return `${elapsed}s`
    return `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
  }

  if (!thinkingState.isThinking) {
    return null
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col gap-2 p-3 bg-muted/50 rounded-lg border border-border/50 select-none"
      >
        {/* 主状态行 */}
        <div className="flex items-center gap-2">
          {/* 动态图标 */}
          <motion.div
            key={currentIcon}
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.3 }}
            className="text-primary/60"
          >
            {icons[currentIcon]}
          </motion.div>

          {/* 主消息 */}
          <ShinyText
            text={thinkingState.message + '.'.repeat(dots)}
            className="text-sm text-primary/80!"
            speed={2.5}
          />

          {/* 经过时间 */}
          {thinkingState.startTime && (
            <span className="text-xs text-muted-foreground ml-auto">
              {getElapsedTime()}
            </span>
          )}
        </div>

        {/* 当前步骤 */}
        {thinkingState.step && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2 pl-6"
          >
            <Loader2 className="animate-spin size-3 text-primary/50" />
            <span className="text-xs text-muted-foreground">
              {thinkingState.step}
            </span>
          </motion.div>
        )}

        {/* 详细信息列表 */}
        {thinkingState.details && thinkingState.details.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="pl-6 space-y-1"
          >
            {thinkingState.details.map((detail, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="text-xs text-muted-foreground/70 flex items-start gap-1"
              >
                <span className="text-primary/40 mt-0.5">•</span>
                <span>{detail}</span>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* 进度条 */}
        <motion.div className="h-0.5 bg-border/30 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-primary/60 to-primary/30"
            animate={{
              x: ['-100%', '100%'],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'linear',
            }}
            style={{ width: '50%' }}
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default ThinkingStatus
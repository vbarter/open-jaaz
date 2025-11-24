import { useState, Dispatch, SetStateAction, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import ChatInterface from '@/components/chat/Chat'
import { ChatPanelHeader } from './ChatPanelHeader'
import { Session } from '@/types/types'
import { MessageCircle, X, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNavigate } from '@tanstack/react-router'

interface FloatingChatPanelProps {
  canvasId: string
  sessionList: Session[]
  setSessionList: Dispatch<SetStateAction<Session[]>>
  sessionId: string
  onNewSession?: () => void
  onSessionNameChange?: (sessionId: string, newName: string) => void
  isProcessingRef?: React.MutableRefObject<boolean>
}

export function FloatingChatPanel({
  canvasId,
  sessionList,
  setSessionList,
  sessionId,
  onNewSession,
  onSessionNameChange,
  isProcessingRef,
}: FloatingChatPanelProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [panelWidth, setPanelWidth] = useState(25) // 默认占窗口宽度的25%
  const [isResizing, setIsResizing] = useState(false)
  const [windowWidth, setWindowWidth] = useState(window.innerWidth)
  const panelRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // 新建会话 - 现在直接调用传入的回调
  const handleNewSession = () => {
    onNewSession?.()
  }

  // 切换会话
  const handleSessionSelect = (newSessionId: string) => {
    // 跳转到指定会话
    navigate({
      to: '/canvas/$id',
      params: { id: canvasId },
      search: { sessionId: newSessionId }
    })
  }

  // 根据屏幕大小计算实际宽度
  const getResponsiveWidth = () => {
    // 移动端：全屏
    if (windowWidth <= 640) {
      return '100%'
    }

    // 平板：最大50%
    if (windowWidth <= 768) {
      return `${Math.min(panelWidth * 2, 50)}%`
    }

    // 桌面端：使用设置的宽度
    return `${panelWidth}%`
  }

  // 监听窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth)
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  // 处理拖拽调整宽度
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return

      // 计算新的宽度百分比
      const newWidthPercent = ((window.innerWidth - e.clientX) / window.innerWidth) * 100

      // 限制宽度范围：最小15%，最大50%
      const clampedWidth = Math.min(50, Math.max(15, newWidthPercent))
      setPanelWidth(clampedWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    if (isResizing) {
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  // 处理触摸事件（移动端支持）
  useEffect(() => {
    const handleTouchMove = (e: TouchEvent) => {
      if (!isResizing) return

      const touch = e.touches[0]
      const newWidthPercent = ((window.innerWidth - touch.clientX) / window.innerWidth) * 100
      const clampedWidth = Math.min(50, Math.max(15, newWidthPercent))
      setPanelWidth(clampedWidth)
    }

    const handleTouchEnd = () => {
      setIsResizing(false)
    }

    if (isResizing) {
      document.addEventListener('touchmove', handleTouchMove)
      document.addEventListener('touchend', handleTouchEnd)
    }

    return () => {
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [isResizing])

  return (
    <>
      {/* 聊天切换按钮 - 右侧中间位置 */}
      {!isOpen && (
        <div className="absolute top-1/2 right-4 -translate-y-1/2 z-40">
          <Button
            onClick={() => setIsOpen(true)}
            size="sm"
            className="p-3 h-auto w-auto rounded-full bg-white/90 backdrop-blur-md border border-gray-200/50 shadow-lg hover:bg-white"
            style={{
              transition: 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1), background-color 200ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)'
            }}
          >
            <MessageCircle className="w-5 h-5 text-gray-700" />
          </Button>
        </div>
      )}

      {/* 统一的浮动聊天窗口 - 始终显示在右侧，支持调整宽度 */}
      <div
        ref={panelRef}
        className={cn(
          'absolute top-20 right-0 bottom-0 z-65',
          'transition-all duration-300 ease-out',
          isOpen ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
        )}
        style={{
          width: getResponsiveWidth(),
          minWidth: windowWidth <= 640 ? '100%' : '280px',
          maxWidth: windowWidth <= 640 ? '100%' : '600px',
          left: windowWidth <= 640 ? '0' : 'auto',
          top: windowWidth <= 640 ? '0' : '80px',
          transitionProperty: isResizing ? 'none' : 'transform, opacity',
          transitionDuration: '300ms',
          transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        <div className="relative w-full h-full flex">
          {/* 拖拽调整宽度的手柄 - 仅在桌面端显示 */}
          {windowWidth > 768 && (
            <div
              className={cn(
                'absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/30 transition-colors z-10',
                'flex items-center justify-center',
                isResizing && 'bg-blue-500/30'
              )}
              onMouseDown={(e) => {
                e.preventDefault()
                setIsResizing(true)
              }}
              onTouchStart={(e) => {
                e.preventDefault()
                setIsResizing(true)
              }}
            >
              <div className="w-6 h-12 flex items-center justify-center">
                <GripVertical className="w-4 h-4 text-gray-400" />
              </div>
            </div>
          )}

          {/* 聊天面板主体 */}
          <div className={cn(
            "flex-1 bg-white/95 backdrop-blur-lg shadow-lg border border-gray-200/50 overflow-hidden flex flex-col",
            windowWidth > 768 ? "rounded-l-xl ml-1" : "rounded-none"
          )}>
            {/* 功能栏 */}
            <ChatPanelHeader
              sessionList={sessionList}
              currentSessionId={sessionId}
              onClose={() => setIsOpen(false)}
              onNewSession={handleNewSession}
              onSessionSelect={handleSessionSelect}
              onSessionNameChange={onSessionNameChange}
            />

            {/* 聊天界面 */}
            <div className="flex-1 overflow-hidden">
              <ChatInterface
                canvasId={canvasId}
                sessionList={sessionList}
                setSessionList={setSessionList}
                sessionId={sessionId}
                isProcessingRef={isProcessingRef}
              />
            </div>
          </div>
        </div>
      </div>

    </>
  )
}
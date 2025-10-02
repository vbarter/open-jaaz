import { useState, Dispatch, SetStateAction } from 'react'
import { Button } from '@/components/ui/button'
import ChatInterface from '@/components/chat/Chat'
import { ChatPanelHeader } from './ChatPanelHeader'
import { Session } from '@/types/types'
import { MessageCircle, X } from 'lucide-react'
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

  return (
    <>
      {/* 聊天切换按钮 - 右侧中间位置，移动端友好 */}
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

      {/* 浮动聊天窗口 - 桌面端显示，为右上角用户信息留出空间 */}
      <div
        className={cn(
          'hidden md:block absolute top-20 right-4 bottom-4 z-65',
          'w-[min(25vw,400px)] min-w-[280px] max-w-[400px]',
          'transition-transform duration-300 ease-out',
          isOpen ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
        )}
        style={{
          transitionProperty: 'transform, opacity',
          transitionDuration: '300ms',
          transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        <div className="relative w-full h-full bg-white/95 backdrop-blur-lg rounded-xl shadow-lg border border-gray-200/50 overflow-hidden flex flex-col">
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

      {/* 移动端适配：全屏沉浸式模式，完全覆盖背景浮动元素 */}
      {isOpen && (
        <div className="md:hidden fixed inset-0 z-70 bg-white flex flex-col">
          {/* 移动端功能栏 */}
          <ChatPanelHeader
            sessionList={sessionList}
            currentSessionId={sessionId}
            onClose={() => setIsOpen(false)}
            onNewSession={handleNewSession}
            onSessionSelect={handleSessionSelect}
            onSessionNameChange={onSessionNameChange}
          />

          {/* 移动端聊天界面 */}
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
      )}
    </>
  )
}
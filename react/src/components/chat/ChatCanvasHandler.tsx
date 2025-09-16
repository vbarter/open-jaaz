import { useConfigs } from '@/contexts/configs'
import { eventBus, TCanvasChatEvent } from '@/lib/event'
import { Message, PendingType } from '@/types/types'
import { useCallback, useEffect, useRef } from 'react'
import { DEFAULT_SYSTEM_PROMPT } from '@/constants'
import { useAuth } from '@/contexts/AuthContext'

// 全局事件处理记录，防止StrictMode导致的重复处理
const globalEventProcessing = new Map<string, boolean>()

type ChatCanvasHandlerProps = {
  sessionId: string
  canvasId: string
  messages: Message[]
  setMessages: (messages: Message[]) => void
  setPending: (pending: PendingType) => void
  scrollToBottom: () => void
}

const ChatCanvasHandler: React.FC<ChatCanvasHandlerProps> = ({
  sessionId,
  canvasId,
  messages,
  setMessages,
  setPending,
  scrollToBottom,
}) => {
  const { setShowLoginDialog, textModel } = useConfigs()
  const { authStatus } = useAuth()

  // 使用ref存储最新的值，避免频繁重建callback
  const messagesRef = useRef(messages)
  const processingRef = useRef(false)
  const lastEventRef = useRef<{ timestamp: string; fileId: string } | null>(null)

  // 更新messages ref
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const handleCanvasChat = useCallback(
    async (data: TCanvasChatEvent) => {
      // 生成事件唯一标识
      const eventKey = `${data.fileId}_${data.timestamp}`

      console.log('[ChatCanvasHandler] 接收到Canvas Chat事件:', {
        fileId: data.fileId,
        timestamp: data.timestamp,
        width: data.width,
        height: data.height,
        base64Length: data.base64.length,
        userTextLength: data.userText.length,
        userText: data.userText.substring(0, 50) + '...',
        eventKey,
        globalProcessingStatus: globalEventProcessing.get(eventKey),
      })

      // 使用全局Map防止重复处理（针对StrictMode）
      if (globalEventProcessing.get(eventKey)) {
        console.warn('[ChatCanvasHandler] 事件已在全局处理中，忽略重复:', eventKey)
        return
      }

      // 防止重复处理相同事件（本地检查）
      if (lastEventRef.current &&
          lastEventRef.current.timestamp === data.timestamp &&
          lastEventRef.current.fileId === data.fileId) {
        console.warn('[ChatCanvasHandler] 忽略重复事件（本地检查）')
        return
      }

      // 防止并发处理
      if (processingRef.current) {
        console.warn('[ChatCanvasHandler] 已有请求正在处理，忽略新请求')
        return
      }

      // 设置全局和本地处理标志
      globalEventProcessing.set(eventKey, true)
      lastEventRef.current = { timestamp: data.timestamp, fileId: data.fileId }
      processingRef.current = true

      // 清理函数
      const cleanupEventProcessing = () => {
        processingRef.current = false
        globalEventProcessing.delete(eventKey)
        console.log('[ChatCanvasHandler] 清理事件处理标志:', eventKey)
      }

      // 5秒后自动清理全局标志（防止内存泄漏）
      const cleanupTimer = setTimeout(() => {
        if (globalEventProcessing.has(eventKey)) {
          cleanupEventProcessing()
          console.log('[ChatCanvasHandler] 超时自动清理事件标志:', eventKey)
        }
      }, 5000)

      if (!authStatus.is_logged_in) {
        console.warn('[ChatCanvasHandler] 用户未登录，显示登录对话框')
        setShowLoginDialog(true)
        clearTimeout(cleanupTimer)
        cleanupEventProcessing()
        return
      }

      try {
        // 设置pending状态为text，表示正在处理
        console.log('[ChatCanvasHandler] 设置pending状态为text')
        setPending('text')

        // 创建包含图片和用户文本的消息 - 直接使用已处理的base64数据
        const chatMessage: Message = {
          role: 'user',
          content: [
            {
              type: 'text',
              text: data.userText,
            },
            {
              type: 'image_url',
              image_url: {
                url: data.base64, // 直接使用CanvasInlineChat已经处理好的base64数据
              },
            },
          ],
        }
        console.log('[ChatCanvasHandler] 创建聊天消息:', {
          role: chatMessage.role,
          contentLength: Array.isArray(chatMessage.content) ? chatMessage.content.length : 1,
          textLength: data.userText.length,
          imageDataLength: data.base64.length,
        })

        // 更新消息列表
        const newMessages = [...messagesRef.current, chatMessage]
        console.log('[ChatCanvasHandler] 更新消息列表，新消息数量:', newMessages.length)
        setMessages(newMessages)
        scrollToBottom()

        // 获取当前选择的模型
        const currentSelectedModel = localStorage.getItem('current_selected_model')
        let modelName = ''

        if (currentSelectedModel) {
          modelName = currentSelectedModel
        } else {
          if (textModel) {
            modelName = textModel.model
            localStorage.setItem('current_selected_model', modelName)
          } else {
            modelName = 'gpt-4o' // 默认模型
            localStorage.setItem('current_selected_model', modelName)
          }
        }

        // 直接发送到后台，避免重复的图片处理
        console.log('[ChatCanvasHandler] 准备发送到后台（使用chat接口，无需重复图片处理）:', {
          sessionId,
          canvasId,
          messagesCount: newMessages.length,
          modelName,
          skipImageProcessing: true, // 标记已经处理过图片
        })

        // 直接调用chat API，跳过ChatTextarea的图片处理逻辑
        const response = await fetch(`/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: newMessages,
            canvas_id: canvasId,
            session_id: sessionId,
            model_name: modelName,
            system_prompt: localStorage.getItem('system_prompt') || DEFAULT_SYSTEM_PROMPT,
          }),
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(
            `Chat request failed: ${response.status} ${response.statusText} - ${errorText}`
          )
        }

        const result = await response.json()
        console.log('[ChatCanvasHandler] 聊天请求成功发送到后台，结果:', result)
        scrollToBottom()
        // 请求成功，清理标志
        clearTimeout(cleanupTimer)
        cleanupEventProcessing()
      } catch (error) {
        console.error('[ChatCanvasHandler] 发送聊天消息失败:', error)
        console.error('[ChatCanvasHandler] 错误详情:', {
          name: error instanceof Error ? error.name : 'Unknown',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        })
        // 发生错误时重置pending状态和清理标志
        setPending(false)
        clearTimeout(cleanupTimer)
        cleanupEventProcessing()
      }
    },
    // 减少依赖项，只保留必要的
    [sessionId, canvasId, setMessages, setPending, scrollToBottom, authStatus.is_logged_in, setShowLoginDialog, textModel]
  )

  useEffect(() => {
    // 生成组件实例ID用于调试
    const instanceId = `ChatCanvasHandler_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
    console.log('[ChatCanvasHandler] 组件挂载，注册事件监听器:', {
      instanceId,
      sessionId,
      canvasId,
      timestamp: new Date().toISOString(),
    })

    // 监听Canvas聊天事件
    eventBus.on('Canvas::Chat', handleCanvasChat)

    return () => {
      console.log('[ChatCanvasHandler] 组件卸载，移除事件监听器:', {
        instanceId,
        sessionId,
        canvasId,
        timestamp: new Date().toISOString(),
      })
      eventBus.off('Canvas::Chat', handleCanvasChat)
    }
  }, [handleCanvasChat, sessionId, canvasId])

  return null // 这是一个纯逻辑组件，不渲染UI
}

export default ChatCanvasHandler

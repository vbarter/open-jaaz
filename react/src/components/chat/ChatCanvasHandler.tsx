import { sendMagicGenerate } from '@/api/magic'
import { useConfigs } from '@/contexts/configs'
import { eventBus, TCanvasChatEvent } from '@/lib/event'
import { Message, PendingType } from '@/types/types'
import { useCallback, useEffect } from 'react'
import { DEFAULT_SYSTEM_PROMPT } from '@/constants'
import { useAuth } from '@/contexts/AuthContext'

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
    scrollToBottom
}) => {
    const { setShowLoginDialog } = useConfigs()
    const { authStatus } = useAuth()

    const handleCanvasChat = useCallback(
        async (data: TCanvasChatEvent) => {
            console.log('[ChatCanvasHandler] 接收到Canvas Chat事件:', {
                fileId: data.fileId,
                timestamp: data.timestamp,
                width: data.width,
                height: data.height,
                base64Length: data.base64.length,
                userTextLength: data.userText.length,
                userText: data.userText.substring(0, 50) + '...'
            });

            if (!authStatus.is_logged_in) {
                console.warn('[ChatCanvasHandler] 用户未登录，显示登录对话框');
                setShowLoginDialog(true)
                return
            }

            try {
                // 设置pending状态为text，表示正在处理
                console.log('[ChatCanvasHandler] 设置pending状态为text');
                setPending('text')

                // 创建包含图片和用户文本的消息
                const chatMessage: Message = {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: data.userText
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: data.base64
                            }
                        },
                    ]
                }
                console.log('[ChatCanvasHandler] 创建聊天消息:', {
                    role: chatMessage.role,
                    contentLength: chatMessage.content.length,
                    textLength: data.userText.length
                });

                // 更新消息列表
                const newMessages = [...messages, chatMessage]
                console.log('[ChatCanvasHandler] 更新消息列表，新消息数量:', newMessages.length);
                setMessages(newMessages)
                scrollToBottom()

                // 发送到后台使用magic接口
                console.log('[ChatCanvasHandler] 准备发送到后台（使用magic接口）:', {
                    sessionId,
                    canvasId,
                    messagesCount: newMessages.length
                });

                const result = await sendMagicGenerate({
                    sessionId: sessionId,
                    canvasId: canvasId,
                    newMessages: newMessages,
                    systemPrompt: localStorage.getItem('system_prompt') || DEFAULT_SYSTEM_PROMPT,
                })

                console.log('[ChatCanvasHandler] 聊天请求成功发送到后台，结果:', result);
                scrollToBottom()
            } catch (error) {
                console.error('[ChatCanvasHandler] 发送聊天消息失败:', error)
                console.error('[ChatCanvasHandler] 错误详情:', {
                    name: error instanceof Error ? error.name : 'Unknown',
                    message: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined
                });
                // 发生错误时重置pending状态
                setPending(false)
            }
        },
        [sessionId, canvasId, messages, setMessages, setPending, scrollToBottom, authStatus.is_logged_in, setShowLoginDialog]
    )

    useEffect(() => {
        // 监听Canvas聊天事件
        eventBus.on('Canvas::Chat', handleCanvasChat)

        return () => {
            eventBus.off('Canvas::Chat', handleCanvasChat)
        }
    }, [handleCanvasChat])

    return null // 这是一个纯逻辑组件，不渲染UI
}

export default ChatCanvasHandler
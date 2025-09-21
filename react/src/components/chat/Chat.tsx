import { sendMessages } from '@/api/chat'
import Blur from '@/components/common/Blur'
import { ScrollArea } from '@/components/ui/scroll-area'
import { eventBus, TEvents } from '@/lib/event'
import ChatMagicGenerator from './ChatMagicGenerator'
import ChatCanvasHandler from './ChatCanvasHandler'
import { AssistantMessage, Message, Model, PendingType, Session } from '@/types/types'
import { useSearch } from '@tanstack/react-router'
import { produce } from 'immer'
import { motion } from 'motion/react'
import { nanoid } from 'nanoid'
import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from 'i18next'
import { PhotoProvider } from 'react-photo-view'
import { toast } from 'sonner'

// 🔧 Debug 控制 - 通过环境变量精确控制日志输出
const DEBUG_ENABLED = import.meta.env.VITE_CHAT_DEBUG === 'true' ||
  (import.meta.env.DEV && import.meta.env.VITE_CHAT_DEBUG !== 'false')
const debugLog = DEBUG_ENABLED ? console.log : () => {}
const debugWarn = DEBUG_ENABLED ? console.warn : () => {}
import ShinyText from '../ui/shiny-text'
import ChatTextarea from './ChatTextarea'
import MessageRegular from './Message/Regular'
import MultiMediaMessage from './Message/MultiMediaMessage'
import { ToolCallContent } from './Message/ToolCallContent'
import ToolCallTag from './Message/ToolCallTag'
import SessionSelector from './SessionSelector'
import ChatSpinner from './Spinner'
import ToolcallProgressUpdate from './ToolcallProgressUpdate'
import ShareTemplateDialog from './ShareTemplateDialog'
import { generateChatSessionTitle } from '@/utils/formatDate'

import { useConfigs } from '@/contexts/configs'
import 'react-photo-view/dist/react-photo-view.css'
import { DEFAULT_SYSTEM_PROMPT } from '@/constants'
import { useSocket } from '@/hooks/useSocket'
import { ModelInfo, ToolInfo } from '@/api/model'
import { Button } from '@/components/ui/button'
import { Share2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useQueryClient } from '@tanstack/react-query'
import MixedContent, { MixedContentImages, MixedContentText } from './Message/MixedContent'
import Timestamp from './Message/Timestamp'

type ChatInterfaceProps = {
  canvasId: string
  sessionList: Session[]
  setSessionList: Dispatch<SetStateAction<Session[]>>
  sessionId: string
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  canvasId,
  sessionList,
  setSessionList,
  sessionId: searchSessionId,
}) => {
  const { t } = useTranslation(['chat', 'common'])
  const [session, setSession] = useState<Session | null>(null)
  const { initCanvas, setInitCanvas, textModel } = useConfigs()
  const { authStatus } = useAuth()
  const [showShareDialog, setShowShareDialog] = useState(false)
  const queryClient = useQueryClient()
  const { socketManager } = useSocket()

  const [messages, setMessages] = useState<Message[]>([])
  const [pending, setPending] = useState<PendingType>(false) // 不再基于initCanvas设置初始状态
  const [hasDisplayedInitialMessage, setHasDisplayedInitialMessage] = useState(false)

  const mergedToolCallIds = useRef<string[]>([])
  const pendingTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const hasDisplayedInitialMessageRef = useRef(false)
  const currentMessagesRef = useRef<Message[]>([])
  const isNewSessionRef = useRef<boolean>(false) // 🔥 新增：标记是否为新建session

  const sessionId = session?.id ?? searchSessionId

  // 同步状态到ref
  useEffect(() => {
    hasDisplayedInitialMessageRef.current = hasDisplayedInitialMessage
  }, [hasDisplayedInitialMessage])

  useEffect(() => {
    currentMessagesRef.current = messages
  }, [messages])

  useEffect(() => {
    if (sessionList.length > 0) {
      let _session = null
      if (searchSessionId) {
        _session = sessionList.find((s) => s.id === searchSessionId) || null
      } else {
        _session = sessionList[0]
      }
      setSession(_session)

      // 🔧 关键修复：确保WebSocket session注册与当前活跃session同步
      if (_session && socketManager) {
        debugLog('🔄 [SESSION_SYNC] 同步WebSocket session注册:', {
          newSessionId: _session.id,
          canvasId,
          socketConnected: socketManager.isConnected()
        })

        // 重新注册session，确保WebSocket使用正确的session ID
        socketManager.registerSession(_session.id, canvasId)
      }
    } else {
      setSession(null)
    }
  }, [sessionList, searchSessionId, socketManager, canvasId])

  const sessionIdRef = useRef<string>(session?.id || nanoid())
  const [expandingToolCalls, setExpandingToolCalls] = useState<string[]>([])
  const [pendingToolConfirmations, setPendingToolConfirmations] = useState<string[]>([])

  const scrollRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true) // 初始默认在底部
  const isUserScrollingRef = useRef(false) // 跟踪用户是否在手动滚动

  const checkIfAtBottom = useCallback(() => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
      const threshold = 50 // 50px的阈值，更宽容的底部检测
      const atBottom = scrollHeight - scrollTop - clientHeight < threshold
      isAtBottomRef.current = atBottom
      return atBottom
    }
    return false
  }, [])

  const scrollToBottom = useCallback(() => {
    // 只有在用户在底部或者是新消息时才自动滚动
    if (isAtBottomRef.current && !isUserScrollingRef.current) {
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: 'smooth',
          })
        }
      }, 100) // 减少延迟以提供更好的响应性
    }
  }, [])

  const forceScrollToBottom = useCallback(() => {
    // 强制滚动到底部，用于用户发送消息时
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: 'smooth',
        })
        isAtBottomRef.current = true
      }
    }, 100)
  }, [])

  // 立即检查并显示初始用户消息 - 组件挂载时就检查
  useEffect(() => {
    const checkAndDisplayInitialMessage = () => {
      const initialMessageData = localStorage.getItem('initial_user_message')
      debugLog('🔍 检查初始用户消息', {
        hasData: !!initialMessageData,
        hasDisplayed: hasDisplayedInitialMessage,
        sessionId: searchSessionId,
      })

      if (initialMessageData && !hasDisplayedInitialMessage) {
        try {
          const {
            sessionId: storedSessionId,
            message,
            timestamp,
            canvasId,
          } = JSON.parse(initialMessageData)

          // 检查timestamp是否在5分钟内
          const isWithinTimeLimit = Date.now() - timestamp < 5 * 60 * 1000

          if (isWithinTimeLimit) {
            const shouldDisplayMessage =
              !searchSessionId ||
              storedSessionId === searchSessionId ||
              (canvasId && window.location.pathname.includes(canvasId))

            if (shouldDisplayMessage) {
              debugLog('✅ 显示初始用户消息')
              setMessages([message])
              setHasDisplayedInitialMessage(true)

              // 延迟显示等待状态，让用户先看到自己的消息
              pendingTimeoutRef.current = setTimeout(() => {
                setPending('text')
              }, 300)

              // 多次尝试滚动确保成功
              setTimeout(() => forceScrollToBottom(), 50)
              setTimeout(() => forceScrollToBottom(), 200)
              setTimeout(() => forceScrollToBottom(), 500)

              // 延迟清除localStorage，给后端推送时间
              setTimeout(() => {
                localStorage.removeItem('initial_user_message')
              }, 2000)
              return true
            } else {
              debugLog('❌ SessionId不匹配，不显示消息')
            }
          } else {
            debugLog('⏰ 消息已过期，清除localStorage')
            localStorage.removeItem('initial_user_message')
          }
        } catch (error) {
          console.error('❌ 解析初始消息失败', error)
          localStorage.removeItem('initial_user_message')
        }
      }
      return false
    }

    // 立即检查一次
    const displayed = checkAndDisplayInitialMessage()

    // 如果没有显示，等待一小段时间再检查一次（防止sessionId延迟）
    if (!displayed && !hasDisplayedInitialMessage) {
      const timeoutId = setTimeout(() => {
        debugLog('🔄 延迟重新检查初始消息')
        checkAndDisplayInitialMessage()
      }, 200)

      return () => clearTimeout(timeoutId)
    }
  }, [searchSessionId, hasDisplayedInitialMessage, forceScrollToBottom])

  // 当sessionId变化时也检查一次（兜底逻辑）
  useEffect(() => {
    if (!hasDisplayedInitialMessage && sessionId) {
      const initialMessageData = localStorage.getItem('initial_user_message')
      debugLog('🔄 SessionId变化时检查初始消息', { sessionId, hasData: !!initialMessageData })

      if (initialMessageData) {
        try {
          const {
            sessionId: storedSessionId,
            message,
            timestamp,
            canvasId,
          } = JSON.parse(initialMessageData)

          const isWithinTimeLimit = Date.now() - timestamp < 5 * 60 * 1000
          const shouldDisplayMessage =
            storedSessionId === sessionId ||
            (canvasId && window.location.pathname.includes(canvasId))

          if (shouldDisplayMessage && isWithinTimeLimit) {
            debugLog('✅ SessionId变化时显示初始消息')
            setMessages([message])
            setHasDisplayedInitialMessage(true)

            pendingTimeoutRef.current = setTimeout(() => {
              setPending('text')
            }, 300)

            setTimeout(() => forceScrollToBottom(), 50)
            setTimeout(() => forceScrollToBottom(), 200)

            setTimeout(() => {
              localStorage.removeItem('initial_user_message')
            }, 2000)
          }
        } catch (error) {
          console.error('❌ SessionId变化时解析失败', error)
          setTimeout(() => {
            localStorage.removeItem('initial_user_message')
          }, 1000)
        }
      }
    }
  }, [sessionId, hasDisplayedInitialMessage, forceScrollToBottom])

  // 🔧 增加兜底检查 - 如果前面的逻辑都没有显示消息，则更积极地尝试
  useEffect(() => {
    if (!hasDisplayedInitialMessage) {
      const timeoutId = setTimeout(() => {
        const initialMessageData = localStorage.getItem('initial_user_message')
        if (initialMessageData) {
          try {
            const { message, timestamp } = JSON.parse(initialMessageData)

            // 如果消息还在有效期内，无论sessionId如何，都显示
            if (Date.now() - timestamp < 30 * 1000) {
              debugLog('🚨 兜底显示初始消息（忽略sessionId检查）')
              setMessages([message])
              setHasDisplayedInitialMessage(true)

              pendingTimeoutRef.current = setTimeout(() => {
                setPending('text')
              }, 300)

              setTimeout(() => forceScrollToBottom(), 100)
              setTimeout(() => forceScrollToBottom(), 300)

              setTimeout(() => {
                localStorage.removeItem('initial_user_message')
              }, 2000)
            }
          } catch (error) {
            console.error('❌ 兜底解析失败', error)
          }
        }
      }, 1000) // 1秒后检查

      return () => clearTimeout(timeoutId)
    }
  }, [hasDisplayedInitialMessage, forceScrollToBottom])

  // 监听messages变化，确保用户消息显示后立即滚动
  useEffect(() => {
    if (messages.length > 0 && hasDisplayedInitialMessage) {
      // 延迟一点确保DOM已更新
      setTimeout(() => {
        forceScrollToBottom()
      }, 100)
    }
  }, [messages, hasDisplayedInitialMessage, forceScrollToBottom])

  // 监听pending状态变化，确保"Thinking..."出现时滚动到底部
  useEffect(() => {
    if (pending) {
      debugLog('⏳ Pending状态开始', { pending, messagesCount: messages.length })

      // 立即滚动一次
      forceScrollToBottom()

      // 延迟滚动确保ChatSpinner已经渲染
      setTimeout(() => {
        forceScrollToBottom()
      }, 100)

      // 再次延迟滚动确保完全显示
      setTimeout(() => {
        forceScrollToBottom()
      }, 300)
    } else {
      debugLog('✅ Pending状态结束', { messagesCount: messages.length })
    }
  }, [pending, forceScrollToBottom, messages.length, hasDisplayedInitialMessage, sessionId])

  // 组件挂载时立即滚动到底部
  useEffect(() => {
    // 组件首次加载时滚动到底部
    const mountScrollTimer = setTimeout(() => {
      debugLog('[debug] 组件挂载，滚动到底部')
      forceScrollToBottom()
    }, 200)

    // 清理函数
    return () => {
      clearTimeout(mountScrollTimer)
      if (pendingTimeoutRef.current) {
        clearTimeout(pendingTimeoutRef.current)
      }
    }
  }, [])

  // 🆕 Q&A结构辅助函数：组织消息为问答对，改善顺序管理
  const organizeMessagesAsQA = (messages: Message[]) => {
    const qaStructure = []
    let currentQuestion = null
    let currentAnswers = []

    for (const message of messages) {
      if (message.role === 'user') {
        // 如果之前有问答对，先保存
        if (currentQuestion && currentAnswers.length > 0) {
          qaStructure.push({
            question: currentQuestion,
            answers: [...currentAnswers]
          })
        }
        // 开始新的问答对
        currentQuestion = message
        currentAnswers = []
      } else if (message.role === 'assistant' && currentQuestion) {
        // 收集当前问题的答案
        currentAnswers.push(message)
      } else {
        // 处理工具调用等其他消息类型
        currentAnswers.push(message)
      }
    }

    // 处理最后一个问答对
    if (currentQuestion && currentAnswers.length > 0) {
      qaStructure.push({
        question: currentQuestion,
        answers: [...currentAnswers]
      })
    }

    // Q&A结构组织完成

    // 将Q&A结构重新扁平化为消息数组，确保顺序正确
    const organizedMessages = []
    for (const qa of qaStructure) {
      organizedMessages.push(qa.question)
      organizedMessages.push(...qa.answers)
    }

    return organizedMessages
  }

  const mergeToolCallResult = (messages: Message[]) => {
    // 🔧 简化的去重逻辑：保护图片消息和canvas元素
    const uniqueMessages = messages.filter((message, index, arr) => {
      const messageWithMeta = message as Message & {
        message_id?: string
        canvas_element_id?: string
        tool_call_id?: string
      }

      // 1. 优先基于message_id去重（最可靠）
      if (messageWithMeta.message_id) {
        const isDuplicate = arr.slice(0, index).some((prevMessage) => {
          const prevMessageWithMeta = prevMessage as Message & { message_id?: string }
          return prevMessageWithMeta.message_id === messageWithMeta.message_id
        })
        return !isDuplicate
      }

      // 2. 对于图片消息，基于canvas_element_id去重
      if (messageWithMeta.canvas_element_id) {
        const isDuplicate = arr.slice(0, index).some((prevMessage) => {
          const prevMessageWithMeta = prevMessage as Message & { canvas_element_id?: string }
          return prevMessageWithMeta.canvas_element_id === messageWithMeta.canvas_element_id
        })
        return !isDuplicate
      }

      // 3. 对于工具调用消息，基于tool_call_id去重
      if (message.role === 'tool' && messageWithMeta.tool_call_id) {
        const isDuplicate = arr.slice(0, index).some((prevMessage) => {
          const prevToolMessage = prevMessage as Message & { tool_call_id?: string }
          return (
            prevMessage.role === 'tool' &&
            prevToolMessage.tool_call_id === messageWithMeta.tool_call_id
          )
        })
        return !isDuplicate
      }

      // 4. 用户消息和普通助手消息不去重，保持完整性
      return true
    })

    const messagesWithToolCallResult = uniqueMessages.map((message, index) => {
      if (message.role === 'assistant' && message.tool_calls) {
        for (const toolCall of message.tool_calls) {
          // From the next message, find the tool call result
          for (let i = index + 1; i < uniqueMessages.length; i++) {
            const nextMessage = uniqueMessages[i]
            if (nextMessage.role === 'tool' && nextMessage.tool_call_id === toolCall.id) {
              toolCall.result = nextMessage.content
              mergedToolCallIds.current.push(toolCall.id)
            }
          }
        }
      }

      // 🔧 确保重要属性完整性（特别是图片消息）
      const messageWithMeta = message as any
      if (messageWithMeta.canvas_element_id || messageWithMeta.video_url) {
        // 保护消息重要属性的逻辑已经在这里实现
      }

      return message
    })

    // mergeToolCallResult 完成，返回处理后的消息

    return messagesWithToolCallResult
  }

  const handleDelta = useCallback(
    (data: TEvents['Socket::Session::Delta']) => {
      if (data.session_id && data.session_id !== sessionId) {
        return
      }

      setPending('text')
      setMessages(
        produce((prev) => {
          const last = prev.at(-1)
          // 确保只有当最后一条消息是assistant且没有tool_calls时才追加内容
          if (last?.role === 'assistant' && last.content != null && !last.tool_calls) {
            if (typeof last.content === 'string') {
              last.content += data.text
            } else if (
              Array.isArray(last.content) &&
              last.content.length > 0 &&
              last.content.at(-1)?.type === 'text'
            ) {
              ;(last.content.at(-1) as { text: string }).text += data.text
            } else {
              // 如果最后一条内容不是文本，添加新的文本内容
              if (Array.isArray(last.content)) {
                last.content.push({ type: 'text', text: data.text })
              } else {
                last.content = data.text
              }
            }
          } else {
            // 创建新的assistant消息
            prev.push({
              role: 'assistant',
              content: data.text,
            })
          }
        })
      )
      scrollToBottom()
    },
    [sessionId, scrollToBottom]
  )

  const handleToolCall = useCallback(
    (data: TEvents['Socket::Session::ToolCall']) => {
      if (data.session_id && data.session_id !== sessionId) {
        return
      }

      const existToolCall = messages.find(
        (m) => m.role === 'assistant' && m.tool_calls && m.tool_calls.find((t) => t.id == data.id)
      )

      if (existToolCall) {
        return
      }

      setMessages(
        produce((prev) => {
          setPending('tool')
          prev.push({
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                type: 'function',
                function: {
                  name: data.name,
                  arguments: '',
                },
                id: data.id,
              },
            ],
          })
        })
      )

      setExpandingToolCalls(
        produce((prev) => {
          prev.push(data.id)
        })
      )
    },
    [sessionId]
  )

  const handleToolCallPendingConfirmation = useCallback(
    (data: TEvents['Socket::Session::ToolCallPendingConfirmation']) => {
      if (data.session_id && data.session_id !== sessionId) {
        return
      }

      const existToolCall = messages.find(
        (m) => m.role === 'assistant' && m.tool_calls && m.tool_calls.find((t) => t.id == data.id)
      )

      if (existToolCall) {
        return
      }

      setMessages(
        produce((prev) => {
          debugLog('👇tool_call_pending_confirmation event get', data)
          setPending('tool')
          prev.push({
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                type: 'function',
                function: {
                  name: data.name,
                  arguments: data.arguments,
                },
                id: data.id,
              },
            ],
          })
        })
      )

      setPendingToolConfirmations(
        produce((prev) => {
          prev.push(data.id)
        })
      )

      // 自动展开需要确认的工具调用
      setExpandingToolCalls(
        produce((prev) => {
          if (!prev.includes(data.id)) {
            prev.push(data.id)
          }
        })
      )
    },
    [sessionId]
  )

  const handleToolCallConfirmed = useCallback(
    (data: TEvents['Socket::Session::ToolCallConfirmed']) => {
      if (data.session_id && data.session_id !== sessionId) {
        return
      }

      setPendingToolConfirmations(
        produce((prev) => {
          return prev.filter((id) => id !== data.id)
        })
      )

      setExpandingToolCalls(
        produce((prev) => {
          if (!prev.includes(data.id)) {
            prev.push(data.id)
          }
        })
      )
    },
    [sessionId]
  )

  const handleToolCallCancelled = useCallback(
    (data: TEvents['Socket::Session::ToolCallCancelled']) => {
      if (data.session_id && data.session_id !== sessionId) {
        return
      }

      setPendingToolConfirmations(
        produce((prev) => {
          return prev.filter((id) => id !== data.id)
        })
      )

      // 更新工具调用的状态
      setMessages(
        produce((prev) => {
          prev.forEach((msg) => {
            if (msg.role === 'assistant' && msg.tool_calls) {
              msg.tool_calls.forEach((tc) => {
                if (tc.id === data.id) {
                  // 添加取消状态标记
                  tc.result = t('chat:toolCall.cancelled')
                }
              })
            }
          })
        })
      )
    },
    [sessionId, t]
  )

  const handleToolCallArguments = useCallback(
    (data: TEvents['Socket::Session::ToolCallArguments']) => {
      if (data.session_id && data.session_id !== sessionId) {
        return
      }

      setMessages(
        produce((prev) => {
          setPending('tool')
          const lastMessage = prev.find(
            (m) =>
              m.role === 'assistant' && m.tool_calls && m.tool_calls.find((t) => t.id == data.id)
          ) as AssistantMessage

          if (lastMessage) {
            const toolCall = lastMessage.tool_calls!.find((t) => t.id == data.id)
            if (toolCall) {
              // 检查是否是待确认的工具调用，如果是则跳过参数追加
              if (pendingToolConfirmations.includes(data.id)) {
                return
              }
              toolCall.function.arguments += data.text
            }
          }
        })
      )
      scrollToBottom()
    },
    [sessionId, scrollToBottom, pendingToolConfirmations]
  )

  const handleToolCallResult = useCallback(
    (data: TEvents['Socket::Session::ToolCallResult']) => {
      debugLog('😘🖼️tool_call_result event get', data)
      if (data.session_id && data.session_id !== sessionId) {
        return
      }
      // TODO: support other non string types of returning content like image_url
      if (data.message.content) {
        setMessages(
          produce((prev) => {
            prev.forEach((m) => {
              if (m.role === 'assistant' && m.tool_calls) {
                m.tool_calls.forEach((t) => {
                  if (t.id === data.id) {
                    t.result = data.message.content
                  }
                })
              }
            })
          })
        )
      }
    },
    [canvasId, sessionId]
  )

  const handleVideoGenerated = useCallback(
    (data: TEvents['Socket::Session::VideoGenerated']) => {
      debugLog('🎬 handleVideoGenerated received:', {
        sessionMatch: data.session_id === sessionId,
        canvasMatch: data.canvas_id === canvasId,
        videoUrl: data.video_url
      })

      // 修复判断逻辑：只要canvas_id或session_id有一个匹配就处理
      if (data.canvas_id && data.canvas_id !== canvasId) {
        // 如果有canvas_id但不匹配，再检查session_id
        if (!data.session_id || data.session_id !== sessionId) {
          debugLog('❌ VideoGenerated session/canvas mismatch')
          return
        }
      }

      debugLog('✅ Processing video_generated event')

      // 添加视频消息到聊天记录
      const videoMessage: Message = {
        role: 'assistant',
        content: t('chat:generation.videoGenerated', { defaultValue: '🎬 视频已生成并添加到画布' }),
        type: 'video' as any,
        video_url: data.video_url,
        canvas_element_id: data.element?.id,
        canvas_id: data.canvas_id,
      } as any

      debugLog('📝 Adding video message:', videoMessage.type)

      setMessages(
        produce((prev) => {
          prev.push(videoMessage)
        })
      )

      setPending(false) // 取消loading状态
      forceScrollToBottom()

      // 多次延迟滚动确保视频加载完成后正确显示
      setTimeout(() => forceScrollToBottom(), 200)
      setTimeout(() => forceScrollToBottom(), 600)
      setTimeout(() => forceScrollToBottom(), 1200)
    },
    [canvasId, sessionId, forceScrollToBottom, t]
  )

  const handleImageGenerated = useCallback(
    (data: TEvents['Socket::Session::ImageGenerated']) => {
      // 修复判断逻辑：只要canvas_id或session_id有一个匹配就处理
      if (data.canvas_id && data.canvas_id !== canvasId) {
        // 如果有canvas_id但不匹配，再检查session_id
        if (!data.session_id || data.session_id !== sessionId) {
          return
        }
      }

      debugLog('⭐️dispatching image_generated', data)

      // 添加图片消息到聊天记录
      const imageMessage: Message = {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: t('chat:generation.imageGenerated'),
          },
          {
            type: 'image_url',
            image_url: {
              url: data.image_url,
            },
          },
        ] as MessageContent[],
      }

      // 添加canvas定位信息到消息（用于点击定位功能）
      const messageWithCanvasInfo = {
        ...imageMessage,
        canvas_element_id: data.element.id, // 添加canvas元素ID
        canvas_id: data.canvas_id, // 添加canvas ID
      }

      setMessages(
        produce((prev) => {
          prev.push(messageWithCanvasInfo)
        })
      )

      setPending(false) // 取消loading状态

      // 立即滚动一次
      forceScrollToBottom()

      // 多次延迟滚动确保图片加载完成后正确显示
      setTimeout(() => {
        forceScrollToBottom()
      }, 200)

      setTimeout(() => {
        forceScrollToBottom()
      }, 600)

      // 最后一次滚动确保图片完全可见
      setTimeout(() => {
        forceScrollToBottom()
      }, 1200)
    },
    [canvasId, sessionId, forceScrollToBottom, t]
  )

  const handleUserImages = useCallback(
    (data: TEvents['Socket::Session::UserImages']) => {
      if (data.session_id && data.session_id !== sessionId) {
        return
      }

      debugLog('📸 接收到用户图片', data.message)

      // 将用户图片消息添加到消息列表
      setMessages(
        produce((prev) => {
          prev.push({
            role: 'user',
            content: data.message.content,
          })
        })
      )

      scrollToBottom()
    },
    [sessionId, scrollToBottom]
  )

  // 添加一个 ref 来跟踪最后处理的 AllMessages 事件，防止重复处理
  const lastAllMessagesRef = useRef<string>('')
  const processingAllMessagesRef = useRef<boolean>(false)

  const handleAllMessages = useCallback(
    (data: TEvents['Socket::Session::AllMessages']) => {
      // 防止同时处理多个AllMessages事件
      if (processingAllMessagesRef.current) {
        debugLog('⚠️ AllMessages event ignored (already processing)')
        return
      }

      // 生成消息的唯一标识符
      const messageKey = `${data.session_id}_${data.canvas_id}_${data.messages?.length}`

      // 防止重复处理相同的消息
      if (lastAllMessagesRef.current === messageKey) {
        debugLog('⚠️ Duplicate AllMessages event ignored')
        return
      }

      // 设置处理标志
      processingAllMessagesRef.current = true
      lastAllMessagesRef.current = messageKey

      debugLog('📨 处理AllMessages事件:', {
        sessionMatch: data.session_id === sessionId,
        canvasMatch: data.canvas_id === canvasId,
        newCount: data.messages?.length,
        currentCount: messages.length
      })

      // 🚨 检查是否是服务繁忙错误
      if (data.error_type === 'service_busy') {
        debugLog('🚨 检测到服务繁忙错误')

        // 检查消息中是否包含服务繁忙的错误信息
        const hasServiceBusyMessage = data.messages?.some((msg: any) =>
          msg.error_type === 'service_busy' ||
          (typeof msg.content === 'string' &&
           (msg.content.includes('当前服务忙') || msg.content.includes('Service is currently busy')))
        )

        if (hasServiceBusyMessage) {
          debugLog('✅ 服务繁忙消息将正常显示')
        }
      }

      // 🔥 严格的消息接收逻辑：优先session匹配，谨慎使用canvas匹配
      // 1. 优先：完全匹配的session
      const sessionExactMatch = data.session_id && data.session_id === sessionId
      // 2. 谨慎：canvas匹配（仅当session不匹配但canvas匹配，且时间很近时）
      const timeDifference = Math.abs(Date.now() - (data.timestamp || 0))
      const canvasMatch = data.canvas_id && data.canvas_id === canvasId &&
                         !sessionExactMatch && timeDifference < 30000 // 30秒内的canvas匹配才接受

      const shouldAcceptMessage = sessionExactMatch || canvasMatch

      // 消息接收逻辑检查完成

      if (!shouldAcceptMessage) {
        debugLog('❌ Message rejected - session/canvas mismatch')
        processingAllMessagesRef.current = false
        return
      }

      debugLog('✅ Message accepted via', {
        viaSession: data.session_id === sessionId,
        viaCanvas: data.canvas_id === canvasId
      })

      // 检查是否包含视频消息
      const hasVideo = data.messages?.some((msg: any) => {
        const hasVideoType = msg.type === 'video'
        const hasVideoUrl = msg.video_url !== undefined

        if (hasVideoType || hasVideoUrl) {
          debugLog('🎥 Found video message:', { type: msg.type, hasUrl: !!msg.video_url })
        }

        return hasVideoType || hasVideoUrl
      })

      debugLog('🔍 handleAllMessages processing:', {
        newCount: data.messages.length,
        currentCount: messages.length,
        hasVideo,
        hasInitialMessage: hasDisplayedInitialMessage
      })

      const processedMessages = mergeToolCallResult(data.messages)

      // 🆕 应用Q&A结构组织，确保消息顺序正确
      const qaOrganizedMessages = organizeMessagesAsQA(processedMessages)

      // 如果已经显示了初始用户消息，且后端消息为空，则不覆盖
      if (hasDisplayedInitialMessage && qaOrganizedMessages.length === 0 && messages.length > 0) {
        debugLog('🚫 保持当前消息，不覆盖空消息')
        processingAllMessagesRef.current = false
        return
      }

      // 🔥 简化的消息处理策略：使用Q&A组织的消息，确保顺序和属性完整性
      debugLog('✅ 应用Q&A组织的消息处理策略', {
        currentCount: messages.length,
        qaCount: qaOrganizedMessages.length,
        sessionMatch: sessionExactMatch ? 'EXACT_SESSION' : canvasMatch ? 'CANVAS_FALLBACK' : 'NO_MATCH'
      })

      // 对于session完全匹配的情况，直接使用Q&A组织的消息（最可靠）
      if (sessionExactMatch) {
        debugLog('🎯 Session完全匹配，直接替换')
        setMessages(qaOrganizedMessages)
        scrollToBottom()
        processingAllMessagesRef.current = false
        return
      }

      // 对于canvas匹配但session不匹配的情况，谨慎处理
      if (canvasMatch) {
        debugLog('⚠️ Canvas匹配但session不同，谨慎处理')

        // 检查当前是否有重要的图片/视频内容需要保留
        const hasImportantContent = messages.some(msg => {
          if (msg.role === 'assistant') {
            return Array.isArray(msg.content) && msg.content.some(c => c.type === 'image_url') ||
                   (msg as any).canvas_element_id || (msg as any).video_url
          }
          return false
        })

        if (!hasImportantContent) {
          debugLog('🔄 无重要内容，直接替换')
          setMessages(qaOrganizedMessages)
        } else {
          debugLog('🔗 有重要内容，合并处理')
          const combinedMessages = [...messages, ...qaOrganizedMessages]
          const qaOrganizedCombined = organizeMessagesAsQA(combinedMessages)
          setMessages(qaOrganizedCombined)
        }

        scrollToBottom()
        processingAllMessagesRef.current = false
        return
      }

      // 如果上述条件都不满足，执行默认的Q&A组织消息替换
      debugLog('✅ 执行默认Q&A组织消息替换', {
        fromCount: messages.length,
        toCount: qaOrganizedMessages.length
      })

      setMessages(qaOrganizedMessages)
      scrollToBottom()
      processingAllMessagesRef.current = false
    },
    [sessionId, scrollToBottom, messages, hasDisplayedInitialMessage]
  )

  // 添加一个 ref 来跟踪最后处理的 done 事件时间戳，防止重复处理
  const lastDoneTimestampRef = useRef<number>(0)

  const handleDone = useCallback(
    (data: TEvents['Socket::Session::Done']) => {
      // 防止重复处理：如果在100ms内收到相同的done事件，忽略它
      const now = Date.now()
      if (now - lastDoneTimestampRef.current < 100) {
        debugLog('⚠️ Duplicate done event ignored (within 100ms)')
        return
      }
      lastDoneTimestampRef.current = now

      debugLog('✅ handleDone received:', {
        sessionMatch: data.session_id === sessionId,
        canvasMatch: data.canvas_id === canvasId
      })

      // 同样支持基于canvas_id的done事件
      const shouldAcceptMessage =
        (data.session_id && data.session_id === sessionId) ||
        (data.canvas_id && data.canvas_id === canvasId)

      if (!shouldAcceptMessage) {
        debugLog('❌ Done event rejected')
        return
      }

      setPending(false)
      scrollToBottom()

      // 聊天输出完毕后更新余额
      if (authStatus.is_logged_in) {
        queryClient.invalidateQueries({ queryKey: ['balance'] })
      }
    },
    [sessionId, canvasId, scrollToBottom, authStatus.is_logged_in, queryClient]
  )

  const handleError = useCallback(
    (data: TEvents['Socket::Session::Error']) => {
      console.log('🚨 [Chat] 收到Socket错误事件:', {
        error_code: data.error_code,
        session_id: data.session_id,
        current_session_id: sessionId,
        error: data.error,
      })

      // 🔧 关键修复：只处理当前session的错误，过滤掉其他session的错误
      if (data.session_id && data.session_id !== sessionId) {
        debugLog('⚠️ 错误来自不同session，忽略处理', {
          errorSessionId: data.session_id,
          currentSessionId: sessionId
        })
        return
      }

      setPending(false)

      // 特别处理积分不足错误
      if (data.error_code === 'insufficient_points') {
        console.log('💰 [Chat] 处理积分不足错误')
        if (data.current_points !== undefined && data.required_points !== undefined) {
          debugLog('📊 显示详细积分不足提示', {
            current: data.current_points,
            required: data.required_points,
          })
          toast.error(
            t('common:toast.insufficientPointsWithDetails', {
              current: data.current_points,
              required: data.required_points,
            }),
            {
              closeButton: true,
              duration: 5000,
              style: { color: 'red' },
            }
          )
        } else {
          debugLog('📊 显示基本积分不足提示')
          toast.error(t('common:toast.insufficientPoints'), {
            closeButton: true,
            duration: 5000,
            style: { color: 'red' },
          })
        }
      } else {
        console.log('⚠️ [Chat] 处理其他类型错误:', data.error)
        // 其他错误使用原有的显示方式
        toast.error('Error: ' + data.error, {
          closeButton: true,
          duration: 3600 * 1000,
          style: { color: 'red' },
        })
      }
    },
    [t, sessionId]
  )

  const handleInfo = useCallback((data: TEvents['Socket::Session::Info']) => {
    toast.info(data.info, {
      closeButton: true,
      duration: 10 * 1000,
    })
  }, [])

  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout

    const handleScroll = () => {
      // 标记用户正在滚动
      isUserScrollingRef.current = true

      // 检查是否在底部
      checkIfAtBottom()

      // 清除之前的定时器
      clearTimeout(scrollTimeout)

      // 延迟重置滚动状态，给滚动动画时间完成
      scrollTimeout = setTimeout(() => {
        isUserScrollingRef.current = false
      }, 150)
    }

    const scrollEl = scrollRef.current
    scrollEl?.addEventListener('scroll', handleScroll, { passive: true })

    eventBus.on('Socket::Session::Delta', handleDelta)
    eventBus.on('Socket::Session::ToolCall', handleToolCall)
    eventBus.on('Socket::Session::ToolCallPendingConfirmation', handleToolCallPendingConfirmation)
    eventBus.on('Socket::Session::ToolCallConfirmed', handleToolCallConfirmed)
    eventBus.on('Socket::Session::ToolCallCancelled', handleToolCallCancelled)
    eventBus.on('Socket::Session::ToolCallArguments', handleToolCallArguments)
    eventBus.on('Socket::Session::ToolCallResult', handleToolCallResult)
    eventBus.on('Socket::Session::ImageGenerated', handleImageGenerated)
    // 注释掉VideoGenerated事件监听，因为视频已经在AllMessages中处理
    // eventBus.on('Socket::Session::VideoGenerated', handleVideoGenerated)
    eventBus.on('Socket::Session::UserImages', handleUserImages)
    eventBus.on('Socket::Session::AllMessages', handleAllMessages)
    eventBus.on('Socket::Session::Done', handleDone)
    eventBus.on('Socket::Session::Error', handleError)
    eventBus.on('Socket::Session::Info', handleInfo)
    return () => {
      scrollEl?.removeEventListener('scroll', handleScroll)
      clearTimeout(scrollTimeout)

      eventBus.off('Socket::Session::Delta', handleDelta)
      eventBus.off('Socket::Session::ToolCall', handleToolCall)
      eventBus.off(
        'Socket::Session::ToolCallPendingConfirmation',
        handleToolCallPendingConfirmation
      )
      eventBus.off('Socket::Session::ToolCallConfirmed', handleToolCallConfirmed)
      eventBus.off('Socket::Session::ToolCallCancelled', handleToolCallCancelled)
      eventBus.off('Socket::Session::ToolCallArguments', handleToolCallArguments)
      eventBus.off('Socket::Session::ToolCallResult', handleToolCallResult)
      eventBus.off('Socket::Session::ImageGenerated', handleImageGenerated)
      // eventBus.off('Socket::Session::VideoGenerated', handleVideoGenerated)
      eventBus.off('Socket::Session::UserImages', handleUserImages)
      eventBus.off('Socket::Session::AllMessages', handleAllMessages)
      eventBus.off('Socket::Session::Done', handleDone)
      eventBus.off('Socket::Session::Error', handleError)
      eventBus.off('Socket::Session::Info', handleInfo)
    }
  }, [
    sessionId,
    handleDelta,
    handleToolCall,
    handleToolCallPendingConfirmation,
    handleToolCallConfirmed,
    handleToolCallCancelled,
    handleToolCallArguments,
    handleToolCallResult,
    handleImageGenerated,
    // handleVideoGenerated, // 已移除，视频在AllMessages中处理
    handleUserImages,
    handleAllMessages,
    handleDone,
    handleError,
    handleInfo,
    checkIfAtBottom
  ])

  const initChat = useCallback(async () => {
    if (!sessionId) {
      return
    }

    sessionIdRef.current = sessionId

    // 🔥 优先检查：如果是新建session，直接保持空白状态
    if (isNewSessionRef.current) {
      debugLog('[debug] 检测到新session，保持空白状态')
      setMessages([])
      setPending(false)
      setHasDisplayedInitialMessage(false)
      isNewSessionRef.current = false // 重置标志
      return
    }

    try {
      const resp = await fetch('/api/chat_session/' + sessionId)
      const data = await resp.json()
      const msgs = data?.length ? data : []

      debugLog('[debug] initChat 获取到历史消息:', msgs.length, 'for session:', sessionId)

      // 🔥 关键修复：每次切换session都要重置消息状态
      // 如果后端无历史消息，设置为空白状态（而不是保持当前状态）
      if (msgs.length === 0) {
        debugLog('[debug] session无历史消息，设置空白状态')
        setMessages([])
        setPending(false)
        setHasDisplayedInitialMessage(false)
        return
      }

      // 如果已经显示了初始用户消息，且历史消息不包含用户消息，则合并
      if (hasDisplayedInitialMessageRef.current && currentMessagesRef.current.length > 0) {
        const hasUserInHistory = msgs.some((msg: Message) => msg.role === 'user')
        if (!hasUserInHistory) {
          debugLog('[debug] 合并当前消息和历史消息')
          const processedMessages = mergeToolCallResult(msgs)
          const mergedMessages = [...currentMessagesRef.current, ...processedMessages]
          setMessages(mergedMessages)
          forceScrollToBottom()
          return
        }
      }

      // 正常情况：设置历史消息
      debugLog('[debug] 设置历史消息:', msgs.length)
      const processedMessages = mergeToolCallResult(msgs)
      setMessages(processedMessages)

      if (msgs.length > 0) {
        setInitCanvas(false)
        // 如果有历史消息，滚动到底部
        forceScrollToBottom()
      }
    } catch (error) {
      console.error('[debug] 初始化聊天失败:', error)
      // 🔥 出错时也要清空状态，防止显示错误的消息
      setMessages([])
      setPending(false)
      setHasDisplayedInitialMessage(false)
    }
  }, [sessionId, forceScrollToBottom, setInitCanvas])

  useEffect(() => {
    initChat()
  }, [sessionId, initChat])

  // 组件初始化和消息加载完成后自动滚动到底部
  useEffect(() => {
    // 延迟执行以确保DOM已完全渲染
    const scrollTimer = setTimeout(() => {
      if (messages.length > 0) {
        debugLog('[debug] 初始化或消息更新，自动滚动到底部')
        forceScrollToBottom()
      }
    }, 100)

    // 多次尝试滚动以确保成功
    const scrollTimer2 = setTimeout(() => {
      if (messages.length > 0) {
        forceScrollToBottom()
      }
    }, 300)

    return () => {
      clearTimeout(scrollTimer)
      clearTimeout(scrollTimer2)
    }
  }, [messages.length, forceScrollToBottom])

  const onSelectSession = (sessionId: string) => {
    debugLog('[debug] 切换session:', sessionId)

    // 🔥 确保session切换时状态一致性
    // 重置可能影响新session的状态
    setPending(false)
    setHasDisplayedInitialMessage(false)

    // 设置新session
    setSession(sessionList.find((s) => s.id === sessionId) || null)
    window.history.pushState({}, '', `/canvas/${canvasId}?sessionId=${sessionId}`)
  }

  const onClickNewChat = () => {
    debugLog('[debug] 点击New Chat')

    // 计算新session的名称
    const newSessionNumber = sessionList.length + 1
    const newSessionName = `New Session ${newSessionNumber}`

    const newSession: Session = {
      id: nanoid(),
      title: generateChatSessionTitle(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      model: textModel?.model || session?.model || 'gpt-4o',
      provider: textModel?.provider || session?.provider || 'openai',
      name: newSessionName, // 设置明确的session名称
      messages: [],
    }

    // 🔥 关键修复：标记为新session，防止initChat加载历史消息
    isNewSessionRef.current = true

    debugLog('[debug] 创建新session:', newSession.id)

    // 添加新session到列表头部并选择（最新的在前面）
    setSessionList((prev) => [newSession, ...prev])
    onSelectSession(newSession.id)
  }

  const onSendMessages = useCallback(
    (
      data: Message[],
      configs: {
        textModel: ModelInfo | null
        toolList: ToolInfo[]
        modelName: string
        aspectRatio?: string
        quantity?: number
      }
    ) => {
      const startTime = performance.now()

      // 🔥 升级版重要内容检测 - 使用与handleAllMessages相同的逻辑
      const getCurrentImportantMessages = (msgs: Message[]) => {
        return msgs.filter(msg => {
          if (msg.role === 'assistant') {
            // 检查是否包含图片内容
            if (Array.isArray(msg.content)) {
              const hasImage = msg.content.some(c => c.type === 'image_url')
              if (hasImage) return true
            }
            // 检查是否是图片/视频生成消息
            const content = typeof msg.content === 'string' ? msg.content : ''
            const hasGeneratedContent = content.includes('图片已生成') || content.includes('视频已生成') ||
                   content.includes('imageGenerated') || content.includes('videoGenerated') ||
                   content.includes('Image generated') || content.includes('Video generated')
            const hasCanvasElement = (msg as any).canvas_element_id || (msg as any).video_url
            return hasGeneratedContent || hasCanvasElement
          }
          return false
        })
      }

      const currentImportantMessages = getCurrentImportantMessages(messages)

      debugLog('📤 onSendMessages called', {
        messageCount: data.length,
        currentMessagesCount: messages.length,
        hasImportantContent: currentImportantMessages.length > 0
      })

      setPending('text')

      // 🔥 简化的消息设置策略：避免复杂合并逻辑
      if (currentImportantMessages.length > 0 && messages.length > 0) {
        debugLog('🔗 检测到重要内容，简单追加新消息', {
          protectedCount: currentImportantMessages.length,
          newCount: data.length
        })

        // 简单追加：保持现有消息的完整性，直接追加新消息
        setMessages([...messages, ...data])
      } else {
        debugLog('📝 标准消息替换', {
          reason: currentImportantMessages.length === 0 ? 'no-important-content' : 'empty-messages'
        })
        setMessages(data)
      }

      // Ensure we have a valid sessionId
      const effectiveSessionId = sessionId || sessionIdRef.current || nanoid()

      // 🔥 关键修复：在发送消息前注册WebSocket session
      // 这确保新的chat session能够接收到实时消息推送
      if (socketManager) {
        debugLog('🔌 注册session:', {
          sessionId: effectiveSessionId,
          canvasId: canvasId,
          socketConnected: socketManager.isConnected()
        })
        socketManager.registerSession(effectiveSessionId, canvasId)
      } else {
        debugWarn('⚠️ Socket manager not available')
      }

      // 🌍 获取当前语言
      const currentLanguage = localStorage.getItem('i18nextLng') || i18n.language || 'en'

      const sendStart = performance.now()
      sendMessages({
        sessionId: effectiveSessionId,
        canvasId: canvasId,
        newMessages: data,
        modelName: configs.modelName,
        systemPrompt: localStorage.getItem('system_prompt') || DEFAULT_SYSTEM_PROMPT,
        aspectRatio: configs.aspectRatio || 'auto',
        quantity: configs.quantity || 1,
        language: currentLanguage,
      })
      if (searchSessionId !== effectiveSessionId) {
        window.history.pushState({}, '', `/canvas/${canvasId}?sessionId=${effectiveSessionId}`)
      }

      forceScrollToBottom() // 用户发送消息时强制滚动到底部
    },
    [canvasId, sessionId, searchSessionId, forceScrollToBottom]
  )

  const handleCancelChat = useCallback(() => {
    setPending(false)
  }, [])

  return (
    <PhotoProvider>
      <div className='flex flex-col h-full relative'>
        {/* Chat messages */}

        <header className='flex items-center p-4 absolute top-0 z-10 w-full'>
          <div className='flex-1 min-w-0'>
            <SessionSelector
              session={session}
              sessionList={sessionList}
              onClickNewChat={onClickNewChat}
              onSelectSession={onSelectSession}
            />
          </div>
        </header>

        <ScrollArea className='flex-1 min-h-0' viewportRef={scrollRef}>
          {messages.length > 0 ? (
            <div className='flex flex-col flex-1 px-4 pt-20 pb-6'>
              {/* Messages */}
              {messages.map((message, idx) => {
                return (
                  <div key={`${idx}`} className='flex flex-col gap-4 mb-2'>
                    {/* 根据消息类型选择合适的渲染方式 */}
                    {message.role === 'tool' ? (
                      // Tool消息处理
                      message.tool_call_id &&
                      mergedToolCallIds.current.includes(message.tool_call_id) ? (
                        <></>
                      ) : (
                        <ToolCallContent
                          expandingToolCalls={expandingToolCalls}
                          message={message}
                        />
                      )
                    ) : (message as any).media ? (
                      // 🆕 多媒体消息（支持多个图片和视频）
                      <MultiMediaMessage message={message as any} />
                    ) : (message as any).type === 'video' ||
                       ((message as any).video_url && typeof message.content === 'string') ? (
                      // 视频消息处理 - MessageRegular会自动处理视频显示和时间戳
                      <MessageRegular
                        message={message}
                        content={typeof message.content === 'string' ? message.content : '🎬 视频已生成'}
                      />
                    ) : (message as any).error_type === 'service_busy' ? (
                      // 🚨 服务繁忙错误消息 - 特殊样式显示
                      <div className='flex justify-start mb-4'>
                        <div className='bg-orange-50 border border-orange-200 rounded-lg p-4 max-w-[80%]'>
                          <div className='flex items-center gap-2 mb-2'>
                            <div className='w-2 h-2 bg-orange-400 rounded-full'></div>
                            <span className='text-orange-700 font-medium text-sm'>
                              {t('chat:error.serviceStatus', { defaultValue: '服务状态' })}
                            </span>
                          </div>
                          <div className='text-orange-800'>
                            {typeof message.content === 'string' ? message.content : '当前服务忙，请稍后重试'}
                          </div>
                          <Timestamp
                            timestamp={message.timestamp}
                            align='left'
                          />
                        </div>
                      </div>
                    ) : typeof message.content === 'string' ? (
                      // 字符串内容消息
                      <MessageRegular message={message} content={message.content} />
                    ) : Array.isArray(message.content) ? (
                      // 混合内容消息（文本+图片）- 时间戳显示在最上方
                      <div className='mb-4'>
                        {/* 混合内容消息的时间戳 - 使用统一的Timestamp组件 */}
                        <Timestamp
                          timestamp={message.timestamp}
                          align={message.role === 'user' ? 'right' : 'left'}
                        />
                        {/* 混合内容区域 - 根据角色决定顺序 */}
                        {message.role === 'user' ? (
                          // 用户消息：图片在上，文字在下
                          <>
                            <div className='mb-3'>
                              <MixedContentImages
                                contents={message.content}
                                canvasElementId={(message as any).canvas_element_id}
                                messageRole={message.role}
                              />
                            </div>
                            <MixedContentText
                              message={message}
                              contents={message.content}
                              hideTimestamp={true}
                            />
                          </>
                        ) : (
                          // AI消息：文字在上，图片在下
                          <>
                            <div className='mb-3'>
                              <MixedContentText
                                message={message}
                                contents={message.content}
                                hideTimestamp={true}
                              />
                            </div>
                            <MixedContentImages
                              contents={message.content}
                              canvasElementId={(message as any).canvas_element_id}
                              messageRole={message.role}
                            />
                          </>
                        )}
                      </div>
                    ) : null}

                    {/* Tool calls for assistant messages */}
                    {message.role === 'assistant' &&
                      message.tool_calls &&
                      message.tool_calls.at(-1)?.function.name != 'finish' &&
                      message.tool_calls.map((toolCall, i) => {
                        return (
                          <ToolCallTag
                            key={toolCall.id}
                            toolCall={toolCall}
                            isExpanded={expandingToolCalls.includes(toolCall.id)}
                            onToggleExpand={() => {
                              if (expandingToolCalls.includes(toolCall.id)) {
                                setExpandingToolCalls((prev) =>
                                  prev.filter((id) => id !== toolCall.id)
                                )
                              } else {
                                setExpandingToolCalls((prev) => [...prev, toolCall.id])
                              }
                            }}
                            requiresConfirmation={pendingToolConfirmations.includes(toolCall.id)}
                            onConfirm={() => {
                              // 发送确认事件到后端
                              fetch('/api/tool_confirmation', {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                  session_id: sessionId,
                                  tool_call_id: toolCall.id,
                                  confirmed: true,
                                }),
                              })
                            }}
                            onCancel={() => {
                              // 发送取消事件到后端
                              fetch('/api/tool_confirmation', {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                  session_id: sessionId,
                                  tool_call_id: toolCall.id,
                                  confirmed: false,
                                }),
                              })
                            }}
                          />
                        )
                      })}
                  </div>
                )
              })}

              {/* Thinking状态显示 */}
              {pending && (
                <div className='flex flex-col gap-2 mt-3 sm:mt-4 md:mt-6 mb-3 sm:mb-4'>
                  <ChatSpinner pending={pending} />
                  {sessionId && <ToolcallProgressUpdate sessionId={sessionId} />}
                </div>
              )}
            </div>
          ) : (
            <motion.div className='flex flex-col h-full p-4 items-start justify-start pt-24 select-none'>
              <motion.span
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className='text-muted-foreground text-3xl'
              >
                <ShinyText text={t('chat:welcome.greeting')} />
              </motion.span>
              <motion.span
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className='text-muted-foreground text-2xl'
              >
                <ShinyText text={t('chat:welcome.question')} />
              </motion.span>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
                className='mt-6 text-muted-foreground/70 text-sm max-w-md'
              >
                <p className='mb-2'>{t('chat:welcome.newSession')}</p>
                <p className='mb-1'>{t('chat:welcome.autoSave')}</p>
                <p className='mb-1'>{t('chat:welcome.persistent')}</p>
                <p>{t('chat:welcome.management')}</p>
              </motion.div>
            </motion.div>
          )}
        </ScrollArea>

        <div className='p-2 gap-2 bg-background/95 backdrop-blur-sm border-t border-border/50 flex-shrink-0'>
          <ChatTextarea
            sessionId={sessionId!}
            pending={!!pending}
            messages={messages}
            onSendMessages={onSendMessages}
            onCancelChat={handleCancelChat}
            enableDynamicPlaceholder={false} // 🆕 在画布页面禁用动态placeholder效果
          />

          {/* 魔法生成组件 */}
          <ChatMagicGenerator
            sessionId={sessionId || sessionIdRef.current || nanoid()}
            canvasId={canvasId}
            messages={messages}
            setMessages={setMessages}
            setPending={setPending}
            scrollToBottom={scrollToBottom}
          />
          {/* Canvas聊天处理组件 */}
          <ChatCanvasHandler
            sessionId={sessionId || sessionIdRef.current || nanoid()}
            canvasId={canvasId}
            messages={messages}
            setMessages={setMessages}
            setPending={setPending}
            scrollToBottom={scrollToBottom}
          />
        </div>
      </div>

      {/* Share Template Dialog */}
      <ShareTemplateDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        canvasId={canvasId}
        sessionId={sessionId || ''}
        messages={messages}
      />
    </PhotoProvider>
  )
}

export default ChatInterface

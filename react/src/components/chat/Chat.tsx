import { sendMessages } from '@/api/chat'
import { ScrollArea } from '@/components/ui/scroll-area'
import { eventBus, TEvents } from '@/lib/event'
import ChatMagicGenerator from './ChatMagicGenerator'
import ChatCanvasHandler from './ChatCanvasHandler'
import { AssistantMessage, Message, MessageContent, PendingType, Session } from '@/types/types'
import { produce } from 'immer'
import { motion } from 'motion/react'
import { nanoid } from 'nanoid'
import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PhotoProvider, PhotoView } from 'react-photo-view'
import { toast } from 'sonner'
import ShinyText from '../ui/shiny-text'
import ChatTextarea from './ChatTextarea'
import MessageRegular from './Message/Regular'
import { ToolCallContent } from './Message/ToolCallContent'
import ToolCallTag from './Message/ToolCallTag'
import SessionSelector from './SessionSelector'
import ChatSpinner from './Spinner'
import ToolcallProgressUpdate from './ToolcallProgressUpdate'
import ShareTemplateDialog from './ShareTemplateDialog'
import { generateChatSessionTitle } from '@/utils/formatDate'
import { Button } from '@/components/ui/button'
import { useCanvas } from '@/contexts/canvas'

import { useConfigs } from '@/contexts/configs'
import 'react-photo-view/dist/react-photo-view.css'
import { DEFAULT_SYSTEM_PROMPT } from '@/constants'
import { ModelInfo, ToolInfo } from '@/api/model'
import { useAuth } from '@/contexts/AuthContext'
import { useQueryClient } from '@tanstack/react-query'
import { MixedContentText } from './Message/MixedContent'
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
  const { setInitCanvas, textModel } = useConfigs()
  const { authStatus } = useAuth()
  const [showShareDialog, setShowShareDialog] = useState(false)
  const queryClient = useQueryClient()
  const { excalidrawAPI } = useCanvas()

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
    } else {
      setSession(null)
    }
  }, [sessionList, searchSessionId])

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
      console.log('🔍 检查初始用户消息', {
        initialMessageData: !!initialMessageData,
        hasDisplayedInitialMessage,
        searchSessionId
      })

      if (initialMessageData && !hasDisplayedInitialMessage) {
        try {
          const { sessionId: storedSessionId, message, timestamp, canvasId } = JSON.parse(initialMessageData)
          console.log('📄 解析初始消息数据', {
            storedSessionId,
            searchSessionId,
            canvasId,
            messageContent: message?.content?.length > 0 ? '有内容' : '无内容',
            timestamp: new Date(timestamp).toLocaleString()
          })

          // 检查timestamp是否在5分钟内
          const isWithinTimeLimit = Date.now() - timestamp < 5 * 60 * 1000
          console.log('⏰ 时间检查', {
            isWithinTimeLimit,
            timeDiff: Math.floor((Date.now() - timestamp) / 1000) + '秒'
          })

          if (isWithinTimeLimit) {
            // 🔧 放宽sessionId匹配条件：
            // 1. 如果存储的sessionId和当前的sessionId匹配
            // 2. 或者还没有searchSessionId（刚跳转过来）
            // 3. 或者是同一个canvas下的消息（即使session不同）
            const shouldDisplayMessage = (
              !searchSessionId ||
              storedSessionId === searchSessionId ||
              (canvasId && window.location.pathname.includes(canvasId))
            )

            console.log('🎯 SessionId匹配检查', {
              shouldDisplayMessage,
              条件1_无当前SessionId: !searchSessionId,
              条件2_SessionId匹配: storedSessionId === searchSessionId,
              条件3_同一Canvas: canvasId && window.location.pathname.includes(canvasId)
            })

            if (shouldDisplayMessage) {
              console.log('✅ 显示初始用户消息')
              setMessages([message])
              setHasDisplayedInitialMessage(true)

              // 延迟显示等待状态，让用户先看到自己的消息
              pendingTimeoutRef.current = setTimeout(() => {
                console.log('⏳ 设置pending状态为text')
                setPending('text')
              }, 300)

              // 多次尝试滚动确保成功
              setTimeout(() => forceScrollToBottom(), 50)
              setTimeout(() => forceScrollToBottom(), 200)
              setTimeout(() => forceScrollToBottom(), 500)

              // 延迟清除localStorage，给后端推送时间
              setTimeout(() => {
                console.log('🗑️ 清除localStorage中的初始消息')
                localStorage.removeItem('initial_user_message')
              }, 2000)
              return true
            } else {
              console.log('❌ SessionId不匹配，不显示消息')
            }
          } else {
            console.log('⏰ 消息已过期，清除localStorage')
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
        console.log('🔄 延迟重新检查初始消息')
        checkAndDisplayInitialMessage()
      }, 200)

      return () => clearTimeout(timeoutId)
    }
  }, [searchSessionId, hasDisplayedInitialMessage, forceScrollToBottom])

  // 当sessionId变化时也检查一次（兜底逻辑）
  useEffect(() => {
    if (!hasDisplayedInitialMessage && sessionId) {
      const initialMessageData = localStorage.getItem('initial_user_message')
      console.log('🔄 SessionId变化时检查初始消息', {
        sessionId,
        hasInitialMessage: !!initialMessageData,
        hasDisplayedInitialMessage
      })

      if (initialMessageData) {
        try {
          const { sessionId: storedSessionId, message, timestamp, canvasId } = JSON.parse(initialMessageData)
          console.log('📄 SessionId变化时解析数据', {
            storedSessionId,
            currentSessionId: sessionId,
            canvasId,
            timeDiff: Math.floor((Date.now() - timestamp) / 1000) + '秒'
          })

          // 🔧 同样放宽匹配条件
          const isWithinTimeLimit = Date.now() - timestamp < 5 * 60 * 1000
          const shouldDisplayMessage = (
            storedSessionId === sessionId ||
            (canvasId && window.location.pathname.includes(canvasId))
          )

          console.log('🎯 SessionId变化时匹配检查', {
            isWithinTimeLimit,
            shouldDisplayMessage,
            sessionMatch: storedSessionId === sessionId,
            canvasMatch: canvasId && window.location.pathname.includes(canvasId)
          })

          if (shouldDisplayMessage && isWithinTimeLimit) {
            console.log('✅ SessionId变化时显示初始消息')
            setMessages([message])
            setHasDisplayedInitialMessage(true)

            // 延迟显示等待状态，让用户先看到自己的消息
            pendingTimeoutRef.current = setTimeout(() => {
              console.log('⏳ SessionId变化时设置pending状态')
              setPending('text')
            }, 300)

            // 多次尝试滚动确保成功
            setTimeout(() => forceScrollToBottom(), 50)
            setTimeout(() => forceScrollToBottom(), 200)

            // 延迟清除localStorage，给后端推送时间
            setTimeout(() => {
              console.log('🗑️ SessionId变化时清除localStorage')
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
            if (Date.now() - timestamp < 30 * 1000) { // 30秒内的消息
              console.log('🚨 兜底显示初始消息（忽略sessionId检查）')
              setMessages([message])
              setHasDisplayedInitialMessage(true)

              pendingTimeoutRef.current = setTimeout(() => {
                console.log('⏳ 兜底设置pending状态')
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
    }
  }, [pending, forceScrollToBottom])

  // 组件挂载时立即滚动到底部
  useEffect(() => {
    // 组件首次加载时滚动到底部
    const mountScrollTimer = setTimeout(() => {
      console.log('[debug] 组件挂载，滚动到底部')
      forceScrollToBottom()
    }, 200)

    // 清理函数
    return () => {
      clearTimeout(mountScrollTimer)
      if (pendingTimeoutRef.current) {
        clearTimeout(pendingTimeoutRef.current)
      }
    }
  }, [forceScrollToBottom])

  const mergeToolCallResult = (messages: Message[]) => {
    // 修复：基于消息ID去重，而不是内容去重，避免误删相同内容的不同消息
    const uniqueMessages = messages.filter((message, index, arr) => {
      // 如果消息有message_id，基于ID去重
      const messageWithId = message as Message & { message_id?: string }
      if (messageWithId.message_id) {
        const isDuplicate = arr.slice(0, index).some((prevMessage) => {
          const prevMessageWithId = prevMessage as Message & { message_id?: string }
          return prevMessageWithId.message_id === messageWithId.message_id
        })
        return !isDuplicate
      }

      // 对于没有message_id的消息（兼容旧数据），只对工具调用消息进行去重
      if (message.role === 'tool') {
        const toolMessage = message as Message & { tool_call_id?: string }
        const isDuplicate = arr.slice(0, index).some((prevMessage) => {
          const prevToolMessage = prevMessage as Message & { tool_call_id?: string }
          return (
            prevMessage.role === 'tool' &&
            prevToolMessage.tool_call_id === toolMessage.tool_call_id &&
            JSON.stringify(prevMessage.content) === JSON.stringify(message.content)
          )
        })
        return !isDuplicate
      }

      // 用户消息和助手消息不进行内容去重，允许重复内容
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
      return message
    })

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
    [sessionId, messages]
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
          console.log('👇tool_call_pending_confirmation event get', data)
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
    [sessionId, messages]
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
      console.log('😘🖼️tool_call_result event get', data)
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
    [sessionId]
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

      console.log('⭐️dispatching image_generated', data)
      console.log('📍 Canvas element:', data.element)
      console.log('📍 Canvas element ID:', data.element?.id)
      console.log('📍 File info:', data.file)
      console.log('🖼️ Image URL:', data.image_url)

      // 立即检查canvas files
      if (excalidrawAPI) {
        const currentFiles = excalidrawAPI.getFiles()
        console.log('📁 当前Canvas files:', Object.keys(currentFiles || {}))
        console.log('🔍 查找element.fileId:', data.element?.fileId, '是否在files中')
        if (data.element?.fileId && currentFiles) {
          const found = Object.keys(currentFiles).includes(data.element.fileId)
          console.log(found ? '✅ 找到了!' : '❌ 没找到!')
        }

        // 也检查file.id
        if (data.file?.id && currentFiles) {
          const foundFile = Object.keys(currentFiles).includes(data.file.id)
          console.log('🔍 查找file.id:', data.file.id, foundFile ? '✅ 找到了!' : '❌ 没找到!')
        }

        // 延迟检查，看看canvas files是否会更新
        setTimeout(() => {
          if (excalidrawAPI) {
            const updatedFiles = excalidrawAPI.getFiles()
            console.log('⏰ 500ms后重新检查Canvas files:', Object.keys(updatedFiles || {}))
            if (data.element?.fileId && updatedFiles) {
              const foundLater = Object.keys(updatedFiles).includes(data.element.fileId)
              console.log('⏰ 延迟查找element.fileId:', data.element.fileId, foundLater ? '✅ 找到了!' : '❌ 还是没找到!')
            }
          }
        }, 500)
      }

      // 添加图片消息到聊天记录
      const imageMessage: Message = {
        role: 'assistant',
        content: [
          {
            type: 'text' as const,
            text: t('chat:generation.imageGenerated'),
          },
          {
            type: 'image_url' as const,
            image_url: {
              url: data.image_url,
            },
          },
        ],
      }

      // 添加canvas定位信息到消息（用于点击定位功能）
      // 优先使用fileId（这是files对象的key），其次是file.id，最后是element.id
      const canvasFileId = data.element?.fileId || data.file?.id || data.element?.id
      const messageWithCanvasInfo = {
        ...imageMessage,
        canvas_element_id: canvasFileId,
        canvas_id: data.canvas_id,
      }

      console.log('✅ 创建的消息包含canvas_element_id:', messageWithCanvasInfo.canvas_element_id)
      console.log('   使用的是:',
        data.element?.fileId ? 'element.fileId' :
        data.file?.id ? 'file.id' :
        data.element?.id ? 'element.id' : 'none')

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
    [canvasId, sessionId, forceScrollToBottom, t, excalidrawAPI]
  )

  const handleUserImages = useCallback(
    (data: TEvents['Socket::Session::UserImages']) => {
      if (data.session_id && data.session_id !== sessionId) {
        return
      }

      console.log('📸 接收到用户图片', data.message)

      // 将用户图片消息添加到消息列表
      setMessages(
        produce((prev) => {
          prev.push({
            role: 'user',
            content: data.message.content as MessageContent[] | string,
          })
        })
      )

      scrollToBottom()
    },
    [sessionId, scrollToBottom]
  )

  const handleAllMessages = useCallback(
    (data: TEvents['Socket::Session::AllMessages']) => {
      if (data.session_id && data.session_id !== sessionId) {
        return
      }
      
      console.log('🔍 [DEBUG] handleAllMessages called:', {
        sessionId,
        currentMessagesCount: messages.length,
        newMessagesCount: data.messages.length,
        hasDisplayedInitialMessage,
        firstNewMessage: data.messages[0]?.role,
        currentMessages: messages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content.slice(0, 50) : 'mixed' }))
      })
      
      const processedMessages = mergeToolCallResult(data.messages)

      // 如果已经显示了初始用户消息，且后端消息为空，则不覆盖
      if (hasDisplayedInitialMessage && processedMessages.length === 0 && messages.length > 0) {
        console.log('🔍 [DEBUG] handleAllMessages: 保持当前消息，不覆盖空消息')
        return
      }

      // 如果已显示初始消息，且后端消息不包含用户消息，则合并
      if (hasDisplayedInitialMessage && messages.length > 0) {
        const hasUserMessage = processedMessages.some((msg) => msg.role === 'user')
        if (!hasUserMessage) {
          const mergedMessages = [...messages, ...processedMessages]
          console.log('🔍 [DEBUG] handleAllMessages: 合并消息，当前消息数:', messages.length, '新消息数:', processedMessages.length, '合并后:', mergedMessages.length)
          setMessages(mergedMessages)
          scrollToBottom()
          return
        }
      }
      
      console.log('🔍 [DEBUG] handleAllMessages: 完全替换消息列表，从', messages.length, '条消息到', processedMessages.length, '条消息')
      setMessages(processedMessages)
      scrollToBottom()
    },
    [sessionId, scrollToBottom, messages, hasDisplayedInitialMessage]
  )

  const handleDone = useCallback(
    (data: TEvents['Socket::Session::Done']) => {
      if (data.session_id && data.session_id !== sessionId) {
        return
      }

      setPending(false)
      scrollToBottom()

      // 聊天输出完毕后更新余额
      if (authStatus.is_logged_in) {
        queryClient.invalidateQueries({ queryKey: ['balance'] })
      }
    },
    [sessionId, scrollToBottom, authStatus.is_logged_in, queryClient]
  )

  const handleError = useCallback((data: TEvents['Socket::Session::Error']) => {
    console.log('🚨 [Chat] 收到Socket错误事件:', {
      error_code: data.error_code,
      current_points: data.current_points,
      required_points: data.required_points,
      session_id: data.session_id,
      current_session_id: sessionId,
      error: data.error
    })
    
    setPending(false)
    
    // 特别处理积分不足错误
    if (data.error_code === 'insufficient_points') {
      console.log('💰 [Chat] 处理积分不足错误')
      if (data.current_points !== undefined && data.required_points !== undefined) {
        console.log('📊 [Chat] 显示详细积分不足提示', {
          current: data.current_points,
          required: data.required_points
        })
        toast.error(t('common:toast.insufficientPointsWithDetails', {
          current: data.current_points,
          required: data.required_points
        }), {
          closeButton: true,
          duration: 5000,
          style: { color: 'red' },
        })
      } else {
        console.log('📊 [Chat] 显示基本积分不足提示')
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
  }, [t, sessionId])

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
      eventBus.off('Socket::Session::UserImages', handleUserImages)
      eventBus.off('Socket::Session::AllMessages', handleAllMessages)
      eventBus.off('Socket::Session::Done', handleDone)
      eventBus.off('Socket::Session::Error', handleError)
      eventBus.off('Socket::Session::Info', handleInfo)
    }
  })

  const initChat = useCallback(async () => {
    if (!sessionId) {
      return
    }

    sessionIdRef.current = sessionId

    // 🔥 优先检查：如果是新建session，直接保持空白状态
    if (isNewSessionRef.current) {
      console.log('[debug] 检测到新session，保持空白状态')
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

      console.log('[debug] initChat 获取到历史消息:', msgs.length, 'for session:', sessionId)

      // 🔥 关键修复：每次切换session都要重置消息状态
      // 如果后端无历史消息，设置为空白状态（而不是保持当前状态）
      if (msgs.length === 0) {
        console.log('[debug] session无历史消息，设置空白状态')
        setMessages([])
        setPending(false)
        setHasDisplayedInitialMessage(false)
        return
      }

      // 如果已经显示了初始用户消息，且历史消息不包含用户消息，则合并
      if (hasDisplayedInitialMessageRef.current && currentMessagesRef.current.length > 0) {
        const hasUserInHistory = msgs.some((msg: Message) => msg.role === 'user')
        if (!hasUserInHistory) {
          console.log('[debug] 合并当前消息和历史消息')
          const processedMessages = mergeToolCallResult(msgs)
          const mergedMessages = [...currentMessagesRef.current, ...processedMessages]
          setMessages(mergedMessages)
          forceScrollToBottom()
          return
        }
      }

      // 正常情况：设置历史消息
      console.log('[debug] 设置历史消息:', msgs.length)
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
        console.log('[debug] 初始化或消息更新，自动滚动到底部')
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
    console.log('[debug] 切换session:', sessionId)
    
    // 🔥 确保session切换时状态一致性
    // 重置可能影响新session的状态
    setPending(false)
    setHasDisplayedInitialMessage(false)
    
    // 设置新session
    setSession(sessionList.find((s) => s.id === sessionId) || null)
    window.history.pushState({}, '', `/canvas/${canvasId}?sessionId=${sessionId}`)
  }

  const onClickNewChat = () => {
    console.log('[debug] 点击New Chat')

    // 计算新session的名称
    const newSessionNumber = sessionList.length + 1
    const newSessionName = `New Session ${newSessionNumber}`

    const newSession: Session = {
      id: nanoid(),
      title: newSessionName, // 使用newSessionName作为title
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      model: textModel?.model || session?.model || 'gpt-4o',
      provider: textModel?.provider || session?.provider || 'openai',
      messages: []
    }

    // 🔥 关键修复：标记为新session，防止initChat加载历史消息
    isNewSessionRef.current = true

    console.log('[debug] 创建新session:', newSession.id, '标记为新session')

    // 添加新session到列表头部并选择（最新的在前面）
    setSessionList((prev) => [newSession, ...prev])
    onSelectSession(newSession.id)
  }

  const onSendMessages = useCallback(
    (data: Message[], configs: {
      textModel: ModelInfo | null
      toolList: ToolInfo[]
      modelName: string
    }) => {
      setPending('text')
      setMessages(data)

      // Ensure we have a valid sessionId
      const effectiveSessionId = sessionId || sessionIdRef.current || nanoid()

      sendMessages({
        sessionId: effectiveSessionId,
        canvasId: canvasId,
        newMessages: data,
        modelName: configs.modelName,
        systemPrompt: localStorage.getItem('system_prompt') || DEFAULT_SYSTEM_PROMPT,
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

  // 图片定位处理函数
  const handleImagePositioning = useCallback((elementId: string) => {
    if (excalidrawAPI && elementId) {
      excalidrawAPI.scrollToContent(elementId, { animate: true })
    }
  }, [excalidrawAPI])

  // 渲染图片组件 - 简化版本，先确保按钮显示
  const renderImageWithPhotoView = useCallback((
    imageUrl: string,
    canvasElementId?: string,
    isUserMessage: boolean = false
  ) => {
    console.log('🎨 开始渲染图片组件:', {
      imageUrl: imageUrl.substring(0, 50),
      canvasElementId,
      isUserMessage
    })

    // 先强制显示按钮，不管ID匹配
    const showButton = true  // 临时强制显示

    // 获取files用于后续匹配
    const files = excalidrawAPI?.getFiles()
    const filesArray = Object.keys(files || {}).map((key) => ({
      id: key,
      url: files![key].dataURL,
    }))

    console.log('📁 Canvas files数量:', filesArray.length)

    // 尝试多种匹配方式
    let elementId = canvasElementId  // 先用传入的ID

    if (!elementId && filesArray.length > 0) {
      // 尝试URL匹配
      const found = filesArray.find((file) => {
        // 检查多种匹配可能
        if (imageUrl.includes(file.url)) {
          console.log('✅ 方式1: imageUrl包含file.url')
          return true
        }
        if (file.url.includes(imageUrl)) {
          console.log('✅ 方式2: file.url包含imageUrl')
          return true
        }
        // 尝试提取文件名匹配
        const urlFilename = imageUrl.split('/').pop()?.split('?')[0]
        if (urlFilename && file.url.includes(urlFilename)) {
          console.log('✅ 方式3: 文件名匹配:', urlFilename)
          return true
        }
        return false
      })

      if (found) {
        elementId = found.id
        console.log('🎯 找到匹配的ID:', elementId)
      } else {
        console.log('❌ 没有找到匹配，使用第一个file作为测试')
        elementId = filesArray[0]?.id  // 临时使用第一个ID测试
      }
    }

    // 暂时不使用PhotoView，直接渲染看看按钮是否出现
    return (
      <div className="relative inline-block my-2">
        <img
          className={`cursor-pointer w-full h-auto rounded-md border border-border ${
            isUserMessage ? 'max-h-[140px] object-cover' : 'object-contain'
          }`}
          src={imageUrl}
          alt="Image"
        />

        {/* 强制显示按钮，使用最简单的样式 */}
        <button
          className="absolute top-2 right-2 px-3 py-1 bg-white text-black rounded shadow-lg"
          style={{
            zIndex: 9999,
            border: '2px solid red',  // 红色边框更明显
            fontSize: '14px',
            fontWeight: 'bold'
          }}
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            console.log('🚀 点击定位按钮，elementId:', elementId)
            alert('按钮被点击了！elementId: ' + elementId)  // 添加alert确认点击
            if (elementId) {
              handleImagePositioning(elementId)
            }
          }}
        >
          🎯 Go to Image
        </button>
      </div>
    )
  }, [excalidrawAPI, handleImagePositioning])

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
                // 调试：打印每条消息的类型
                console.log(`📨 消息${idx}:`, {
                  role: message.role,
                  contentType: typeof message.content,
                  isArray: Array.isArray(message.content),
                  contentLength: Array.isArray(message.content) ? message.content.length : 0,
                  hasImages: Array.isArray(message.content) ?
                    message.content.some(c => c.type === 'image_url') : false
                })

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
                    ) : typeof message.content === 'string' ? (
                      // 字符串内容消息
                      <MessageRegular message={message} content={message.content} />
                    ) : Array.isArray(message.content) ? (
                      // 混合内容消息（文本+图片）- 时间戳显示在最上方
                      <div className="mb-4">
                        {/* 混合内容消息的时间戳 - 使用统一的Timestamp组件 */}
                        <Timestamp
                          timestamp={message.timestamp}
                          align={message.role === 'user' ? 'right' : 'left'}
                        />
                        {/* 混合内容区域 - 根据角色决定顺序 */}
                        {(() => {
                          // 提取文本和图片内容
                          const textContents = message.content.filter((c) => c.type === 'text')
                          const imageContents = message.content.filter((c) => c.type === 'image_url')
                          const canvasElementId = (message as Message & { canvas_element_id?: string }).canvas_element_id

                          // 调试日志
                          if (imageContents.length > 0) {
                            console.log('🎨 渲染图片消息:', {
                              role: message.role,
                              imageCount: imageContents.length,
                              canvasElementId,
                              hasCanvasElementId: !!canvasElementId
                            })
                          }

                          if (message.role === 'user') {
                            // 用户消息：图片在上，文字在下 - 用户上传的图片不需要定位按钮
                            return (
                              <>
                                {/* 渲染用户上传的图片 - 不需要定位按钮 */}
                                {imageContents.length > 0 && (
                                  <div className="px-4">
                                    <div className="flex justify-end">
                                      {imageContents.length === 1 ? (
                                        // 单张图片
                                        <div className="max-w-[140px]">
                                          <img
                                            className="max-h-[140px] object-cover w-full h-auto rounded-md border border-border"
                                            src={imageContents[0].image_url.url}
                                            alt="User uploaded image"
                                          />
                                        </div>
                                      ) : (
                                        // 多张图片
                                        <div className="flex gap-2 flex-row-reverse">
                                          {imageContents.map((img, index) => (
                                            <div key={index} className="max-w-[140px]">
                                              <img
                                                className="max-h-[140px] object-cover w-full h-auto rounded-md border border-border"
                                                src={img.image_url.url}
                                                alt={`User uploaded image ${index + 1}`}
                                              />
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                                {/* 渲染文本 */}
                                {textContents.length > 0 && (
                                  <MixedContentText message={message} contents={message.content} hideTimestamp={true} />
                                )}
                              </>
                            )
                          } else {
                            // AI消息：文字在上，图片在下 - AI生成的图片需要定位按钮！
                            return (
                              <>
                                {/* 渲染文本 */}
                                {textContents.length > 0 && (
                                  <div className="mb-3">
                                    <MixedContentText message={message} contents={message.content} hideTimestamp={true} />
                                  </div>
                                )}
                                {/* 渲染AI生成的图片 - 需要定位按钮！ */}
                                {imageContents.length > 0 && (
                                  <div className="px-4">
                                    {console.log('🤖 [AI生成的图片] 准备渲染，需要定位按钮！', {
                                      数量: imageContents.length,
                                      canvasElementId,
                                      消息: message
                                    })}
                                    <div className="flex justify-start">
                                      {imageContents.map((img, imgIndex) => (
                                        <div key={imgIndex} className="relative inline-block mr-2">
                                          <PhotoView src={img.image_url.url}>
                                            <span className="group block relative overflow-hidden rounded-md">
                                              <img
                                                className="cursor-pointer group-hover:scale-105 transition-transform duration-300 w-full h-auto rounded-md border border-border"
                                                src={img.image_url.url}
                                                alt="AI generated image"
                                                style={{ maxWidth: '400px' }}
                                              />

                                              {/* 为AI生成的图片添加定位按钮 */}
                                              {canvasElementId && (
                                                <Button
                                                  variant="secondary"
                                                  className="group-hover:opacity-100 opacity-0 absolute top-2 right-2 z-10"
                                                  onClick={(e) => {
                                                    e.stopPropagation()
                                                    console.log('🎯 点击AI图片定位按钮，跳转到:', canvasElementId)
                                                    handleImagePositioning(canvasElementId)
                                                  }}
                                                >
                                                  {t('chat:messages:imagePositioning')}
                                                </Button>
                                              )}
                                            </span>
                                          </PhotoView>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </>
                            )
                          }
                        })()}
                      </div>
                    ) : null}

                    {/* Tool calls for assistant messages */}
                    {message.role === 'assistant' &&
                      message.tool_calls &&
                      message.tool_calls.at(-1)?.function.name != 'finish' &&
                      message.tool_calls.map((toolCall) => {
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
                <div className="flex flex-col gap-2 mt-3 sm:mt-4 md:mt-6 mb-3 sm:mb-4">
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

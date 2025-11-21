import * as ISocket from '@/types/socket'
import mitt from 'mitt'

export type TCanvasAddImagesToChatEvent = {
  fileId: string
  base64?: string
  width: number
  height: number
}[]

export type TCanvasMagicGenerateEvent = {
  fileId: string
  base64: string
  width: number
  height: number
  timestamp: string
  aspectRatio?: string
  quantity?: number
}

export type TCanvasChatEvent = {
  fileId: string
  base64: string
  width: number
  height: number
  timestamp: string
  userText: string
}

export type TMaterialAddImagesToChatEvent = {
  filePath: string
  fileName: string
  fileType: string
  width?: number
  height?: number
}[]

export type TUserImagesEvent = {
  session_id: string
  message: {
    role: 'user'
    content: Array<{
      type: 'text' | 'image_url'
      text?: string
      image_url?: {
        url: string
      }
    }>
  }
}

export type TEvents = {
  // ********** Socket events - Start **********
  'Socket::Session::Error': ISocket.SessionErrorEvent
  'Socket::Session::Done': ISocket.SessionDoneEvent
  'Socket::Session::Info': ISocket.SessionInfoEvent
  'Socket::Session::ImageGenerated': ISocket.SessionImageGeneratedEvent
  'Socket::Session::VideoGenerated': ISocket.SessionVideoGeneratedEvent
  'Socket::Session::Delta': ISocket.SessionDeltaEvent
  'Socket::Session::ToolCall': ISocket.SessionToolCallEvent
  'Socket::Session::ToolCallArguments': ISocket.SessionToolCallArgumentsEvent
  'Socket::Session::ToolCallResult': ISocket.SessionToolCallResultEvent
  'Socket::Session::AllMessages': ISocket.SessionAllMessagesEvent
  'Socket::Session::ToolCallProgress': ISocket.SessionToolCallProgressEvent
  'Socket::Session::ToolCallPendingConfirmation': ISocket.SessionToolCallPendingConfirmationEvent
  'Socket::Session::ToolCallConfirmed': ISocket.SessionToolCallConfirmedEvent
  'Socket::Session::ToolCallCancelled': ISocket.SessionToolCallCancelledEvent
  'Socket::Session::UserImages': TUserImagesEvent
  // 生成状态事件
  'Socket::Session::GenerationStarted': ISocket.SessionGenerationStartedEvent
  'Socket::Session::GenerationProgress': ISocket.SessionGenerationProgressEvent
  'Socket::Session::GenerationComplete': ISocket.SessionGenerationCompleteEvent
  // Thinking 状态事件
  'Socket::Session::ThinkingStarted': ISocket.SessionThinkingStartedEvent
  'Socket::Session::ThinkingUpdate': ISocket.SessionThinkingUpdateEvent
  'Socket::Session::ThinkingComplete': ISocket.SessionThinkingCompleteEvent
  // ********** Socket events - End **********

  // ********** Canvas events - Start **********
  'Canvas::AddImagesToChat': TCanvasAddImagesToChatEvent
  'Canvas::MagicGenerate': TCanvasMagicGenerateEvent
  'Canvas::Chat': TCanvasChatEvent
  // ********** Canvas events - End **********

  // ********** Material events - Start **********
  'Material::AddImagesToChat': TMaterialAddImagesToChatEvent
  // ********** Material events - End **********
}

// 🔧 Debug 控制 - 通过环境变量精确控制日志输出
const DEBUG_ENABLED = process.env.VITE_EVENTBUS_DEBUG === 'true' ||
  (process.env.NODE_ENV === 'development' && process.env.VITE_EVENTBUS_DEBUG !== 'false')
const debugLog = () => {}

// 创建eventBus实例
const eventBusInstance = mitt<TEvents>()

// 包装emit方法以添加调试日志
const originalEmit = eventBusInstance.emit
eventBusInstance.emit = function<Key extends keyof TEvents>(type: Key, event: TEvents[Key]) {
  debugLog('🚀 [EVENTBUS] 发射事件:', {
    type,
    event,
    timestamp: new Date().toISOString(),
    listeners_count: eventBusInstance.all.get(type)?.length || 0
  })
  return originalEmit.call(this, type, event)
}

// 包装on方法以添加调试日志
const originalOn = eventBusInstance.on
eventBusInstance.on = function<Key extends keyof TEvents>(type: Key, handler: (event: TEvents[Key]) => void) {
  debugLog('🎯 [EVENTBUS] 注册事件监听器:', {
    type,
    handler_name: handler.name || 'anonymous',
    timestamp: new Date().toISOString()
  })
  return originalOn.call(this, type, handler)
}

export const eventBus = eventBusInstance

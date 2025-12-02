import { ExcalidrawImageElement } from '@excalidraw/excalidraw/element/types'
import { BinaryFileData } from '@excalidraw/excalidraw/types'
import { Message, ToolCallFunctionName, ToolResultMessage } from './types'

export enum SessionEventType {
  Error = 'error',
  Done = 'done',
  Info = 'info',
  ImageGenerated = 'image_generated',
  VideoGenerated = 'video_generated',
  Delta = 'delta',
  ToolCall = 'tool_call',
  ToolCallArguments = 'tool_call_arguments',
  ToolCallResult = 'tool_call_result',
  AllMessages = 'all_messages',
  ToolCallProgress = 'tool_call_progress',
  ToolCallPendingConfirmation = 'tool_call_pending_confirmation',
  ToolCallConfirmed = 'tool_call_confirmed',
  ToolCallCancelled = 'tool_call_cancelled',
  UserImages = 'user_images',
  // 新增生成状态类型
  GenerationStarted = 'generation_started',
  GenerationProgress = 'generation_progress',
  GenerationComplete = 'generation_complete',
  // Thinking 状态类型
  ThinkingStarted = 'thinking_started',
  ThinkingUpdate = 'thinking_update',
  ThinkingComplete = 'thinking_complete',
  // Poster 事件类型
  PosterImageGenerated = 'poster_image_generated',
  PosterCompleted = 'poster_completed',
}

export interface SessionBaseEvent {
  session_id: string
}

export interface SessionErrorEvent extends SessionBaseEvent {
  type: SessionEventType.Error
  error: string
  error_code?: string
  current_points?: number
  required_points?: number
}
export interface SessionDoneEvent extends SessionBaseEvent {
  type: SessionEventType.Done
  canvas_id?: string
}
export interface SessionInfoEvent extends SessionBaseEvent {
  type: SessionEventType.Info
  info: string
}
export interface SessionImageGeneratedEvent extends SessionBaseEvent {
  type: SessionEventType.ImageGenerated
  element: ExcalidrawImageElement
  file: BinaryFileData
  canvas_id: string
  image_url: string
}
export interface SessionVideoGeneratedEvent extends SessionBaseEvent {
  type: SessionEventType.VideoGenerated
  element: any
  file: BinaryFileData & { duration?: number }
  canvas_id: string
  video_url: string
}

export interface SessionDeltaEvent extends SessionBaseEvent {
  type: SessionEventType.Delta
  text: string
}
export interface SessionToolCallEvent extends SessionBaseEvent {
  type: SessionEventType.ToolCall
  id: string
  name: ToolCallFunctionName
}
export interface SessionToolCallArgumentsEvent extends SessionBaseEvent {
  type: SessionEventType.ToolCallArguments
  id: string
  text: string
}
export interface SessionToolCallResultEvent extends SessionBaseEvent {
  type: SessionEventType.ToolCallResult
  id: string
  message: ToolResultMessage
}
export interface SessionAllMessagesEvent extends SessionBaseEvent {
  type: SessionEventType.AllMessages
  messages: Message[]
  canvas_id?: string
  error_type?: string
  timestamp?: number
}
export interface SessionToolCallProgressEvent extends SessionBaseEvent {
  type: SessionEventType.ToolCallProgress
  tool_call_id: string
  update: string
}

export interface SessionToolCallPendingConfirmationEvent
  extends SessionBaseEvent {
  type: SessionEventType.ToolCallPendingConfirmation
  id: string
  name: ToolCallFunctionName
  arguments: string
}

export interface SessionToolCallConfirmedEvent extends SessionBaseEvent {
  type: SessionEventType.ToolCallConfirmed
  id: string
}

export interface SessionToolCallCancelledEvent extends SessionBaseEvent {
  type: SessionEventType.ToolCallCancelled
  id: string
}

export interface SessionUserImagesEvent extends SessionBaseEvent {
  type: SessionEventType.UserImages
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

export interface SessionGenerationStartedEvent extends SessionBaseEvent {
  type: SessionEventType.GenerationStarted
  canvas_id?: string
  message: string
  progress: number
  timestamp: number
  data?: any
}

export interface SessionGenerationProgressEvent extends SessionBaseEvent {
  type: SessionEventType.GenerationProgress
  canvas_id?: string
  message: string
  progress: number
  timestamp: number
  data?: any
}

export interface SessionGenerationCompleteEvent extends SessionBaseEvent {
  type: SessionEventType.GenerationComplete
  canvas_id?: string
  message: string
  progress: number
  timestamp: number
  data?: any
}

// Thinking 事件接口
export interface SessionThinkingStartedEvent extends SessionBaseEvent {
  type: SessionEventType.ThinkingStarted
  canvas_id?: string
  message: string
  timestamp: number
}

export interface SessionThinkingUpdateEvent extends SessionBaseEvent {
  type: SessionEventType.ThinkingUpdate
  canvas_id?: string
  message: string
  step?: string
  details?: string[]
  timestamp: number
}

export interface SessionThinkingCompleteEvent extends SessionBaseEvent {
  type: SessionEventType.ThinkingComplete
  canvas_id?: string
  message: string
  timestamp: number
}

export interface SessionPosterImageGeneratedEvent extends SessionBaseEvent {
  type: SessionEventType.PosterImageGenerated
  canvas_id?: string
  image: {
    index: number
    success: boolean
    image_url?: string
    error?: string
    completed_count?: number
    total_count?: number
  }
  timestamp?: number
}

export interface SessionPosterCompletedEvent extends SessionBaseEvent {
  type: SessionEventType.PosterCompleted
  canvas_id?: string
  images: Array<{
    index: number
    success: boolean
    image_url?: string
    error?: string
  }>
  timestamp?: number
}

export type SessionUpdateEvent =
  | SessionDeltaEvent
  | SessionToolCallEvent
  | SessionToolCallArgumentsEvent
  | SessionToolCallProgressEvent
  | SessionImageGeneratedEvent
  | SessionVideoGeneratedEvent
  | SessionAllMessagesEvent
  | SessionDoneEvent
  | SessionErrorEvent
  | SessionInfoEvent
  | SessionToolCallResultEvent
  | SessionToolCallPendingConfirmationEvent
  | SessionToolCallConfirmedEvent
  | SessionToolCallCancelledEvent
  | SessionUserImagesEvent
  | SessionGenerationStartedEvent
  | SessionGenerationProgressEvent
  | SessionGenerationCompleteEvent
  | SessionThinkingStartedEvent
  | SessionThinkingUpdateEvent
  | SessionThinkingCompleteEvent
  | SessionPosterImageGeneratedEvent
  | SessionPosterCompletedEvent

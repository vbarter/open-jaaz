/**
 * Message State Manager for Frontend
 * Implements Observer Pattern and State Management for incremental updates
 */

import { produce } from 'immer'

// Message type definitions
export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
  TOOL = 'tool',
}

export enum MessageStatus {
  PENDING = 'pending',
  STREAMING = 'streaming',
  COMPLETED = 'completed',
  ERROR = 'error',
}

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  MIXED = 'mixed',
}

export enum MessageEventType {
  INIT_MESSAGES = 'init_messages',
  DELTA_MESSAGE = 'delta_message',
  UPDATE_MESSAGE = 'update_message',
  DELETE_MESSAGE = 'delete_message',
  STREAMING_START = 'streaming_start',
  STREAMING_DELTA = 'streaming_delta',
  STREAMING_END = 'streaming_end',
  SYNC_MESSAGES = 'sync_messages',
  ALL_MESSAGES = 'all_messages', // Backward compatibility
}

export interface MediaContent {
  type: 'image' | 'video' | 'audio'
  url: string
  thumbnail_url?: string
  width?: number
  height?: number
  duration?: number
  canvas_element_id?: string
}

export interface StandardMessage {
  message_id: string
  timestamp: number
  role: MessageRole | string
  content: string | MessageContent[]
  session_id: string
  canvas_id?: string
  type?: MessageType | string
  status?: MessageStatus | string

  // Media fields
  media?: MediaContent[]
  canvas_element_id?: string
  video_url?: string

  // Error fields
  error_type?: string
  error_message?: string

  // Metadata
  user_id?: string
  model?: string
  provider?: string
  tokens_used?: number

  // Tool fields
  tool_calls?: any[]
  tool_call_id?: string
}

export interface MessageContent {
  type: string
  text?: string
  image_url?: { url: string }
  video_url?: string
}

export interface DeltaMessageEvent {
  type: MessageEventType | string
  message?: StandardMessage
  messages?: StandardMessage[]
  session_id?: string
  canvas_id?: string
  is_append?: boolean
  previous_message_id?: string
  delta_content?: string
  delta_index?: number
  message_id?: string
  is_incremental?: boolean
  is_full_sync?: boolean
}

// Observer type
type MessageObserver = (messages: StandardMessage[]) => void
type EventObserver = (event: DeltaMessageEvent) => void

/**
 * Message State Manager
 * Singleton class for managing message state with incremental updates
 */
export class MessageStateManager {
  private static instance: MessageStateManager
  private messages: Map<string, StandardMessage> = new Map()
  private sessionMessages: Map<string, string[]> = new Map()
  private observers: Set<MessageObserver> = new Set()
  private eventObservers: Map<MessageEventType, Set<EventObserver>> = new Map()
  private lastMessageId: Map<string, string> = new Map()
  private streamingMessages: Map<string, StandardMessage> = new Map()

  private constructor() {
    // Initialize event observer maps
    Object.values(MessageEventType).forEach(eventType => {
      this.eventObservers.set(eventType, new Set())
    })
  }

  /**
   * Get singleton instance
   */
  static getInstance(): MessageStateManager {
    if (!MessageStateManager.instance) {
      MessageStateManager.instance = new MessageStateManager()
    }
    return MessageStateManager.instance
  }

  /**
   * Process incoming WebSocket event
   */
  processEvent(event: DeltaMessageEvent): void {
    const eventType = event.type as MessageEventType

    console.log(`[MessageStateManager] Processing event: ${eventType}`, event)

    switch (eventType) {
      case MessageEventType.INIT_MESSAGES:
        this.handleInitMessages(event)
        break
      case MessageEventType.DELTA_MESSAGE:
        this.handleDeltaMessage(event)
        break
      case MessageEventType.UPDATE_MESSAGE:
        this.handleUpdateMessage(event)
        break
      case MessageEventType.DELETE_MESSAGE:
        this.handleDeleteMessage(event)
        break
      case MessageEventType.STREAMING_START:
        this.handleStreamingStart(event)
        break
      case MessageEventType.STREAMING_DELTA:
        this.handleStreamingDelta(event)
        break
      case MessageEventType.STREAMING_END:
        this.handleStreamingEnd(event)
        break
      case MessageEventType.SYNC_MESSAGES:
        this.handleSyncMessages(event)
        break
      case MessageEventType.ALL_MESSAGES:
        this.handleAllMessages(event)
        break
      default:
        console.warn(`[MessageStateManager] Unknown event type: ${eventType}`)
    }

    // Notify event observers
    this.notifyEventObservers(eventType, event)
  }

  /**
   * Handle initialization messages
   */
  private handleInitMessages(event: DeltaMessageEvent): void {
    const { messages = [], session_id } = event

    if (!session_id) return

    // Clear existing messages for this session
    this.clearSession(session_id)

    // Add all messages
    messages.forEach(msg => {
      this.addMessage(msg, session_id)
    })

    this.notifyObservers(session_id)
  }

  /**
   * Handle delta (incremental) message
   */
  private handleDeltaMessage(event: DeltaMessageEvent): void {
    const { message, session_id, is_append = true } = event

    if (!message || !session_id) return

    // Check for duplicates
    if (this.messages.has(message.message_id)) {
      console.log(`[MessageStateManager] Duplicate message ignored: ${message.message_id}`)
      return
    }

    if (is_append) {
      this.addMessage(message, session_id)
    } else {
      // Insert at specific position if needed
      this.insertMessage(message, session_id, event.previous_message_id)
    }

    this.notifyObservers(session_id)
  }

  /**
   * Handle message update
   */
  private handleUpdateMessage(event: DeltaMessageEvent): void {
    const { message, message_id } = event

    const targetId = message_id || message?.message_id
    if (!targetId) return

    const existing = this.messages.get(targetId)
    if (!existing) return

    // Merge updates while preserving important fields
    const updated = produce(existing, draft => {
      if (message) {
        Object.assign(draft, message)
        // Preserve media fields
        if (existing.media) draft.media = existing.media
        if (existing.canvas_element_id) draft.canvas_element_id = existing.canvas_element_id
        if (existing.video_url) draft.video_url = existing.video_url
      }
    })

    this.messages.set(targetId, updated)
    this.notifyObservers(existing.session_id)
  }

  /**
   * Handle message deletion
   */
  private handleDeleteMessage(event: DeltaMessageEvent): void {
    const { message_id, session_id } = event

    if (!message_id || !session_id) return

    this.messages.delete(message_id)

    const sessionMsgs = this.sessionMessages.get(session_id) || []
    const index = sessionMsgs.indexOf(message_id)
    if (index > -1) {
      sessionMsgs.splice(index, 1)
    }

    this.notifyObservers(session_id)
  }

  /**
   * Handle streaming start
   */
  private handleStreamingStart(event: DeltaMessageEvent): void {
    const { message, session_id } = event

    if (!message || !session_id) return

    // Mark as streaming
    const streamingMsg = produce(message, draft => {
      draft.status = MessageStatus.STREAMING
      if (!draft.content) draft.content = ''
    })

    this.streamingMessages.set(message.message_id, streamingMsg)
    this.addMessage(streamingMsg, session_id)
    this.notifyObservers(session_id)
  }

  /**
   * Handle streaming delta
   */
  private handleStreamingDelta(event: DeltaMessageEvent): void {
    const { delta_content, message_id, session_id } = event

    if (!delta_content || !message_id) return

    const message = this.messages.get(message_id) || this.streamingMessages.get(message_id)
    if (!message) return

    // Append delta content
    const updated = produce(message, draft => {
      if (typeof draft.content === 'string') {
        draft.content += delta_content
      } else {
        draft.content = (draft.content as string || '') + delta_content
      }
    })

    this.messages.set(message_id, updated)
    this.streamingMessages.set(message_id, updated)

    if (session_id) {
      this.notifyObservers(session_id)
    }
  }

  /**
   * Handle streaming end
   */
  private handleStreamingEnd(event: DeltaMessageEvent): void {
    const { message, message_id } = event

    const targetId = message_id || message?.message_id
    if (!targetId) return

    // Update to completed status
    const existing = this.messages.get(targetId) || this.streamingMessages.get(targetId)
    if (!existing) return

    const updated = produce(existing, draft => {
      draft.status = MessageStatus.COMPLETED
      if (message) {
        // Apply final updates
        if (message.content !== undefined) draft.content = message.content
        if (message.media) draft.media = message.media
        if (message.video_url) draft.video_url = message.video_url
      }
    })

    this.messages.set(targetId, updated)
    this.streamingMessages.delete(targetId)
    this.notifyObservers(existing.session_id)
  }

  /**
   * Handle sync messages
   */
  private handleSyncMessages(event: DeltaMessageEvent): void {
    const { messages = [], session_id, is_incremental } = event

    if (!session_id) return

    if (is_incremental) {
      // Add only new messages
      messages.forEach(msg => {
        if (!this.messages.has(msg.message_id)) {
          this.addMessage(msg, session_id)
        }
      })
    } else {
      // Replace all messages
      this.clearSession(session_id)
      messages.forEach(msg => {
        this.addMessage(msg, session_id)
      })
    }

    this.notifyObservers(session_id)
  }

  /**
   * Handle all messages (backward compatibility)
   */
  private handleAllMessages(event: DeltaMessageEvent): void {
    const { messages = [], session_id } = event

    if (!session_id) return

    // For backward compatibility, check if we should merge or replace
    const currentMessages = this.getSessionMessages(session_id)

    // If we have existing messages and new messages seem to be incremental
    if (currentMessages.length > 0 && messages.length > currentMessages.length) {
      // Merge intelligently
      this.mergeMessages(messages, session_id)
    } else {
      // Replace all
      this.clearSession(session_id)
      messages.forEach(msg => {
        this.addMessage(msg, session_id)
      })
    }

    this.notifyObservers(session_id)
  }

  /**
   * Add a message to the store
   */
  private addMessage(message: StandardMessage, sessionId: string): void {
    // Ensure message has required fields
    if (!message.message_id) {
      message.message_id = `${sessionId}_${message.timestamp || Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }
    if (!message.timestamp) {
      message.timestamp = Date.now()
    }

    this.messages.set(message.message_id, message)

    // Update session messages
    const sessionMsgs = this.sessionMessages.get(sessionId) || []
    if (!sessionMsgs.includes(message.message_id)) {
      sessionMsgs.push(message.message_id)
      this.sessionMessages.set(sessionId, sessionMsgs)
    }

    // Update last message ID
    this.lastMessageId.set(sessionId, message.message_id)
  }

  /**
   * Insert message at specific position
   */
  private insertMessage(message: StandardMessage, sessionId: string, afterMessageId?: string): void {
    this.messages.set(message.message_id, message)

    const sessionMsgs = this.sessionMessages.get(sessionId) || []

    if (afterMessageId) {
      const index = sessionMsgs.indexOf(afterMessageId)
      if (index > -1) {
        sessionMsgs.splice(index + 1, 0, message.message_id)
      } else {
        sessionMsgs.push(message.message_id)
      }
    } else {
      sessionMsgs.unshift(message.message_id)
    }

    this.sessionMessages.set(sessionId, sessionMsgs)
  }

  /**
   * Merge messages intelligently
   */
  private mergeMessages(newMessages: StandardMessage[], sessionId: string): void {
    const existingIds = new Set(this.sessionMessages.get(sessionId) || [])

    newMessages.forEach(msg => {
      if (!existingIds.has(msg.message_id)) {
        this.addMessage(msg, sessionId)
      } else {
        // Update existing message
        const existing = this.messages.get(msg.message_id)
        if (existing) {
          const updated = produce(existing, draft => {
            Object.assign(draft, msg)
            // Preserve important fields
            if (existing.media) draft.media = existing.media
            if (existing.canvas_element_id) draft.canvas_element_id = existing.canvas_element_id
            if (existing.video_url) draft.video_url = existing.video_url
          })
          this.messages.set(msg.message_id, updated)
        }
      }
    })
  }

  /**
   * Get messages for a session
   */
  getSessionMessages(sessionId: string): StandardMessage[] {
    const messageIds = this.sessionMessages.get(sessionId) || []
    const messages = messageIds
      .map(id => this.messages.get(id))
      .filter((msg): msg is StandardMessage => msg !== undefined)

    // Sort by timestamp
    return messages.sort((a, b) => a.timestamp - b.timestamp)
  }

  /**
   * Clear messages for a session
   */
  clearSession(sessionId: string): void {
    const messageIds = this.sessionMessages.get(sessionId) || []
    messageIds.forEach(id => this.messages.delete(id))
    this.sessionMessages.delete(sessionId)
    this.lastMessageId.delete(sessionId)
  }

  /**
   * Subscribe to message updates
   */
  subscribe(observer: MessageObserver): () => void {
    this.observers.add(observer)
    return () => this.observers.delete(observer)
  }

  /**
   * Subscribe to specific event type
   */
  subscribeToEvent(eventType: MessageEventType, observer: EventObserver): () => void {
    const observers = this.eventObservers.get(eventType)
    if (observers) {
      observers.add(observer)
    }
    return () => {
      const observers = this.eventObservers.get(eventType)
      if (observers) {
        observers.delete(observer)
      }
    }
  }

  /**
   * Notify all observers
   */
  private notifyObservers(sessionId: string): void {
    const messages = this.getSessionMessages(sessionId)
    this.observers.forEach(observer => {
      try {
        observer(messages)
      } catch (error) {
        console.error('[MessageStateManager] Observer error:', error)
      }
    })
  }

  /**
   * Notify event observers
   */
  private notifyEventObservers(eventType: MessageEventType, event: DeltaMessageEvent): void {
    const observers = this.eventObservers.get(eventType)
    if (observers) {
      observers.forEach(observer => {
        try {
          observer(event)
        } catch (error) {
          console.error(`[MessageStateManager] Event observer error for ${eventType}:`, error)
        }
      })
    }
  }

  /**
   * Get last message ID for a session
   */
  getLastMessageId(sessionId: string): string | undefined {
    return this.lastMessageId.get(sessionId)
  }

  /**
   * Check if message exists
   */
  hasMessage(messageId: string): boolean {
    return this.messages.has(messageId)
  }

  /**
   * Get a specific message
   */
  getMessage(messageId: string): StandardMessage | undefined {
    return this.messages.get(messageId)
  }
}

// Export singleton instance getter
export const getMessageStateManager = () => MessageStateManager.getInstance()
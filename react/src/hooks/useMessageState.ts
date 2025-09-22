/**
 * React Hook for Message State Management
 * Provides easy integration with MessageStateManager
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  MessageStateManager,
  StandardMessage,
  DeltaMessageEvent,
  MessageEventType,
  getMessageStateManager
} from '@/lib/messageStateManager'

export interface UseMessageStateOptions {
  sessionId: string
  autoScroll?: boolean
  onMessageAdded?: (message: StandardMessage) => void
  onMessageUpdated?: (message: StandardMessage) => void
  onStreamingStart?: (message: StandardMessage) => void
  onStreamingEnd?: (message: StandardMessage) => void
}

export interface UseMessageStateReturn {
  messages: StandardMessage[]
  pending: boolean
  streamingMessageId: string | null
  processEvent: (event: DeltaMessageEvent) => void
  clearMessages: () => void
  hasMessage: (messageId: string) => boolean
  getMessage: (messageId: string) => StandardMessage | undefined
}

/**
 * Custom hook for managing message state
 */
export function useMessageState(options: UseMessageStateOptions): UseMessageStateReturn {
  const { sessionId, autoScroll = true, onMessageAdded, onMessageUpdated, onStreamingStart, onStreamingEnd } = options

  const [messages, setMessages] = useState<StandardMessage[]>([])
  const [pending, setPending] = useState(false)
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null)

  const managerRef = useRef<MessageStateManager>()
  const scrollTimeoutRef = useRef<NodeJS.Timeout>()

  // Initialize manager
  useEffect(() => {
    managerRef.current = getMessageStateManager()
  }, [])

  // Subscribe to message updates
  useEffect(() => {
    if (!managerRef.current) return

    const unsubscribe = managerRef.current.subscribe((updatedMessages) => {
      setMessages(updatedMessages)

      // Auto scroll if enabled
      if (autoScroll) {
        clearTimeout(scrollTimeoutRef.current)
        scrollTimeoutRef.current = setTimeout(() => {
          const scrollElement = document.querySelector('.chat-scroll-area')
          if (scrollElement) {
            scrollElement.scrollTo({
              top: scrollElement.scrollHeight,
              behavior: 'smooth'
            })
          }
        }, 100)
      }
    })

    // Subscribe to specific events
    const unsubscribeStreamingStart = managerRef.current.subscribeToEvent(
      MessageEventType.STREAMING_START,
      (event) => {
        setPending(true)
        if (event.message) {
          setStreamingMessageId(event.message.message_id)
          onStreamingStart?.(event.message)
        }
      }
    )

    const unsubscribeStreamingEnd = managerRef.current.subscribeToEvent(
      MessageEventType.STREAMING_END,
      (event) => {
        setPending(false)
        setStreamingMessageId(null)
        if (event.message) {
          onStreamingEnd?.(event.message)
        }
      }
    )

    const unsubscribeDelta = managerRef.current.subscribeToEvent(
      MessageEventType.DELTA_MESSAGE,
      (event) => {
        if (event.message) {
          onMessageAdded?.(event.message)
        }
      }
    )

    const unsubscribeUpdate = managerRef.current.subscribeToEvent(
      MessageEventType.UPDATE_MESSAGE,
      (event) => {
        if (event.message) {
          onMessageUpdated?.(event.message)
        }
      }
    )

    // Load initial messages for the session
    const initialMessages = managerRef.current.getSessionMessages(sessionId)
    setMessages(initialMessages)

    return () => {
      unsubscribe()
      unsubscribeStreamingStart()
      unsubscribeStreamingEnd()
      unsubscribeDelta()
      unsubscribeUpdate()
      clearTimeout(scrollTimeoutRef.current)
    }
  }, [sessionId, autoScroll, onMessageAdded, onMessageUpdated, onStreamingStart, onStreamingEnd])

  // Process incoming WebSocket event
  const processEvent = useCallback((event: DeltaMessageEvent) => {
    if (!managerRef.current) return

    // Only process events for our session
    if (event.session_id && event.session_id !== sessionId) {
      console.log(`[useMessageState] Ignoring event for different session: ${event.session_id}`)
      return
    }

    managerRef.current.processEvent(event)
  }, [sessionId])

  // Clear messages for the session
  const clearMessages = useCallback(() => {
    if (!managerRef.current) return
    managerRef.current.clearSession(sessionId)
    setMessages([])
  }, [sessionId])

  // Check if message exists
  const hasMessage = useCallback((messageId: string): boolean => {
    if (!managerRef.current) return false
    return managerRef.current.hasMessage(messageId)
  }, [])

  // Get a specific message
  const getMessage = useCallback((messageId: string): StandardMessage | undefined => {
    if (!managerRef.current) return undefined
    return managerRef.current.getMessage(messageId)
  }, [])

  return {
    messages,
    pending,
    streamingMessageId,
    processEvent,
    clearMessages,
    hasMessage,
    getMessage
  }
}

/**
 * Hook for managing multiple sessions
 */
export function useMultiSessionMessageState() {
  const [activeSessions, setActiveSessions] = useState<Set<string>>(new Set())
  const managerRef = useRef<MessageStateManager>()

  useEffect(() => {
    managerRef.current = getMessageStateManager()
  }, [])

  const getSessionMessages = useCallback((sessionId: string): StandardMessage[] => {
    if (!managerRef.current) return []
    return managerRef.current.getSessionMessages(sessionId)
  }, [])

  const processEvent = useCallback((event: DeltaMessageEvent) => {
    if (!managerRef.current) return
    managerRef.current.processEvent(event)

    // Track active sessions
    if (event.session_id) {
      setActiveSessions(prev => new Set(prev).add(event.session_id!))
    }
  }, [])

  const clearSession = useCallback((sessionId: string) => {
    if (!managerRef.current) return
    managerRef.current.clearSession(sessionId)
    setActiveSessions(prev => {
      const newSet = new Set(prev)
      newSet.delete(sessionId)
      return newSet
    })
  }, [])

  return {
    activeSessions: Array.from(activeSessions),
    getSessionMessages,
    processEvent,
    clearSession
  }
}
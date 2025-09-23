/**
 * 管理session处理状态的工具函数
 * 用于跨页面保持处理状态（pending/thinking）
 */

const PROCESSING_STATE_KEY = 'session_processing_states'

interface ProcessingState {
  sessionId: string
  isProcessing: boolean
  startTime: number
  type?: 'text' | 'tool' | 'image'
}

interface ProcessingStates {
  [sessionId: string]: ProcessingState
}

/**
 * 设置session的处理状态
 */
export const setSessionProcessing = (sessionId: string, isProcessing: boolean, type?: 'text' | 'tool' | 'magic') => {
  try {
    const states: ProcessingStates = JSON.parse(localStorage.getItem(PROCESSING_STATE_KEY) || '{}')

    if (isProcessing) {
      states[sessionId] = {
        sessionId,
        isProcessing: true,
        startTime: Date.now(),
        type: type || 'text'
      }
    } else {
      delete states[sessionId]
    }

    localStorage.setItem(PROCESSING_STATE_KEY, JSON.stringify(states))
    console.log(`📝 [SessionState] ${sessionId} processing: ${isProcessing}`, type)
  } catch (error) {
    console.error('Failed to set session processing state:', error)
  }
}

/**
 * 获取session的处理状态
 */
export const getSessionProcessing = (sessionId: string): ProcessingState | null => {
  try {
    const states: ProcessingStates = JSON.parse(localStorage.getItem(PROCESSING_STATE_KEY) || '{}')
    const state = states[sessionId]

    if (state) {
      // 检查状态是否过期（超过5分钟）
      const elapsed = Date.now() - state.startTime
      if (elapsed > 5 * 60 * 1000) {
        console.log(`⏰ [SessionState] ${sessionId} processing state expired`)
        delete states[sessionId]
        localStorage.setItem(PROCESSING_STATE_KEY, JSON.stringify(states))
        return null
      }

      console.log(`📖 [SessionState] ${sessionId} is processing:`, state)
      return state
    }

    return null
  } catch (error) {
    console.error('Failed to get session processing state:', error)
    return null
  }
}

/**
 * 清除所有过期的处理状态
 */
export const cleanupExpiredStates = () => {
  try {
    const states: ProcessingStates = JSON.parse(localStorage.getItem(PROCESSING_STATE_KEY) || '{}')
    const now = Date.now()
    let hasChanges = false

    Object.keys(states).forEach(sessionId => {
      const state = states[sessionId]
      const elapsed = now - state.startTime

      // 清除超过5分钟的状态
      if (elapsed > 5 * 60 * 1000) {
        delete states[sessionId]
        hasChanges = true
        console.log(`🧹 [SessionState] Cleaned expired state for ${sessionId}`)
      }
    })

    if (hasChanges) {
      localStorage.setItem(PROCESSING_STATE_KEY, JSON.stringify(states))
    }
  } catch (error) {
    console.error('Failed to cleanup expired states:', error)
  }
}

/**
 * 清除特定session的处理状态
 */
export const clearSessionProcessing = (sessionId: string) => {
  setSessionProcessing(sessionId, false)
}

/**
 * 清除所有处理状态
 */
export const clearAllProcessingStates = () => {
  localStorage.removeItem(PROCESSING_STATE_KEY)
  console.log('🧹 [SessionState] Cleared all processing states')
}
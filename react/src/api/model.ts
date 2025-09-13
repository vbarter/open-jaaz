export type ModelInfo = {
  provider: string
  model: string
  type: 'text' | 'image' | 'tool' | 'video'
  url: string
}

export type ToolInfo = {
  provider: string
  id: string
  display_name?: string | null
  type?: 'image' | 'tool' | 'video'
}

export async function listModels(): Promise<{
  llm: ModelInfo[]
  tools: ToolInfo[]
  hasError?: boolean
  errorType?: 'network' | 'auth' | 'server' | 'unknown'
  errorMessage?: string
}> {
  let hasError = false
  let errorType: 'network' | 'auth' | 'server' | 'unknown' = 'unknown'
  let errorMessage = ''

  const modelsResp = await fetch('/api/list_models')
    .then(async (res) => {
      if (!res.ok) {
        hasError = true
        if (res.status === 401 || res.status === 403) {
          errorType = 'auth'
          errorMessage = 'Authentication required'
        } else if (res.status >= 500) {
          errorType = 'server'
          errorMessage = 'Server error'
        } else {
          errorType = 'unknown'
          errorMessage = `HTTP ${res.status}`
        }
        return []
      }
      return await res.json()
    })
    .catch((err) => {
      console.error('Models API error:', err)
      hasError = true
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        errorType = 'network'
        errorMessage = 'Network connection failed'
      } else {
        errorType = 'unknown'
        errorMessage = err.message || 'Unknown error'
      }
      return []
    })

  const toolsResp = await fetch('/api/list_tools')
    .then(async (res) => {
      if (!res.ok) {
        hasError = true
        if (res.status === 401 || res.status === 403) {
          errorType = 'auth'
          errorMessage = 'Authentication required'
        } else if (res.status >= 500) {
          errorType = 'server'
          errorMessage = 'Server error'
        } else {
          errorType = 'unknown'
          errorMessage = `HTTP ${res.status}`
        }
        return []
      }
      return await res.json()
    })
    .catch((err) => {
      console.error('Tools API error:', err)
      hasError = true
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        errorType = 'network'
        errorMessage = 'Network connection failed'
      } else {
        errorType = 'unknown'
        errorMessage = err.message || 'Unknown error'
      }
      return []
    })

  return {
    llm: modelsResp,
    tools: toolsResp,
    hasError,
    errorType,
    errorMessage
  }
}

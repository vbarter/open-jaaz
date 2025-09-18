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
}> {
  // 🔧 改进错误处理：网络错误时抛出异常而不是返回空数组
  // 这样React Query可以保持previous data，避免误触发登录弹窗

  const modelsResp = await fetch('/api/list_models')
    .then((res) => {
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }
      return res.json()
    })
    .catch((err) => {
      console.error('🔥 Failed to fetch models:', err)
      // 🚨 抛出错误而不是返回空数组，让React Query使用placeholderData
      throw new Error(`Failed to fetch models: ${err.message}`)
    })

  const toolsResp = await fetch('/api/list_tools')
    .then((res) => {
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }
      return res.json()
    })
    .catch((err) => {
      console.error('🔥 Failed to fetch tools:', err)
      // 🚨 抛出错误而不是返回空数组，让React Query使用placeholderData
      throw new Error(`Failed to fetch tools: ${err.message}`)
    })

  console.log('🔧 [listModels] 模型列表', modelsResp)
  console.log('🔧 [listModels] 工具列表', toolsResp)
  return {
    llm: modelsResp || [],
    tools: toolsResp || [],
  }
}

import { listModels, ModelInfo, ToolInfo } from '@/api/model'
import useConfigsStore from '@/stores/configs'
import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'

export const ConfigsContext = createContext<{
  configsStore: typeof useConfigsStore
  refreshModels: () => void
  isModelInitialized: boolean
} | null>(null)

export const ConfigsProvider = ({ children }: { children: React.ReactNode }) => {
  const configsStore = useConfigsStore()
  const { setTextModels, setTextModel, setSelectedTools, setAllTools, setShowLoginDialog } =
    configsStore
  const { authStatus } = useAuth()

  // 存储上一次的 allTools 值，用于检测新添加的工具，并自动选中
  const previousAllToolsRef = useRef<ModelInfo[]>([])
  // 添加初始化状态管理，防止竞态条件
  const isInitializingRef = useRef(false)
  const [isModelInitialized, setIsModelInitialized] = useState(false)

  const { data: modelList, refetch: refreshModels } = useQuery({
    queryKey: ['list_models_2'],
    queryFn: () => listModels(),
    staleTime: 1000, // 5分钟内数据被认为是新鲜的
    placeholderData: (previousData) => previousData, // 关键：显示旧数据同时获取新数据
    refetchOnWindowFocus: true, // 窗口获得焦点时重新获取
    refetchOnReconnect: true, // 网络重连时重新获取
    refetchOnMount: true, // 挂载时重新获取
  })

  useEffect(() => {
    if (!modelList || isInitializingRef.current) return
    
    // 设置初始化锁，防止竞态条件
    isInitializingRef.current = true
    
    const { llm: llmModels = [], tools: toolList = [] } = modelList

    setTextModels(llmModels || [])
    setAllTools(toolList || [])

    // 根据登录状态决定模型选择策略
    const isLoggedIn = authStatus.is_logged_in
    const currentSelectedModel = localStorage.getItem('current_selected_model')
    const savedTextModel = localStorage.getItem('text_model')

    console.log('🔧 [ConfigsProvider] 开始模型初始化', {
      isLoggedIn,
      currentSelectedModel,
      savedTextModel,
      llmModelsCount: llmModels.length,
      toolsCount: toolList.length
    })

    // 未登录用户：强制使用 Google 模型
    if (!isLoggedIn) {
      console.log('🔄 未登录用户，强制设置 Google gemini-2.5-flash-image 模型')
      localStorage.setItem('current_selected_model', 'gemini-2.5-flash-image')
      localStorage.removeItem('text_model')
      
      // 清空文本模型选择
      setTextModel(null)
    } else {
      console.log('👤 登录用户，以 current_selected_model 为权威恢复用户选择...')
      
      // 新的恢复策略：严格按照用户最后的选择（current_selected_model）来恢复
      if (currentSelectedModel) {
        console.log('🔍 检查用户最后选择的模型:', currentSelectedModel)
        
        // 步骤1：在文本模型中查找匹配
        const matchedTextModel = llmModels.find((m) => m.model === currentSelectedModel)
        if (matchedTextModel) {
          console.log('✅ 恢复用户选择的文本模型:', matchedTextModel.model)
          setTextModel(matchedTextModel)
          // 同步 text_model 存储
          localStorage.setItem('text_model', matchedTextModel.provider + ':' + matchedTextModel.model)
          // 清空工具选择，确保只有文本模型被选中
          const disabledToolIds = toolList.map((t) => t.id)
          localStorage.setItem('disabled_tool_ids', JSON.stringify(disabledToolIds))
        } else {
          // 步骤2：在工具模型中查找匹配
          const matchedTool = toolList.find((t) => 
            t.display_name === currentSelectedModel || t.id === currentSelectedModel
          )
          if (matchedTool) {
            console.log('✅ 恢复用户选择的工具模型:', matchedTool.display_name || matchedTool.id)
            // 清空文本模型选择
            setTextModel(null)
            localStorage.removeItem('text_model')
            
            // 恢复工具模型选择 - 在后面的工具选择逻辑中会被设置
            console.log('🎯 将在工具选择阶段恢复此工具模型')
          } else {
            console.log('⚠️ 未找到匹配的模型，使用默认策略')
            // 步骤3：都未找到，使用默认策略
            useDefaultModelStrategy()
          }
        }
      } else {
        console.log('🎯 没有保存的模型选择，使用默认策略')
        useDefaultModelStrategy()
      }
      
      // 默认策略函数
      function useDefaultModelStrategy() {
        let defaultModel = llmModels.find((m) => m.type === 'text' && m.model === 'gpt-4o')
        if (!defaultModel) {
          defaultModel = llmModels.find((m) => m.type === 'text' && m.model === 'gpt-4o-mini')
        }
        if (!defaultModel) {
          defaultModel = llmModels.find((m) => m.type === 'text')
        }
        
        if (defaultModel) {
          console.log('📝 设置默认文本模型:', defaultModel.model)
          setTextModel(defaultModel)
          localStorage.setItem('current_selected_model', defaultModel.model)
          localStorage.setItem('text_model', defaultModel.provider + ':' + defaultModel.model)
        }
      }
    }

    // 默认工具选择函数：优先选择 Google 的 gemini-2.5-flash-image 画图工具
    const getDefaultSelectedTools = (toolList: ToolInfo[]): ToolInfo[] => {
      const googleImageTool = toolList.find((t) => 
        t.provider === 'google' && 
        (t.display_name === 'gemini-2.5-flash-image' || t.id === 'generate_image_by_google_nano_banana')
      )
      
      if (googleImageTool) {
        // 如果找到 Google 画图工具，默认只选择它
        return [googleImageTool]
      } else {
        // 如果没有找到，选择所有工具作为兜底
        return toolList
      }
    }

    // 设置选中的工具模型
    let currentSelectedTools: ToolInfo[] = []
    
    if (!isLoggedIn) {
      // 未登录用户：强制使用Google画图工具
      currentSelectedTools = getDefaultSelectedTools(toolList)
      console.log('🎯 未登录用户，强制选择 Google 画图工具:', currentSelectedTools.map(t => t.display_name || t.id))
      
      // 同步localStorage设置：禁用除了Google画图工具之外的所有工具
      if (currentSelectedTools.length > 0) {
        const googleTool = currentSelectedTools[0]
        const disabledToolIds = toolList.filter((t) => t.id !== googleTool.id).map((t) => t.id)
        localStorage.setItem('disabled_tool_ids', JSON.stringify(disabledToolIds))
      }
    } else {
      // 登录用户：根据 current_selected_model 智能恢复工具选择
      console.log('🔧 登录用户工具选择恢复逻辑')
      
      // 检查用户是否选择了工具模型
      if (currentSelectedModel) {
        const matchedTool = toolList.find((t) => 
          t.display_name === currentSelectedModel || t.id === currentSelectedModel
        )
        
        if (matchedTool) {
          // 恢复用户选择的特定工具
          console.log('✅ 恢复用户选择的工具:', matchedTool.display_name || matchedTool.id)
          currentSelectedTools = [matchedTool]
          
          // 更新 disabled_tool_ids，禁用其他工具
          const disabledToolIds = toolList.filter((t) => t.id !== matchedTool.id).map((t) => t.id)
          localStorage.setItem('disabled_tool_ids', JSON.stringify(disabledToolIds))
        } else {
          // current_selected_model 不是工具模型，使用保存的工具选择逻辑
          console.log('🎯 current_selected_model 不是工具，使用保存的工具选择')
          currentSelectedTools = getToolsFromDisabledList()
        }
      } else {
        // 没有 current_selected_model，使用保存的工具选择逻辑
        console.log('🎯 没有 current_selected_model，使用保存的工具选择')
        currentSelectedTools = getToolsFromDisabledList()
      }
      
      // 从 disabled_tool_ids 恢复工具选择的辅助函数
      function getToolsFromDisabledList(): ToolInfo[] {
        const disabledToolsJson = localStorage.getItem('disabled_tool_ids')
        
        if (disabledToolsJson) {
          try {
            const disabledToolIds: string[] = JSON.parse(disabledToolsJson)
            return toolList.filter((t) => !disabledToolIds.includes(t.id))
          } catch (error) {
            console.error('解析 disabled_tool_ids 失败:', error)
            return getDefaultSelectedTools(toolList)
          }
        } else {
          // 如果没有保存的设置，使用默认选择：优先选择 Google 的画图工具
          return getDefaultSelectedTools(toolList)
        }
      }
    }

    setSelectedTools(currentSelectedTools)

    // 只有在明确需要认证时才显示登录对话框，避免网络问题误触发
    const shouldShowLogin = (llmModels.length === 0 || toolList.length === 0) &&
                           modelList?.errorType === 'auth'

    if (shouldShowLogin) {
      console.log('需要认证，显示登录对话框:', modelList.errorMessage)
      setShowLoginDialog(true)
    } else if (modelList?.hasError) {
      // 非认证问题的错误，提供用户友好的错误提示和重试选项
      console.warn('模型加载错误 (非认证问题):', {
        errorType: modelList.errorType,
        errorMessage: modelList.errorMessage,
        modelsCount: llmModels.length,
        toolsCount: toolList.length
      })

      // 根据错误类型显示不同的提示
      if (modelList.errorType === 'network') {
        toast.error('网络连接失败', {
          description: '请检查网络连接后重试',
          action: {
            label: '重试',
            onClick: () => {
              console.log('用户手动重试加载模型')
              refreshModels()
            }
          },
          duration: 8000
        })
      } else if (modelList.errorType === 'server') {
        toast.error('服务器暂时不可用', {
          description: '服务器正在维护中，请稍后重试',
          action: {
            label: '重试',
            onClick: () => {
              console.log('用户手动重试加载模型')
              refreshModels()
            }
          },
          duration: 8000
        })
      } else if (modelList.errorType === 'unknown' && (llmModels.length === 0 || toolList.length === 0)) {
        toast.warning('模型加载异常', {
          description: '部分功能可能不可用，可尝试刷新页面',
          action: {
            label: '刷新',
            onClick: () => {
              window.location.reload()
            }
          },
          duration: 6000
        })
      }
    }

    // 标记初始化完成，释放锁
    setIsModelInitialized(true)
    isInitializingRef.current = false
    
    console.log('✅ [ConfigsProvider] 模型初始化完成')
  }, [modelList, setSelectedTools, setTextModel, setTextModels, setAllTools, setShowLoginDialog, authStatus.is_logged_in])

  return (
    <ConfigsContext.Provider value={{ configsStore: useConfigsStore, refreshModels, isModelInitialized }}>
      {children}
    </ConfigsContext.Provider>
  )
}

export const useConfigs = () => {
  const context = useContext(ConfigsContext)
  if (!context) {
    throw new Error('useConfigs must be used within a ConfigsProvider')
  }
  return context.configsStore()
}

export const useRefreshModels = () => {
  const context = useContext(ConfigsContext)
  if (!context) {
    throw new Error('useRefreshModels must be used within a ConfigsProvider')
  }
  return context.refreshModels
}

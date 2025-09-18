import { ModelInfo, ToolInfo } from '@/api/model'
import { LLMConfig, Model } from '@/types/types'
import { create } from 'zustand'

type ConfigsStore = {
  initCanvas: boolean
  setInitCanvas: (initCanvas: boolean) => void

  textModels: Model[]
  setTextModels: (models: Model[]) => void

  selectedTools: ToolInfo[]
  setSelectedTools: (models: ToolInfo[]) => void

  textModel?: Model
  setTextModel: (model?: Model) => void

  // New: Support multi-selection across types
  selectedImageTool?: ToolInfo
  setSelectedImageTool: (tool?: ToolInfo) => void

  selectedVideoTool?: ToolInfo
  setSelectedVideoTool: (tool?: ToolInfo) => void

  showInstallDialog: boolean
  setShowInstallDialog: (show: boolean) => void

  showUpdateDialog: boolean
  setShowUpdateDialog: (show: boolean) => void

  showSettingsDialog: boolean
  setShowSettingsDialog: (show: boolean) => void

  showLoginDialog: boolean
  setShowLoginDialog: (show: boolean) => void

  allTools: ToolInfo[]
  setAllTools: (tools: ToolInfo[]) => void

  providers: {
    [key: string]: LLMConfig
  }
  setProviders: (providers: { [key: string]: LLMConfig }) => void
}

const useConfigsStore = create<ConfigsStore>((set) => ({
  initCanvas: false,
  setInitCanvas: (initCanvas) => set({ initCanvas }),

  textModels: [],
  setTextModels: (models) => set({ textModels: models }),

  textModel: undefined,
  setTextModel: (model) => set({ textModel: model }),

  selectedImageTool: undefined,
  setSelectedImageTool: (tool) => set({ selectedImageTool: tool }),

  selectedVideoTool: undefined,
  setSelectedVideoTool: (tool) => set({ selectedVideoTool: tool }),

  showInstallDialog: false,
  setShowInstallDialog: (show) => set({ showInstallDialog: show }),

  showUpdateDialog: false,
  setShowUpdateDialog: (show) => set({ showUpdateDialog: show }),

  showSettingsDialog: false,
  setShowSettingsDialog: (show) => set({ showSettingsDialog: show }),

  showLoginDialog: false,
  setShowLoginDialog: (show) => set({ showLoginDialog: show }),

  providers: {},
  setProviders: (providers) => set({ providers }),

  allTools: [],
  setAllTools: (tools) => set({ allTools: tools }),

  selectedTools: [],
  setSelectedTools: (tools) => set({ selectedTools: tools }),
}))

export default useConfigsStore

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Component } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuGroup,
} from '@/components/ui/dropdown-menu'
import { Checkbox } from '@/components/ui/checkbox'
import { useTranslation } from 'react-i18next'
import { useConfigs, useRefreshModels, ConfigsContext } from '@/contexts/configs'
import { ModelInfo, ToolInfo } from '@/api/model'
import { Model } from '@/types/types'
import { PROVIDER_NAME_MAPPING } from '@/constants'
import { ScrollArea } from '@/components/ui/scroll-area'
import useConfigsStore from '@/stores/configs'

interface ModelSelectorV3Props {
  onModelChange?: (modelId: string, type: 'text' | 'image' | 'video') => void
}

const ModelSelectorV3: React.FC<ModelSelectorV3Props> = ({ onModelChange }) => {
  const { textModel, setTextModel, textModels, selectedTools, setSelectedTools, allTools } =
    useConfigs()

  // Get new multi-selection states from store
  const { selectedImageTool, setSelectedImageTool, selectedVideoTool, setSelectedVideoTool } = useConfigsStore()

  const configsContext = React.useContext(ConfigsContext)
  const isModelInitialized = configsContext?.isModelInitialized || false

  const [activeTab, setActiveTab] = useState<'image' | 'video' | 'text'>('image')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const { t } = useTranslation()

  // Multi-selection state: one model per type
  const [selectedModels, setSelectedModels] = useState<{
    text?: Model
    image?: ToolInfo
    video?: ToolInfo
  }>({})

  // Sync selected models from configs
  React.useEffect(() => {
    if (!isModelInitialized) {
      console.log('🔄 [ModelSelectorV3] 等待模型初始化完成...')
      return
    }

    const newSelectedModels: typeof selectedModels = {}

    // Sync text model
    if (textModel) {
      newSelectedModels.text = textModel
    }

    // Sync image tool
    if (selectedImageTool) {
      newSelectedModels.image = selectedImageTool
    }

    // Sync video tool
    if (selectedVideoTool) {
      newSelectedModels.video = selectedVideoTool
    }

    // For backward compatibility with selectedTools
    if (selectedTools.length > 0 && !selectedImageTool && !selectedVideoTool) {
      selectedTools.forEach(tool => {
        if (tool.type === 'image' && !newSelectedModels.image) {
          newSelectedModels.image = tool
          setSelectedImageTool(tool)
        } else if (tool.type === 'video' && !newSelectedModels.video) {
          newSelectedModels.video = tool
          setSelectedVideoTool(tool)
        }
      })
    }

    setSelectedModels(newSelectedModels)
    console.log('🔧 [ModelSelectorV3] 同步选择状态', newSelectedModels)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModelInitialized, textModel, selectedImageTool, selectedVideoTool, selectedTools])

  // Group models by provider
  const groupModelsByProvider = (models: typeof allTools) => {
    const grouped: { [provider: string]: typeof allTools } = {}
    models?.forEach((model) => {
      if (!grouped[model.provider]) {
        grouped[model.provider] = []
      }
      grouped[model.provider].push(model)
    })
    return grouped
  }

  const groupLLMsByProvider = (models: typeof textModels) => {
    const grouped: { [provider: string]: typeof textModels } = {}
    models?.forEach((model) => {
      if (!grouped[model.provider]) {
        grouped[model.provider] = []
      }
      grouped[model.provider].push(model)
    })
    return grouped
  }

  // Sort providers to put Jaaz first
  const sortProviders = <T,>(grouped: { [provider: string]: T[] }) => {
    const sortedEntries = Object.entries(grouped).sort(([a], [b]) => {
      if (a === 'jaaz') return -1
      if (b === 'jaaz') return 1
      return a.localeCompare(b)
    })
    return Object.fromEntries(sortedEntries)
  }

  const groupedLLMs = sortProviders(groupLLMsByProvider(textModels))

  // Filter tools by type
  const getToolsByType = (type: 'image' | 'video') => {
    const filteredTools = allTools.filter((tool) => tool.type === type)
    return groupModelsByProvider(filteredTools)
  }

  const handleModelSelect = (modelKey: string) => {
    if (activeTab === 'text') {
      // Select text model
      const model = textModels?.find((m) => m.provider + ':' + m.model === modelKey)

      if (model) {
        // Toggle text model selection
        if (selectedModels.text?.model === model.model) {
          // Deselect if already selected
          setTextModel(undefined)
          localStorage.removeItem('text_model')
          setSelectedModels(prev => ({ ...prev, text: undefined }))
        } else {
          // Select new text model
          setTextModel(model)
          localStorage.setItem('text_model', modelKey)
          setSelectedModels(prev => ({ ...prev, text: model }))
        }

        console.log('✅ [ModelSelectorV3] 选择文本模型:', model.model)
        onModelChange?.(modelKey, 'text')
      }
    } else {
      // Select tool model (image or video)
      const tool = allTools.find((m) => m.provider + ':' + m.id === modelKey)
      if (tool) {
        const isImage = tool.type === 'image'
        const currentSelected = isImage ? selectedModels.image : selectedModels.video

        if (currentSelected?.id === tool.id) {
          // Deselect if already selected
          if (isImage) {
            setSelectedImageTool(undefined)
            setSelectedModels(prev => ({ ...prev, image: undefined }))
          } else {
            setSelectedVideoTool(undefined)
            setSelectedModels(prev => ({ ...prev, video: undefined }))
          }
        } else {
          // Select new tool
          if (isImage) {
            setSelectedImageTool(tool)
            setSelectedModels(prev => ({ ...prev, image: tool }))
          } else {
            setSelectedVideoTool(tool)
            setSelectedModels(prev => ({ ...prev, video: tool }))
          }
        }

        // Update selectedTools for backward compatibility
        const newSelectedTools = []
        if (isImage) {
          if (currentSelected?.id !== tool.id) {
            newSelectedTools.push(tool)
            if (selectedModels.video) newSelectedTools.push(selectedModels.video)
          } else {
            if (selectedModels.video) newSelectedTools.push(selectedModels.video)
          }
        } else {
          if (selectedModels.image) newSelectedTools.push(selectedModels.image)
          if (currentSelected?.id !== tool.id) {
            newSelectedTools.push(tool)
          }
        }
        setSelectedTools(newSelectedTools)

        console.log('✅ [ModelSelectorV3] 选择工具模型:', tool.display_name || tool.id)
        onModelChange?.(modelKey, activeTab)
      }
    }
    // Don't close dropdown after selection - let user close it manually
    // setDropdownOpen(false)
  }

  // Get selected model for current tab - currently unused but may be useful for future features
  // const getSelectedModel = () => {
  //   if (activeTab === 'text') return selectedModels.text
  //   if (activeTab === 'image') return selectedModels.image
  //   if (activeTab === 'video') return selectedModels.video
  //   return null
  // }

  // Get current models based on active tab
  const getCurrentModels = () => {
    if (activeTab === 'text') {
      return groupedLLMs
    } else {
      return getToolsByType(activeTab)
    }
  }

  // Check if a model is selected
  const isModelSelected = (modelKey: string) => {
    if (activeTab === 'text' && selectedModels.text) {
      return selectedModels.text.provider + ':' + selectedModels.text.model === modelKey
    }

    if (activeTab === 'image' && selectedModels.image) {
      return selectedModels.image.provider + ':' + selectedModels.image.id === modelKey
    }

    if (activeTab === 'video' && selectedModels.video) {
      return selectedModels.video.provider + ':' + selectedModels.video.id === modelKey
    }

    return false
  }

  // Get provider display info
  const getProviderDisplayInfo = (provider: string) => {
    const providerInfo = PROVIDER_NAME_MAPPING[provider]
    return {
      name: providerInfo?.name || provider,
      icon: providerInfo?.icon,
    }
  }

  const tabs = [
    { id: 'image', label: t('chat:modelSelector.tabs.image') },
    { id: 'video', label: t('chat:modelSelector.tabs.video') },
    { id: 'text', label: t('chat:modelSelector.tabs.text') },
  ] as const

  // Auto-switch to tab with selection when dropdown opens
  const hasAutoSwitchedRef = React.useRef(false)
  const lastDropdownStateRef = React.useRef(false)

  React.useEffect(() => {
    const justOpened = dropdownOpen && !lastDropdownStateRef.current

    if (justOpened && !hasAutoSwitchedRef.current) {
      // Auto-switch to first tab with selection
      if (selectedModels.text && activeTab !== 'text') {
        setActiveTab('text')
        hasAutoSwitchedRef.current = true
      } else if (selectedModels.image && activeTab !== 'image') {
        setActiveTab('image')
        hasAutoSwitchedRef.current = true
      } else if (selectedModels.video && activeTab !== 'video') {
        setActiveTab('video')
        hasAutoSwitchedRef.current = true
      }
    }

    lastDropdownStateRef.current = dropdownOpen

    if (!dropdownOpen) {
      hasAutoSwitchedRef.current = false
    }
  }, [dropdownOpen, selectedModels, activeTab])

  return (
    <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant='outline'
          className={`shrink-0 h-8 w-8 p-0 flex items-center justify-center ${
            Object.keys(selectedModels).length > 0
              ? 'text-primary border-green-200 bg-green-50'
              : 'text-muted-foreground border-border bg-background'
          }`}
        >
          <Component className='size-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-96 select-none'>
        {/* Header */}
        <div className='px-4 py-2 border-b'>
          <div className='text-sm font-medium'>{t('chat:modelSelector.title')}</div>
          <div className='text-xs text-muted-foreground mt-1'>
            {t(
              'chat:modelSelector.multiSelectMode',
              'Multi-selection across types, single selection within type'
            )}
          </div>
          {Object.keys(selectedModels).length > 0 && (
            <div className='mt-2 space-y-1'>
              {selectedModels.text && (
                <div className='px-2 py-1 bg-blue-50 rounded text-xs text-blue-700'>
                  {t('chat:modelSelector.text', 'Text')}: {selectedModels.text.model}
                </div>
              )}
              {selectedModels.image && (
                <div className='px-2 py-1 bg-green-50 rounded text-xs text-green-700'>
                  {t('chat:modelSelector.image', 'Image')}: {selectedModels.image.display_name || selectedModels.image.id}
                </div>
              )}
              {selectedModels.video && (
                <div className='px-2 py-1 bg-purple-50 rounded text-xs text-purple-700'>
                  {t('chat:modelSelector.video', 'Video')}: {selectedModels.video.display_name || selectedModels.video.id}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className='flex p-1 bg-muted rounded-lg mx-4 my-2'>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-3 py-1 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Models List */}
        <ScrollArea>
          <div className='max-h-80 h-80 px-4 pb-4 select-none'>
            {Object.entries(getCurrentModels()).map(([provider, providerModels], index, array) => {
              const providerInfo = getProviderDisplayInfo(provider)
              const isLastGroup = index === array.length - 1
              return (
                <DropdownMenuGroup key={provider}>
                  <DropdownMenuLabel className='text-xs font-medium text-muted-foreground px-0 py-2'>
                    <div className='flex items-center gap-2'>
                      <img
                        src={providerInfo.icon}
                        alt={providerInfo.name}
                        className='w-4 h-4 rounded-full'
                      />
                      {providerInfo.name}
                    </div>
                  </DropdownMenuLabel>
                  {providerModels.map((model: ModelInfo | ToolInfo) => {
                    const modelKey =
                      activeTab === 'text'
                        ? model.provider + ':' + (model as Model).model
                        : model.provider + ':' + (model as ToolInfo).id
                    const modelName =
                      activeTab === 'text'
                        ? (model as Model).model
                        : (model as ToolInfo).display_name || (model as ToolInfo).id

                    return (
                      <div
                        key={modelKey}
                        className={`flex items-center justify-between p-3 transition-all duration-200 mb-2 cursor-pointer rounded-lg ${
                          isModelSelected(modelKey)
                            ? 'bg-primary/10 border border-primary/20 shadow-sm'
                            : 'hover:bg-muted/50 border border-transparent'
                        }`}
                        onClick={() => handleModelSelect(modelKey)}
                      >
                        <div className='flex-1'>
                          <div
                            className={`font-medium text-sm transition-colors ${
                              isModelSelected(modelKey) ? 'text-primary' : 'text-foreground'
                            }`}
                          >
                            {modelName}
                          </div>
                          {isModelSelected(modelKey) && (
                            <div className='text-xs text-primary/70 mt-1'>
                              {t('chat:modelSelector.selected', 'Selected')}
                            </div>
                          )}
                        </div>
                        <div
                          className={`ml-4 transition-all duration-200 ${
                            isModelSelected(modelKey)
                              ? 'scale-110 text-primary'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {isModelSelected(modelKey) ? (
                            <div className='w-4 h-4 rounded-full bg-primary flex items-center justify-center'>
                              <svg width='8' height='8' viewBox='0 0 8 8' fill='none'>
                                <path
                                  d='M6.5 2L3 5.5L1.5 4'
                                  stroke='white'
                                  strokeWidth='1.5'
                                  strokeLinecap='round'
                                  strokeLinejoin='round'
                                />
                              </svg>
                            </div>
                          ) : (
                            <div className='w-4 h-4 rounded-full border-2 border-muted-foreground/30' />
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {!isLastGroup && <DropdownMenuSeparator className='my-2' />}
                </DropdownMenuGroup>
              )
            })}
          </div>
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default ModelSelectorV3

import { cancelChat } from '@/api/chat'
import { cancelMagicGenerate } from '@/api/magic'
import { uploadImage, uploadImageFast, FastUploadResult, getBestImageUrl, getDisplayImageUrl } from '@/api/upload'
import { Button } from '@/components/ui/button'
import { useConfigs } from '@/contexts/configs'
import { eventBus, TCanvasAddImagesToChatEvent, TMaterialAddImagesToChatEvent } from '@/lib/event'
import { cn, dataURLToFile } from '@/lib/utils'
import { Message, MessageContent, Model } from '@/types/types'
import { ModelInfo, ToolInfo } from '@/api/model'
import { useMutation } from '@tanstack/react-query'
import { useDrop } from 'ahooks'
import { produce } from 'immer'
import {
  ArrowUp,
  Loader2,
  PlusIcon,
  Square,
  XIcon,
  RectangleVertical,
  ChevronDown,
  Hash,
  Sparkles,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import Textarea, { TextAreaRef } from 'rc-textarea'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import ModelSelectorV2 from './ModelSelectorV2'
import ModelSelectorV3 from './ModelSelectorV3'
import { PosterGeneratorDialog } from '@/components/plugin/PosterGeneratorDialog'
import { useAuth } from '@/contexts/AuthContext'
import { useBalance } from '@/hooks/use-balance'
import { useTypingPlaceholder } from '@/hooks/use-typing-placeholder'
import { BASE_API_URL } from '@/constants'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type ChatTextareaProps = {
  pending: boolean | string // 🆕 Update type
  className?: string
  messages?: Message[] // Make optional
  sessionId?: string
  initialValue?: string
  onSend: ( // Rename to match usage in Chat.tsx
    data: Message[],
    configs: {
      textModel: ModelInfo | null
      toolList: ToolInfo[]
      modelName: string
      aspectRatio?: string
      quantity?: number
      plugin?: string
    }
  ) => void
  onCancelChat?: () => void
  enableDynamicPlaceholder?: boolean
  onStop?: () => void // Add missing prop
  selectedPlugin?: string // 🆕 Add prop
  setSelectedPlugin?: (plugin: string) => void // 🆕 Add prop
  variant?: 'default' | 'homepage'
}

const ChatTextarea: React.FC<ChatTextareaProps> = ({
  pending,
  className,
  messages = [],
  sessionId,
  initialValue = '',
  onSend,
  onCancelChat,
  enableDynamicPlaceholder = true,
  selectedPlugin, // 🆕 Destructure
  setSelectedPlugin, // 🆕 Destructure
  variant = 'default',
}) => {
  const { t } = useTranslation()
  const { authStatus } = useAuth()
  const { textModel, selectedTools, setShowLoginDialog } = useConfigs()
  const { balance } = useBalance()
  
  const dynamicPlaceholder = useTypingPlaceholder({
    typingSpeed: 80,
    deletingSpeed: 40,
    pauseBetweenWords: 800,
    pauseAfterComplete: 2500,
    enabled: enableDynamicPlaceholder
  })
  const [prompt, setPrompt] = useState(initialValue)
  const textareaRef = useRef<TextAreaRef>(null)
  const [images, setImages] = useState<
    {
      file_id: string
      width: number
      height: number
      localPreviewUrl?: string
      serverUrl?: string
      directUrl?: string | null
      redirectUrl?: string
      proxyUrl?: string
      uploadStatus?: 'uploading' | 'local_ready' | 'cloud_synced' | 'failed'
    }[]
  >([])
  const [isFocused, setIsFocused] = useState(false)
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string>('auto')
  const [quantity, setQuantity] = useState<number>(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const MAX_QUANTITY = 30

  const imageInputRef = useRef<HTMLInputElement>(null)
  const [posterDialogOpen, setPosterDialogOpen] = useState(false)
  // const [isPosterMode, setIsPosterMode] = useState(false) // 🗑️ Remove local state

  // 充值按钮组件
  const RechargeContent = useCallback(
    () => (
      <div className='flex items-center justify-between gap-3'>
        <span className='text-sm text-muted-foreground flex-1'>
          {t('chat:insufficientBalanceDescription')}
        </span>
        <Button
          size='sm'
          variant='outline'
          className='shrink-0'
          onClick={() => {
            const billingUrl = `${BASE_API_URL}/billing`
            if (window.electronAPI?.openBrowserUrl) {
              window.electronAPI.openBrowserUrl(billingUrl)
            } else {
              window.open(billingUrl, '_blank')
            }
          }}
        >
          {t('common:auth.recharge')}
        </Button>
      </div>
    ),
    [t]
  )

  const { mutate: uploadImageMutation } = useMutation({
    mutationFn: (file: File) => uploadImageFast(file),
    onSuccess: (data: FastUploadResult) => {
      console.log('⚡ uploadImageMutation onSuccess', data)
      setImages((prev) => [
        ...prev,
        {
          file_id: data.file_id,
          width: data.width,
          height: data.height,
          localPreviewUrl: data.localPreviewUrl,
          serverUrl: data.url, // 向后兼容
          directUrl: data.direct_url, // 腾讯云直链URL
          redirectUrl: data.redirect_url, // 重定向URL
          proxyUrl: data.proxy_url, // 代理URL
          uploadStatus: data.upload_status as 'local_ready',
        },
      ])
    },
    onError: (error) => {
      console.error('⚡ uploadImageMutation onError', error)
      toast.error('Failed to upload image', {
        description: <div>{error.toString()}</div>,
      })
    },
  })

  const handleImagesUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files) {
        for (const file of files) {
          uploadImageMutation(file)
        }
      }
    },
    [uploadImageMutation]
  )

  const handleCancelChat = useCallback(async () => {
    if (sessionId) {
      // 立即触发取消事件，让 ThinkingIndicator 消失
      eventBus.emit('generation:cancelled', null) // 🆕 Fix lint error: pass null
      // 同时取消普通聊天和魔法生成任务
      await Promise.all([cancelChat(sessionId), cancelMagicGenerate(sessionId)])
    }
    onCancelChat?.()
  }, [sessionId, onCancelChat])

  // Send Prompt
  const handleSendPrompt = useCallback(async () => {
    if (pending || isSubmitting) return

    // 立即设置本地提交状态，让按钮瞬间变成加载状态
    setIsSubmitting(true)

    // 首先检查登录状态 - 如果未登录，强制跳转到Google登录
    if (!authStatus.is_logged_in) {
      setShowLoginDialog(true)
      setIsSubmitting(false) // 重置状态
      return
    }

    // 检查是否使用 Jaaz 服务
    const isUsingJaaz =
      textModel?.provider === 'jaaz' || selectedTools?.some((tool) => tool.provider === 'jaaz')
    // console.log('👀isUsingJaaz', textModel, selectedTools, isUsingJaaz)

    // 只有当使用 Jaaz 服务且余额为 0 时才提醒充值
    if (authStatus.is_logged_in && isUsingJaaz && parseFloat(balance) <= 0) {
      toast.error(t('chat:insufficientBalance'), {
        description: <RechargeContent />,
        duration: 10000, // 10s，给用户更多时间操作
      })
      setIsSubmitting(false) // 重置状态
      return
    }

    // 检查是否至少选择了一个模型（文本或工具）
    const hasTextModel = !!textModel
    const hasToolModels = selectedTools && selectedTools.length > 0

    if (!hasTextModel && !hasToolModels) {
      toast.error(t('chat:textarea.selectModel'))
      if (!authStatus.is_logged_in) {
        setShowLoginDialog(true)
      }
      setIsSubmitting(false) // 重置状态
      return
    }

    let text_content: MessageContent[] | string = prompt
    if (prompt.length === 0 || prompt.trim() === '') {
      toast.error(t('chat:textarea.enterPrompt'))
      setIsSubmitting(false) // 重置状态
      return
    }

    // Add aspect ratio and quantity information if not default values
    // 注意：比例和数量参数通过metadata传递，不再添加到文本内容中

    // if (images.length > 0) {
    //   text_content += `\n\n<input_images count="${images.length}">`
    //   images.forEach((image, index) => {
    //     text_content += `\n<image index="${index + 1}" file_id="${image.file_id}" width="${image.width}" height="${image.height}" />`
    //   })
    //   text_content += `\n</input_images>`
    // }

    // Fetch images as base64 with error handling and retry
    const imagePromises = images.map(async (image) => {
      const maxRetries = 3
      let lastError: Error | null = null

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const response = await fetch(`/api/file/${image.file_id}`, {
            method: 'GET',
            headers: {
              Accept: 'image/*',
            },
          })

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }

          const blob = await response.blob()
          return new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result as string)
            reader.onerror = () => reject(new Error('Failed to read image as data URL'))
            reader.readAsDataURL(blob)
          })
        } catch (error) {
          lastError = error as Error
          console.warn(`⚠️ 图片获取失败 (尝试 ${attempt}/${maxRetries}): ${image.file_id}`, error)

          if (attempt < maxRetries) {
            // 指数退避重试
            await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000))
          }
        }
      }

      // 所有重试都失败，显示错误并移除该图片
      console.error(`❌ 图片获取最终失败: ${image.file_id}`, lastError)
      toast.error(`图片获取失败: ${image.file_id}`, {
        description: `请检查网络连接或稍后重试`,
      })

      // 从images列表中移除失败的图片
      setImages((prev) => prev.filter((img) => img.file_id !== image.file_id))

      // 返回空的base64，后续会被过滤掉
      return ''
    })

    const base64Images = await Promise.all(imagePromises)

    // 过滤掉失败的图片和对应的base64数据
    const validImages = images.filter((_, index) => base64Images[index] !== '')
    const validBase64Images = base64Images.filter((base64) => base64 !== '')

    const final_content = [
      {
        type: 'text',
        text: text_content as string,
      },
      ...validImages.map((image, index) => ({
        type: 'image_url',
        image_url: {
          url: validBase64Images[index],
        },
      })),
    ] as MessageContent[]

    const newMessage = messages.concat([
      {
        role: 'user',
        content: final_content,
      },
    ])

    // 立即清空输入状态，提供即时反馈
    setImages([])
    setPrompt('')

    // 直接读取用户在模型选择器中选择的模型
    const currentSelectedModel = localStorage.getItem('current_selected_model')

    let modelName = ''

    if (currentSelectedModel) {
      modelName = currentSelectedModel
    } else {
      if (textModel) {
        modelName = textModel.model
        localStorage.setItem('current_selected_model', modelName)
      } else {
        modelName = 'gpt-5.2' // 默认模型
        localStorage.setItem('current_selected_model', modelName)
      }
    }

    // 调用消息发送，触发pending状态，包含aspect_ratio和quantity参数
    onSend(newMessage, {
      textModel: textModel ? { ...textModel, type: 'text' as const } : null,
      toolList: selectedTools || [],
      modelName,
      aspectRatio: selectedAspectRatio,
      quantity: quantity,
      plugin: selectedPlugin // 🆕 Use prop
    })
  }, [
    pending,
    isSubmitting,
    textModel,
    selectedTools,
    prompt,
    onSend,
    images,
    messages,
    t,
    selectedAspectRatio,
    quantity,
    authStatus.is_logged_in,
    setShowLoginDialog,
    balance,
    RechargeContent,
    selectedPlugin // 🆕 Update dependency
  ])

  // Drop Area
  const dropAreaRef = useRef<HTMLDivElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const handleFilesDrop = useCallback(
    (files: File[]) => {
      for (const file of files) {
        uploadImageMutation(file)
      }
    },
    [uploadImageMutation]
  )

  useDrop(dropAreaRef, {
    onDragOver() {
      setIsDragOver(true)
    },
    onDragLeave() {
      setIsDragOver(false)
    },
    onDrop() {
      setIsDragOver(false)
    },
    onFiles: handleFilesDrop,
  })

  useEffect(() => {
    const handleAddImagesToChat = (data: TCanvasAddImagesToChatEvent) => {
      data.forEach(async (image) => {
        if (image.base64) {
          const file = dataURLToFile(image.base64, image.fileId)
          uploadImageMutation(file)
        } else {
          setImages(
            produce((prev) => {
              prev.push({
                file_id: image.fileId,
                width: image.width,
                height: image.height,
                serverUrl: `/api/file/${image.fileId}`,
                redirectUrl: `/api/file/${image.fileId}?redirect=true`,
                uploadStatus: 'cloud_synced',
              })
            })
          )
        }
      })

      textareaRef.current?.focus()
    }

    const handleMaterialAddImagesToChat = async (data: TMaterialAddImagesToChatEvent) => {
      data.forEach(async (image: TMaterialAddImagesToChatEvent[0]) => {
        // Convert file path to blob and upload
        try {
          const fileUrl = `/api/serve_file?file_path=${encodeURIComponent(image.filePath)}`
          const response = await fetch(fileUrl)
          const blob = await response.blob()
          const file = new File([blob], image.fileName, {
            type: `image/${image.fileType}`,
          })
          uploadImageMutation(file)
        } catch (error) {
          console.error('Failed to load image from material:', error)
          toast.error('Failed to load image from material', {
            description: `${error}`,
          })
        }
      })

      textareaRef.current?.focus()
    }

    eventBus.on('Canvas::AddImagesToChat', handleAddImagesToChat)
    eventBus.on('Material::AddImagesToChat', handleMaterialAddImagesToChat)
    return () => {
      eventBus.off('Canvas::AddImagesToChat', handleAddImagesToChat)
      eventBus.off('Material::AddImagesToChat', handleMaterialAddImagesToChat)
    }
  }, [uploadImageMutation])

  // 同步外部pending状态到本地isSubmitting状态
  useEffect(() => {
    if (!pending) {
      setIsSubmitting(false) // 当外部pending结束时，重置本地状态
    }
  }, [pending])

  // 清理本地预览URL
  useEffect(() => {
    return () => {
      // 组件卸载时清理所有本地预览URL
      images.forEach((image) => {
        if (image.localPreviewUrl) {
          URL.revokeObjectURL(image.localPreviewUrl)
        }
      })
    }
  }, [images])

  // 当initialValue变化时更新prompt
  useEffect(() => {
    if (initialValue) {
      setPrompt(initialValue)
      // 自动聚焦到输入框
      textareaRef.current?.focus()
    }
  }, [initialValue])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className={cn(
        'relative flex flex-col',
        variant === 'homepage' ? 'gap-3 p-4 sm:p-6' : 'gap-2 p-2 sm:p-3',
        className
      )}
    >
      <AnimatePresence>
        {isDragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className='absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4 border-2 border-dashed border-primary/50 rounded-lg m-2'
          >
            <div className='p-4 rounded-full bg-primary/10'>
              <ArrowUp className='size-8 text-primary animate-bounce' />
            </div>
            <p className='text-lg font-medium text-primary'>
              {t('chat:textarea.dropFiles')}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {images.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className='flex gap-2 overflow-x-auto py-2 px-1'
          >
            {images.map((image, index) => (
              <div
                key={image.file_id || index}
                className='relative group shrink-0 w-16 h-16 rounded-md overflow-hidden border bg-muted'
              >
                <img
                  src={image.localPreviewUrl || image.serverUrl}
                  alt='preview'
                  className='w-full h-full object-cover'
                />
                <button
                  onClick={() => {
                    setImages((prev) => prev.filter((_, i) => i !== index))
                  }}
                  className='absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity'
                >
                  <XIcon className='size-3' />
                </button>
                {image.uploadStatus === 'uploading' && (
                  <div className='absolute inset-0 flex items-center justify-center bg-black/30'>
                    <Loader2 className='size-4 text-white animate-spin' />
                  </div>
                )}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div
        ref={dropAreaRef}
        className={cn(
          'relative transition-all',
          variant === 'homepage'
            ? 'rounded-3xl bg-white border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.06)] focus-within:ring-2 focus-within:ring-blue-100/80'
            : 'rounded-2xl bg-neutral-100 border-0 shadow-[0_4px_8px_rgba(0,0,0,0.04)]',
          isDragOver && 'bg-primary/5',
        )}
      >
        <Textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSendPrompt()
            }
          }}
          placeholder={dynamicPlaceholder}
          autoSize={{ minRows: variant === 'homepage' ? 3 : 2, maxRows: 8 }}
          className={cn(
            'w-full max-h-[200px] bg-transparent border-none outline-none resize-none shadow-none focus:ring-0 focus:outline-none',
            variant === 'homepage'
              ? 'text-base sm:text-lg min-h-[96px] px-5 pt-4 pb-2 placeholder:text-gray-300'
              : 'text-sm min-h-[56px] px-4 pt-3 pb-1 placeholder:text-gray-400'
          )}
        />

        <div className={cn(
          'flex items-center justify-between gap-2',
          variant === 'homepage' ? 'px-4 pb-4' : 'px-3 pb-2.5'
        )}>
          <div className='flex items-center gap-1.5 flex-nowrap overflow-x-auto scrollbar-hide'>
            <div className='relative shrink-0'>
              <input
                ref={imageInputRef}
                type='file'
                accept='image/*'
                multiple
                className='hidden'
                onChange={handleImagesUpload}
              />
              <Button
                variant='ghost'
                size='icon'
                className={cn(
                  'rounded-full text-muted-foreground/60 hover:text-foreground',
                  variant === 'homepage'
                    ? 'h-9 w-9 border border-gray-100 hover:bg-gray-50'
                    : 'h-8 w-8 hover:bg-muted/80'
                )}
                onClick={() => imageInputRef.current?.click()}
                title={t('chat:textarea.uploadImage')}
              >
                <PlusIcon className='size-4' />
              </Button>
            </div>
          </div>

          <div className={cn(
            'flex items-center gap-1.5',
            variant === 'homepage' && 'bg-gray-50/50 rounded-full px-1 py-1 border border-gray-100'
          )}>
            <div className='shrink-0'>
              <ModelSelectorV3 />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant='ghost'
                  className='shrink-0 h-8 w-8 p-0 rounded-full flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-muted/80'
                >
                  <RectangleVertical className='size-4' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='w-36'>
                {['auto', '1:1', '4:3', '3:4', '16:9', '9:16'].map((ratio) => (
                  <DropdownMenuItem
                    key={ratio}
                    onClick={() => setSelectedAspectRatio(ratio)}
                    className='flex items-center justify-between'
                  >
                    <span>{ratio}</span>
                    {selectedAspectRatio === ratio && (
                      <div className='size-2 rounded-full bg-primary' />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {pending || isSubmitting ? (
              <Button
                className={cn(
                  'shrink-0 relative p-0 rounded-full flex items-center justify-center',
                  variant === 'homepage' ? 'h-9 w-9' : 'h-8 w-8',
                  'bg-zinc-800 text-white hover:bg-zinc-700'
                )}
                variant='ghost'
                onClick={handleCancelChat}
              >
                <Loader2 className='size-4 animate-spin absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' />
                <Square className='size-1.5 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' />
              </Button>
            ) : (
              <Button
                className={cn(
                  'shrink-0 p-0 rounded-full disabled:opacity-30 flex items-center justify-center',
                  variant === 'homepage' ? 'h-9 w-9' : 'h-8 w-8',
                  variant === 'homepage' && prompt.trim().length === 0
                    ? 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                    : 'bg-zinc-800 text-white hover:bg-zinc-700'
                )}
                variant='ghost'
                onClick={handleSendPrompt}
                disabled={
                  (!textModel && (!selectedTools || selectedTools.length === 0)) ||
                  prompt.length === 0 ||
                  !!pending ||
                  isSubmitting
                }
              >
                <ArrowUp className='size-4' />
              </Button>
            )}
          </div>
        </div>
      </div>

      <PosterGeneratorDialog 
        open={posterDialogOpen} 
        onOpenChange={setPosterDialogOpen}
        initialTopic={prompt}
      />
    </motion.div>
  )
}

export default ChatTextarea

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Hotkey } from '@/components/ui/hotkey'
import { useCanvas } from '@/contexts/canvas'
import { eventBus, TCanvasAddImagesToChatEvent } from '@/lib/event'
import { useKeyPress } from 'ahooks'
import { motion, AnimatePresence } from 'motion/react'
import { memo, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { exportToCanvas, exportToBlob, exportToSvg } from '@excalidraw/excalidraw'
import { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { toast } from 'sonner'
import { useUserInfo } from '@/hooks/use-user-info'
import { processRemoteImage } from '@/utils/remoteImageProcessor'
import { Send, MessageCircle, X } from 'lucide-react'

type CanvasInlineChatProps = {
  selectedImages: TCanvasAddImagesToChatEvent
  selectedElements: OrderedExcalidrawElement[]
  onExpandedChange?: (expanded: boolean) => void
}

const CanvasInlineChat = ({ selectedImages, selectedElements, onExpandedChange }: CanvasInlineChatProps) => {
  const { t } = useTranslation()
  const { excalidrawAPI } = useCanvas()
  const { userInfo } = useUserInfo()

  const [isExpanded, setIsExpanded] = useState(false)
  const [inputText, setInputText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [instantClose, setInstantClose] = useState(false)
  const lastSubmitTimeRef = useRef<number>(0)

  const handleToggle = () => {
    const newExpanded = !isExpanded
    setInstantClose(false) // 确保正常toggle时使用动画
    setIsExpanded(newExpanded)
    onExpandedChange?.(newExpanded)

    if (newExpanded) {
      // 展开时聚焦输入框
      setTimeout(() => {
        const textarea = document.querySelector('[data-canvas-chat-textarea]') as HTMLTextAreaElement
        textarea?.focus()
      }, 200)
    } else {
      setInputText('')
    }
  }

  const handleSubmit = async () => {
    const trimmedText = inputText.trim()
    if (!trimmedText) {
      toast.warning(t('canvas:popbar.chatEmptyWarning'))
      return
    }



    // 防重复检查
    const currentTime = Date.now()
    const timeDiff = currentTime - lastSubmitTimeRef.current

    if (isSubmitting) {
      console.warn('[CanvasInlineChat] 正在提交中，忽略重复请求')
      toast.warning(t('canvas:popbar.chatProcessingWarning'))
      return
    }

    if (timeDiff < 2000) {
      console.warn('[CanvasInlineChat] 提交过于频繁，忽略请求')
      toast.warning(t('canvas:popbar.chatFrequentWarning'))
      return
    }

    setIsSubmitting(true)
    lastSubmitTimeRef.current = currentTime

    if (!excalidrawAPI) {
      console.error('[CanvasInlineChat] excalidrawAPI不可用')
      toast.error(t('canvas:popbar.canvasApiError'))
      setIsSubmitting(false)
      return
    }

    try {
      // 获取选中的元素
      const appState = excalidrawAPI.getAppState()
      const selectedIds = appState.selectedElementIds
      const allElements = excalidrawAPI.getSceneElements()

      if (Object.keys(selectedIds).length === 0) {
        console.warn('[CanvasInlineChat] 没有选中任何元素')
        toast.error(t('canvas:popbar.selectElementsError'))
        setIsSubmitting(false)
        return
      }

      // 重新计算选中的元素，不依赖props，确保数据最新
      const currentSelectedElements = allElements.filter(el => selectedIds[el.id])

      // 检查是否有图片元素
      const imageElements = currentSelectedElements.filter((element) => element.type === 'image')
      if (imageElements.length === 0) {
        console.warn('[CanvasInlineChat] 没有选中图片元素')
        toast.error(t('canvas:popbar.selectImagesError'))
        setIsSubmitting(false)
        return
      }

      // 只获取选中的图片元素的文件
      const allFiles = excalidrawAPI.getFiles()
      const selectedFileIds = imageElements
        .map((element: any) => element.fileId)
        .filter((fileId): fileId is string => !!fileId)





      // 只处理选中元素的文件
      const selectedFiles: Record<string, any> = {}
      selectedFileIds.forEach(fileId => {
        if (allFiles[fileId]) {
          selectedFiles[fileId] = allFiles[fileId]
        }
      })

      // 复用Magic Generate的图片处理逻辑，但只处理选中的文件
      const processedFiles = { ...selectedFiles }
      const fileIds = selectedFileIds
      const remoteFileIds = fileIds.filter((fileId) => {
        const file = selectedFiles[fileId]
        return file && file.dataURL && file.dataURL.startsWith('http')
      })

      if (remoteFileIds.length > 0) {


        const filesToDownload: string[] = []
        for (const fileId of remoteFileIds) {
          const file = selectedFiles[fileId]
          const { extractFileIdentifier, checkLocalFile } = await import('@/utils/remoteImageProcessor')
          const filename = extractFileIdentifier(file.dataURL)
          const localUrl = await checkLocalFile(filename, userInfo)

          if (!localUrl) {
            filesToDownload.push(fileId)
          } else {
            try {
              const response = await fetch(localUrl, { credentials: 'include' })
              const blob = await response.blob()
              const reader = new FileReader()
              const dataURL = await new Promise<string>((resolve, reject) => {
                reader.onload = () => resolve(reader.result as string)
                reader.onerror = reject
                reader.readAsDataURL(blob)
              })

              processedFiles[fileId] = {
                ...file,
                dataURL: dataURL as typeof file.dataURL,
              }
            } catch (error) {
              console.warn(`[CanvasInlineChat] 读取本地文件失败，将重新下载: ${filename}`, error)
              filesToDownload.push(fileId)
            }
          }
        }

        if (filesToDownload.length > 0) {
          toast.loading(`正在下载 ${filesToDownload.length} 个远程图片...`, {
            id: 'download-images',
          })

          try {
            for (const fileId of filesToDownload) {
              const file = selectedFiles[fileId]
              const localDataURL = await processRemoteImage(file.dataURL, userInfo)
              processedFiles[fileId] = {
                ...file,
                dataURL: localDataURL as typeof file.dataURL,
              }
            }
            toast.dismiss('download-images')
          } catch (error) {
            console.error(`[CanvasInlineChat] 批量下载远程图片失败:`, error)
            toast.error(`图片下载失败: ${error instanceof Error ? error.message : '未知错误'}`, {
              id: 'download-images',
            })
            toast.dismiss('download-images')
            setIsSubmitting(false)
            return
          }
        }
      }

      // 导出图片逻辑（复用Magic Generate）
      let base64: string
      let width: number
      let height: number

      const hasImages = currentSelectedElements.some((element) => element.type === 'image')

      if (hasImages && fileIds.length > 0) {


        try {
          const blob = await exportToBlob({
            elements: currentSelectedElements,
            appState: {
              ...appState,
              selectedElementIds: selectedIds,
            },
            files: processedFiles,
            mimeType: 'image/png',
            quality: 0.8,
            exportPadding: 10,
          })

          base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(blob)
          })

          const tempImg = new Image()
          const imgLoad = new Promise<void>((resolve, reject) => {
            tempImg.onload = () => resolve()
            tempImg.onerror = reject
            tempImg.src = base64
          })

          await imgLoad
          width = tempImg.width
          height = tempImg.height
        } catch (blobError) {
          console.warn('[CanvasInlineChat] Blob导出失败，尝试SVG转PNG方案:', blobError)

          const svgString = await exportToSvg({
            elements: currentSelectedElements,
            appState: {
              ...appState,
              selectedElementIds: selectedIds,
            },
            files: processedFiles,
            exportPadding: 10,
          })

          const svgWidth = parseInt(svgString.getAttribute('width') || '800')
          const svgHeight = parseInt(svgString.getAttribute('height') || '600')

          const tempCanvas = document.createElement('canvas')
          const ctx = tempCanvas.getContext('2d')
          tempCanvas.width = svgWidth
          tempCanvas.height = svgHeight

          const img = new Image()
          const svgBlob = new Blob([svgString.outerHTML], { type: 'image/svg+xml' })
          const svgUrl = URL.createObjectURL(svgBlob)

          await new Promise<void>((resolve, reject) => {
            img.onload = () => {
              if (ctx) {
                ctx.drawImage(img, 0, 0)
              }
              URL.revokeObjectURL(svgUrl)
              resolve()
            }
            img.onerror = () => {
              URL.revokeObjectURL(svgUrl)
              reject(new Error('SVG to PNG conversion failed'))
            }
            img.src = svgUrl
          })

          base64 = tempCanvas.toDataURL('image/png', 0.8)
          width = svgWidth
          height = svgHeight
        }
      } else {


        const canvas = await exportToCanvas({
          elements: currentSelectedElements,
          appState: {
            ...appState,
            selectedElementIds: selectedIds,
          },
          files: processedFiles,
          mimeType: 'image/png',
          maxWidthOrHeight: 2048,
          quality: 1,
        })

        try {
          base64 = canvas.toDataURL('image/png', 0.8)
          width = canvas.width
          height = canvas.height
        } catch (canvasError) {
          console.error('[CanvasInlineChat] Canvas被污染，fallback到Blob方案:', canvasError)

          const blob = await exportToBlob({
            elements: currentSelectedElements,
            appState: {
              ...appState,
              selectedElementIds: selectedIds,
            },
            files: processedFiles,
            mimeType: 'image/png',
            quality: 0.8,
            exportPadding: 10,
          })

          base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(blob)
          })
          width = canvas.width
          height = canvas.height
        }
      }

      // 发送聊天事件
      const eventData = {
        fileId: `chat-${Date.now()}`,
        base64: base64,
        width: width,
        height: height,
        timestamp: new Date().toISOString(),
        userText: trimmedText,
      }

      eventBus.emit('Canvas::Chat', eventData)


      // 清除选中状态和输入
      excalidrawAPI?.updateScene({
        appState: { selectedElementIds: {} },
      })

      setInputText('')
      // 提交成功后快速关闭，不需要动画
      setInstantClose(true)
      setIsExpanded(false)
      onExpandedChange?.(false)
      setTimeout(() => setInstantClose(false), 50)
      toast.success(t('canvas:popbar.chatSubmitted'))

    } catch (error) {
      console.error('[CanvasInlineChat] 聊天提交过程中发生错误:', error)
      toast.error('聊天提交失败: ' + (error instanceof Error ? error.message : '未知错误'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      // 设置instant close标记，跳过动画
      setInstantClose(true)
      setIsExpanded(false)
      onExpandedChange?.(false)
      setInputText('')
      // 短暂延迟后重置标记
      setTimeout(() => setInstantClose(false), 50)
    }
  }

  useKeyPress(['meta.t', 'ctrl.t'], () => {
    if (!isExpanded) {
      handleToggle()
    }
  })

  return (
    <AnimatePresence mode="wait">
      {!isExpanded ? (
        <motion.div
          key="button"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: instantClose ? 0 : 0.15 }}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggle}
            className="flex items-center gap-1.5"
          >
            <MessageCircle size={14} />
            {t('canvas:popbar.chat')} <Hotkey keys={['⌘', 'T']} />
          </Button>
        </motion.div>
      ) : (
        <motion.div
          key="input-panel"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{
            duration: instantClose ? 0 : 0.2,
            ease: "easeOut"
          }}
          className="w-80 bg-white rounded-lg shadow-lg border border-gray-200 p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-900">Chat</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggle}
              className="p-1 h-6 w-6 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </Button>
          </div>

          <div className="space-y-3">
            <Textarea
              data-canvas-chat-textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('canvas:popbar.chatPlaceholder')}
              className="min-h-[100px] resize-none border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm bg-white"
              style={{ boxShadow: 'none' }}
              disabled={isSubmitting}
            />

            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-500">
                {t('canvas:popbar.chatShortcuts')}
              </div>
              <Button
                onClick={handleSubmit}
                disabled={!inputText.trim() || isSubmitting}
                size="sm"
                className="flex items-center gap-1"
              >
                <Send size={12} />
                {isSubmitting ? t('canvas:popbar.chatSubmitting') : t('canvas:popbar.chatSubmit')}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default memo(CanvasInlineChat)
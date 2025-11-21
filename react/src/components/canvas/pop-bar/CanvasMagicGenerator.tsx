import { Button } from '@/components/ui/button'
import { Hotkey } from '@/components/ui/hotkey'
import { useCanvas } from '@/contexts/canvas'
import { eventBus, TCanvasAddImagesToChatEvent } from '@/lib/event'
import { useKeyPress } from 'ahooks'
import { motion } from 'motion/react'
import { memo, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { exportToCanvas, exportToBlob, exportToSvg } from '@excalidraw/excalidraw'
import { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { toast } from 'sonner'
import { useUserInfo } from '@/hooks/use-user-info'

type CanvasMagicGeneratorProps = {
  selectedImages: TCanvasAddImagesToChatEvent
  selectedElements: OrderedExcalidrawElement[]
}

const CanvasMagicGenerator = ({ selectedImages, selectedElements }: CanvasMagicGeneratorProps) => {
  const { t } = useTranslation()
  const { excalidrawAPI } = useCanvas()
  const { userInfo } = useUserInfo()

  // 防重复机制
  const [isGenerating, setIsGenerating] = useState(false)
  const lastGenerateTimeRef = useRef<number>(0)

  const handleMagicGenerate = async () => {


    // 防重复检查 - 防止短时间内重复点击
    const currentTime = Date.now()
    const timeDiff = currentTime - lastGenerateTimeRef.current

    if (isGenerating) {
      console.warn('[CanvasMagicGenerator] 正在生成中，忽略重复请求')
      toast.warning('正在生成中，请稍候...')
      return
    }

    if (timeDiff < 2000) { // 2秒内不允许重复点击
      console.warn('[CanvasMagicGenerator] 点击过于频繁，忽略请求')
      toast.warning('请不要频繁点击')
      return
    }

    // 更新状态和时间戳
    setIsGenerating(true)
    lastGenerateTimeRef.current = currentTime

    if (!excalidrawAPI) {
      console.error('[CanvasMagicGenerator] excalidrawAPI不可用')
      toast.error('Canvas API不可用，请刷新页面重试')
      setIsGenerating(false)
      return
    }

    try {
      // 获取选中的元素

      const appState = excalidrawAPI.getAppState()
      const selectedIds = appState.selectedElementIds


      if (Object.keys(selectedIds).length === 0) {
        console.warn('[CanvasMagicGenerator] 没有选中任何元素')
        toast.error('请先选中要生成的元素')
        setIsGenerating(false)
        return
      }

      const allFiles = excalidrawAPI.getFiles()




      // 分析选中的图片元素，获取它们的文件ID
      const imageElements = selectedElements.filter((element) => element.type === 'image')
      const selectedFileIds = new Set<string>()

      imageElements.forEach((element, index) => {
        if (element.fileId) {
          selectedFileIds.add(element.fileId)
        }
      })

      // 只处理选中元素相关的文件
      const files: typeof allFiles = {}
      selectedFileIds.forEach(fileId => {
        if (allFiles[fileId]) {
          files[fileId] = allFiles[fileId]
        }
      })




      // 详细分析选中的files对象结构
      const fileIds = Object.keys(files)
      fileIds.forEach((fileId, index) => {
        const file = files[fileId]
        const urlType = file && file.dataURL ?
          file.dataURL.startsWith('data:') ? 'base64' :
          file.dataURL.startsWith('http') ? 'remote' :
          file.dataURL.startsWith('/api/file/') ? 'api' :
          'other' : 'none'


      })

      // 检查是否包含图片元素（可能导致Canvas污染）
      const hasImages = selectedElements.some((element) => element.type === 'image')


      // 预处理选中的图片（只有存在图片元素时才处理）
      const processedFiles = { ...files }

      // 如果没有图片元素，跳过文件处理
      if (!hasImages) {

      } else {
        // 识别需要处理的图片（非base64格式的）
        const needProcessFileIds = fileIds.filter((fileId) => {
          const file = files[fileId]
          if (!file || !file.dataURL) return false

          // 如果是base64格式（data:开头），不需要处理
          if (file.dataURL.startsWith('data:')) {

            return false
          }

          // 其他格式（http/https或/api/file/）都需要处理

          return true
        })

        if (needProcessFileIds.length > 0) {


          // 处理所有需要获取数据的图片
          for (const fileId of needProcessFileIds) {
            const file = files[fileId]
            const url = file.dataURL

            try {
              let processedDataURL: string

              if (url.startsWith('http')) {
                // 处理远程URL


                // 检查是否已缓存
                const { extractFileIdentifier, checkLocalFile } = await import('@/utils/remoteImageProcessor')
                const filename = extractFileIdentifier(url)
                const localUrl = await checkLocalFile(filename, userInfo)

                if (localUrl) {

                  const response = await fetch(localUrl, { credentials: 'include' })
                  const blob = await response.blob()
                  const reader = new FileReader()
                  processedDataURL = await new Promise<string>((resolve, reject) => {
                    reader.onload = () => resolve(reader.result as string)
                    reader.onerror = reject
                    reader.readAsDataURL(blob)
                  })
                } else {

                  const { processRemoteImage: processImg } = await import('@/utils/remoteImageProcessor')
                  processedDataURL = await processImg(url, userInfo)
                }
              } else if (url.startsWith('/api/file/')) {
                // 处理本地API路径


                // 构建完整的URL
                const fullUrl = `${window.location.origin}${url}`


                // 获取图片数据
                const response = await fetch(fullUrl, { credentials: 'include' })
                if (!response.ok) {
                  throw new Error(`Failed to fetch image: ${response.status}`)
                }

                const blob = await response.blob()
                const reader = new FileReader()
                processedDataURL = await new Promise<string>((resolve, reject) => {
                  reader.onload = () => resolve(reader.result as string)
                  reader.onerror = reject
                  reader.readAsDataURL(blob)
                })


              } else {
                // 其他路径（可能是相对路径）


                // 尝试作为相对路径获取
                const response = await fetch(url, { credentials: 'include' })
                if (!response.ok) {
                  throw new Error(`Failed to fetch image: ${response.status}`)
                }

                const blob = await response.blob()
                const reader = new FileReader()
                processedDataURL = await new Promise<string>((resolve, reject) => {
                  reader.onload = () => resolve(reader.result as string)
                  reader.onerror = reject
                  reader.readAsDataURL(blob)
                })
              }

              // 更新处理后的文件
              processedFiles[fileId] = {
                ...file,
                dataURL: processedDataURL as typeof file.dataURL,
              }


            } catch (error) {
              console.error(`[CanvasMagicGenerator] ❌ 处理图片失败 ${fileId}:`, error)
              toast.error(`图片处理失败: ${error instanceof Error ? error.message : '未知错误'}`)
              setIsGenerating(false)
              return
            }
          }


        }
      }

      // 对于非图片元素（如形状、文字等），我们也需要导出，所以不需要额外的files
      // 但对于图片元素，只导出选中的files
      const exportFiles = hasImages ? processedFiles : {}

      let base64: string
      let width: number
      let height: number

      if (hasImages && fileIds.length > 0) {
        // 有图片时使用更安全的Blob导出方案


        try {
          const blob = await exportToBlob({
            elements: selectedElements,
            appState: {
              ...appState,
              selectedElementIds: selectedIds,
            },
            files: exportFiles, // 只使用选中元素的files
            mimeType: 'image/png',
            quality: 0.8,
            exportPadding: 10,
          })


          // 将Blob转换为base64
          base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(blob)
          })


          // 通过创建临时image获取尺寸
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
          console.warn('[CanvasMagicGenerator] Blob导出失败，尝试SVG转PNG方案:', blobError)

          // Blob失败时尝试SVG导出并转换为PNG
          const svgString = await exportToSvg({
            elements: selectedElements,
            appState: {
              ...appState,
              selectedElementIds: selectedIds,
            },
            files: exportFiles, // 只使用选中元素的files
            exportPadding: 10,
          })


          // SVG转PNG（通过Canvas）
          const svgWidth = parseInt(svgString.getAttribute('width') || '800')
          const svgHeight = parseInt(svgString.getAttribute('height') || '600')

          // 创建临时Canvas将SVG转换为PNG
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

          // 转换为PNG base64
          base64 = tempCanvas.toDataURL('image/png', 0.8)
          width = svgWidth
          height = svgHeight

        }
      } else {
        // 没有图片时使用原来的Canvas导出方案


        const canvas = await exportToCanvas({
          elements: selectedElements,
          appState: {
            ...appState,
            selectedElementIds: selectedIds,
          },
          files: processedFiles, // 使用处理后的files对象
          mimeType: 'image/png',
          maxWidthOrHeight: 2048,
          quality: 1,
        })

        try {
          base64 = canvas.toDataURL('image/png', 0.8)
          width = canvas.width
          height = canvas.height

        } catch (canvasError) {
          console.error('[CanvasMagicGenerator] Canvas被污染，fallback到Blob方案:', canvasError)

          // Canvas被污染时fallback到Blob
          const blob = await exportToBlob({
            elements: selectedElements,
            appState: {
              ...appState,
              selectedElementIds: selectedIds,
            },
            files: exportFiles, // 只使用选中元素的files
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

      // 发送魔法生成事件
      const eventData = {
        fileId: `magic-${Date.now()}`,
        base64: base64,
        width: width,
        height: height,
        timestamp: new Date().toISOString(),
      }


      eventBus.emit('Canvas::MagicGenerate', eventData)

      // 清除选中状态
      excalidrawAPI?.updateScene({
        appState: { selectedElementIds: {} },
      })
    } catch (error) {
      console.error('[CanvasMagicGenerator] Magic Generation过程中发生错误:', error)
      toast.error('Magic Generation失败: ' + (error instanceof Error ? error.message : '未知错误'))
    } finally {
      // 无论成功还是失败，都要重置生成状态
      setIsGenerating(false)
    }
  }

  useKeyPress(['meta.b', 'ctrl.b'], handleMagicGenerate)

  return (
    <Button variant='ghost' size='sm' onClick={handleMagicGenerate} disabled={isGenerating}>
      {isGenerating ? '生成中...' : t('canvas:popbar.magicGenerate')} <Hotkey keys={['⌘', 'B']} />
    </Button>
  )
}

export default memo(CanvasMagicGenerator)

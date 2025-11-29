import { useCanvas } from '@/contexts/canvas'
import { eventBus, TCanvasAddImagesToChatEvent } from '@/lib/event'
import {
  ExcalidrawImageElement,
  OrderedExcalidrawElement,
} from '@excalidraw/excalidraw/element/types'
import { AnimatePresence } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import CanvasPopbarContainer from './CanvasPopbarContainer'

const CanvasPopbarWrapper = () => {
  const { excalidrawAPI } = useCanvas()

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [showAddToChat, setShowAddToChat] = useState(false)
  const [showMagicGenerate, setShowMagicGenerate] = useState(false)
  const [showChat, setShowChat] = useState(false)

  const selectedImagesRef = useRef<TCanvasAddImagesToChatEvent>([])
  const selectedElementsRef = useRef<OrderedExcalidrawElement[]>([])
  const doubleClickTriggeredRef = useRef(false)

  // Listen for double-click event to show chat popup
  useEffect(() => {
    const handleImageDoubleClick = (data: { images: TCanvasAddImagesToChatEvent; position: { x: number; y: number } }) => {
      selectedImagesRef.current = data.images
      setPos(data.position)
      setShowChat(true)
      doubleClickTriggeredRef.current = true
    }

    eventBus.on('Canvas::ImageDoubleClick', handleImageDoubleClick)

    return () => {
      eventBus.off('Canvas::ImageDoubleClick', handleImageDoubleClick)
    }
  }, [])

  // Hide chat when right-click (mousedown with button 2)
  // Using mousedown instead of contextmenu because it fires earlier
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      // Right click is button 2
      if (e.button === 2 && doubleClickTriggeredRef.current) {
        setShowChat(false)
        setPos(null)
        doubleClickTriggeredRef.current = false
      }
    }

    // Use capture phase to ensure we get the event first
    document.addEventListener('mousedown', handleMouseDown, true)

    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true)
    }
  }, [])

  excalidrawAPI?.onChange((elements, appState, files) => {
    const selectedIds = appState.selectedElementIds
    if (Object.keys(selectedIds).length === 0) {
      setPos(null)
      setShowAddToChat(false)
      setShowMagicGenerate(false)
      setShowChat(false)
      doubleClickTriggeredRef.current = false
      return
    }

    // If chat was triggered by double-click, keep it showing
    if (doubleClickTriggeredRef.current) {
      return
    }

    const selectedImages = elements.filter(
      (element) => element.type === 'image' && selectedIds[element.id]
    ) as ExcalidrawImageElement[]

    // 判断是否显示添加到对话按钮：选中图片元素
    const hasSelectedImages = selectedImages.length > 0
    setShowAddToChat(false) // 禁用添加到聊天按钮

    // 判断是否显示魔法生成按钮：选中2个以上元素（包含所有类型）
    const selectedCount = Object.keys(selectedIds).length
    setShowMagicGenerate(selectedCount >= 2)

    // 禁用聊天按钮 - 用户要求选中图片时不显示聊天弹窗
    setShowChat(false)

    // 如果没有满足魔法生成条件，隐藏弹窗
    if (selectedCount < 2) {
      setPos(null)
      return
    }

    // 处理选中的图片数据
    selectedImagesRef.current = selectedImages
      .filter((image) => image.fileId)
      .map((image) => {
        const file = files[image.fileId!]
        const isBase64 = file.dataURL.startsWith('data:')
        let id: string
        if (isBase64) {
          id = file.id
        } else {
          // 从URL中提取文件名，去掉查询参数
          const urlPath = file.dataURL.split('?')[0] // 去掉查询参数
          id = urlPath.split('/').at(-1)! // 提取文件名
        }
        return {
          fileId: id,
          base64: isBase64 ? file.dataURL : undefined,
          width: image.width,
          height: image.height,
        }
      })

    // 处理选中的元素数据
    selectedElementsRef.current = elements.filter(
      (element) => selectedIds[element.id] && element.index !== null
    ) as OrderedExcalidrawElement[]

    // 计算位置：如果有图片，基于图片；否则基于所有选中的元素
    let centerX: number
    let bottomY: number

    if (hasSelectedImages) {
      // 基于选中的图片计算位置
      centerX =
        selectedImages.reduce((acc, image) => acc + image.x + image.width / 2, 0) /
        selectedImages.length

      bottomY = selectedImages.reduce(
        (acc, image) => Math.max(acc, image.y + image.height),
        Number.NEGATIVE_INFINITY
      )
    } else {
      // 基于所有选中的元素计算位置
      const selectedElements = elements.filter((element) => selectedIds[element.id])

      centerX =
        selectedElements.reduce(
          (acc, element) => acc + element.x + (element.width || 0) / 2,
          0
        ) / selectedElements.length

      bottomY = selectedElements.reduce(
        (acc, element) => Math.max(acc, element.y + (element.height || 0)),
        Number.NEGATIVE_INFINITY
      )
    }

    const scrollX = appState.scrollX
    const scrollY = appState.scrollY
    const zoom = appState.zoom.value
    const offsetX = (scrollX + centerX) * zoom
    const offsetY = (scrollY + bottomY) * zoom
    setPos({ x: offsetX, y: offsetY })
    // console.log(offsetX, offsetY)
  })

  return (
    <div className='absolute left-0 bottom-0 w-full h-full z-20 pointer-events-none'>
      <AnimatePresence>
        {pos && (showAddToChat || showMagicGenerate || showChat) && (
          <CanvasPopbarContainer
            pos={pos}
            selectedImages={selectedImagesRef.current}
            selectedElements={selectedElementsRef.current}
            showAddToChat={showAddToChat}
            showMagicGenerate={showMagicGenerate}
            showChat={showChat}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

export default CanvasPopbarWrapper

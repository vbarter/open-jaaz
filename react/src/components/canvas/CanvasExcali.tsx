import { saveCanvas } from '@/api/canvas'
import { useCanvas } from '@/contexts/canvas'
import useDebounce from '@/hooks/use-debounce'
import { useTheme } from '@/hooks/use-theme'
import { eventBus } from '@/lib/event'
import { ImageLayoutManager } from '@/lib/image-layout-manager'
import * as ISocket from '@/types/socket'
import { CanvasData } from '@/types/types'
import { Excalidraw, convertToExcalidrawElements } from '@excalidraw/excalidraw'
import {
  ExcalidrawImageElement,
  ExcalidrawEmbeddableElement,
  OrderedExcalidrawElement,
  Theme,
  NonDeleted,
} from '@excalidraw/excalidraw/element/types'
import '@excalidraw/excalidraw/index.css'
import {
  AppState,
  BinaryFileData,
  BinaryFiles,
  ExcalidrawInitialDataState,
} from '@excalidraw/excalidraw/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { nanoid } from 'nanoid'
import { VideoElement } from './VideoElement'
import ImageSlicerDialog from './ImageSlicerDialog'
import { ImageInfo, GridSettings, SliceResult } from '@/utils/image-slicer'

import '@/assets/style/canvas.css'

type CanvasExcaliProps = {
  canvasId: string
  initialData?: ExcalidrawInitialDataState
}

const CanvasExcali: React.FC<CanvasExcaliProps> = ({ canvasId, initialData }) => {
  const { excalidrawAPI, setExcalidrawAPI } = useCanvas()

  // 创建图片布局管理器实例
  const imageLayoutManagerRef = useRef(new ImageLayoutManager())

  const { t, i18n } = useTranslation('canvas')

  // Image slicer state
  const [slicerDialogOpen, setSlicerDialogOpen] = useState(false)
  const [selectedImageInfo, setSelectedImageInfo] = useState<ImageInfo | null>(null)
  const [selectedImageElement, setSelectedImageElement] = useState<ExcalidrawImageElement | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Immediate handler for UI updates (no debounce)
  const handleSelectionChange = (
    elements: Readonly<OrderedExcalidrawElement[]>,
    appState: AppState
  ) => {
    if (!appState) return

    // Check if any selected element is embeddable type
    const selectedElements = elements.filter((element) => appState.selectedElementIds[element.id])
    const hasEmbeddableSelected = selectedElements.some((element) => element.type === 'embeddable')

    // Toggle CSS class to hide/show left panel immediately
    const excalidrawContainer = document.querySelector('.excalidraw')
    if (excalidrawContainer) {
      if (hasEmbeddableSelected) {
        excalidrawContainer.classList.add('hide-left-panel')
      } else {
        excalidrawContainer.classList.remove('hide-left-panel')
      }
    }
  }

  // Debounced handler for saving (performance optimization)
  const handleSave = useDebounce(
    (elements: Readonly<OrderedExcalidrawElement[]>, appState: AppState, files: BinaryFiles) => {
      if (elements.length === 0 || !appState) {
        return
      }

      const data: CanvasData = {
        elements,
        appState: {
          ...appState,
          collaborators: undefined!,
        },
        files,
      }

      let thumbnail = ''
      const latestImage = elements
        .filter((element) => element.type === 'image')
        .sort((a, b) => b.updated - a.updated)[0]
      if (latestImage) {
        const file = files[latestImage.fileId!]
        if (file) {
          thumbnail = file.dataURL
        }
      }

      saveCanvas(canvasId, { data, thumbnail })
    },
    1000
  )

  // Combined handler that calls both immediate and debounced functions
  const handleChange = (
    elements: Readonly<OrderedExcalidrawElement[]>,
    appState: AppState,
    files: BinaryFiles
  ) => {
    // Immediate UI updates
    handleSelectionChange(elements, appState)
    // Debounced save operation
    handleSave(elements, appState, files)
  }

  const { theme } = useTheme()

  // 添加自定义类名以便应用我们的CSS修复
  const excalidrawClassName = `excalidraw-custom ${theme === 'dark' ? 'excalidraw-dark-fix' : ''}`

  // 在深色模式下使用自定义主题设置，避免使用默认的滤镜
  // 这样可以确保颜色在深色模式下正确显示
  const customTheme = theme === 'dark' ? 'light' : theme

  // 在组件挂载和主题变化时设置深色模式下的背景色
  useEffect(() => {
    if (excalidrawAPI && theme === 'dark') {
      // 设置深色背景，但保持light主题以避免颜色反转
      excalidrawAPI.updateScene({
        appState: {
          viewBackgroundColor: '#121212',
        },
      })
    } else if (excalidrawAPI && theme === 'light') {
      // 恢复浅色背景
      excalidrawAPI.updateScene({
        appState: {
          viewBackgroundColor: '#ffffff',
        },
      })
    }
  }, [excalidrawAPI, theme])

  const addImageToExcalidraw = useCallback(
    async (imageElement: ExcalidrawImageElement, file: BinaryFileData) => {
      if (!excalidrawAPI) return
      // 获取当前画布元素
      const currentElements = excalidrawAPI.getSceneElements()

      // 筛选出所有图片元素
      const imageElements = currentElements.filter((el) => el.type === 'image' && !el.isDeleted)

      // 同步现有图片到布局管理器（只同步，不重置）

      // 如果布局管理器是空的，先初始化
      if (imageLayoutManagerRef.current.getAllImages().length === 0 && imageElements.length > 0) {
        imageLayoutManagerRef.current.initializeFromElements(currentElements)
      } else {
        imageLayoutManagerRef.current.syncWithElements(currentElements)
      }

      // 打印当前布局管理器状态
      const existingImages = imageLayoutManagerRef.current.getAllImages()

      existingImages.forEach((img, index) => {

      })

      // 检查新图片是否已存在
      if (imageLayoutManagerRef.current.hasImage(imageElement.id)) {
        return
      }

      // 添加文件
      excalidrawAPI.addFiles([file])

      // 计算新图片的位置
      const position = imageLayoutManagerRef.current.calculateNextPosition(
        imageElement.width,
        imageElement.height
      )

      // 创建新的图片元素
      const unlockedImageElement = {
        ...imageElement,
        x: position.x,
        y: position.y,
        locked: false,
        groupIds: [],
        isDeleted: false,
      }

      // 更新画布
      excalidrawAPI.updateScene({
        elements: [...(currentElements || []), unlockedImageElement],
      })

      // 将新图片添加到布局管理器
      imageLayoutManagerRef.current.addImage({
        id: imageElement.id,
        x: position.x,
        y: position.y,
        width: imageElement.width,
        height: imageElement.height,
        row: position.row,
        col: position.col,
      })
    },
    [excalidrawAPI]
  )

  const addVideoEmbed = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (elementData: any, videoSrc: string) => {
      if (!excalidrawAPI) return

      // 使用元素数据中的尺寸，如果没有则使用默认值
      const width = elementData.width || 640
      const height = elementData.height || 360
      const x = elementData.x || 100
      const y = elementData.y || 100

      // 创建嵌入元素（使用已有的属性或生成新的）
      const videoElement = {
        type: 'embeddable' as const,
        id: elementData.id || `video_${Date.now()}`,
        x: x,
        y: y,
        width: width,
        height: height,
        link: videoSrc,
        // 基本样式属性
        strokeColor: elementData.strokeColor || '#000000',
        backgroundColor: elementData.backgroundColor || 'transparent',
        fillStyle: elementData.fillStyle || 'solid',
        strokeWidth: elementData.strokeWidth || 1,
        strokeStyle: elementData.strokeStyle || 'solid',
        roundness: elementData.roundness || null,
        roughness: elementData.roughness || 1,
        opacity: elementData.opacity || 100,
        // 变换属性
        angle: elementData.angle || 0,
        seed: elementData.seed || Math.floor(Math.random() * 1000000),
        version: elementData.version || 1,
        versionNonce: elementData.versionNonce || Math.floor(Math.random() * 1000000),
        // 状态属性
        locked: elementData.locked || false,
        isDeleted: elementData.isDeleted || false,
        groupIds: elementData.groupIds || [],
        // 绑定属性
        boundElements: elementData.boundElements || [],
        updated: elementData.updated || Date.now(),
        // 框架属性
        frameId: elementData.frameId || null,
        index: elementData.index || null,
        // 自定义数据
        customData: elementData.customData || {},
      }

      // 转换为Excalidraw元素
      const videoElements = convertToExcalidrawElements([videoElement])

      // 获取当前画布元素
      const currentElements = excalidrawAPI.getSceneElements()
      const newElements = [...currentElements, ...videoElements]

      // 更新画布场景
      excalidrawAPI.updateScene({
        elements: newElements,
      })
    },
    [excalidrawAPI]
  )

  const renderEmbeddable = useCallback(
    (element: NonDeleted<ExcalidrawEmbeddableElement>, appState: AppState) => {
      const { link } = element

      // Check if this is a video URL
      if (
        link &&
        (link.includes('.mp4') ||
          link.includes('.webm') ||
          link.includes('.ogg') ||
          link.startsWith('blob:') ||
          link.includes('video'))
      ) {
        // Return the VideoPlayer component wrapped in a div that hides any hyperlinks
        return (
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <style>{`
              .excalidraw-hyperlinkContainer,
              .excalidraw-hyperlinkContainer-link,
              a[href="${link}"] {
                display: none !important;
              }
            `}</style>
            <VideoElement src={link} width={element.width} height={element.height} />
          </div>
        )
      }


      // Return null for non-video embeds to use default rendering
      return null
    },
    []
  )

  const handleImageGenerated = useCallback(
    (imageData: ISocket.SessionImageGeneratedEvent) => {


      // Only handle if it's for this canvas
      if (imageData.canvas_id !== canvasId) {

        return
      }

      // Check if this is actually a video generation event that got mislabeled
      if (imageData.file?.mimeType?.startsWith('video/')) {

        return
      }

      addImageToExcalidraw(imageData.element, imageData.file)
    },
    [addImageToExcalidraw, canvasId]
  )

  const handleVideoGenerated = useCallback(
    (videoData: ISocket.SessionVideoGeneratedEvent) => {
      // Only handle if it's for this canvas
      if (videoData.canvas_id !== canvasId) {
        return
      }

      // Create video embed element using the video URL
      addVideoEmbed(videoData.element, videoData.video_url)
    },
    [addVideoEmbed, canvasId]
  )

  useEffect(() => {
    eventBus.on('Socket::Session::ImageGenerated', handleImageGenerated)
    eventBus.on('Socket::Session::VideoGenerated', handleVideoGenerated)
    return () => {
      eventBus.off('Socket::Session::ImageGenerated', handleImageGenerated)
      eventBus.off('Socket::Session::VideoGenerated', handleVideoGenerated)
    }
  }, [handleImageGenerated, handleVideoGenerated])

  // 初始化时从现有元素加载布局管理器
  useEffect(() => {
    if (excalidrawAPI && initialData?.elements) {
      imageLayoutManagerRef.current.initializeFromElements(initialData.elements)
    }
  }, [excalidrawAPI, initialData])

  // Open slicer dialog
  const handleOpenSlicer = useCallback(() => {
    if (!excalidrawAPI) return

    const appState = excalidrawAPI.getAppState()
    const elements = excalidrawAPI.getSceneElements()
    const files = excalidrawAPI.getFiles()

    // Find selected image elements
    const selectedImages = elements.filter(
      (el): el is ExcalidrawImageElement =>
        el.type === 'image' &&
        !el.isDeleted &&
        appState.selectedElementIds[el.id]
    )

    if (selectedImages.length === 1) {
      const imageElement = selectedImages[0]
      const file = files[imageElement.fileId as string]

      if (file) {
        setSelectedImageElement(imageElement)
        setSelectedImageInfo({
          src: file.dataURL,
          width: imageElement.width,
          height: imageElement.height,
          originalName: 'image',
        })
        setSlicerDialogOpen(true)
      }
    }
  }, [excalidrawAPI])

  // Store excalidrawAPI ref for use in MutationObserver
  const excalidrawAPIRef = useRef(excalidrawAPI)
  useEffect(() => {
    excalidrawAPIRef.current = excalidrawAPI
  }, [excalidrawAPI])

  // Inject "图片分割" option into Excalidraw's native context menu
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.addedNodes.length) {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement) {
              // Look for Excalidraw context menu
              const contextMenu = node.classList?.contains('context-menu')
                ? node
                : node.querySelector?.('.context-menu')

              if (contextMenu) {
                // Check if we already injected our item
                if (contextMenu.querySelector('[data-image-slicer]')) return

                // Check if an image is selected - do this in real-time
                const api = excalidrawAPIRef.current
                if (!api) return

                const appState = api.getAppState()
                const elements = api.getSceneElements()

                const selectedImages = elements.filter(
                  (el) =>
                    el.type === 'image' &&
                    !el.isDeleted &&
                    appState.selectedElementIds[el.id]
                )

                // Only show slice option if exactly one image is selected
                if (selectedImages.length !== 1) return

                // Find the menu items container
                const menuItems = contextMenu.querySelector('.context-menu-items') || contextMenu

                // Create separator
                const separator = document.createElement('div')
                separator.className = 'context-menu-separator'
                separator.style.cssText = 'height: 1px; background: var(--color-gray-30); margin: 4px 0;'

                // Create our custom menu item
                const sliceItem = document.createElement('button')
                sliceItem.setAttribute('data-image-slicer', 'true')
                sliceItem.className = 'context-menu-item'
                sliceItem.style.cssText = `
                  display: flex;
                  align-items: center;
                  width: 100%;
                  padding: 8px 12px;
                  border: none;
                  background: transparent;
                  cursor: pointer;
                  font-size: 14px;
                  color: var(--color-gray-100, #1b1b1f);
                  text-align: left;
                  gap: 8px;
                `

                // Add icon (Grid3x3 SVG)
                const iconSpan = document.createElement('span')
                iconSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>`
                iconSpan.style.cssText = 'display: flex; align-items: center;'

                // Add text
                const textSpan = document.createElement('span')
                textSpan.textContent = t('imageSlicer.contextMenu.slice', '图片分割')

                sliceItem.appendChild(iconSpan)
                sliceItem.appendChild(textSpan)

                // Add hover effect
                sliceItem.addEventListener('mouseenter', () => {
                  sliceItem.style.background = 'var(--color-gray-10, #f5f5f5)'
                })
                sliceItem.addEventListener('mouseleave', () => {
                  sliceItem.style.background = 'transparent'
                })

                // Add click handler
                sliceItem.addEventListener('click', (e) => {
                  e.preventDefault()
                  e.stopPropagation()

                  // Close the context menu by dispatching Escape key
                  document.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Escape',
                    code: 'Escape',
                    keyCode: 27,
                    which: 27,
                    bubbles: true,
                    cancelable: true
                  }))

                  // Also try to remove the context menu directly
                  const menu = document.querySelector('.context-menu')
                  if (menu) {
                    menu.remove()
                  }

                  // Open slicer dialog
                  handleOpenSlicer()
                })

                // Append separator and item
                menuItems.appendChild(separator)
                menuItems.appendChild(sliceItem)
              }
            }
          })
        }
      }
    })

    observer.observe(document.body, { childList: true, subtree: true })

    return () => observer.disconnect()
  }, [t, handleOpenSlicer])

  // Handle double-click on image to show chat popup
  useEffect(() => {
    const container = containerRef.current
    if (!container || !excalidrawAPI) return

    const handleDoubleClick = (e: MouseEvent) => {
      const appState = excalidrawAPI.getAppState()
      const elements = excalidrawAPI.getSceneElements()
      const files = excalidrawAPI.getFiles()

      // Find selected image elements
      const selectedImages = elements.filter(
        (el): el is ExcalidrawImageElement =>
          el.type === 'image' &&
          !el.isDeleted &&
          appState.selectedElementIds[el.id]
      )

      // Only emit event if images are selected
      if (selectedImages.length > 0) {
        const imageData = selectedImages
          .filter((image) => image.fileId)
          .map((image) => {
            const file = files[image.fileId as string]
            if (!file) return null
            const isBase64 = file.dataURL.startsWith('data:')
            let id: string
            if (isBase64) {
              id = file.id
            } else {
              const urlPath = file.dataURL.split('?')[0]
              id = urlPath.split('/').at(-1)!
            }
            return {
              fileId: id,
              base64: isBase64 ? file.dataURL : undefined,
              width: image.width,
              height: image.height,
            }
          })
          .filter(Boolean) as { fileId: string; base64?: string; width: number; height: number }[]

        if (imageData.length > 0) {
          // Calculate position for popup
          const centerX = selectedImages.reduce((acc, img) => acc + img.x + img.width / 2, 0) / selectedImages.length
          const bottomY = selectedImages.reduce((acc, img) => Math.max(acc, img.y + img.height), Number.NEGATIVE_INFINITY)

          const scrollX = appState.scrollX
          const scrollY = appState.scrollY
          const zoom = appState.zoom.value
          const offsetX = (scrollX + centerX) * zoom
          const offsetY = (scrollY + bottomY) * zoom

          eventBus.emit('Canvas::ImageDoubleClick', {
            images: imageData,
            position: { x: offsetX, y: offsetY },
          })
        }
      }
    }

    container.addEventListener('dblclick', handleDoubleClick)

    return () => {
      container.removeEventListener('dblclick', handleDoubleClick)
    }
  }, [excalidrawAPI])

  // Add sliced images to canvas
  const handleSliceApply = useCallback(
    async (slices: SliceResult[], settings: GridSettings) => {
      if (!excalidrawAPI || !selectedImageElement) return

      const currentElements = excalidrawAPI.getSceneElements()
      const gap = 10 // Gap between slices

      // Calculate starting position (right side of original image)
      const startX = selectedImageElement.x + selectedImageElement.width + 50
      const startY = selectedImageElement.y

      const newFiles: BinaryFileData[] = []
      const newElements: ExcalidrawImageElement[] = []

      for (const slice of slices) {
        const fileId = nanoid()
        const elementId = nanoid()

        // Calculate position based on grid
        const x = startX + slice.col * (slice.width + gap)
        const y = startY + slice.row * (slice.height + gap)

        // Create file data
        newFiles.push({
          id: fileId,
          dataURL: slice.dataURL,
          mimeType: `image/${settings.format}`,
          created: Date.now(),
        })

        // Create image element
        const newElement: ExcalidrawImageElement = {
          type: 'image',
          id: elementId,
          x,
          y,
          width: slice.width,
          height: slice.height,
          fileId,
          status: 'saved',
          scale: [1, 1],
          // Basic properties
          strokeColor: '#000000',
          backgroundColor: 'transparent',
          fillStyle: 'solid',
          strokeWidth: 1,
          strokeStyle: 'solid',
          roundness: null,
          roughness: 1,
          opacity: 100,
          angle: 0,
          seed: Math.floor(Math.random() * 1000000),
          version: 1,
          versionNonce: Math.floor(Math.random() * 1000000),
          locked: false,
          isDeleted: false,
          groupIds: [],
          boundElements: null,
          updated: Date.now(),
          frameId: null,
          index: null as unknown as string,
          link: null,
        }

        newElements.push(newElement)
      }

      // Add files to Excalidraw
      excalidrawAPI.addFiles(newFiles)

      // Add elements to scene
      excalidrawAPI.updateScene({
        elements: [...currentElements, ...newElements],
      })

      // Reset state
      setSelectedImageElement(null)
      setSelectedImageInfo(null)
    },
    [excalidrawAPI, selectedImageElement]
  )

  return (
    <div ref={containerRef} className={excalidrawClassName} style={{ width: '100%', height: '100%' }}>
      <Excalidraw
        theme={customTheme as Theme}
        langCode={i18n.language}
        excalidrawAPI={(api) => {
          setExcalidrawAPI(api)
        }}
        onChange={handleChange}
        initialData={() => {
          const data = initialData

          // 🎨 设置自定义背景色 - 与蓝色渐变主题呼应
          // 颜色选项：
          // '#fafbff' - 非常淡的蓝白色（推荐，与主题完美呼应）
          // '#f8faff' - 稍蓝一点的版本（更明显的蓝色调）
          // '#fbfcff' - 极淡版本（几乎白色但保持蓝色调）
          // '#ffffff' - 经典纯白色（如需回到原始效果）
          const customAppState = {
            ...(data?.appState || {}),
            collaborators: undefined!,
            viewBackgroundColor: '#fafbff', // 当前使用：非常淡的蓝白色
          }

          return {
            ...data,
            appState: customAppState,
          }
        }}
        renderEmbeddable={renderEmbeddable}
        // Allow all URLs for embeddable content
        validateEmbeddable={(url: string) => {
          // Allow all URLs - return true for everything
          return true
        }}
        // Ensure interactive mode is enabled
        viewModeEnabled={false}
        zenModeEnabled={false}
        // Allow element manipulation
        onPointerUpdate={(payload) => {
          // Minimal logging - only log significant pointer events
          if (payload.button === 'down' && Math.random() < 0.05) {
            // console.log('👇 Pointer down on:', payload.pointer.x, payload.pointer.y)
          }
        }}
      />

      {/* Image Slicer Dialog */}
      <ImageSlicerDialog
        open={slicerDialogOpen}
        onOpenChange={setSlicerDialogOpen}
        imageInfo={selectedImageInfo}
        onApply={handleSliceApply}
      />
    </div>
  )
}

export { CanvasExcali }
export default CanvasExcali

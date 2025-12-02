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
  FileId,
  FractionalIndex,
} from '@excalidraw/excalidraw/element/types'
import '@excalidraw/excalidraw/index.css'
import {
  AppState,
  BinaryFileData,
  BinaryFiles,
  ExcalidrawInitialDataState,
  DataURL,
} from '@excalidraw/excalidraw/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { nanoid } from 'nanoid'
import { VideoElement } from './VideoElement'
import ImageSlicerDialog from './ImageSlicerDialog'
import { PosterGeneratorDialog } from '@/components/plugin/PosterGeneratorDialog'
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
  
  // Poster generator state
  const [posterDialogOpen, setPosterDialogOpen] = useState(false)
  const [posterReferenceImage, setPosterReferenceImage] = useState<{ fileId: string; base64?: string } | undefined>(undefined)

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
    
    // Handle adding poster images
    const handleAddPosterImages = (event: { images: { url: string; index: number }[]; referenceImageId?: string }) => {
      if (!excalidrawAPI) return
      
      const currentElements = excalidrawAPI.getSceneElements()
      const newFiles: BinaryFileData[] = []
      const newElements: ExcalidrawImageElement[] = []
      
      // Calculate start position
      let startX = 0
      let startY = 0
      
      // If we have a reference image, start near it
      if (event.referenceImageId) {
        const refElement = currentElements.find(el => el.type === 'image' && el.fileId === event.referenceImageId)
        if (refElement) {
          startX = refElement.x + refElement.width + 50
          startY = refElement.y
        }
      } else {
        // Otherwise use center of view
        const appState = excalidrawAPI.getAppState()
        startX = appState.scrollX + appState.width / 2
        startY = appState.scrollY + appState.height / 2
      }
      
      const gap = 20
      const width = 300 // Default width
      const height = 400 // Default height (3:4)
      
      event.images.forEach((img, i) => {
        const fileId = nanoid()
        const elementId = nanoid()
        
        // Simple grid layout
        const cols = 3
        const row = Math.floor(i / cols)
        const col = i % cols
        
        const x = startX + col * (width + gap)
        const y = startY + row * (height + gap)
        
        // We need to fetch the image to get dataURL
        // Since we can't do async easily here, we'll just add a placeholder or try to fetch
        // For now, let's assume the URL is accessible and we can add it as an image
        // But Excalidraw needs dataURL for images usually, or we can use the URL if it supports it
        // Actually, let's fetch the image content
        
        fetch(img.url)
          .then(res => res.blob())
          .then(blob => {
            const reader = new FileReader()
            reader.onloadend = () => {
              const dataURL = reader.result as string
              
              const file: BinaryFileData = {
                id: fileId as FileId,
                dataURL: dataURL as DataURL,
                mimeType: blob.type as any,
                created: Date.now(),
              }
              
              const element: ExcalidrawImageElement = {
                type: 'image',
                id: elementId,
                x,
                y,
                width,
                height,
                fileId: fileId as FileId,
                status: 'saved',
                scale: [1, 1],
                crop: null,
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
                index: null as unknown as FractionalIndex,
                link: null,
              }
              
              excalidrawAPI.addFiles([file])
              excalidrawAPI.updateScene({
                elements: [...excalidrawAPI.getSceneElements(), element]
              })
            }
            reader.readAsDataURL(blob)
          })
          .catch(err => console.error('Failed to fetch poster image:', err))
      })
    }
    
    eventBus.on('Canvas::AddPosterImages', handleAddPosterImages)

    return () => {
      eventBus.off('Socket::Session::ImageGenerated', handleImageGenerated)
      eventBus.off('Socket::Session::VideoGenerated', handleVideoGenerated)
      eventBus.off('Canvas::AddPosterImages', handleAddPosterImages)
    }
  }, [handleImageGenerated, handleVideoGenerated, excalidrawAPI, canvasId])

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
      (el) =>
        el.type === 'image' &&
        !el.isDeleted &&
        appState.selectedElementIds[el.id]
    ) as ExcalidrawImageElement[]

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

  // Open poster generator dialog
  // Moved up to fix hoisting issue
  const handleOpenPosterGenerator = useCallback(() => {
    if (!excalidrawAPI) return

    const appState = excalidrawAPI.getAppState()
    const elements = excalidrawAPI.getSceneElements()
    const files = excalidrawAPI.getFiles()

    // Find selected image elements
    const selectedImages = elements.filter(
      (el) =>
        el.type === 'image' &&
        !el.isDeleted &&
        appState.selectedElementIds[el.id]
    ) as ExcalidrawImageElement[]

    if (selectedImages.length === 1) {
      const imageElement = selectedImages[0]
      const file = files[imageElement.fileId as string]

      if (file) {
        setPosterReferenceImage({
          fileId: imageElement.fileId as string,
          base64: file.dataURL
        })
        setPosterDialogOpen(true)
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
                ) as ExcalidrawImageElement[]

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

                menuItems.appendChild(separator)
                menuItems.appendChild(sliceItem)

                // Create Poster Generator item
                const posterItem = document.createElement('button')
                posterItem.setAttribute('data-poster-generator', 'true')
                posterItem.className = 'context-menu-item'
                posterItem.style.cssText = sliceItem.style.cssText

                // Add icon (Sparkles SVG)
                const posterIconSpan = document.createElement('span')
                posterIconSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`
                posterIconSpan.style.cssText = 'display: flex; align-items: center;'

                // Add text
                const posterTextSpan = document.createElement('span')
                posterTextSpan.textContent = t('poster.contextMenu.generate', '生成海报')

                posterItem.appendChild(posterIconSpan)
                posterItem.appendChild(posterTextSpan)

                // Add hover effect
                posterItem.addEventListener('mouseenter', () => {
                  posterItem.style.background = 'var(--color-gray-10, #f5f5f5)'
                })
                posterItem.addEventListener('mouseleave', () => {
                  posterItem.style.background = 'transparent'
                })

                // Add click handler
                posterItem.addEventListener('click', (e) => {
                  e.preventDefault()
                  e.stopPropagation()

                  // Close context menu
                  document.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Escape',
                    code: 'Escape',
                    keyCode: 27,
                    which: 27,
                    bubbles: true,
                    cancelable: true
                  }))

                  const menu = document.querySelector('.context-menu')
                  if (menu) menu.remove()

                  // Open poster dialog
                  handleOpenPosterGenerator()
                })

                menuItems.appendChild(posterItem)
              }
            }
          })
        }
      }
    })

    observer.observe(document.body, { childList: true, subtree: true })

    return () => observer.disconnect()
  }, [t, handleOpenSlicer, handleOpenPosterGenerator])

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
        (el) =>
          el.type === 'image' &&
          !el.isDeleted &&
          appState.selectedElementIds[el.id]
      ) as ExcalidrawImageElement[]

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
          id: fileId as FileId,
          dataURL: slice.dataURL as DataURL,
          mimeType: `image/${settings.format}` as any,
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
          fileId: fileId as FileId,
          status: 'saved',
          scale: [1, 1],
          crop: null,
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
          index: null as unknown as FractionalIndex,
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

      <ImageSlicerDialog
        open={slicerDialogOpen}
        onOpenChange={setSlicerDialogOpen}
        imageInfo={selectedImageInfo}
        onApply={handleSliceApply}
      />

      {/* Poster Generator Dialog */}
      <PosterGeneratorDialog
        open={posterDialogOpen}
        onOpenChange={setPosterDialogOpen}
        referenceImage={posterReferenceImage}
      />
    </div>
  )
}

export { CanvasExcali }
export default CanvasExcali

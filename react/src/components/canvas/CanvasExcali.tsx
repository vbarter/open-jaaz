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
import { useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { VideoElement } from './VideoElement'

import '@/assets/style/canvas.css'

type CanvasExcaliProps = {
  canvasId: string
  initialData?: ExcalidrawInitialDataState
}

const CanvasExcali: React.FC<CanvasExcaliProps> = ({
  canvasId,
  initialData,
}) => {
  const { excalidrawAPI, setExcalidrawAPI } = useCanvas()

  // 创建图片布局管理器实例
  const imageLayoutManagerRef = useRef(new ImageLayoutManager())

  const { i18n } = useTranslation()

  // Immediate handler for UI updates (no debounce)
  const handleSelectionChange = (
    elements: Readonly<OrderedExcalidrawElement[]>,
    appState: AppState
  ) => {
    if (!appState) return

    // Check if any selected element is embeddable type
    const selectedElements = elements.filter((element) => 
      appState.selectedElementIds[element.id]
    )
    const hasEmbeddableSelected = selectedElements.some(
      (element) => element.type === 'embeddable'
    )

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
    (
      elements: Readonly<OrderedExcalidrawElement[]>,
      appState: AppState,
      files: BinaryFiles
    ) => {
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
          gridColor: 'rgba(255, 255, 255, 0.1)',
        }
      })
    } else if (excalidrawAPI && theme === 'light') {
      // 恢复浅色背景
      excalidrawAPI.updateScene({
        appState: {
          viewBackgroundColor: '#ffffff',
          gridColor: 'rgba(0, 0, 0, 0.1)',
        }
      })
    }
  }, [excalidrawAPI, theme])

  const addImageToExcalidraw = useCallback(
    async (imageElement: ExcalidrawImageElement, file: BinaryFileData) => {
      if (!excalidrawAPI) return

      console.log('========== 开始添加新图片 ==========')
      console.log('👇 新图片ID:', imageElement.id)

      // 获取当前画布元素
      const currentElements = excalidrawAPI.getSceneElements()
      console.log('👇 画布当前元素数量:', currentElements.length)

      // 筛选出所有图片元素
      const imageElements = currentElements.filter(el => el.type === 'image' && !el.isDeleted)
      console.log('👇 画布当前图片数量:', imageElements.length)

      // 同步现有图片到布局管理器（只同步，不重置）
      console.log('👇 同步现有图片到布局管理器...')

      // 如果布局管理器是空的，先初始化
      if (imageLayoutManagerRef.current.getAllImages().length === 0 && imageElements.length > 0) {
        console.log('👇 布局管理器为空，初始化现有图片...')
        imageLayoutManagerRef.current.initializeFromElements(currentElements)
      } else {
        console.log('👇 布局管理器已有数据，同步新图片...')
        imageLayoutManagerRef.current.syncWithElements(currentElements)
      }

      // 打印当前布局管理器状态
      const existingImages = imageLayoutManagerRef.current.getAllImages()
      console.log('👇 布局管理器中的图片:', existingImages.length)
      existingImages.forEach((img, index) => {
        console.log(`  [${index}] 位置(${img.row},${img.col}) 坐标(${img.x},${img.y}) 尺寸(${img.width}x${img.height})`)
      })

      // 检查新图片是否已存在
      if (imageLayoutManagerRef.current.hasImage(imageElement.id)) {
        console.log('⚠️ 图片已存在，跳过添加')
        return
      }

      // 添加文件
      excalidrawAPI.addFiles([file])

      // 计算新图片的位置
      const position = imageLayoutManagerRef.current.calculateNextPosition(
        imageElement.width,
        imageElement.height
      )

      console.log('👇 计算出的新图片位置:', {
        x: position.x,
        y: position.y,
        row: position.row,
        col: position.col
      })

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
        col: position.col
      })

      console.log('✅ 图片添加完成，当前总图片数:',
        imageLayoutManagerRef.current.getAllImages().length)
      console.log('========== 添加图片结束 ==========\n')
    },
    [excalidrawAPI]
  )

  const addVideoEmbed = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (elementData: any, videoSrc: string) => {
      if (!excalidrawAPI) return

      console.log('🎥 添加视频到画布:', {
        videoSrc,
        elementData
      })

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

      console.log('🎬 创建的视频元素:', videoElement)

      // 转换为Excalidraw元素
      const videoElements = convertToExcalidrawElements([videoElement])

      console.log('👇 Converted video elements:', videoElements)

      // 获取当前画布元素
      const currentElements = excalidrawAPI.getSceneElements()
      const newElements = [...currentElements, ...videoElements]

      console.log('👇 更新画布，元素总数:', newElements.length)

      // 更新画布场景
      excalidrawAPI.updateScene({
        elements: newElements,
      })

      console.log(
        '✅ 视频已添加到画布:',
        videoSrc,
        `尺寸: ${width}x${height}`,
        `位置: (${x}, ${y})`
      )
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
            <VideoElement
              src={link}
              width={element.width}
              height={element.height}
            />
          </div>
        )
      }

      console.log('👇 Not a video URL, returning null for:', link)
      // Return null for non-video embeds to use default rendering
      return null
    },
    []
  )

  const handleImageGenerated = useCallback(
    (imageData: ISocket.SessionImageGeneratedEvent) => {
      console.log('👇 CanvasExcali received image_generated:', imageData)

      // Only handle if it's for this canvas
      if (imageData.canvas_id !== canvasId) {
        console.log('👇 Image not for this canvas, ignoring')
        return
      }

      // Check if this is actually a video generation event that got mislabeled
      if (imageData.file?.mimeType?.startsWith('video/')) {
        console.log(
          '👇 This appears to be a video, not an image. Ignoring in image handler.'
        )
        return
      }

      addImageToExcalidraw(imageData.element, imageData.file)
    },
    [addImageToExcalidraw, canvasId]
  )

  const handleVideoGenerated = useCallback(
    (videoData: ISocket.SessionVideoGeneratedEvent) => {
      console.log('👇 CanvasExcali received video_generated:', videoData)

      // Only handle if it's for this canvas
      if (videoData.canvas_id !== canvasId) {
        console.log('👇 Video not for this canvas, ignoring')
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

  return (
    <Excalidraw
      theme={customTheme as Theme}
      langCode={i18n.language}
      className={excalidrawClassName}
      excalidrawAPI={(api) => {
        setExcalidrawAPI(api)
      }}
      onChange={handleChange}
      initialData={() => {
        const data = initialData
        console.log('👇initialData', data)
        
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
        } || null
      }}
      renderEmbeddable={renderEmbeddable}
      // Allow all URLs for embeddable content
      validateEmbeddable={(url: string) => {
        console.log('👇 Validating embeddable URL:', url)
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
  )
}

export { CanvasExcali }
export default CanvasExcali

import { saveCanvas } from '@/api/canvas'
import { useCanvas } from '@/contexts/canvas'
import useDebounce from '@/hooks/use-debounce'
import { useTheme } from '@/hooks/use-theme'
import { eventBus } from '@/lib/event'
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

type LastImagePosition = {
  x: number
  y: number
  width: number
  height: number
  col: number // col index
}

type CanvasExcaliProps = {
  canvasId: string
  initialData?: ExcalidrawInitialDataState
}

const CanvasExcali: React.FC<CanvasExcaliProps> = ({
  canvasId,
  initialData,
}) => {
  const { excalidrawAPI, setExcalidrawAPI } = useCanvas()

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

  const lastImagePosition = useRef<LastImagePosition | null>(
    localStorage.getItem('excalidraw-last-image-position')
      ? JSON.parse(localStorage.getItem('excalidraw-last-image-position')!)
      : null
  )
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

      // 获取当前画布元素以便添加新元素
      const currentElements = excalidrawAPI.getSceneElements()

      excalidrawAPI.addFiles([file])

      console.log('👇 Adding new image element to canvas:', imageElement.id)
      console.log('👇 Image element properties:', {
        id: imageElement.id,
        type: imageElement.type,
        locked: imageElement.locked,
        groupIds: imageElement.groupIds,
        isDeleted: imageElement.isDeleted,
        x: imageElement.x,
        y: imageElement.y,
        width: imageElement.width,
        height: imageElement.height,
      })

      // Ensure image is not locked and can be manipulated
      const unlockedImageElement = {
        ...imageElement,
        locked: false,
        groupIds: [],
        isDeleted: false,
      }

      excalidrawAPI.updateScene({
        elements: [...(currentElements || []), unlockedImageElement],
      })

      // 🎯 Auto-focus: Use the same scrollToContent method as chat goto functionality
      setTimeout(() => {
        if (excalidrawAPI) {
          console.log('🎯 Auto-focusing on new image using scrollToContent:', unlockedImageElement.id)
          excalidrawAPI.scrollToContent(unlockedImageElement.id, { animate: true })
        }
      }, 100) // Small delay to ensure the image is rendered

      localStorage.setItem(
        'excalidraw-last-image-position',
        JSON.stringify(lastImagePosition.current)
      )
    },
    [excalidrawAPI]
  )

  const addVideoEmbed = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (elementData: any, videoSrc: string) => {
      if (!excalidrawAPI) return

      // Function to create video element with given dimensions
      const createVideoElement = (finalWidth: number, finalHeight: number) => {
        console.log('👇 Video element properties:', {
          id: elementData.id,
          type: elementData.type,
          locked: elementData.locked,
          groupIds: elementData.groupIds,
          isDeleted: elementData.isDeleted,
          x: elementData.x,
          y: elementData.y,
          width: elementData.width,
          height: elementData.height,
        })

        const videoElements = convertToExcalidrawElements([
          {
            type: 'embeddable',
            id: elementData.id,
            x: elementData.x,
            y: elementData.y,
            width: elementData.width,
            height: elementData.height,
            link: videoSrc,
            // 添加必需的基本样式属性
            strokeColor: '#000000',
            backgroundColor: 'transparent',
            fillStyle: 'solid',
            strokeWidth: 1,
            strokeStyle: 'solid',
            roundness: null,
            roughness: 1,
            opacity: 100,
            // 添加必需的变换属性
            angle: 0,
            seed: Math.random(),
            version: 1,
            versionNonce: Math.random(),
            // 添加必需的状态属性
            locked: false,
            isDeleted: false,
            groupIds: [],
            // 添加绑定框属性
            boundElements: [],
            updated: Date.now(),
            // 添加必需的索引和帧ID属性
            frameId: null,
            index: null, // 添加缺失的index属性
            // 添加自定义数据属性
            customData: {},
          },
        ])

        console.log('👇 Converted video elements:', videoElements)

        const currentElements = excalidrawAPI.getSceneElements()
        const newElements = [...currentElements, ...videoElements]

        console.log(
          '👇 Updating scene with elements count:',
          newElements.length
        )

        excalidrawAPI.updateScene({
          elements: newElements,
        })

        // 🎯 Auto-focus: Center the view on the newly added video within canvas viewport
        setTimeout(() => {
          if (excalidrawAPI && videoElements.length > 0) {
            const videoElement = videoElements[0]
            // Calculate the center point of the newly added video
            const videoCenterX = videoElement.x + videoElement.width / 2
            const videoCenterY = videoElement.y + videoElement.height / 2

            console.log('🎯 Auto-focusing on new video at center:', {
              x: videoCenterX,
              y: videoCenterY,
              videoId: videoElement.id
            })

            // Get current app state to preserve other settings
            const currentAppState = excalidrawAPI.getAppState()

            // 🎯 视频精确居中算法（与图片算法一致）
            console.log('🎯 === 视频精确居中算法开始 ===')

            // 1. 获取画布DOM的真实尺寸（与图片算法一致）
            const canvasContainer = document.querySelector('.excalidraw')
            if (!canvasContainer) {
              console.error('❌ 视频：无法找到画布容器，使用备用方案')
              return
            }

            const rect = canvasContainer.getBoundingClientRect()
            const zoom = currentAppState.zoom.value

            // 2. 计算真实的画布中心偏移
            const realCenterOffsetX = rect.width / 2
            const realCenterOffsetY = rect.height / 2

            console.log('视频步骤1 - 画布真实信息:', {
              domWidth: rect.width,
              domHeight: rect.height,
              realCenterOffsetX: realCenterOffsetX,
              realCenterOffsetY: realCenterOffsetY,
              currentZoom: zoom
            })

            console.log('视频步骤2 - 视频信息:', {
              videoPosition: { x: videoElement.x, y: videoElement.y },
              videoSize: { width: videoElement.width, height: videoElement.height },
              videoCenterX: videoCenterX,
              videoCenterY: videoCenterY
            })

            // 3. 使用真实画布尺寸计算精确滚动位置
            const newScrollX = videoCenterX - realCenterOffsetX / zoom
            const newScrollY = videoCenterY - realCenterOffsetY / zoom

            console.log('视频步骤3 - 精确滚动计算:', {
              计算公式: 'scrollX = videoCenterX - realCenterOffsetX / zoom',
              计算过程X: `${videoCenterX} - ${realCenterOffsetX}/${zoom} = ${newScrollX}`,
              计算过程Y: `${videoCenterY} - ${realCenterOffsetY}/${zoom} = ${newScrollY}`,
              newScrollX: newScrollX,
              newScrollY: newScrollY
            })

            // 4. 应用精确居中位置
            excalidrawAPI.updateScene({
              appState: {
                ...currentAppState,
                scrollX: newScrollX,
                scrollY: newScrollY,
              }
            })

            console.log('视频步骤4 - 应用精确居中位置:', {
              应用的scrollX: newScrollX,
              应用的scrollY: newScrollY,
              videoId: videoElement.id,
              算法类型: '精确居中法'
            })

            // 5. 最终验证：使用真实画布尺寸验证居中效果
            setTimeout(() => {
              try {
                const verifyState = excalidrawAPI.getAppState()

                // 验证：新的scroll位置 + realCenterOffset/zoom = 视频中心
                const verifyViewCenterX = verifyState.scrollX + realCenterOffsetX / verifyState.zoom.value
                const verifyViewCenterY = verifyState.scrollY + realCenterOffsetY / verifyState.zoom.value

                console.log('视频步骤5 - 精确居中验证:', {
                  实际应用的scrollX: verifyState.scrollX,
                  实际应用的scrollY: verifyState.scrollY,
                  预期scrollX: newScrollX,
                  预期scrollY: newScrollY,
                  scrollX误差: Math.abs(verifyState.scrollX - newScrollX),
                  scrollY误差: Math.abs(verifyState.scrollY - newScrollY),
                  scrollX匹配: Math.abs(verifyState.scrollX - newScrollX) < 0.1,
                  scrollY匹配: Math.abs(verifyState.scrollY - newScrollY) < 0.1,
                  计算出的视图中心X: verifyViewCenterX,
                  计算出的视图中心Y: verifyViewCenterY,
                  视频中心X: videoCenterX,
                  视频中心Y: videoCenterY,
                  X轴居中误差: Math.abs(verifyViewCenterX - videoCenterX),
                  Y轴居中误差: Math.abs(verifyViewCenterY - videoCenterY),
                  精确居中成功: Math.abs(verifyViewCenterX - videoCenterX) < 1 && Math.abs(verifyViewCenterY - videoCenterY) < 1,
                  使用的真实画布尺寸: { width: rect.width, height: rect.height }
                })

                console.log('🎯 === 视频精确居中算法结束 ===')
              } catch (error) {
                console.error('视频精确居中验证失败:', error)
              }
            }, 50)

            console.log('🎯 视频精确居中完成 for video:', {
              videoId: videoElement.id,
              algorithm: 'PreciseCenter',
              newScrollX,
              newScrollY,
              realCanvasSize: { width: rect.width, height: rect.height },
              realCenterOffset: { x: realCenterOffsetX, y: realCenterOffsetY }
            })
          }
        }, 100) // Small delay to ensure the video element is rendered

        console.log(
          '👇 Added video embed element:',
          videoSrc,
          `${elementData.width}x${elementData.height}`
        )
      }

      // If dimensions are provided, use them directly
      if (elementData.width && elementData.height) {
        createVideoElement(elementData.width, elementData.height)
        return
      }

      // Otherwise, try to get video's natural dimensions
      const video = document.createElement('video')
      video.crossOrigin = 'anonymous'

      video.onloadedmetadata = () => {
        const videoWidth = video.videoWidth
        const videoHeight = video.videoHeight

        if (videoWidth && videoHeight) {
          // Scale down if video is too large (max 800px width)
          const maxWidth = 800
          let finalWidth = videoWidth
          let finalHeight = videoHeight

          if (videoWidth > maxWidth) {
            const scale = maxWidth / videoWidth
            finalWidth = maxWidth
            finalHeight = videoHeight * scale
          }

          createVideoElement(finalWidth, finalHeight)
        } else {
          // Fallback to default dimensions
          createVideoElement(320, 180)
        }
      }

      video.onerror = () => {
        console.warn('Could not load video metadata, using default dimensions')
        createVideoElement(320, 180)
      }

      video.src = videoSrc
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
        // Return the VideoPlayer component
        return (
          <VideoElement
            src={link}
            width={element.width}
            height={element.height}
          />
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

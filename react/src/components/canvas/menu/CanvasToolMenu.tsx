import { Separator } from '@/components/ui/separator'
import { useCanvas } from '@/contexts/canvas'
import { useState } from 'react'
import CanvasMenuButton from './CanvasMenuButton'
import RelayoutButton from './RelayoutButton'
import { ToolType } from './CanvasMenuIcon'
import { ImageLayoutManager } from '@/lib/image-layout-manager'

const CanvasToolMenu = () => {
  const { excalidrawAPI } = useCanvas()

  const [activeTool, setActiveTool] = useState<ToolType | undefined>(undefined)

  const handleToolChange = (tool: ToolType) => {
    excalidrawAPI?.setActiveTool({ type: tool })
  }

  const handleRelayout = () => {
    if (!excalidrawAPI) return

    console.log('开始重排版图片...')

    // 获取当前画布中的所有元素和文件
    const currentElements = excalidrawAPI.getSceneElements()
    const currentFiles = excalidrawAPI.getFiles()

    console.log('🔍 当前画布状态:')
    console.log('  - 元素总数:', currentElements.length)
    console.log('  - 文件总数:', Object.keys(currentFiles).length)

    // 筛选出图片元素
    const imageElements = currentElements.filter(el => el.type === 'image' && !el.isDeleted)

    if (imageElements.length === 0) {
      console.log('画布中没有图片，跳过重排版')
      return
    }

    console.log(`找到 ${imageElements.length} 张图片，开始重排版...`)

    // 打印每个图片元素的关键信息
    imageElements.forEach((img, index) => {
      console.log(`  图片 ${index + 1}: ID=${img.id}, fileId=${img.fileId}, 位置=(${Math.round(img.x)}, ${Math.round(img.y)})`)
    })

    // 使用临时的布局管理器进行重排版
    const layoutManager = new ImageLayoutManager()

    // 重新排列图片
    const relayoutedImages = layoutManager.relayoutImages(currentElements)

    if (relayoutedImages.length === 0) {
      console.log('重排版后没有图片')
      return
    }

    console.log('📐 重排版后的图片位置:')
    relayoutedImages.forEach((img, index) => {
      console.log(`  图片 ${index + 1}: ID=${img.id}, fileId=${img.fileId}, 新位置=(${Math.round(img.x)}, ${Math.round(img.y)})`)
    })

    // 更新非图片元素（保持原样）
    const nonImageElements = currentElements.filter(el => el.type !== 'image' || el.isDeleted)

    // 合并所有元素
    const updatedElements = [...nonImageElements, ...relayoutedImages]

    console.log('🎨 更新画布:')
    console.log('  - 非图片元素:', nonImageElements.length)
    console.log('  - 重排版图片:', relayoutedImages.length)
    console.log('  - 总元素数:', updatedElements.length)

    // 更新画布 - 同时传递元素和文件
    excalidrawAPI.updateScene({
      elements: updatedElements,
      files: currentFiles // 重要：保持文件引用
    })

    console.log('重排版完成，准备自动滚动到第一张图片...')

    // 等待DOM完全更新后再触发滚动
    // 使用多层延迟确保重排版完全完成
    requestAnimationFrame(() => {
      setTimeout(() => {
        console.log('🎯 开始执行滚动逻辑...')

        // 方案1：尝试滚动到第一张图片（第一行第一列）
        const firstImageInfo = layoutManager.getFirstImageInfo()
        if (firstImageInfo) {
          console.log(`🎯 找到第一张图片: ID=${firstImageInfo.id}, 位置=(${Math.round(firstImageInfo.x)}, ${Math.round(firstImageInfo.y)})`)

          try {
            console.log('📱 尝试滚动到第一张图片元素...')
            excalidrawAPI.scrollToContent(firstImageInfo.id, {
              animate: true
            })
            console.log('✅ 滚动到第一张图片完成')
            return
          } catch (error) {
            console.error('❌ 滚动到第一张图片失败:', error)
            console.log('🔄 尝试备选方案：滚动到第一行视野区域...')

            // 方案1.5：滚动到第一行的视野区域
            const firstRowViewArea = layoutManager.getFirstRowViewArea()
            if (firstRowViewArea) {
              try {
                console.log(`📱 滚动到第一行视野区域: (${Math.round(firstRowViewArea.x)}, ${Math.round(firstRowViewArea.y)}) ${Math.round(firstRowViewArea.width)}x${Math.round(firstRowViewArea.height)}`)

                // 使用updateScene设置视窗位置
                const currentAppState = excalidrawAPI.getAppState()
                excalidrawAPI.updateScene({
                  appState: {
                    ...currentAppState,
                    scrollX: -firstRowViewArea.x,
                    scrollY: -firstRowViewArea.y,
                    zoom: {
                      value: Math.min(
                        window.innerWidth / firstRowViewArea.width,
                        window.innerHeight / firstRowViewArea.height,
                        1 // 不要放大，最多1倍
                      )
                    }
                  }
                })
                console.log('✅ 滚动到第一行视野区域完成')
                return
              } catch (viewError) {
                console.error('❌ 滚动到第一行视野区域失败:', viewError)
              }
            }
          }
        }

        // 方案2：滚动到所有内容区域
        console.log('📱 尝试滚动到整体内容区域...')
        try {
          excalidrawAPI.scrollToContent(undefined, {
            fitToContent: true,
            animate: true
          })
          console.log('✅ 滚动到整体内容完成')
        } catch (error) {
          console.error('❌ 滚动到整体内容失败:', error)

          // 方案3：使用zoomToFit作为备选
          console.log('📱 尝试使用zoomToFit作为备选...')
          try {
            excalidrawAPI.updateScene({
              appState: {
                ...excalidrawAPI.getAppState(),
                shouldCacheIgnoreZoom: false
              }
            })
            console.log('✅ 备选方案执行完成')
          } catch (fallbackError) {
            console.error('❌ 备选方案也失败:', fallbackError)
          }
        }
      }, 200) // 增加延迟时间，确保DOM完全更新
    })
  }

  excalidrawAPI?.onChange((_elements, appState, _files) => {
    setActiveTool(appState.activeTool.type as ToolType)
  })

  // 检查是否有图片元素，用于控制重排版按钮是否可用
  const hasImages = () => {
    if (!excalidrawAPI) return false
    const elements = excalidrawAPI.getSceneElements()
    return elements.some(el => el.type === 'image' && !el.isDeleted)
  }

  const tools: (ToolType | null)[] = [
    'hand',
    'selection',
    null,
    'rectangle',
    'ellipse',
    'arrow',
    'line',
    'freedraw',
    null,
    'text',
    'image',
  ]

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-white/85 backdrop-blur-md rounded-xl p-1.5 shadow-lg border border-white/40 md:bottom-5">
      {tools.map((tool, index) =>
        tool ? (
          <CanvasMenuButton
            key={tool}
            type={tool}
            activeTool={activeTool}
            onClick={() => handleToolChange(tool)}
          />
        ) : (
          <Separator
            key={index}
            orientation="vertical"
            className="h-6! bg-primary/5"
          />
        )
      )}
      <Separator orientation="vertical" className="h-6! bg-primary/5" />
      <RelayoutButton
        onClick={handleRelayout}
        disabled={!hasImages()}
      />
    </div>
  )
}

export default CanvasToolMenu

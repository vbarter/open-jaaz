import { Separator } from '@/components/ui/separator'
import { useCanvas } from '@/contexts/canvas'
import { useIsMobile } from '@/hooks/use-mobile'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Grid3X3 } from 'lucide-react'
import CanvasMenuButton from './CanvasMenuButton'
import RelayoutButton from './RelayoutButton'
import ToolOverflowMenu from './ToolOverflowMenu'
import { ToolType } from './CanvasMenuIcon'
import { ImageLayoutManager } from '@/lib/image-layout-manager'
import { toast } from 'sonner'

const CanvasToolMenu = () => {
  const { excalidrawAPI } = useCanvas()
  const isMobile = useIsMobile()
  const { t } = useTranslation()

  const [activeTool, setActiveTool] = useState<ToolType | undefined>(undefined)

  const handleToolChange = (tool: ToolType) => {
    excalidrawAPI?.setActiveTool({ type: tool })
  }

  const handleRelayout = () => {
    console.log('🔧 开始重新排布操作')

    if (!excalidrawAPI) {
      console.error('❌ excalidrawAPI 未初始化')
      toast.error(t('canvas:tool.relayoutError', { defaultValue: '重排版失败：画布API未初始化' }))
      return
    }

    try {
      // 获取当前画布中的所有元素和文件
      const currentElements = excalidrawAPI.getSceneElements()
      const currentFiles = excalidrawAPI.getFiles()

      console.log('📊 画布元素统计:', {
        totalElements: currentElements.length,
        files: Object.keys(currentFiles).length,
      })

      // 筛选出图片元素
      const imageElements = currentElements.filter((el) => el.type === 'image' && !el.isDeleted)

      console.log('🖼️ 图片元素详情:', {
        totalImages: imageElements.length,
        imageIds: imageElements.map((el) => ({ id: el.id, x: el.x, y: el.y, type: el.type })),
      })

      if (imageElements.length === 0) {
        console.warn('⚠️ 没有找到图片元素，重排版操作已取消')
        toast.warning(t('canvas:tool.noImages', { defaultValue: '画布上没有图片可以重新排布' }))
        return
      }

      // 使用临时的布局管理器进行重排版
      const layoutManager = new ImageLayoutManager()

      // 重新排列图片
      console.log('🔄 开始重新排列图片...')
      const relayoutedImages = layoutManager.relayoutImages(currentElements)

      console.log('✅ 重排版结果:', {
        relayoutedCount: relayoutedImages.length,
        expectedCount: imageElements.length,
      })

      if (relayoutedImages.length === 0) {
        console.error('❌ 重排版失败：没有生成重排版后的图片')
        toast.error(t('canvas:tool.relayoutFailed', { defaultValue: '重排版失败' }))
        return
      }

      // 更新非图片元素（保持原样）
      const nonImageElements = currentElements.filter((el) => el.type !== 'image' || el.isDeleted)
      // 合并所有元素
      const updatedElements = [...nonImageElements, ...relayoutedImages]
      // 更新画布 - 同时传递元素和文件
      try {
        excalidrawAPI.updateScene({
          elements: updatedElements,
          files: currentFiles, // 重要：保持文件引用
        })
      } catch (updateError) {
        return
      }

      // 等待DOM完全更新后再触发滚动
      // 使用多层延迟确保重排版完全完成
      requestAnimationFrame(() => {
        setTimeout(() => {
          console.log('📍 开始滚动到重排版后的内容')

          // 方案1：尝试滚动到第一张图片（第一行第一列）
          const firstImageInfo = layoutManager.getFirstImageInfo()
          if (firstImageInfo) {
            try {
              console.log('📍 滚动到第一张图片:', firstImageInfo)
              excalidrawAPI.scrollToContent(firstImageInfo.id, {
                animate: true,
              })
              return
            } catch (error) {
              console.warn('⚠️ 滚动到第一张图片失败，尝试备选方案:', error)

              // 方案1.5：滚动到第一行的视野区域
              const firstRowViewArea = layoutManager.getFirstRowViewArea()
              if (firstRowViewArea) {
                try {
                  console.log('📍 滚动到第一行视野区域:', firstRowViewArea)
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
                        ),
                      },
                    },
                  })
                  return
                } catch (viewError) {
                  console.error('❌ 滚动到第一行视野区域失败:', viewError)
                }
              }
            }
          }

          // 方案2：滚动到全部内容
          try {
            console.log('📍 尝试滚动到全部内容')
            excalidrawAPI.scrollToContent(undefined, {
              fitToContent: true,
              animate: true,
            })
          } catch (error) {
            console.warn('⚠️ 滚动到全部内容失败，尝试最后的备选方案:', error)

            try {
              excalidrawAPI.updateScene({
                appState: {
                  ...excalidrawAPI.getAppState(),
                  shouldCacheIgnoreZoom: false,
                },
              })
            } catch (fallbackError) {
              console.error('❌ 所有滚动方案都失败:', fallbackError)
            }
          }
        }, 200) // 增加延迟时间，确保DOM完全更新
      })
    } catch (error) {
      console.error('❌ 重排版过程中发生未预期的错误:', error)
      toast.error(
        t('canvas:tool.relayoutError', {
          defaultValue: `重排版失败：${error instanceof Error ? error.message : '未知错误'}`,
        })
      )
    }
  }

  excalidrawAPI?.onChange((_elements, appState, _files) => {
    setActiveTool(appState.activeTool.type as ToolType)
  })

  // 检查是否有图片元素，用于控制重排版按钮是否可用
  const hasImages = () => {
    if (!excalidrawAPI) {
      console.log('🔍 hasImages: excalidrawAPI 未初始化')
      return false
    }

    const elements = excalidrawAPI.getSceneElements()
    const imageElements = elements.filter((el) => el.type === 'image' && !el.isDeleted)

    // 每次检查时输出详细信息，便于调试
    // console.log('🔍 hasImages 检查结果:', {
    //   totalElements: elements.length,
    //   imageCount: imageElements.length,
    //   allElementTypes: [...new Set(elements.map((el) => el.type))],
    //   imageElementDetails: imageElements.map((el) => ({
    //     id: el.id,
    //     type: el.type,
    //     isDeleted: el.isDeleted,
    //     x: el.x,
    //     y: el.y,
    //   })),
    // })

    return imageElements.length > 0
  }

  // 所有可用的工具
  const allTools: ToolType[] = [
    'hand',
    'selection',
    'rectangle',
    'ellipse',
    'arrow',
    'line',
    'freedraw',
    'text',
    'image',
  ]

  // 移动端优先显示的工具（最重要的8个 + 重排版按钮 = 9个）
  const mobileVisibleTools: ToolType[] = [
    'hand',
    'selection',
    'rectangle',
    'ellipse',
    'arrow',
    'line',
    'text',
    'image',
  ]

  // 计算需要折叠的工具
  const overflowTools = isMobile
    ? allTools.filter((tool) => !mobileVisibleTools.includes(tool))
    : []

  // 当前显示的工具
  const visibleTools = isMobile ? mobileVisibleTools : allTools

  // 创建自定义菜单项（移动端时包含重排按钮）
  const customItems = isMobile
    ? [
        {
          id: 'relayout',
          type: 'relayout' as const,
          icon: Grid3X3,
          label: t('canvas:tool.relayout'),
          disabled: !hasImages(),
          onClick: handleRelayout,
        },
      ]
    : []

  return (
    <div
      className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center bg-white/85 backdrop-blur-md rounded-xl shadow-lg border border-white/40 md:bottom-5 ${
        isMobile ? 'p-1 max-w-[95vw] overflow-x-auto gap-0.5' : 'p-1.5 gap-1'
      }`}
    >
      {/* 基础工具组 */}
      <CanvasMenuButton
        type='hand'
        activeTool={activeTool}
        onClick={() => handleToolChange('hand')}
      />
      <CanvasMenuButton
        type='selection'
        activeTool={activeTool}
        onClick={() => handleToolChange('selection')}
      />

      {/* 分隔符 */}
      <Separator orientation='vertical' className='h-6! bg-primary/5' />

      {/* 绘图工具组 */}
      {visibleTools.slice(2).map((tool) => (
        <CanvasMenuButton
          key={tool}
          type={tool}
          activeTool={activeTool}
          onClick={() => handleToolChange(tool)}
        />
      ))}

      {/* 折叠菜单 */}
      {isMobile && (overflowTools.length > 0 || customItems.length > 0) && (
        <ToolOverflowMenu
          tools={overflowTools}
          activeTool={activeTool}
          onToolSelect={handleToolChange}
          customItems={customItems}
        />
      )}

      {/* 分隔符（仅桌面端显示重排按钮时） */}
      {!isMobile && <Separator orientation='vertical' className='h-6! bg-primary/5' />}

      {/* 重排版按钮（仅桌面端显示） */}
      {!isMobile && <RelayoutButton onClick={handleRelayout} disabled={!hasImages()} />}
    </div>
  )
}

export default CanvasToolMenu

/**
 * 调试自动聚焦失败的原因
 * 重新设计更简单直接的解决方案
 */

console.log('🔍 调试自动聚焦失败原因')
console.log('='.repeat(60))

function analyzePossibleIssues() {
  console.log('\n❌ 可能的问题分析:')
  console.log('1. 相对偏移算法可能还是理解错误')
  console.log('2. viewportBounds或DOM尺寸获取可能不准确')
  console.log('3. Excalidraw的坐标系统可能有特殊性')
  console.log('4. 缩放状态下的计算可能需要特殊处理')
  console.log('5. 可能需要考虑画布的实际渲染区域')
}

function designSimpleSolutions() {
  console.log('\n💡 简化解决方案设计:')

  console.log('\n方案1: 重置+居中法')
  console.log('- 先将视图重置到合理的位置')
  console.log('- 再直接计算图片的绝对居中位置')
  console.log('- 避免复杂的相对计算')

  console.log('\n方案2: 使用Excalidraw内置方法')
  console.log('- 尝试使用scrollToContent')
  console.log('- 或者使用zoomToFit相关API')
  console.log('- 减少自定义计算的复杂性')

  console.log('\n方案3: 分步调整法')
  console.log('- 第一步：确保图片在可视区域内')
  console.log('- 第二步：微调到精确中心位置')
  console.log('- 分解复杂度，逐步调试')

  console.log('\n方案4: 强制居中法')
  console.log('- 直接设置scrollX = imageCenterX - 固定偏移')
  console.log('- 使用硬编码的视口中心偏移')
  console.log('- 优先保证功能，再优化精度')
}

function generateResetCenterApproach() {
  console.log('\n🎯 方案1实现: 重置+居中法')

  const algorithm = `
// 重置+居中算法
function resetAndCenterImage(imageElement, excalidrawAPI) {
  try {
    const currentAppState = excalidrawAPI.getAppState()

    // 1. 计算图片中心
    const imageCenterX = imageElement.x + imageElement.width / 2
    const imageCenterY = imageElement.y + imageElement.height / 2

    // 2. 使用固定的视口尺寸（避免动态获取的问题）
    const FIXED_VIEWPORT_WIDTH = 1200
    const FIXED_VIEWPORT_HEIGHT = 800
    const zoom = currentAppState.zoom.value

    // 3. 直接计算绝对居中位置
    const targetScrollX = imageCenterX - FIXED_VIEWPORT_WIDTH / (2 * zoom)
    const targetScrollY = imageCenterY - FIXED_VIEWPORT_HEIGHT / (2 * zoom)

    // 4. 应用位置
    excalidrawAPI.updateScene({
      appState: {
        ...currentAppState,
        scrollX: targetScrollX,
        scrollY: targetScrollY
      }
    })

    console.log('重置+居中算法执行:', {
      imageCenter: { x: imageCenterX, y: imageCenterY },
      targetScroll: { x: targetScrollX, y: targetScrollY },
      zoom: zoom
    })

  } catch (error) {
    console.error('重置+居中算法失败:', error)
  }
}
`

  console.log(algorithm)
}

function generateExcalidrawAPIApproach() {
  console.log('\n🎯 方案2实现: 使用Excalidraw内置方法')

  const algorithm = `
// 使用Excalidraw内置API
function useBuiltinMethods(imageElement, excalidrawAPI) {
  try {
    // 方法A: 尝试使用scrollToContent
    if (excalidrawAPI.scrollToContent) {
      excalidrawAPI.scrollToContent([imageElement])
      console.log('使用scrollToContent成功')
      return
    }

    // 方法B: 尝试使用zoomToFit
    if (excalidrawAPI.zoomToFit) {
      excalidrawAPI.zoomToFit([imageElement])
      console.log('使用zoomToFit成功')
      return
    }

    // 方法C: 尝试使用updateScene的特殊属性
    const imageBounds = {
      minX: imageElement.x,
      minY: imageElement.y,
      maxX: imageElement.x + imageElement.width,
      maxY: imageElement.y + imageElement.height
    }

    excalidrawAPI.updateScene({
      appState: {
        ...excalidrawAPI.getAppState(),
        // 尝试设置viewportBounds为图片区域
        // 这可能会触发自动居中
      }
    })

  } catch (error) {
    console.error('内置方法失败:', error)
  }
}
`

  console.log(algorithm)
}

function generateStepByStepApproach() {
  console.log('\n🎯 方案3实现: 分步调整法')

  const algorithm = `
// 分步调整算法
function stepByStepCenter(imageElement, excalidrawAPI) {
  try {
    const currentAppState = excalidrawAPI.getAppState()

    // 步骤1: 检查图片是否在可视区域
    const viewportWidth = 1200  // 使用固定值
    const viewportHeight = 800
    const zoom = currentAppState.zoom.value

    const visibleLeft = currentAppState.scrollX
    const visibleTop = currentAppState.scrollY
    const visibleRight = visibleLeft + viewportWidth / zoom
    const visibleBottom = visibleTop + viewportHeight / zoom

    const imageCenterX = imageElement.x + imageElement.width / 2
    const imageCenterY = imageElement.y + imageElement.height / 2

    const imageVisible = (
      imageCenterX >= visibleLeft && imageCenterX <= visibleRight &&
      imageCenterY >= visibleTop && imageCenterY <= visibleBottom
    )

    console.log('步骤1 - 可视性检查:', {
      imageCenter: { x: imageCenterX, y: imageCenterY },
      visibleArea: { left: visibleLeft, top: visibleTop, right: visibleRight, bottom: visibleBottom },
      imageVisible: imageVisible
    })

    // 步骤2: 如果不可视，移动到可视区域
    if (!imageVisible) {
      console.log('步骤2 - 图片不在可视区域，开始移动')

      // 简单粗暴：直接居中
      const targetScrollX = imageCenterX - viewportWidth / (2 * zoom)
      const targetScrollY = imageCenterY - viewportHeight / (2 * zoom)

      excalidrawAPI.updateScene({
        appState: {
          ...currentAppState,
          scrollX: targetScrollX,
          scrollY: targetScrollY
        }
      })

      console.log('步骤2完成 - 移动到:', { x: targetScrollX, y: targetScrollY })
    } else {
      console.log('步骤2跳过 - 图片已在可视区域')
    }

  } catch (error) {
    console.error('分步调整失败:', error)
  }
}
`

  console.log(algorithm)
}

function generateForceCenterApproach() {
  console.log('\n🎯 方案4实现: 强制居中法')

  const algorithm = `
// 强制居中算法（最简单直接）
function forceCenter(imageElement, excalidrawAPI) {
  try {
    const imageCenterX = imageElement.x + imageElement.width / 2
    const imageCenterY = imageElement.y + imageElement.height / 2

    // 使用硬编码的偏移值（基于经验调试）
    const HARDCODED_OFFSET_X = 600  // 假设视口宽度的一半
    const HARDCODED_OFFSET_Y = 400  // 假设视口高度的一半

    const currentAppState = excalidrawAPI.getAppState()
    const zoom = currentAppState.zoom.value

    // 强制居中公式
    const targetScrollX = imageCenterX - HARDCODED_OFFSET_X / zoom
    const targetScrollY = imageCenterY - HARDCODED_OFFSET_Y / zoom

    excalidrawAPI.updateScene({
      appState: {
        ...currentAppState,
        scrollX: targetScrollX,
        scrollY: targetScrollY
      }
    })

    console.log('强制居中完成:', {
      imageCenter: { x: imageCenterX, y: imageCenterY },
      targetScroll: { x: targetScrollX, y: targetScrollY },
      hardcodedOffset: { x: HARDCODED_OFFSET_X, y: HARDCODED_OFFSET_Y },
      zoom: zoom
    })

  } catch (error) {
    console.error('强制居中失败:', error)
  }
}
`

  console.log(algorithm)
}

// 执行分析
analyzePossibleIssues()
designSimpleSolutions()
generateResetCenterApproach()
generateExcalidrawAPIApproach()
generateStepByStepApproach()
generateForceCenterApproach()

console.log('\n' + '='.repeat(60))
console.log('🎯 推荐尝试顺序:')
console.log('1. 先试方案4（强制居中法）- 最简单直接')
console.log('2. 再试方案1（重置+居中法）- 避免复杂计算')
console.log('3. 如果还不行，试方案2（内置方法）')
console.log('4. 最后试方案3（分步调整法）- 便于调试')
console.log('='.repeat(60))
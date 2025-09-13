/**
 * 改进的画布聚焦算法分析
 * 解决新图片不可见的问题
 */

console.log('🔧 改进画布聚焦算法分析')
console.log('='.repeat(60))

/**
 * 问题分析：
 * 1. 新图片生成后不可见，说明自动聚焦失败
 * 2. 可能的原因：
 *    - viewportBounds 数据不准确
 *    - 图片坐标系统理解有误
 *    - 滚动计算方法有问题
 *    - 缩放状态下的计算错误
 */

function analyzeCurrentProblem() {
  console.log('\n❌ 当前问题分析:')
  console.log('1. 新图片生成但不在可视区域')
  console.log('2. 自动聚焦算法未能正确定位')
  console.log('3. 可能是坐标系统理解错误')
  console.log('4. 需要更鲁棒的解决方案')
}

function designImprovedAlgorithm() {
  console.log('\n🎯 改进算法设计:')

  console.log('\n方案1: 使用相对偏移计算')
  console.log('- 不依赖绝对坐标系统')
  console.log('- 基于当前视图中心进行相对移动')
  console.log('- 更容易理解和调试')

  console.log('\n方案2: 使用DOM实际尺寸')
  console.log('- 获取画布DOM元素的真实尺寸')
  console.log('- 避免依赖可能不准确的viewportBounds')
  console.log('- 更接近实际渲染情况')

  console.log('\n方案3: 分步式聚焦')
  console.log('- 先获取当前视图范围')
  console.log('- 计算图片相对于视图的位置')
  console.log('- 逐步调整到中心位置')

  console.log('\n方案4: 使用Excalidraw内置方法')
  console.log('- 尝试使用API提供的内置方法')
  console.log('- 如scrollToContent或fitToContent')
  console.log('- 减少手动计算的复杂性')
}

function implementRelativeOffsetApproach() {
  console.log('\n🔧 实现方案1: 相对偏移方法')

  // 模拟当前状态
  const currentState = {
    scrollX: 100,  // 假设当前滚动位置
    scrollY: 50,
    zoom: 0.61,
    viewportWidth: 1200,
    viewportHeight: 800
  }

  // 新图片信息
  const newImage = {
    x: 300,   // 假设图片位置
    y: 800,   // 这可能解释为什么看不见（Y坐标较大）
    width: 250,
    height: 200
  }

  const imageCenterX = newImage.x + newImage.width / 2
  const imageCenterY = newImage.y + newImage.height / 2

  console.log('当前状态:', currentState)
  console.log('新图片:', newImage)
  console.log('图片中心:', { x: imageCenterX, y: imageCenterY })

  // 当前视图中心的世界坐标
  const currentViewCenterX = currentState.scrollX + currentState.viewportWidth / (2 * currentState.zoom)
  const currentViewCenterY = currentState.scrollY + currentState.viewportHeight / (2 * currentState.zoom)

  console.log('当前视图中心:', { x: currentViewCenterX, y: currentViewCenterY })

  // 需要移动的距离
  const offsetX = imageCenterX - currentViewCenterX
  const offsetY = imageCenterY - currentViewCenterY

  console.log('需要偏移:', { x: offsetX, y: offsetY })

  // 新的滚动位置
  const newScrollX = currentState.scrollX + offsetX
  const newScrollY = currentState.scrollY + offsetY

  console.log('新滚动位置:', { x: newScrollX, y: newScrollY })

  // 验证
  const newViewCenterX = newScrollX + currentState.viewportWidth / (2 * currentState.zoom)
  const newViewCenterY = newScrollY + currentState.viewportHeight / (2 * currentState.zoom)

  console.log('新视图中心:', { x: newViewCenterX, y: newViewCenterY })
  console.log('是否匹配图片中心:', {
    x: Math.abs(newViewCenterX - imageCenterX) < 0.1,
    y: Math.abs(newViewCenterY - imageCenterY) < 0.1
  })
}

function implementDOMBasedApproach() {
  console.log('\n🔧 实现方案2: 基于DOM的方法')

  const pseudoCode = `
// 获取画布DOM元素的实际尺寸
const canvasContainer = document.querySelector('.excalidraw')
const containerRect = canvasContainer.getBoundingClientRect()

// 使用实际DOM尺寸而不是viewportBounds
const realViewportWidth = containerRect.width
const realViewportHeight = containerRect.height

// 重新计算滚动位置
const newScrollX = imageCenterX - realViewportWidth / (2 * zoom)
const newScrollY = imageCenterY - realViewportHeight / (2 * zoom)
`

  console.log('伪代码:', pseudoCode)
}

function implementStepByStepApproach() {
  console.log('\n🔧 实现方案3: 分步式方法')

  const pseudoCode = `
// 第1步：获取当前可视区域边界
const visibleArea = {
  left: scrollX,
  top: scrollY,
  right: scrollX + viewportWidth / zoom,
  bottom: scrollY + viewportHeight / zoom
}

// 第2步：检查图片是否在可视区域内
const imageInView = (
  imageCenterX >= visibleArea.left &&
  imageCenterX <= visibleArea.right &&
  imageCenterY >= visibleArea.top &&
  imageCenterY <= visibleArea.bottom
)

// 第3步：如果不在可视区域，计算移动距离
if (!imageInView) {
  const targetScrollX = imageCenterX - viewportWidth / (2 * zoom)
  const targetScrollY = imageCenterY - viewportHeight / (2 * zoom)

  // 应用滚动
  excalidrawAPI.updateScene({
    appState: { scrollX: targetScrollX, scrollY: targetScrollY }
  })
}
`

  console.log('分步式伪代码:', pseudoCode)
}

function generateRobustSolution() {
  console.log('\n🎯 生成鲁棒解决方案:')

  const solution = `
// 鲁棒的自动聚焦算法
function robustAutoFocus(imageElement, excalidrawAPI) {
  try {
    // 1. 获取当前状态
    const appState = excalidrawAPI.getAppState()

    // 2. 尝试多种方法获取视口尺寸
    let viewportWidth, viewportHeight

    // 方法A: 使用viewportBounds
    if (appState.viewportBounds) {
      viewportWidth = appState.viewportBounds.width
      viewportHeight = appState.viewportBounds.height
    } else {
      // 方法B: 使用DOM元素
      const canvasEl = document.querySelector('.excalidraw')
      if (canvasEl) {
        const rect = canvasEl.getBoundingClientRect()
        viewportWidth = rect.width
        viewportHeight = rect.height
      } else {
        // 方法C: 使用默认值
        viewportWidth = 1200
        viewportHeight = 800
      }
    }

    // 3. 计算图片中心
    const imageCenterX = imageElement.x + imageElement.width / 2
    const imageCenterY = imageElement.y + imageElement.height / 2

    // 4. 计算目标滚动位置（使用相对偏移方法）
    const currentViewCenterX = appState.scrollX + viewportWidth / (2 * appState.zoom.value)
    const currentViewCenterY = appState.scrollY + viewportHeight / (2 * appState.zoom.value)

    const offsetX = imageCenterX - currentViewCenterX
    const offsetY = imageCenterY - currentViewCenterY

    const targetScrollX = appState.scrollX + offsetX
    const targetScrollY = appState.scrollY + offsetY

    // 5. 应用滚动位置
    excalidrawAPI.updateScene({
      appState: {
        ...appState,
        scrollX: targetScrollX,
        scrollY: targetScrollY
      }
    })

    // 6. 详细日志
    console.log('鲁棒聚焦算法执行:', {
      imageCenter: { x: imageCenterX, y: imageCenterY },
      currentViewCenter: { x: currentViewCenterX, y: currentViewCenterY },
      offset: { x: offsetX, y: offsetY },
      targetScroll: { x: targetScrollX, y: targetScrollY },
      viewport: { width: viewportWidth, height: viewportHeight }
    })

  } catch (error) {
    console.error('自动聚焦失败:', error)
  }
}
`

  console.log(solution)
}

// 执行分析
analyzeCurrentProblem()
designImprovedAlgorithm()
implementRelativeOffsetApproach()
implementDOMBasedApproach()
implementStepByStepApproach()
generateRobustSolution()

console.log('\n' + '='.repeat(60))
console.log('🎯 推荐使用相对偏移方法 + DOM尺寸获取的组合方案')
console.log('这样可以避免依赖可能不准确的viewportBounds')
console.log('同时使用更直观的相对移动逻辑')
console.log('='.repeat(60))
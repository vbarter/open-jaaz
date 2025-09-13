/**
 * 深入分析画布中心坐标问题
 * 找出无法准确获取画布中心的根本原因
 */

console.log('🔍 深入分析画布中心坐标问题')
console.log('='.repeat(70))

function analyzeCoreProblem() {
  console.log('\n❌ 根本问题分析:')
  console.log('1. 硬编码偏移值(600,400)是基于假设的，不是真实测量的')
  console.log('2. 没有获取画布DOM元素的真实尺寸和位置')
  console.log('3. 没有考虑画布在页面中的实际位置')
  console.log('4. viewportBounds可能不代表用户看到的实际画布区域')
  console.log('5. 缩放状态下的坐标变换可能理解有误')
}

function designAccurateSolution() {
  console.log('\n🎯 精确解决方案设计:')

  console.log('\n方案1: 动态获取真实画布尺寸')
  const solution1 = `
// 获取画布容器的真实尺寸和位置
function getRealCanvasInfo() {
  const canvasContainer = document.querySelector('.excalidraw')
  if (!canvasContainer) return null

  const rect = canvasContainer.getBoundingClientRect()

  return {
    // DOM信息
    domWidth: rect.width,
    domHeight: rect.height,
    domLeft: rect.left,
    domTop: rect.top,

    // 计算真实的画布中心偏移
    realCenterOffsetX: rect.width / 2,
    realCenterOffsetY: rect.height / 2
  }
}
`
  console.log(solution1)

  console.log('\n方案2: 使用当前视图中心作为参考')
  const solution2 = `
// 基于当前视图状态计算真实中心
function getCurrentViewCenter(appState) {
  // 获取当前可视区域的世界坐标范围
  const zoom = appState.zoom.value
  const scrollX = appState.scrollX
  const scrollY = appState.scrollY

  // 获取真实画布尺寸
  const canvasInfo = getRealCanvasInfo()
  if (!canvasInfo) return null

  // 计算当前视图中心的世界坐标
  const viewCenterWorldX = scrollX + canvasInfo.realCenterOffsetX / zoom
  const viewCenterWorldY = scrollY + canvasInfo.realCenterOffsetY / zoom

  return {
    worldX: viewCenterWorldX,
    worldY: viewCenterWorldY,
    canvasInfo: canvasInfo
  }
}
`
  console.log(solution2)

  console.log('\n方案3: 精确居中算法')
  const solution3 = `
// 精确居中算法
function preciseCenter(imageElement, excalidrawAPI) {
  const appState = excalidrawAPI.getAppState()

  // 1. 获取图片中心
  const imageCenterX = imageElement.x + imageElement.width / 2
  const imageCenterY = imageElement.y + imageElement.height / 2

  // 2. 获取真实画布信息
  const canvasInfo = getRealCanvasInfo()
  if (!canvasInfo) return false

  // 3. 计算精确的滚动位置
  // 要使图片居中：imageCenterX = scrollX + canvasWidth/(2*zoom)
  // 所以：scrollX = imageCenterX - canvasWidth/(2*zoom)
  const targetScrollX = imageCenterX - canvasInfo.realCenterOffsetX / appState.zoom.value
  const targetScrollY = imageCenterY - canvasInfo.realCenterOffsetY / appState.zoom.value

  // 4. 应用滚动位置
  excalidrawAPI.updateScene({
    appState: {
      ...appState,
      scrollX: targetScrollX,
      scrollY: targetScrollY
    }
  })

  return {
    targetScrollX,
    targetScrollY,
    canvasInfo,
    imageCenterX,
    imageCenterY
  }
}
`
  console.log(solution3)
}

function identifyTestingStrategy() {
  console.log('\n🧪 测试验证策略:')

  console.log('步骤1: 获取画布真实尺寸')
  console.log('- 使用getBoundingClientRect获取实际DOM尺寸')
  console.log('- 对比viewportBounds和DOM尺寸的差异')
  console.log('- 输出详细的尺寸信息便于调试')

  console.log('\n步骤2: 验证中心计算')
  console.log('- 计算当前视图中心的世界坐标')
  console.log('- 验证 scrollX + centerOffset/zoom = viewCenterX')
  console.log('- 确保公式的数学正确性')

  console.log('\n步骤3: 实际测试')
  console.log('- 手动将视图移动到已知位置')
  console.log('- 验证计算出的中心坐标是否正确')
  console.log('- 调整算法直到完全准确')
}

function generateImplementationCode() {
  console.log('\n🛠️ 实现代码模板:')

  const implementationCode = `
// 完整的精确居中实现
function implementPreciseAutoFocus(imageElement, excalidrawAPI) {
  console.log('🎯 === 精确居中算法开始 ===')

  try {
    // 1. 获取当前状态
    const appState = excalidrawAPI.getAppState()

    // 2. 获取真实画布信息
    const canvasContainer = document.querySelector('.excalidraw')
    if (!canvasContainer) {
      console.error('无法找到画布容器')
      return false
    }

    const rect = canvasContainer.getBoundingClientRect()

    console.log('画布真实信息:', {
      domWidth: rect.width,
      domHeight: rect.height,
      domLeft: rect.left,
      domTop: rect.top,
      viewportBounds: appState.viewportBounds,
      currentZoom: appState.zoom.value,
      currentScroll: { x: appState.scrollX, y: appState.scrollY }
    })

    // 3. 计算图片中心
    const imageCenterX = imageElement.x + imageElement.width / 2
    const imageCenterY = imageElement.y + imageElement.height / 2

    // 4. 计算真实的中心偏移（使用DOM实际尺寸）
    const realCenterOffsetX = rect.width / 2
    const realCenterOffsetY = rect.height / 2

    console.log('中心计算信息:', {
      imageCenterX,
      imageCenterY,
      realCenterOffsetX,
      realCenterOffsetY,
      zoom: appState.zoom.value
    })

    // 5. 计算精确滚动位置
    const targetScrollX = imageCenterX - realCenterOffsetX / appState.zoom.value
    const targetScrollY = imageCenterY - realCenterOffsetY / appState.zoom.value

    console.log('精确滚动计算:', {
      公式: 'scrollX = imageCenterX - realCenterOffsetX / zoom',
      targetScrollX,
      targetScrollY,
      验证公式: targetScrollX + realCenterOffsetX / appState.zoom.value + ' = ' + imageCenterX
    })

    // 6. 应用滚动位置
    excalidrawAPI.updateScene({
      appState: {
        ...appState,
        scrollX: targetScrollX,
        scrollY: targetScrollY
      }
    })

    // 7. 验证结果
    setTimeout(() => {
      const verifyState = excalidrawAPI.getAppState()
      const verifyViewCenterX = verifyState.scrollX + realCenterOffsetX / verifyState.zoom.value
      const verifyViewCenterY = verifyState.scrollY + realCenterOffsetY / verifyState.zoom.value

      console.log('精确居中验证:', {
        实际scrollX: verifyState.scrollX,
        实际scrollY: verifyState.scrollY,
        预期scrollX: targetScrollX,
        预期scrollY: targetScrollY,
        计算出的视图中心X: verifyViewCenterX,
        计算出的视图中心Y: verifyViewCenterY,
        图片中心X: imageCenterX,
        图片中心Y: imageCenterY,
        X轴误差: Math.abs(verifyViewCenterX - imageCenterX),
        Y轴误差: Math.abs(verifyViewCenterY - imageCenterY),
        居中成功: Math.abs(verifyViewCenterX - imageCenterX) < 1 && Math.abs(verifyViewCenterY - imageCenterY) < 1
      })

      console.log('🎯 === 精确居中算法结束 ===')
    }, 50)

  } catch (error) {
    console.error('精确居中算法失败:', error)
  }
}
`

  console.log(implementationCode)
}

// 执行分析
analyzeCoreProblem()
designAccurateSolution()
identifyTestingStrategy()
generateImplementationCode()

console.log('\n' + '='.repeat(70))
console.log('🎯 核心问题总结:')
console.log('1. 必须获取画布DOM的真实尺寸，不能依赖假设')
console.log('2. 使用 getBoundingClientRect() 获取准确的画布信息')
console.log('3. 公式: scrollX = imageCenterX - realCanvasWidth/(2*zoom)')
console.log('4. 关键是用真实DOM尺寸替换硬编码的偏移值')
console.log('='.repeat(70))
/**
 * ACM-Style Canvas Coordinate System Analysis
 * 深度分析Excalidraw画布坐标系统和当前可视区域
 */

console.log('🏆 ACM-Style Canvas Coordinate Analysis')
console.log('='.repeat(80))

/**
 * 问题分析：
 * 1. 图片现在出现在右侧，而不是中心
 * 2. 说明我的滚动计算依然有误
 * 3. 需要准确分析当前可视画布区域的世界坐标范围
 */

function analyzeCanvasCoordinateSystem() {
  console.log('\n📐 Excalidraw坐标系统深度分析:')

  // 模拟当前状态 (基于截图的61%缩放)
  const currentState = {
    zoom: 0.61,
    scrollX: 0,    // 假设当前滚动位置
    scrollY: 0,
    viewportWidth: 1200,  // 画布容器宽度
    viewportHeight: 800   // 画布容器高度
  }

  console.log('当前状态:', currentState)

  // 计算当前可视的世界坐标范围
  const visibleWorldArea = {
    left: currentState.scrollX,
    top: currentState.scrollY,
    right: currentState.scrollX + currentState.viewportWidth / currentState.zoom,
    bottom: currentState.scrollY + currentState.viewportHeight / currentState.zoom,
    width: currentState.viewportWidth / currentState.zoom,
    height: currentState.viewportHeight / currentState.zoom,
    centerX: currentState.scrollX + (currentState.viewportWidth / currentState.zoom) / 2,
    centerY: currentState.scrollY + (currentState.viewportHeight / currentState.zoom) / 2
  }

  console.log('当前可视世界坐标范围:', visibleWorldArea)
  console.log(`可视区域: (${visibleWorldArea.left}, ${visibleWorldArea.top}) 到 (${visibleWorldArea.right}, ${visibleWorldArea.bottom})`)
  console.log(`可视区域中心: (${visibleWorldArea.centerX}, ${visibleWorldArea.centerY})`)

  return visibleWorldArea
}

function designCorrectCenteringAlgorithm() {
  console.log('\n🎯 重新设计居中算法:')

  // 假设新生成的图片位置 (参考截图中右侧山的图片)
  const newImage = {
    x: 800,      // 估计的x坐标
    y: 200,      // 估计的y坐标
    width: 300,  // 估计的宽度
    height: 400  // 估计的高度
  }

  const imageCenterX = newImage.x + newImage.width / 2
  const imageCenterY = newImage.y + newImage.height / 2

  console.log('新图片信息:', newImage)
  console.log(`图片中心: (${imageCenterX}, ${imageCenterY})`)

  // 当前状态
  const currentState = {
    zoom: 0.61,
    scrollX: 0,
    scrollY: 0,
    viewportWidth: 1200,
    viewportHeight: 800
  }

  // 方法1: 直接计算 (我之前用的方法)
  const method1_scrollX = imageCenterX - currentState.viewportWidth / (2 * currentState.zoom)
  const method1_scrollY = imageCenterY - currentState.viewportHeight / (2 * currentState.zoom)

  console.log('\n方法1 - 直接计算:')
  console.log(`计算得到的scrollX: ${method1_scrollX}`)
  console.log(`计算得到的scrollY: ${method1_scrollY}`)

  // 验证方法1: 用这个scroll值，视口中心是否等于图片中心？
  const method1_viewportCenterX = method1_scrollX + currentState.viewportWidth / (2 * currentState.zoom)
  const method1_viewportCenterY = method1_scrollY + currentState.viewportHeight / (2 * currentState.zoom)

  console.log(`验证 - 视口中心: (${method1_viewportCenterX}, ${method1_viewportCenterY})`)
  console.log(`是否匹配图片中心: ${Math.abs(method1_viewportCenterX - imageCenterX) < 0.1 && Math.abs(method1_viewportCenterY - imageCenterY) < 0.1 ? '✅' : '❌'}`)

  // 方法2: 基于当前可视区域中心的偏移计算
  const currentVisibleCenterX = currentState.scrollX + currentState.viewportWidth / (2 * currentState.zoom)
  const currentVisibleCenterY = currentState.scrollY + currentState.viewportHeight / (2 * currentState.zoom)

  const offsetX = imageCenterX - currentVisibleCenterX
  const offsetY = imageCenterY - currentVisibleCenterY

  const method2_scrollX = currentState.scrollX + offsetX
  const method2_scrollY = currentState.scrollY + offsetY

  console.log('\n方法2 - 基于当前可视区域偏移:')
  console.log(`当前可视中心: (${currentVisibleCenterX}, ${currentVisibleCenterY})`)
  console.log(`需要偏移: (${offsetX}, ${offsetY})`)
  console.log(`计算得到的scrollX: ${method2_scrollX}`)
  console.log(`计算得到的scrollY: ${method2_scrollY}`)

  // 验证方法2
  const method2_viewportCenterX = method2_scrollX + currentState.viewportWidth / (2 * currentState.zoom)
  const method2_viewportCenterY = method2_scrollY + currentState.viewportHeight / (2 * currentState.zoom)

  console.log(`验证 - 视口中心: (${method2_viewportCenterX}, ${method2_viewportCenterY})`)
  console.log(`是否匹配图片中心: ${Math.abs(method2_viewportCenterX - imageCenterX) < 0.1 && Math.abs(method2_viewportCenterY - imageCenterY) < 0.1 ? '✅' : '❌'}`)

  console.log('\n📊 方法比较:')
  console.log(`方法1和方法2的scrollX差异: ${Math.abs(method1_scrollX - method2_scrollX)}`)
  console.log(`方法1和方法2的scrollY差异: ${Math.abs(method1_scrollY - method2_scrollY)}`)

  return {
    method1: { scrollX: method1_scrollX, scrollY: method1_scrollY },
    method2: { scrollX: method2_scrollX, scrollY: method2_scrollY }
  }
}

function identifyRootCause() {
  console.log('\n🔍 根本原因分析:')

  console.log('可能的问题:')
  console.log('1. ❓ viewportBounds获取的尺寸不准确')
  console.log('2. ❓ 需要考虑画布容器的实际DOM尺寸')
  console.log('3. ❓ Excalidraw内部可能有额外的坐标变换')
  console.log('4. ❓ 缩放状态下的计算可能需要特殊处理')

  console.log('\n💡 改进方案:')
  console.log('1. 🔧 添加详细的调试日志，输出所有中间计算值')
  console.log('2. 🔧 尝试获取画布DOM元素的实际尺寸')
  console.log('3. 🔧 在不同缩放级别下测试算法')
  console.log('4. 🔧 对比当前scroll值和计算出的目标scroll值')
}

function generateDebuggingCode() {
  console.log('\n🛠️ 生成调试代码:')

  const debugCode = `
// 在实际代码中添加的详细调试信息
console.log('🔍 详细调试信息:')
console.log('步骤1 - 当前状态:', {
  zoom: currentAppState.zoom.value,
  scrollX: currentAppState.scrollX,
  scrollY: currentAppState.scrollY,
  viewportBounds: currentAppState.viewportBounds
})

console.log('步骤2 - 图片信息:', {
  imageX: unlockedImageElement.x,
  imageY: unlockedImageElement.y,
  imageWidth: unlockedImageElement.width,
  imageHeight: unlockedImageElement.height,
  imageCenterX: imageCenterX,
  imageCenterY: imageCenterY
})

console.log('步骤3 - 当前可视区域:', {
  visibleLeft: currentAppState.scrollX,
  visibleTop: currentAppState.scrollY,
  visibleRight: currentAppState.scrollX + viewportBounds.width / currentAppState.zoom.value,
  visibleBottom: currentAppState.scrollY + viewportBounds.height / currentAppState.zoom.value,
  visibleCenterX: currentAppState.scrollX + viewportBounds.width / (2 * currentAppState.zoom.value),
  visibleCenterY: currentAppState.scrollY + viewportBounds.height / (2 * currentAppState.zoom.value)
})

console.log('步骤4 - 计算结果:', {
  targetScrollX: newScrollX,
  targetScrollY: newScrollY,
  预期新的视口中心X: newScrollX + viewportBounds.width / (2 * currentAppState.zoom.value),
  预期新的视口中心Y: newScrollY + viewportBounds.height / (2 * currentAppState.zoom.value)
})`

  console.log(debugCode)
}

// 执行分析
analyzeCanvasCoordinateSystem()
designCorrectCenteringAlgorithm()
identifyRootCause()
generateDebuggingCode()

console.log('\n' + '='.repeat(80))
console.log('🎯 分析完成！接下来需要:')
console.log('1. 在实际代码中添加详细调试信息')
console.log('2. 运行并观察实际的坐标值')
console.log('3. 根据调试结果调整算法')
console.log('='.repeat(80))
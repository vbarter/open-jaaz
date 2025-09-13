/**
 * 深度调试坐标计算错误的问题
 * 分析为什么聚焦到了错误的位置
 */

console.log('🐛 深度调试坐标计算错误')
console.log('='.repeat(70))

function analyzeCoordinateMismatch() {
  console.log('\n❌ 问题现象分析:')
  console.log('现象: 新图片在第三排第4张位置，但聚焦却跑到第一排第一张')
  console.log('说明: 坐标计算算法存在根本性错误')

  console.log('\n🔍 可能的错误原因:')
  console.log('1. 对Excalidraw scrollX/scrollY含义理解错误')
  console.log('2. getBoundingClientRect()获取的不是实际绘制区域')
  console.log('3. 画布有偏移量或边距未考虑')
  console.log('4. zoom计算方式不正确')
  console.log('5. 坐标系统的原点位置理解错误')
}

function reanalyzeExcalidrawCoordinates() {
  console.log('\n📐 重新分析Excalidraw坐标系统:')

  console.log('\nExcalidraw坐标系统组成:')
  console.log('1. 世界坐标系 - 无限画布上元素的绝对位置(x, y)')
  console.log('2. 视口坐标系 - 用户看到的区域')
  console.log('3. 滚动偏移 - scrollX, scrollY决定视口在世界坐标中的位置')
  console.log('4. 缩放因子 - zoom影响视口覆盖的世界坐标范围')

  console.log('\n关键理解:')
  console.log('- scrollX, scrollY表示视口左上角在世界坐标系中的位置')
  console.log('- 视口中心的世界坐标 = (scrollX + viewportWidth/(2*zoom), scrollY + viewportHeight/(2*zoom))')
  console.log('- 要让某点居中: scrollX = 目标点X - viewportWidth/(2*zoom)')

  console.log('\n可能的误区:')
  console.log('❌ 误区1: 以为scrollX是视口中心的世界坐标')
  console.log('❌ 误区2: 以为viewportWidth是屏幕宽度')
  console.log('❌ 误区3: 没考虑画布容器内的实际绘制区域')
  console.log('❌ 误区4: zoom的作用理解错误')
}

function designDebugStrategy() {
  console.log('\n🛠️ 调试策略设计:')

  console.log('\n第一步: 输出所有关键数值')
  const debugStep1 = `
// 输出所有关键信息
console.log('=== 完整状态调试 ===')
console.log('1. 图片信息:', {
  x: imageElement.x,
  y: imageElement.y,
  width: imageElement.width,
  height: imageElement.height,
  centerX: imageElement.x + imageElement.width / 2,
  centerY: imageElement.y + imageElement.height / 2
})

console.log('2. 当前视图状态:', {
  scrollX: appState.scrollX,
  scrollY: appState.scrollY,
  zoom: appState.zoom.value,
  viewportBounds: appState.viewportBounds
})

console.log('3. DOM信息:', {
  canvasRect: canvasContainer.getBoundingClientRect(),
  windowSize: { width: window.innerWidth, height: window.innerHeight }
})

console.log('4. 计算出的当前视图中心:', {
  currentViewCenterX: appState.scrollX + canvasRect.width / (2 * appState.zoom.value),
  currentViewCenterY: appState.scrollY + canvasRect.height / (2 * appState.zoom.value)
})
`
  console.log(debugStep1)

  console.log('\n第二步: 测试简单场景')
  const debugStep2 = `
// 测试1: 尝试聚焦到原点(0,0)
function testFocusToOrigin() {
  const targetScrollX = 0 - canvasRect.width / (2 * zoom)
  const targetScrollY = 0 - canvasRect.height / (2 * zoom)

  console.log('测试聚焦到原点(0,0):', {
    targetScrollX,
    targetScrollY,
    预期结果: '原点应该出现在视口中心'
  })
}

// 测试2: 尝试聚焦到当前视图中心
function testFocusToCurrentCenter() {
  const currentCenterX = appState.scrollX + canvasRect.width / (2 * zoom)
  const currentCenterY = appState.scrollY + canvasRect.height / (2 * zoom)

  const targetScrollX = currentCenterX - canvasRect.width / (2 * zoom)
  const targetScrollY = currentCenterY - canvasRect.height / (2 * zoom)

  console.log('测试聚焦到当前中心:', {
    currentCenterX,
    currentCenterY,
    targetScrollX,
    targetScrollY,
    预期结果: '视图应该不变'
  })
}
`
  console.log(debugStep2)

  console.log('\n第三步: 逐步验证算法')
  const debugStep3 = `
// 验证算法的每个环节
function validateAlgorithmStep() {
  // 1. 验证视口中心计算
  const calculatedCenterX = scrollX + viewportWidth / (2 * zoom)
  const calculatedCenterY = scrollY + viewportHeight / (2 * zoom)

  // 2. 验证目标scroll计算
  const targetScrollX = imageCenterX - viewportWidth / (2 * zoom)
  const targetScrollY = imageCenterY - viewportHeight / (2 * zoom)

  // 3. 验证结果
  const resultCenterX = targetScrollX + viewportWidth / (2 * zoom)
  const resultCenterY = targetScrollY + viewportHeight / (2 * zoom)

  console.log('算法验证:', {
    imageCenterX,
    imageCenterY,
    targetScrollX,
    targetScrollY,
    resultCenterX,
    resultCenterY,
    X轴匹配: Math.abs(resultCenterX - imageCenterX) < 0.1,
    Y轴匹配: Math.abs(resultCenterY - imageCenterY) < 0.1
  })
}
`
  console.log(debugStep3)
}

function generateAlternativeApproaches() {
  console.log('\n🔄 备选方案设计:')

  console.log('\n方案1: 相对移动法')
  const approach1 = `
// 基于当前位置的相对移动
function relativeMovementApproach() {
  // 1. 计算当前视图中心
  const currentCenterX = scrollX + viewportWidth / (2 * zoom)
  const currentCenterY = scrollY + viewportHeight / (2 * zoom)

  // 2. 计算需要移动的距离
  const deltaX = imageCenterX - currentCenterX
  const deltaY = imageCenterY - currentCenterY

  // 3. 应用相对移动
  const newScrollX = scrollX + deltaX
  const newScrollY = scrollY + deltaY

  console.log('相对移动法:', {
    currentCenter: { x: currentCenterX, y: currentCenterY },
    imageCenter: { x: imageCenterX, y: imageCenterY },
    delta: { x: deltaX, y: deltaY },
    newScroll: { x: newScrollX, y: newScrollY }
  })
}
`
  console.log(approach1)

  console.log('\n方案2: 逐步调试法')
  const approach2 = `
// 分步骤调试，每步验证
function stepByStepDebugApproach() {
  console.log('步骤1: 当前状态')
  console.log('当前scroll:', { x: scrollX, y: scrollY })
  console.log('当前zoom:', zoom)

  console.log('步骤2: 画布信息')
  const rect = canvasContainer.getBoundingClientRect()
  console.log('画布DOM尺寸:', { width: rect.width, height: rect.height })

  console.log('步骤3: 当前视图范围')
  const visibleLeft = scrollX
  const visibleTop = scrollY
  const visibleRight = scrollX + rect.width / zoom
  const visibleBottom = scrollY + rect.height / zoom
  console.log('当前可视世界坐标范围:', {
    left: visibleLeft, top: visibleTop,
    right: visibleRight, bottom: visibleBottom
  })

  console.log('步骤4: 图片位置检查')
  console.log('图片是否在可视范围:', {
    x在范围内: imageCenterX >= visibleLeft && imageCenterX <= visibleRight,
    y在范围内: imageCenterY >= visibleTop && imageCenterY <= visibleBottom
  })
}
`
  console.log(approach2)

  console.log('\n方案3: 保守估算法')
  const approach3 = `
// 使用更保守的估算方法
function conservativeApproach() {
  // 1. 使用固定的视口尺寸估算
  const ESTIMATED_VIEWPORT_WIDTH = 1000
  const ESTIMATED_VIEWPORT_HEIGHT = 600

  // 2. 计算保守的scroll值
  const conservativeScrollX = imageCenterX - ESTIMATED_VIEWPORT_WIDTH / (2 * zoom)
  const conservativeScrollY = imageCenterY - ESTIMATED_VIEWPORT_HEIGHT / (2 * zoom)

  console.log('保守估算法:', {
    估算视口尺寸: { width: ESTIMATED_VIEWPORT_WIDTH, height: ESTIMATED_VIEWPORT_HEIGHT },
    计算结果: { x: conservativeScrollX, y: conservativeScrollY }
  })
}
`
  console.log(approach3)
}

// 执行分析
analyzeCoordinateMismatch()
reanalyzeExcalidrawCoordinates()
designDebugStrategy()
generateAlternativeApproaches()

console.log('\n' + '='.repeat(70))
console.log('🎯 下一步行动计划:')
console.log('1. 在实际代码中添加完整的调试信息输出')
console.log('2. 先测试简单场景（如聚焦到原点）验证理解')
console.log('3. 如果基础理解正确，逐步调试复杂场景')
console.log('4. 如果基础理解错误，尝试备选方案')
console.log('='.repeat(70))
/**
 * 基于相对位置变化的算法分析
 * 摒弃复杂的绝对坐标计算，采用简单的相对移动
 */

console.log('🔄 相对位置变化算法分析')
console.log('='.repeat(70))

function analyzeRelativeMovementApproach() {
  console.log('\n💡 相对移动算法的核心思想:')
  console.log('1. 不计算复杂的绝对坐标')
  console.log('2. 直接计算"需要移动多少"而不是"移动到哪里"')
  console.log('3. 基于当前状态的相对偏移')
  console.log('4. 更直观，更不容易出错')

  console.log('\n🎯 算法步骤:')
  console.log('步骤1: 获取图片在当前视口中的位置')
  console.log('步骤2: 计算图片中心到视口中心的距离')
  console.log('步骤3: 直接移动这个距离')
}

function designRelativeMovementAlgorithm() {
  console.log('\n🛠️ 相对移动算法设计:')

  const algorithm = `
// 相对移动算法
function relativeMovementCenter(imageElement, excalidrawAPI) {
  const appState = excalidrawAPI.getAppState()

  // 1. 获取画布信息
  const canvasContainer = document.querySelector('.excalidraw')
  const rect = canvasContainer.getBoundingClientRect()
  const zoom = appState.zoom.value

  // 2. 计算图片中心的世界坐标
  const imageCenterX = imageElement.x + imageElement.width / 2
  const imageCenterY = imageElement.y + imageElement.height / 2

  // 3. 计算当前视口中心的世界坐标
  const currentViewCenterX = appState.scrollX + rect.width / (2 * zoom)
  const currentViewCenterY = appState.scrollY + rect.height / (2 * zoom)

  // 4. 计算需要移动的距离（相对偏移）
  const deltaX = imageCenterX - currentViewCenterX
  const deltaY = imageCenterY - currentViewCenterY

  // 5. 应用相对移动
  const newScrollX = appState.scrollX + deltaX
  const newScrollY = appState.scrollY + deltaY

  console.log('相对移动算法:', {
    当前视图中心: { x: currentViewCenterX, y: currentViewCenterY },
    图片中心: { x: imageCenterX, y: imageCenterY },
    需要移动的距离: { x: deltaX, y: deltaY },
    当前scroll: { x: appState.scrollX, y: appState.scrollY },
    新scroll: { x: newScrollX, y: newScrollY }
  })

  return { newScrollX, newScrollY }
}
`

  console.log(algorithm)
}

function compareApproaches() {
  console.log('\n📊 算法对比:')

  console.log('\n❌ 之前的绝对坐标方法:')
  console.log('- 复杂: 需要理解Excalidraw坐标系统的细节')
  console.log('- 容易出错: 对scrollX/scrollY含义的理解可能错误')
  console.log('- 难调试: 中间计算步骤多，难以定位问题')

  console.log('\n✅ 新的相对移动方法:')
  console.log('- 简单: 只需要计算"移动多少"')
  console.log('- 直观: 基于当前位置的相对变化')
  console.log('- 可靠: 不依赖对坐标系统的复杂理解')
  console.log('- 易调试: 逻辑清晰，步骤简单')
}

function generateTestScenarios() {
  console.log('\n🧪 测试场景设计:')

  console.log('\n场景1: 图片在视口右侧')
  const scenario1 = `
// 当前视口中心: (500, 400)
// 图片中心: (800, 400)
// 需要向右移动: 800 - 500 = 300
// 新scroll: currentScrollX + 300
`
  console.log(scenario1)

  console.log('\n场景2: 图片在视口下方')
  const scenario2 = `
// 当前视口中心: (500, 400)
// 图片中心: (500, 800)
// 需要向下移动: 800 - 400 = 400
// 新scroll: currentScrollY + 400
`
  console.log(scenario2)

  console.log('\n场景3: 图片在视口左上方')
  const scenario3 = `
// 当前视口中心: (500, 400)
// 图片中心: (200, 200)
// 需要向左上移动: (200-500, 200-400) = (-300, -200)
// 新scroll: (currentScrollX - 300, currentScrollY - 200)
`
  console.log(scenario3)
}

function generateSimplifiedImplementation() {
  console.log('\n🎯 简化实现代码:')

  const simplifiedCode = `
// 极简相对移动算法
console.log('🔄 === 相对移动算法开始 ===')

// 1. 基础信息获取
const appState = excalidrawAPI.getAppState()
const canvasContainer = document.querySelector('.excalidraw')
const rect = canvasContainer.getBoundingClientRect()
const zoom = appState.zoom.value

// 2. 关键坐标计算
const imageCenterX = imageElement.x + imageElement.width / 2
const imageCenterY = imageElement.y + imageElement.height / 2
const viewCenterX = appState.scrollX + rect.width / (2 * zoom)
const viewCenterY = appState.scrollY + rect.height / (2 * zoom)

console.log('当前状态:', {
  图片中心: { x: imageCenterX, y: imageCenterY },
  视口中心: { x: viewCenterX, y: viewCenterY },
  当前scroll: { x: appState.scrollX, y: appState.scrollY }
})

// 3. 相对移动计算
const moveX = imageCenterX - viewCenterX
const moveY = imageCenterY - viewCenterY
const newScrollX = appState.scrollX + moveX
const newScrollY = appState.scrollY + moveY

console.log('移动计算:', {
  需要移动: { x: moveX, y: moveY },
  新scroll: { x: newScrollX, y: newScrollY }
})

// 4. 应用移动
excalidrawAPI.updateScene({
  appState: {
    ...appState,
    scrollX: newScrollX,
    scrollY: newScrollY
  }
})

console.log('🔄 === 相对移动算法结束 ===')
`

  console.log(simplifiedCode)
}

// 执行分析
analyzeRelativeMovementApproach()
designRelativeMovementAlgorithm()
compareApproaches()
generateTestScenarios()
generateSimplifiedImplementation()

console.log('\n' + '='.repeat(70))
console.log('🎯 总结:')
console.log('1. 相对移动算法更简单、更可靠')
console.log('2. 核心思想: currentScroll + (imageCenter - viewCenter)')
console.log('3. 避免复杂的坐标系统理解')
console.log('4. 基于当前状态的直接偏移计算')
console.log('='.repeat(70))
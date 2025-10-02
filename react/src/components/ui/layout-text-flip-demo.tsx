// 这是一个展示 LayoutTextFlip 组件不同效果的演示页面
// 可以用于测试和预览不同的配置

import { LayoutTextFlip, LayoutTextFlipAdvanced } from './layout-text-flip'

export function LayoutTextFlipDemo() {
  return (
    <div className="flex flex-col gap-8 p-8">
      {/* 基础示例 */}
      <div className="text-center">
        <h3 className="text-sm text-gray-500 mb-2">基础效果</h3>
        <LayoutTextFlip
          text="Welcome to "
          words={["MagicArt!", "Creative Space!", "Art Studio!"]}
          duration={3000}
        />
      </div>

      {/* 渐变色效果 */}
      <div className="text-center">
        <h3 className="text-sm text-gray-500 mb-2">渐变色效果</h3>
        <LayoutTextFlip
          text="Build "
          words={["Amazing!", "Beautiful!", "Powerful!"]}
          duration={2500}
          wordClassName="bg-gradient-to-r from-purple-600 via-pink-600 to-red-600 bg-clip-text text-transparent"
        />
      </div>

      {/* 高级版 - Spring 动画 */}
      <div className="text-center">
        <h3 className="text-sm text-gray-500 mb-2">Spring 动画</h3>
        <LayoutTextFlipAdvanced
          text="Create "
          words={["Landing Pages", "Dashboards", "Applications"]}
          duration={3000}
          animationType="spring"
        />
      </div>

      {/* 高级版 - Tween 动画 */}
      <div className="text-center">
        <h3 className="text-sm text-gray-500 mb-2">Tween 动画</h3>
        <LayoutTextFlipAdvanced
          text="Design "
          words={["Interfaces", "Experiences", "Solutions"]}
          duration={3000}
          animationType="tween"
        />
      </div>

      {/* 高级版 - Inertia 动画 */}
      <div className="text-center">
        <h3 className="text-sm text-gray-500 mb-2">Inertia 动画</h3>
        <LayoutTextFlipAdvanced
          text="Explore "
          words={["Innovation", "Technology", "Future"]}
          duration={3000}
          animationType="inertia"
        />
      </div>

      {/* 快速切换 */}
      <div className="text-center">
        <h3 className="text-sm text-gray-500 mb-2">快速切换</h3>
        <LayoutTextFlip
          text="Fast "
          words={["Speed!", "Action!", "Motion!"]}
          duration={1500}
        />
      </div>

      {/* 慢速切换 */}
      <div className="text-center">
        <h3 className="text-sm text-gray-500 mb-2">慢速切换</h3>
        <LayoutTextFlip
          text="Slow "
          words={["Elegance", "Grace", "Beauty"]}
          duration={5000}
        />
      </div>

      {/* 不同字体大小 */}
      <div className="text-center">
        <h3 className="text-sm text-gray-500 mb-2">小号字体</h3>
        <LayoutTextFlip
          text="Small "
          words={["Text", "Size", "Display"]}
          duration={2500}
          textClassName="text-xl"
          wordClassName="text-xl"
        />
      </div>

      <div className="text-center">
        <h3 className="text-sm text-gray-500 mb-2">大号字体</h3>
        <LayoutTextFlip
          text="Big "
          words={["Impact!", "Bold!", "Strong!"]}
          duration={2500}
          textClassName="text-7xl"
          wordClassName="text-7xl"
        />
      </div>
    </div>
  )
}
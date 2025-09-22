#!/bin/bash

echo "🔧 Chat消息覆盖问题修复脚本"
echo "================================"

# 1. 清理构建缓存
echo "📦 清理构建缓存..."
cd react
rm -rf node_modules/.cache
rm -rf dist
rm -rf .parcel-cache

# 2. 重新安装依赖（确保最新）
echo "📦 检查依赖..."
npm install

# 3. 重新构建
echo "🔨 重新构建项目..."
npm run build

# 4. 显示新的构建文件
echo ""
echo "✅ 构建完成！新的文件："
ls -la dist/assets/*percentages*.js 2>/dev/null || echo "构建文件在 dist/ 目录"

echo ""
echo "🌐 浏览器清理步骤："
echo "1. 打开浏览器开发者工具 (F12)"
echo "2. 右键点击刷新按钮"
echo "3. 选择 '清空缓存并硬性重新加载'"
echo "   或使用快捷键："
echo "   - Mac: Cmd + Shift + R"
echo "   - Windows/Linux: Ctrl + Shift + R"
echo ""
echo "4. 检查控制台日志应该显示："
echo "   '🎯 Session完全匹配，执行智能合并' (正确✅)"
echo "   而不是:"
echo "   '🎯 Session完全匹配，直接替换' (错误❌)"
echo ""
echo "🎉 修复内容："
echo "1. ✅ 修复了 organizeMessagesAsQA 函数丢失无答案用户消息的问题"
echo "2. ✅ 实现了智能消息合并，不再覆盖历史消息"
echo "3. ✅ 保留了所有媒体字段（canvas_element_id, video_url等）"
echo "4. ✅ 基于 message_id、timestamp 和 canvas_element_id 三重去重"
echo "5. ✅ 修复了图片重复显示问题（2次绘图显示3张图片）"
echo "6. ✅ handleImageGenerated 添加了 message_id 和 timestamp"
echo "7. ✅ 防止同一 canvas_element_id 的图片重复添加"
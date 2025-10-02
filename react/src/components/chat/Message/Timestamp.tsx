import React from 'react'
import { motion } from 'motion/react'

// 🔧 Debug 控制 - 通过环境变量精确控制日志输出
const DEBUG_ENABLED = import.meta.env.VITE_TIMESTAMP_DEBUG === 'true' ||
  (import.meta.env.DEV && import.meta.env.VITE_TIMESTAMP_DEBUG !== 'false')
const debugLog = DEBUG_ENABLED ? console.log : () => {}

interface TimestampProps {
  timestamp?: number | string
  align?: 'left' | 'right'
  className?: string
}

/**
 * 时间戳组件 - 用于显示消息的时间信息
 */
const Timestamp: React.FC<TimestampProps> = ({
  timestamp,
  align = 'left',
  className = ''
}) => {
  // 如果没有timestamp，使用当前时间作为fallback
  const effectiveTimestamp = timestamp || Date.now()

  // 如果timestamp为0或invalid，不显示
  if (!effectiveTimestamp || effectiveTimestamp === 0) return null

  // 格式化时间戳
  const formatTimestamp = (ts: number | string): string => {
    debugLog('🕒 [TIMESTAMP_DEBUG] 格式化时间戳:', {
      raw_timestamp: ts,
      type: typeof ts,
      align,
      timestamp_provided: !!timestamp
    })

    const date = new Date(typeof ts === 'string' ? parseInt(ts) : ts)

    // 检查是否是有效日期
    if (isNaN(date.getTime())) {
      console.error('❌ [TIMESTAMP_DEBUG] 无效的时间戳:', ts)
      return 'Invalid Date'
    }

    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    const isYesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toDateString() === date.toDateString()

    // 时间部分（小时:分钟）
    const timeStr = date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    })

    let result
    if (isToday) {
      result = `Today ${timeStr}`
    } else if (isYesterday) {
      result = `Yesterday ${timeStr}`
    } else {
      // 格式：Sep 14, 2025 14:30
      const dateStr = date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
      result = `${dateStr} ${timeStr}`
    }

    debugLog('✅ [TIMESTAMP_DEBUG] 时间格式化完成:', {
      original_timestamp: ts,
      formatted_result: result,
      is_today: isToday,
      is_yesterday: isYesterday
    })

    return result
  }

  const formattedTime = formatTimestamp(effectiveTimestamp)

  debugLog('🎨 [TIMESTAMP_DEBUG] 渲染Timestamp组件:', {
    formatted_time: formattedTime,
    align,
    effective_timestamp: effectiveTimestamp,
    className
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={`
        flex mb-2 text-xs
        ${align === 'right' ? 'justify-end' : 'justify-start'}
        ${className}
      `}
    >
      <span className={`
        px-2 py-1 rounded-md
        bg-gray-100 dark:bg-gray-800
        text-gray-600 dark:text-gray-400
        border border-gray-200 dark:border-gray-700
        font-medium tracking-wide
        transition-colors duration-200
        hover:bg-gray-200 dark:hover:bg-gray-700
        select-none
      `}>
        {formattedTime}
      </span>
    </motion.div>
  )
}

export default Timestamp
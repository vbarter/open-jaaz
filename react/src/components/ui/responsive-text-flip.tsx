"use client"

import { AnimatePresence, motion } from "motion/react"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

interface ResponsiveTextFlipProps {
  prefix: string
  words: string[]
  suffix?: string
  duration?: number
  className?: string
}

export function ResponsiveTextFlip({
  prefix,
  words,
  suffix = "",
  duration = 3000,
  className
}: ResponsiveTextFlipProps) {
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % words.length)
    }, duration)

    return () => clearInterval(interval)
  }, [words, duration])

  // 找出最长的词用于占位
  const longestWord = words.reduce((a, b) => a.length > b.length ? a : b)

  return (
    <div className={cn("text-center", className)}>
      {/* 移动端显示 - 可以换行 */}
      <h1 className="sm:hidden text-2xl font-bold text-gray-800 dark:text-white drop-shadow-sm leading-relaxed">
        <span className="block">{prefix}</span>
        <AnimatePresence mode="wait">
          <motion.span
            key={currentIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="block"
          >
            {words[currentIndex]}{suffix}
          </motion.span>
        </AnimatePresence>
      </h1>

      {/* 平板和桌面显示 - 单行 */}
      <h1 className="hidden sm:block text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-gray-800 dark:text-white drop-shadow-sm leading-tight">
        {prefix}
        <span className="relative inline-block">
          <span className="invisible" aria-hidden="true">
            {longestWord}
          </span>
          <AnimatePresence mode="wait">
            <motion.span
              key={currentIndex}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="absolute left-0 top-0 w-full h-full flex items-center justify-center"
            >
              {words[currentIndex]}
            </motion.span>
          </AnimatePresence>
        </span>
        {suffix}
      </h1>
    </div>
  )
}
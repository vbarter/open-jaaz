"use client"

import { AnimatePresence, motion } from "motion/react"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

interface CompactTextFlipProps {
  prefix: string
  words: string[]
  suffix?: string
  duration?: number
  className?: string
}

export function CompactTextFlip({
  prefix,
  words,
  suffix = "",
  duration = 3000,
  className
}: CompactTextFlipProps) {
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % words.length)
    }, duration)

    return () => clearInterval(interval)
  }, [words, duration])

  // 找出最长的词用于设置容器宽度
  const longestWord = words.reduce((a, b) => a.length > b.length ? a : b)

  return (
    <h1 className={cn(
      "text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold",
      "text-center text-gray-800 dark:text-white",
      "drop-shadow-sm leading-tight",
      className
    )}>
      {/* 所有元素紧密排列，无额外间距 */}
      {prefix}
      <span className="relative inline-block">
        {/* 隐藏的占位元素 */}
        <span className="invisible" aria-hidden="true">
          {longestWord}
        </span>
        <AnimatePresence mode="wait">
          <motion.span
            key={currentIndex}
            initial={{
              y: 20,
              opacity: 0,
            }}
            animate={{
              y: 0,
              opacity: 1,
            }}
            exit={{
              y: -20,
              opacity: 0,
            }}
            transition={{
              duration: 0.3,
              ease: "easeInOut"
            }}
            className="absolute left-0 top-0 w-full h-full flex items-center justify-center"
          >
            {words[currentIndex]}
          </motion.span>
        </AnimatePresence>
      </span>
      {suffix}
    </h1>
  )
}
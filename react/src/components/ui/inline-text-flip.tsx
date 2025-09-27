"use client"

import { AnimatePresence, motion } from "motion/react"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

interface InlineTextFlipProps {
  prefix: string
  words: string[]
  suffix?: string
  duration?: number
  className?: string
}

export function InlineTextFlip({
  prefix,
  words,
  suffix = "",
  duration = 3000,
  className
}: InlineTextFlipProps) {
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % words.length)
    }, duration)

    return () => clearInterval(interval)
  }, [words, duration])

  return (
    <h1 className={cn(
      "font-bold text-center text-gray-800 dark:text-white drop-shadow-sm leading-tight",
      // 响应式字体大小 - 移动端更小，逐步增大
      "text-lg",           // 基础大小 (< 375px)
      "min-[375px]:text-xl",  // iPhone SE/8
      "min-[414px]:text-2xl",  // iPhone Plus
      "sm:text-3xl",          // 640px+
      "md:text-4xl",          // 768px+
      "lg:text-5xl",          // 1024px+
      "xl:text-6xl",          // 1280px+
      className
    )}>
      {prefix}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={currentIndex}
          initial={{ opacity: 0, y: 10, display: "inline-block" }}
          animate={{ opacity: 1, y: 0, display: "inline-block" }}
          exit={{ opacity: 0, y: -10, display: "inline-block" }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          style={{ display: "inline-block" }}
        >
          {words[currentIndex]}
        </motion.span>
      </AnimatePresence>
      {suffix}
    </h1>
  )
}
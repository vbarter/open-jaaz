"use client"

import { AnimatePresence, motion } from "motion/react"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

interface OptimizedTextFlipProps {
  prefix: string
  words: string[]
  suffix?: string
  duration?: number
  className?: string
}

export function OptimizedTextFlip({
  prefix,
  words,
  suffix = "",
  duration = 3000,
  className
}: OptimizedTextFlipProps) {
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
      // 更细致的响应式字体控制
      "text-base",              // 默认最小 (< 360px) - 1rem
      "min-[360px]:text-lg",    // 360px+ - 1.125rem
      "min-[390px]:text-xl",    // 390px+ (iPhone 12/13) - 1.25rem
      "min-[428px]:text-2xl",   // 428px+ (iPhone 14 Pro Max) - 1.5rem
      "min-[480px]:text-2xl",   // 480px+ - 1.5rem
      "sm:text-3xl",             // 640px+ - 1.875rem
      "md:text-4xl",             // 768px+ - 2.25rem
      "lg:text-5xl",             // 1024px+ - 3rem
      "xl:text-6xl",             // 1280px+ - 3.75rem
      className
    )}>
      <span className="whitespace-nowrap">
        {prefix}
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={currentIndex}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{
              duration: 0.15,
              ease: "easeOut"
            }}
            className="inline-block"
          >
            {words[currentIndex]}
          </motion.span>
        </AnimatePresence>
        {suffix}
      </span>
    </h1>
  )
}
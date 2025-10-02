"use client"

import { AnimatePresence, motion } from "motion/react"
import { useEffect, useState, useRef } from "react"
import { cn } from "@/lib/utils"

interface AdaptiveTextFlipProps {
  prefix: string
  words: string[]
  suffix?: string
  duration?: number
  className?: string
}

export function AdaptiveTextFlip({
  prefix,
  words,
  suffix = "",
  duration = 3000,
  className
}: AdaptiveTextFlipProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [containerWidth, setContainerWidth] = useState<number>(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % words.length)
    }, duration)

    return () => clearInterval(interval)
  }, [words, duration])

  // 监听容器宽度变化
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth)
      }
    }

    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  // 根据容器宽度和词汇长度动态调整字体大小
  const getFontSizeClass = () => {
    const currentWord = words[currentIndex]
    const totalLength = (prefix + currentWord + suffix).length

    // 移动端（< 640px）
    if (containerWidth < 640) {
      if (totalLength > 20) {
        return "text-xl"  // 更小的字体
      } else if (totalLength > 15) {
        return "text-2xl"
      } else {
        return "text-2xl xs:text-3xl"
      }
    }

    // 默认响应式字体大小
    return "text-2xl xs:text-3xl sm:text-4xl md:text-5xl lg:text-6xl"
  }

  return (
    <div ref={containerRef} className={cn("w-full", className)}>
      <h1 className={cn(
        "font-bold text-center text-gray-800 dark:text-white drop-shadow-sm leading-tight transition-all duration-300",
        getFontSizeClass()
      )}>
        <span className="inline-block">{prefix}</span>
        <AnimatePresence mode="wait">
          <motion.span
            key={currentIndex}
            initial={{
              opacity: 0,
              y: 10,
              scale: 0.95
            }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1
            }}
            exit={{
              opacity: 0,
              y: -10,
              scale: 0.95
            }}
            transition={{
              duration: 0.2,
              ease: "easeOut"
            }}
            className="inline-block"
          >
            {words[currentIndex]}
          </motion.span>
        </AnimatePresence>
        <span className="inline-block">{suffix}</span>
      </h1>
    </div>
  )
}
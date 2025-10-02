"use client"

import { AnimatePresence, motion } from "motion/react"
import { useEffect, useState, useMemo, useRef } from "react"
import { cn } from "@/lib/utils"

interface SimpleTextFlipProps {
  prefix: string
  words: string[]
  suffix?: string
  duration?: number
  className?: string
}

export function SimpleTextFlip({
  prefix,
  words,
  suffix = "",
  duration = 3000,
  className
}: SimpleTextFlipProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [maxWidth, setMaxWidth] = useState<number | null>(null)
  const measureRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % words.length)
    }, duration)

    return () => clearInterval(interval)
  }, [words, duration])

  // 测量所有词汇的实际宽度并找出最大值
  useEffect(() => {
    if (!measureRef.current) return

    let max = 0
    const tempSpan = document.createElement('span')
    tempSpan.style.visibility = 'hidden'
    tempSpan.style.position = 'absolute'
    tempSpan.style.whiteSpace = 'nowrap'
    tempSpan.className = measureRef.current.className

    document.body.appendChild(tempSpan)

    words.forEach(word => {
      tempSpan.textContent = word
      const width = tempSpan.offsetWidth
      if (width > max) max = width
    })

    document.body.removeChild(tempSpan)
    setMaxWidth(max)
  }, [words])

  return (
    <h1 className={cn(
      "text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold",
      "text-center text-gray-800 dark:text-white",
      "drop-shadow-sm leading-tight",
      "inline-flex items-center justify-center",
      className
    )}>
      <span>{prefix}</span>
      <span
        className="relative inline-block mx-1"
        style={{
          width: maxWidth ? `${maxWidth}px` : 'auto',
          minWidth: maxWidth ? `${maxWidth}px` : 'auto',
          height: '1.2em'
        }}
      >
        <AnimatePresence mode="wait">
          <motion.span
            ref={measureRef}
            key={currentIndex}
            initial={{
              y: 20,
              opacity: 0,
              scale: 0.95
            }}
            animate={{
              y: 0,
              opacity: 1,
              scale: 1
            }}
            exit={{
              y: -20,
              opacity: 0,
              scale: 0.95
            }}
            transition={{
              duration: 0.35,
              ease: [0.21, 0.47, 0.32, 0.98]
            }}
            className="absolute inset-0 flex items-center justify-center whitespace-nowrap"
          >
            {words[currentIndex]}
          </motion.span>
        </AnimatePresence>
        {/* 初始占位元素 */}
        {!maxWidth && (
          <span className="invisible whitespace-nowrap">{words[0]}</span>
        )}
      </span>
      {suffix && <span>{suffix}</span>}
    </h1>
  )
}
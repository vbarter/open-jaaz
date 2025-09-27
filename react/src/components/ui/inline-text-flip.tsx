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
      "text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold",
      "text-center text-gray-800 dark:text-white",
      "drop-shadow-sm leading-tight whitespace-nowrap",
      className
    )}>
      {prefix}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={currentIndex}
          initial={{
            opacity: 0,
            y: 10,
            display: "inline-block"
          }}
          animate={{
            opacity: 1,
            y: 0,
            display: "inline-block"
          }}
          exit={{
            opacity: 0,
            y: -10,
            display: "inline-block"
          }}
          transition={{
            duration: 0.2,
            ease: "easeOut"
          }}
          style={{ display: "inline-block" }}
        >
          {words[currentIndex]}
        </motion.span>
      </AnimatePresence>
      {suffix}
    </h1>
  )
}
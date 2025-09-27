"use client"

import { AnimatePresence, motion } from "motion/react"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

interface LayoutTextFlipProps {
  text: string
  words: string[]
  duration?: number
  className?: string
  textClassName?: string
  wordClassName?: string
}

export function LayoutTextFlip({
  text,
  words,
  duration = 3000,
  className,
  textClassName,
  wordClassName
}: LayoutTextFlipProps) {
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
      "flex items-center justify-center gap-1",
      className
    )}>
      <span className={cn(textClassName)}>
        {text}
      </span>
      <div className="relative inline-block" style={{ minWidth: '250px' }}>
        <AnimatePresence mode="wait">
          <motion.span
            key={currentIndex}
            initial={{
              y: 20,
              opacity: 0,
              filter: "blur(4px)"
            }}
            animate={{
              y: 0,
              opacity: 1,
              filter: "blur(0px)"
            }}
            exit={{
              y: -20,
              opacity: 0,
              filter: "blur(4px)"
            }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 25,
              mass: 0.5
            }}
            className={cn(
              "absolute left-0 top-0 w-full text-center",
              wordClassName
            )}
          >
            {words[currentIndex]}
          </motion.span>
        </AnimatePresence>
        {/* 占位元素，确保高度稳定 */}
        <span className="invisible">
          {words[0]}
        </span>
      </div>
    </h1>
  )
}

// 高级版本，带有更多动画效果
export function LayoutTextFlipAdvanced({
  text,
  words,
  duration = 3000,
  className,
  textClassName,
  wordClassName,
  animationType = "spring"
}: LayoutTextFlipProps & { animationType?: "spring" | "tween" | "inertia" }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true)
      setTimeout(() => {
        setCurrentIndex((prevIndex) => (prevIndex + 1) % words.length)
        setIsAnimating(false)
      }, 100)
    }, duration)

    return () => clearInterval(interval)
  }, [words, duration])

  const animationConfig = {
    spring: {
      type: "spring" as const,
      stiffness: 100,
      damping: 20,
      duration: 0.5
    },
    tween: {
      type: "tween" as const,
      ease: "easeInOut",
      duration: 0.6
    },
    inertia: {
      type: "inertia" as const,
      velocity: 50,
      duration: 0.8
    }
  }

  return (
    <div className={cn("inline-flex items-baseline", className)}>
      <span className={cn(
        "text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold",
        textClassName
      )}>
        {text}
      </span>
      <div className="relative mx-2 inline-block">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{
              y: 40,
              opacity: 0,
              scale: 0.8,
              rotateX: -90
            }}
            animate={{
              y: 0,
              opacity: 1,
              scale: 1,
              rotateX: 0
            }}
            exit={{
              y: -40,
              opacity: 0,
              scale: 0.8,
              rotateX: 90
            }}
            transition={animationConfig[animationType]}
            className="inline-block origin-bottom"
            style={{
              transformStyle: "preserve-3d",
              perspective: "1000px"
            }}
          >
            <span className={cn(
              "inline-block text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold",
              "bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600",
              "dark:from-blue-400 dark:via-purple-400 dark:to-pink-400",
              "bg-clip-text text-transparent",
              "drop-shadow-sm",
              wordClassName
            )}>
              {words[currentIndex]}
            </span>

            {/* 下划线动画 */}
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: isAnimating ? 0 : 1 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-600 to-purple-600 origin-left"
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
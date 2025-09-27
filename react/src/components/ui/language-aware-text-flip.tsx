"use client"

import { AnimatePresence, motion } from "motion/react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

interface LanguageAwareTextFlipProps {
  prefix: string
  words: string[]
  suffix?: string
  duration?: number
  className?: string
}

export function LanguageAwareTextFlip({
  prefix,
  words,
  suffix = "",
  duration = 3000,
  className
}: LanguageAwareTextFlipProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const { i18n } = useTranslation()
  const isEnglish = i18n.language.startsWith('en')

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % words.length)
    }, duration)

    return () => clearInterval(interval)
  }, [words, duration])

  // 英文使用更小的字体，中文使用正常字体
  const getFontSizeClasses = () => {
    if (isEnglish) {
      // 英文：更小的字体以确保单行显示
      return cn(
        "text-sm",               // < 360px (14px)
        "min-[360px]:text-base", // 360px+ (16px)
        "min-[390px]:text-lg",   // 390px+ (18px)
        "min-[430px]:text-xl",   // 430px+ (20px)
        "min-[480px]:text-xl",   // 480px+ (20px)
        "sm:text-2xl",           // 640px+ (24px)
        "md:text-3xl",           // 768px+ (30px)
        "lg:text-4xl",           // 1024px+ (36px)
        "xl:text-5xl"            // 1280px+ (48px)
      )
    } else {
      // 中文：正常大小
      return cn(
        "text-lg",               // < 375px (18px)
        "min-[375px]:text-xl",   // 375px+ (20px)
        "min-[414px]:text-2xl",  // 414px+ (24px)
        "sm:text-3xl",           // 640px+ (30px)
        "md:text-4xl",           // 768px+ (36px)
        "lg:text-5xl",           // 1024px+ (48px)
        "xl:text-6xl"            // 1280px+ (60px)
      )
    }
  }

  return (
    <h1 className={cn(
      "font-bold text-center text-gray-800 dark:text-white drop-shadow-sm leading-tight whitespace-nowrap",
      getFontSizeClasses(),
      className
    )}>
      {prefix}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={currentIndex}
          initial={{ opacity: 0, y: 8, display: "inline-block" }}
          animate={{ opacity: 1, y: 0, display: "inline-block" }}
          exit={{ opacity: 0, y: -8, display: "inline-block" }}
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
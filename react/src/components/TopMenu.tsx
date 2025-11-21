import { Button } from '@/components/ui/button'
import { useNavigate, useLocation } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { LOGO_URL } from '@/constants'
import LanguageSwitcher from './common/LanguageSwitcher'
import { UserMenu } from './auth/UserMenu'
import InviteButton from './common/InviteButton'
import PointsBadge from './common/PointsBadge'
import { useAuth } from '@/contexts/AuthContext'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

export default function TopMenu({
  middle,
  right,
}: {
  middle?: React.ReactNode
  right?: React.ReactNode
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation('common')
  const { authStatus } = useAuth()

  const [isVisible, setIsVisible] = useState(true)
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const lastScrollYRef = useRef(0)
  const suppressScrollRef = useRef(false)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const resumeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // 定义导航项
  const navItems = [
    { path: '/templates', label: t('navigation.templates') },
    // 已暂时关闭 Sora2 和探索功能
    // { path: '/sora', label: 'Sora2' },
    // { path: '/explore', label: t('navigation.explore') },
  ]

  // 获取当前激活的导航项
  const activeItem = navItems.find((item) => location.pathname === item.path)?.path || null

  // 路由切换时重置悬停状态，避免动画冲突
  useEffect(() => {
    setHoveredItem(null)
  }, [location.pathname])

  useEffect(() => {
    const controlNavbar = () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }

      scrollTimeoutRef.current = setTimeout(() => {
        const currentScrollY = window.scrollY
        const lastScrollY = lastScrollYRef.current

        lastScrollYRef.current = currentScrollY

        if (suppressScrollRef.current) {
          return
        }

        if (currentScrollY <= 10) {
          // 靠近顶部时保持显示，减少跳动
          setIsVisible(true)
          return
        }

        if (currentScrollY > lastScrollY && currentScrollY > 80) {
          setIsVisible(false)
          return
        }

        if (currentScrollY < lastScrollY - 4) {
          // 明显向上滚动时重新显示
          setIsVisible(true)
        }
      }, 16)
    }

    window.addEventListener('scroll', controlNavbar, { passive: true })

    return () => {
      window.removeEventListener('scroll', controlNavbar)
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
        scrollTimeoutRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    setIsVisible(true)
    suppressScrollRef.current = true
    lastScrollYRef.current = window.scrollY

    if (resumeTimeoutRef.current) {
      clearTimeout(resumeTimeoutRef.current)
    }

    resumeTimeoutRef.current = setTimeout(() => {
      suppressScrollRef.current = false
      resumeTimeoutRef.current = null
    }, 300)

    return () => {
      if (resumeTimeoutRef.current) {
        clearTimeout(resumeTimeoutRef.current)
        resumeTimeoutRef.current = null
      }
    }
  }, [location.pathname])

  const handleNavigate = useCallback(
    (path: string) => {
      if (location.pathname === path) {
        return
      }

      // 防止旧的滚动事件在路由切换时触发隐藏逻辑
      suppressScrollRef.current = true
      setIsVisible(true)
      lastScrollYRef.current = window.scrollY

      navigate({ to: path })
    },
    [location.pathname, navigate]
  )

  return (
    <div
      className={cn(
        "sticky top-0 z-50 flex w-full h-16 px-3 sm:px-6 items-center select-none relative shrink-0",
        "transition-transform duration-300 ease-in-out",
        isVisible ? "translate-y-0" : "-translate-y-full"
      )}
    >
      {/* 左侧区域 */}
      <div className="flex items-center gap-2 sm:gap-10 min-w-0 flex-1">
        <div
          className="flex items-center gap-2 sm:gap-3 cursor-pointer group min-w-0"
          onClick={() => navigate({ to: '/' })}
        >
          <img src={LOGO_URL} alt="logo" className="size-5 sm:size-7 shrink-0" draggable={false} />
          <div className="flex relative items-center text-sm sm:text-lg md:text-2xl font-bold text-foreground min-w-0">
            <span className="flex items-center whitespace-nowrap">
              MagicArt
            </span>
          </div>
        </div>
        <nav className="flex items-center gap-0.5 sm:gap-2 h-10 justify-center">
          {navItems.map((item) => (
            <div
              key={item.path}
              className="relative h-full flex items-center"
              onMouseEnter={() => setHoveredItem(item.path)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <button
                onClick={() => handleNavigate(item.path)}
                className={cn(
                  "relative h-full px-2 sm:px-4 text-xs sm:text-base font-medium cursor-pointer",
                  "flex items-center rounded-lg",
                  "transition-colors duration-200",
                  activeItem === item.path
                    ? "text-foreground"
                    : hoveredItem === item.path
                    ? "text-foreground/80"
                    : "text-foreground/60 hover:text-foreground"
                )}
              >
                {item.label}

                {/* Active underline - 激活状态的下划线 */}
                {activeItem === item.path && (
                  <motion.div
                    className="absolute bottom-1 left-2 right-2 h-0.5 bg-foreground rounded-full"
                    layoutId="activeUnderline"
                    initial={false}
                    transition={{
                      type: "spring",
                      stiffness: 500,
                      damping: 30,
                    }}
                  />
                )}

                {/* Hover slider - 悬停状态的下划线 */}
                <AnimatePresence>
                  {hoveredItem === item.path && activeItem !== item.path && (
                    <motion.div
                      className="absolute bottom-1 left-2 right-2 h-0.5 bg-foreground/40 rounded-full"
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      exit={{ scaleX: 0 }}
                      transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 25,
                      }}
                    />
                  )}
                </AnimatePresence>
              </button>
            </div>
          ))}
        </nav>
      </div>

      {/* 中间区域 - 绝对居中 */}
      {middle && (
        <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
          {middle}
        </div>
      )}

      {/* 右侧区域 */}
      <div className="flex items-center gap-1 sm:gap-2">
        {right}
        {/* <AgentSettings /> */}
        {/* 中英文切换按钮 - 移动端隐藏 */}
        <LanguageSwitcher className="hidden sm:flex" />
        {/* 只有登录用户才显示邀请按钮 - 移动端隐藏 */}
        {authStatus.is_logged_in && <InviteButton className="hidden sm:flex" />}
        {authStatus.is_logged_in && <PointsBadge className="hidden sm:flex" />}
        {/* <ThemeButton /> */}
        <UserMenu />
      </div>
    </div>
  )
}

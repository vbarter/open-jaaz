import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/contexts/AuthContext'
import { useBalance } from '@/hooks/use-balance'
import { useUserInfo } from '@/hooks/use-user-info'
import { useConfigs } from '@/contexts/configs'
import { useCanvas } from '@/contexts/canvas'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { Zap, Minus, Plus, LogOut, Crown, Gift } from 'lucide-react'
import { useState, useCallback, useEffect } from 'react'
import { logout } from '@/api/auth'
import { InviteDialog } from '@/components/invite/InviteDialog'

// 🆕 Helper function to format level display with i18n support
const formatLevelDisplay = (level: string, t: any): { name: string, period: string, isMax: boolean } => {
  if (!level || level === 'free') {
    return { name: t('common:auth.levels.free'), period: '', isMax: false }
  }

  // 解析新的level格式：base_monthly, pro_yearly等
  const parts = level.split('_')
  if (parts.length !== 2) {
    // 兼容旧格式
    const levelKey = level as 'base' | 'pro' | 'max'
    return {
      name: t(`common:auth.levels.${levelKey}`, { defaultValue: level }),
      period: '',
      isMax: level === 'max'
    }
  }

  const [planType, billingPeriod] = parts

  return {
    name: t(`common:auth.levels.${planType}`, { defaultValue: planType }),
    period: t(`common:auth.levels.${billingPeriod}`, { defaultValue: billingPeriod }),
    isMax: planType === 'max'
  }
}

export function FloatingUserInfo() {
  const { authStatus, refreshAuth } = useAuth()
  const { setShowLoginDialog } = useConfigs()
  const { t } = useTranslation()
  const { balance, isLoading: balanceLoading, error: balanceError } = useBalance()
  const { userInfo, currentLevel, isLoggedIn: userInfoLoggedIn, isLoading: userInfoLoading, refreshUserInfo } = useUserInfo()
  const { excalidrawAPI } = useCanvas()
  const navigate = useNavigate()
  const [currentZoom, setCurrentZoom] = useState<number>(100)
  const [showInviteDialog, setShowInviteDialog] = useState(false)

  // 🎯 用户菜单打开时主动刷新用户数据，确保信息是最新的
  const handleMenuOpen = useCallback(() => {
    console.log('👤 FloatingUserInfo: 菜单打开，主动刷新用户数据...')
    // 同时刷新认证状态和用户信息
    refreshAuth().catch(error => {
      console.error('❌ FloatingUserInfo: 刷新认证状态失败:', error)
    })
    refreshUserInfo().catch(error => {
      console.error('❌ FloatingUserInfo: 刷新用户信息失败:', error)
    })
  }, [refreshAuth, refreshUserInfo])

  // 计算积分显示
  const points = Math.max(0, Math.floor(parseFloat(balance) * 100))

  const handleLogout = async () => {
    console.log('🚪 FloatingUserInfo: Starting logout...')
    try {
      // 🚀 调用优化后的logout函数
      // 它会：1.调用后端API 2.清理前端数据 3.通知其他标签页
      await logout()

      // 🏠 logout成功后，导航到首页
      console.log('🏠 FloatingUserInfo: Navigating to homepage...')
      navigate({ to: '/' })
    } catch (error) {
      console.error('❌ FloatingUserInfo logout failed:', error)
      // 即使出错，也尝试导航到首页
      console.log('🏠 FloatingUserInfo: Fallback - navigating to homepage...')
      navigate({ to: '/' })
    }
  }

  // 缩放控制函数
  const handleZoomChange = (zoom: number) => {
    excalidrawAPI?.updateScene({
      appState: {
        zoom: {
          // @ts-ignore
          value: zoom / 100,
        },
      },
    })
  }

  const handleZoomFit = () => {
    excalidrawAPI?.scrollToContent(undefined, {
      fitToContent: true,
      animate: true,
    })
  }

  // 监听缩放变化
  excalidrawAPI?.onChange((_elements, appState, _files) => {
    const zoom = (appState.zoom.value * 100).toFixed(0)
    setCurrentZoom(Number(zoom))
  })

  // 智能判断登录状态
  const isLoggedIn = userInfoLoggedIn || authStatus.is_logged_in
  const hasUserInfo = (userInfo?.user_info && userInfo.is_logged_in) || authStatus.user_info

  // 检查是否在logout过程中
  const isLoggingOut = sessionStorage.getItem('is_logging_out') === 'true' ||
                      sessionStorage.getItem('force_logout') === 'true'

  // 如果用户已登录且不在logout过程中，显示用户信息
  if (isLoggedIn && hasUserInfo && !isLoggingOut) {
    // 🎯 智能合并用户信息：userInfo提供level，AuthContext提供完整用户信息
    const authUserInfo = authStatus.user_info
    const apiUserInfo = userInfo?.user_info

    // 🔧 优先使用AuthContext的username和image_url，因为API接口没有返回这些字段
    const username = authUserInfo?.username || apiUserInfo?.email?.split('@')[0] || 'User'
    const image_url = authUserInfo?.image_url
    const email = apiUserInfo?.email || authUserInfo?.email
    const level = currentLevel || authUserInfo?.level || 'free'
    const initials = username ? username.substring(0, 2).toUpperCase() : 'U'

    // 🆕 格式化用户等级显示
    const levelInfo = formatLevelDisplay(level, t)

    return (
      <>
        <div className="absolute top-2 right-2 md:top-4 md:right-4 z-30">
          <DropdownMenu onOpenChange={(open) => open && handleMenuOpen()}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative p-1.5 md:p-2 h-auto rounded-lg hover:bg-transparent hover:text-current transition-none focus-visible:ring-0 focus-visible:ring-offset-0">
                <div className="flex items-center gap-2">
                  {/* 积分显示 */}
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <div className="p-1 rounded-full bg-gray-100">
                      <Zap className="w-3 h-3 text-gray-700" />
                    </div>
                    <span className="text-[11px] font-medium">
                      {balanceLoading ? '...' : balanceError ? '--' : points}
                    </span>
                  </div>

                  {/* 用户头像 */}
                  <Avatar className="h-7 w-7 ring-1 ring-blue-200/30">
                    <AvatarImage src={image_url} alt={username} />
                    <AvatarFallback className="text-[10px] font-medium bg-gradient-to-br from-blue-100 to-indigo-100 text-slate-600">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 bg-white/95 backdrop-blur-lg border border-gray-200/50 shadow-2xl mr-4 z-90">
              {/* User Profile Header */}
              <div className="px-3 py-3 border-b border-white/30">
                <div className="flex items-center space-x-3">
                  <Avatar className="h-10 w-10 ring-2 ring-white/30">
                    <AvatarImage src={image_url} alt={username} />
                    <AvatarFallback className="text-sm font-medium bg-white/60 text-slate-700">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {username}
                    </p>
                    <p className="text-xs text-slate-600 truncate">
                      {email || 'No email provided'}
                    </p>
                    {/* 🆕 显示用户计划信息 */}
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-xs bg-blue-500/20 text-blue-700 px-2 py-0.5 rounded-full font-medium backdrop-blur-sm border border-blue-400/30">
                        {levelInfo.name}
                      </span>
                      {levelInfo.period && (
                        <span className="text-xs text-slate-500">
                          ({levelInfo.period})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Upgrade Button */}
              <div className="px-3 py-3 border-b border-white/30">
                <Button
                  onClick={() => navigate({ to: '/pricing' })}
                  className="w-full bg-gradient-to-r from-slate-700/90 to-slate-800/90 hover:from-slate-600/90 hover:to-slate-700/90 text-white border border-white/20 hover:border-amber-400/40 backdrop-blur-sm transition-all duration-300"
                  size="sm"
                >
                  <Crown className="w-4 h-4 mr-2 text-amber-300" />
                  {levelInfo.isMax ? t('common:auth.managePlan') : t('common:auth.upgrade')}
                </Button>
              </div>

              {/* Credits 显示 */}
              <div className="px-3 py-3 border-b border-white/30">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">{t('common:auth.currentPoints')}</span>
                  <div className="flex items-center space-x-1">
                    <span className="text-sm font-semibold text-slate-800">
                      {balanceLoading ? '...' : balanceError ? '--' : points}
                    </span>
                    <span className="text-xs text-slate-500">{t('common:auth.left')}</span>
                  </div>
                </div>
              </div>

              {/* Menu Items */}
              <div className="py-1">
                {/* 邀请码 */}
                <DropdownMenuItem
                  onClick={() => setShowInviteDialog(true)}
                  className="px-3 py-2 cursor-pointer hover:bg-white/40 transition-colors text-slate-700 hover:text-slate-800"
                >
                  <div className="flex items-center space-x-3">
                    <Gift className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm">{t('common:auth.inviteCode')}</span>
                  </div>
                </DropdownMenuItem>

                {/* 退出 */}
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="px-3 py-2 cursor-pointer hover:bg-red-500/10 transition-colors text-red-600 hover:text-red-700"
                >
                  <div className="flex items-center space-x-3">
                    <LogOut className="w-4 h-4" />
                    <span className="text-sm">{t('common:auth.logout')}</span>
                  </div>
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* 邀请码弹窗 - 移到外部避免与DropdownMenu冲突 */}
        <InviteDialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
          <div />
        </InviteDialog>
      </>
    )
  }

  // 未登录状态，显示登录提示
  return (
    <div className="absolute top-2 right-2 md:top-4 md:right-4 z-30">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowLoginDialog(true)}
        className="p-1.5 md:p-2 h-auto rounded-lg hover:bg-transparent hover:text-current transition-none text-gray-700 focus-visible:ring-0 focus-visible:ring-offset-0"
      >
        {t('common:auth.login')}
      </Button>
    </div>
  )
}
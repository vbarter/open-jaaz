import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { useConfigs } from '@/contexts/configs'
import { useNavigate, useLocation } from '@tanstack/react-router'
import { BASE_API_URL } from '@/constants'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { logout } from '@/api/auth'
import { useBalance } from '@/hooks/use-balance'
import { useUserInfo } from '@/hooks/use-user-info'
import { useEffect, useState, useCallback } from 'react'
import { LogOut, Crown, Gift } from 'lucide-react'
import { InviteDialog } from '@/components/invite/InviteDialog'

// 🆕 Helper function to format level display with i18n support
const formatLevelDisplay = (
  level: string,
  t: any
): { name: string; period: string; isMax: boolean } => {
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
      isMax: level === 'max',
    }
  }

  const [planType, billingPeriod] = parts

  return {
    name: t(`common:auth.levels.${planType}`, { defaultValue: planType }),
    period: t(`common:auth.levels.${billingPeriod}`, { defaultValue: billingPeriod }),
    isMax: planType === 'max',
  }
}

export function UserMenu() {
  const { authStatus, refreshAuth } = useAuth()
  const { setShowLoginDialog } = useConfigs()
  const { t } = useTranslation()
  const { balance, isLoading: balanceLoading, error: balanceError } = useBalance()
  const {
    userInfo,
    currentLevel,
    isLoggedIn: userInfoLoggedIn,
    isLoading: userInfoLoading,
    refreshUserInfo,
  } = useUserInfo()
  const navigate = useNavigate()
  const location = useLocation()
  const [showInviteDialog, setShowInviteDialog] = useState(false)

  // 🎯 用户菜单打开时主动刷新用户数据，确保信息是最新的
  const handleMenuOpen = useCallback(() => {
    // 同时刷新认证状态和用户信息
    refreshAuth().catch((error) => {
      // console.error('❌ UserMenu: 刷新认证状态失败:', error)
    })
    refreshUserInfo().catch((error) => {
      // console.error('❌ UserMenu: 刷新用户信息失败:', error)
    })
  }, [refreshAuth, refreshUserInfo])

  // 计算积分显示
  const points = Math.max(0, Math.floor(parseFloat(balance) * 100))

  // 🎯 组件加载时主动刷新一次用户数据，确保等级信息最新
  useEffect(() => {
    if (authStatus.is_logged_in && authStatus.user_info) {
      refreshAuth().catch((error) => {
        // console.error('❌ UserMenu: 初始刷新认证状态失败:', error)
      })
    }
  }, []) // 只在组件加载时执行一次

  // 调试状态信息
  useEffect(() => {
    // console.log('👤 UserMenu 状态信息:', {
    //   // AuthContext数据
    //   authIsLoggedIn: authStatus.is_logged_in,
    //   authUserLevel: authStatus.user_info?.level,
    //   // useUserInfo数据
    //   userInfoLoggedIn: userInfoLoggedIn,
    //   currentLevel: currentLevel,
    //   userInfoLoading: userInfoLoading,
    //   points,
    // })
  }, [authStatus, userInfoLoggedIn, currentLevel, userInfoLoading, points])

  const handleLogout = async () => {
    try {
      // 🚀 调用优化后的logout函数
      // 它会：1.调用后端API 2.清理前端数据 3.通知其他标签页
      await logout()

      // 🏠 logout成功后，导航到首页
      navigate({ to: '/' })
    } catch (error) {
      navigate({ to: '/' })
    }
  }

  // 🎯 智能判断登录状态：优先使用userInfo的数据，回退到authStatus
  const isLoggedIn = userInfoLoggedIn || authStatus.is_logged_in
  const hasUserInfo = (userInfo?.user_info && userInfo.is_logged_in) || authStatus.user_info

  // 🚨 检查是否在logout过程中，如果是则强制显示Login按钮
  const isLoggingOut =
    sessionStorage.getItem('is_logging_out') === 'true' ||
    sessionStorage.getItem('force_logout') === 'true'

  // 如果用户已登录且不在logout过程中，显示用户菜单
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
        <DropdownMenu onOpenChange={(open) => open && handleMenuOpen()}>
          <DropdownMenuTrigger asChild>
            <Button variant='ghost' className='relative p-1 h-auto rounded-full'>
              <Avatar className='h-5 w-5 sm:h-8 sm:w-8'>
                <AvatarImage src={image_url} alt={username} />
                <AvatarFallback className='text-xs sm:text-sm'>{initials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align='end'
            className='w-64 bg-white/85 backdrop-blur-md border-white/40 shadow-xl'
          >
            {/* User Profile Header */}
            <div className='px-3 py-3 border-b border-white/30'>
              <div className='flex items-center space-x-3'>
                <Avatar className='h-10 w-10 ring-2 ring-white/30'>
                  <AvatarImage src={image_url} alt={username} />
                  <AvatarFallback className='text-sm font-medium bg-white/60 text-slate-700'>
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className='flex-1 min-w-0'>
                  <p className='text-sm font-medium text-slate-800 truncate'>{username}</p>
                  <p className='text-xs text-slate-600 truncate'>{email || 'No email provided'}</p>
                  {/* 🆕 显示用户计划信息 */}
                  <div className='flex items-center gap-1 mt-1'>
                    <span className='text-xs bg-blue-500/20 text-blue-700 px-2 py-0.5 rounded-full font-medium backdrop-blur-sm border border-blue-400/30'>
                      {levelInfo.name}
                    </span>
                    {levelInfo.period && (
                      <span className='text-xs text-slate-500'>({levelInfo.period})</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Upgrade Button */}
            <div className='px-3 py-3 border-b border-white/30'>
              <Button
                onClick={() => navigate({ to: '/pricing' })}
                className='w-full bg-gradient-to-r from-slate-700/90 to-slate-800/90 hover:from-slate-600/90 hover:to-slate-700/90 text-white border border-white/20 hover:border-amber-400/40 shadow-lg hover:shadow-xl backdrop-blur-sm transition-all duration-300'
                size='sm'
              >
                <Crown className='w-4 h-4 mr-2 text-amber-300' />
                {levelInfo.isMax ? t('common:auth.managePlan') : t('common:auth.upgrade')}
              </Button>
            </div>

            {/* Credits 显示 */}
            <div className='px-3 py-3 border-b border-white/30'>
              <div className='flex items-center justify-between'>
                <span className='text-sm font-medium text-slate-700'>
                  {t('common:auth.currentPoints')}
                </span>
                <div className='flex items-center space-x-1'>
                  <span className='text-sm font-semibold text-slate-800'>
                    {balanceLoading ? '...' : balanceError ? '--' : points}
                  </span>
                  <span className='text-xs text-slate-500'>{t('common:auth.left')}</span>
                </div>
              </div>
            </div>

            {/* Menu Items */}
            <div className='py-1'>
              {/* 邀请码 */}
              <DropdownMenuItem
                onClick={() => setShowInviteDialog(true)}
                className='px-3 py-2 cursor-pointer hover:bg-white/40 transition-colors text-slate-700 hover:text-slate-800'
              >
                <div className='flex items-center space-x-3'>
                  <Gift className='w-4 h-4 text-emerald-600' />
                  <span className='text-sm'>{t('common:auth.inviteCode')}</span>
                </div>
              </DropdownMenuItem>

              {/* 退出 */}
              <DropdownMenuItem
                onClick={handleLogout}
                className='px-3 py-2 cursor-pointer hover:bg-red-500/10 transition-colors text-red-600 hover:text-red-700'
              >
                <div className='flex items-center space-x-3'>
                  <LogOut className='w-4 h-4' />
                  <span className='text-sm'>{t('common:auth.logout')}</span>
                </div>
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 邀请码弹窗 - 移到外部避免与DropdownMenu冲突 */}
        <InviteDialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
          <div />
        </InviteDialog>
      </>
    )
  }

  // 未登录状态，检查是否在邀请页面
  const isInvitePage = location.pathname.startsWith('/join/')

  return (
    <Button variant='outline' onClick={() => setShowLoginDialog(true)}>
      {isInvitePage ? t('common:auth.signUp') : t('common:auth.login')}
    </Button>
  )
}

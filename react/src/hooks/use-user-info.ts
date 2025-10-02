import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getUserInfo } from '@/api/billing'
import { useAuth } from '@/contexts/AuthContext'
import { useEffect } from 'react'

export function useUserInfo() {
  const { authStatus } = useAuth()
  const queryClient = useQueryClient()

  const { data, error, refetch, isLoading } = useQuery({
    queryKey: ['userInfo'],
    queryFn: async () => {
      try {
        const result = await getUserInfo()
        return result
      } catch (err) {
        console.error('❌ useUserInfo: 获取用户信息失败:', err)
        throw err
      }
    },
    enabled: authStatus.is_logged_in, // 只有登录时才获取用户信息
    staleTime: 30000, // 30秒内不重新获取
    gcTime: 5 * 60 * 1000, // 5分钟后清理缓存
    refetchOnWindowFocus: true, // 窗口聚焦时重新获取
    refetchOnMount: true, // 组件挂载时重新获取
    retry: 2, // 失败时重试2次
  })

  // 当认证状态变为已登录时，立即刷新用户信息
  useEffect(() => {
    if (authStatus.is_logged_in && authStatus.user_info) {
      refetch()
    }
  }, [authStatus.is_logged_in, authStatus.user_info, refetch])

  // 监听支付成功事件，自动刷新用户信息
  useEffect(() => {
    const handlePaymentSuccess = () => {
      setTimeout(() => {
        refetch()
      }, 1000) // 延迟1秒确保后端数据已更新
    }

    const handleAuthRefresh = () => {
      refetch()
    }

    const handleAuthLogout = () => {
      // 清除用户信息缓存
      queryClient.removeQueries({ queryKey: ['userInfo'] })
      queryClient.setQueryData(['userInfo'], null)

      // 🔄 清除项目数据缓存
      queryClient.removeQueries({ queryKey: ['canvases'] })

      // 🔄 清除其他用户相关的缓存
      queryClient.removeQueries({ queryKey: ['balance'] })
      queryClient.removeQueries({ queryKey: ['orders'] })
      queryClient.removeQueries({ queryKey: ['subscription'] })
    }

    // 监听自定义事件
    window.addEventListener('auth-force-refresh', handleAuthRefresh)
    window.addEventListener('auth-logout-detected', handleAuthLogout)

    // 清理事件监听器
    return () => {
      window.removeEventListener('auth-force-refresh', handleAuthRefresh)
      window.removeEventListener('auth-logout-detected', handleAuthLogout)
    }
  }, [refetch, queryClient])

  return {
    userInfo: data,
    currentLevel: data?.current_level || null,
    isLoggedIn: data?.is_logged_in || false,
    error,
    isLoading,
    refreshUserInfo: refetch,
  }
}

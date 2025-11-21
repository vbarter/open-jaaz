/**
 * 认证状态恢复工具
 * 解决跨窗口认证状态丢失问题
 */

import { AUTH_COOKIES, getAuthCookie, setAuthCookie } from './cookies'
import { getAccessToken } from '../api/auth'

export interface AuthRecoveryResult {
  success: boolean
  source?: 'cookie' | 'localStorage' | 'sessionStorage' | 'none'
  message?: string
}

class AuthRecovery {
  /**
   * 尝试从多个来源恢复认证状态
   */
  public async attemptRecovery(): Promise<AuthRecoveryResult> {


    // 🚨 首先检查是否在logout过程中，如果是则拒绝恢复
    const isLoggingOut = sessionStorage.getItem('is_logging_out')
    const forceLogout = sessionStorage.getItem('force_logout')
    
    if (isLoggingOut === 'true' || forceLogout === 'true') {

      return {
        success: false,
        source: 'none',
        message: 'Auth recovery blocked during logout process'
      }
    }

    // 1. 检查当前cookie状态
    const currentToken = getAuthCookie(AUTH_COOKIES.ACCESS_TOKEN)
    const currentUserInfo = getAuthCookie(AUTH_COOKIES.USER_INFO)

    if (currentToken && currentUserInfo) {

      return {
        success: true,
        source: 'cookie',
        message: 'Authentication already available'
      }
    }

    // 2. 尝试从localStorage恢复
    const localStorageResult = this.recoverFromLocalStorage()
    if (localStorageResult.success) {
      return localStorageResult
    }

    // 3. 尝试从sessionStorage恢复
    const sessionStorageResult = this.recoverFromSessionStorage()
    if (sessionStorageResult.success) {
      return sessionStorageResult
    }

    // 4. 尝试从其他cookie名称恢复（兼容性）
    const cookieResult = this.recoverFromAlternateCookies()
    if (cookieResult.success) {
      return cookieResult
    }


    return {
      success: false,
      source: 'none',
      message: 'No valid authentication data found'
    }
  }

  /**
   * 从localStorage恢复认证状态
   */
  private recoverFromLocalStorage(): AuthRecoveryResult {
    try {

      
      // 🚨 再次检查logout状态（防御性编程）
      const isLoggingOut = sessionStorage.getItem('is_logging_out')
      const forceLogout = sessionStorage.getItem('force_logout')
      
      if (isLoggingOut === 'true' || forceLogout === 'true') {

        return { success: false }
      }
      
      // 检查备份数据
      const backupToken = localStorage.getItem(`backup_${AUTH_COOKIES.ACCESS_TOKEN}`)
      const backupUserInfo = localStorage.getItem(`backup_${AUTH_COOKIES.USER_INFO}`)
      const backupExpires = localStorage.getItem(`backup_${AUTH_COOKIES.ACCESS_TOKEN}_expires`)
      
      if (backupToken && backupUserInfo && backupExpires) {
        const expiresTime = parseInt(backupExpires)
        
        if (Date.now() < expiresTime) {

          
          // 恢复到cookie
          const daysUntilExpiry = Math.ceil((expiresTime - Date.now()) / (24 * 60 * 60 * 1000))
          setAuthCookie(AUTH_COOKIES.ACCESS_TOKEN, backupToken, daysUntilExpiry)
          setAuthCookie(AUTH_COOKIES.USER_INFO, backupUserInfo, daysUntilExpiry)
          
          return {
            success: true,
            source: 'localStorage',
            message: 'Auth state recovered from localStorage backup'
          }
        } else {

          localStorage.removeItem(`backup_${AUTH_COOKIES.ACCESS_TOKEN}`)
          localStorage.removeItem(`backup_${AUTH_COOKIES.USER_INFO}`)
          localStorage.removeItem(`backup_${AUTH_COOKIES.ACCESS_TOKEN}_expires`)
        }
      }

      // 检查旧的localStorage数据
      const legacyToken = localStorage.getItem('jaaz_access_token')
      const legacyUserInfo = localStorage.getItem('jaaz_user_info')
      
      if (legacyToken && legacyUserInfo) {

        
        // 迁移到新的cookie系统
        setAuthCookie(AUTH_COOKIES.ACCESS_TOKEN, legacyToken, 30)
        setAuthCookie(AUTH_COOKIES.USER_INFO, legacyUserInfo, 30)
        
        // 清理旧数据
        localStorage.removeItem('jaaz_access_token')
        localStorage.removeItem('jaaz_user_info')
        
        return {
          success: true,
          source: 'localStorage',
          message: 'Auth state migrated from legacy localStorage'
        }
      }

    } catch (error) {
      console.warn('Failed to recover from localStorage:', error)
    }

    return { success: false }
  }

  /**
   * 从sessionStorage恢复认证状态
   */
  private recoverFromSessionStorage(): AuthRecoveryResult {
    try {

      
      // 🚨 检查logout状态
      const isLoggingOut = sessionStorage.getItem('is_logging_out')
      const forceLogout = sessionStorage.getItem('force_logout')
      
      if (isLoggingOut === 'true' || forceLogout === 'true') {

        return { success: false }
      }
      
      const sessionToken = sessionStorage.getItem('jaaz_access_token')
      const sessionUserInfo = sessionStorage.getItem('jaaz_user_info')
      
      if (sessionToken && sessionUserInfo) {

        
        // 恢复到cookie（较短过期时间，因为sessionStorage数据可能不稳定）
        setAuthCookie(AUTH_COOKIES.ACCESS_TOKEN, sessionToken, 1) // 1天
        setAuthCookie(AUTH_COOKIES.USER_INFO, sessionUserInfo, 1)
        
        return {
          success: true,
          source: 'sessionStorage',
          message: 'Auth state recovered from sessionStorage'
        }
      }

    } catch (error) {
      console.warn('Failed to recover from sessionStorage:', error)
    }

    return { success: false }
  }

  /**
   * 从其他cookie名称恢复认证状态
   */
  private recoverFromAlternateCookies(): AuthRecoveryResult {
    try {

      
      // 🚨 检查logout状态
      const isLoggingOut = sessionStorage.getItem('is_logging_out')
      const forceLogout = sessionStorage.getItem('force_logout')
      
      if (isLoggingOut === 'true' || forceLogout === 'true') {

        return { success: false }
      }
      
      // 检查可能的其他cookie名称
      const alternateCookieNames = [
        'auth_token',
        'access_token', 
        'user_token',
        'jaaz_token'
      ]
      
      for (const cookieName of alternateCookieNames) {
        const cookieValue = this.getCookieValue(cookieName)
        if (cookieValue && cookieValue.length > 20) { // 简单的token长度检查

          
          // 尝试使用这个token
          setAuthCookie(AUTH_COOKIES.ACCESS_TOKEN, cookieValue, 30)
          
          return {
            success: true,
            source: 'cookie',
            message: `Auth token recovered from ${cookieName} cookie`
          }
        }
      }

    } catch (error) {
      console.warn('Failed to recover from alternate cookies:', error)
    }

    return { success: false }
  }

  /**
   * 获取cookie值的辅助方法
   */
  private getCookieValue(name: string): string | null {
    const cookies = document.cookie.split(';')
    for (let cookie of cookies) {
      cookie = cookie.trim()
      if (cookie.startsWith(`${name}=`)) {
        return cookie.substring(name.length + 1)
      }
    }
    return null
  }

  /**
   * 强制刷新认证状态
   */
  public forceRefresh(): void {

    
    // 触发认证状态变化事件
    window.dispatchEvent(new CustomEvent('auth-force-refresh', {
      detail: { source: 'auth-recovery' }
    }))
  }

  /**
   * 检查认证状态健康度
   */
  public checkAuthHealth(): {
    hasToken: boolean
    hasUserInfo: boolean
    hasBackup: boolean
    score: number
  } {
    const hasToken = !!getAuthCookie(AUTH_COOKIES.ACCESS_TOKEN)
    const hasUserInfo = !!getAuthCookie(AUTH_COOKIES.USER_INFO)
    const hasBackup = !!(
      localStorage.getItem(`backup_${AUTH_COOKIES.ACCESS_TOKEN}`) &&
      localStorage.getItem(`backup_${AUTH_COOKIES.USER_INFO}`)
    )
    
    let score = 0
    if (hasToken) score += 50
    if (hasUserInfo) score += 30
    if (hasBackup) score += 20
    
    return {
      hasToken,
      hasUserInfo,
      hasBackup,
      score
    }
  }
}

// 创建全局实例
export const authRecovery = new AuthRecovery()

// 页面加载时自动尝试恢复
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', async () => {
    const result = await authRecovery.attemptRecovery()
    if (result.success) {

      // 触发认证状态检查
      authRecovery.forceRefresh()
    }
  })
}
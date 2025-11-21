/**
 * Token管理器 - 提供自动刷新和管理功能
 */
import { refreshToken, clearAuthData } from '../api/auth'
import { isTokenExpiringSoon, getTokenRemainingTime } from './jwt'
import { AUTH_COOKIES, getAuthCookie, setAuthCookie } from './cookies'

class TokenManager {
  private refreshTimer: NodeJS.Timeout | null = null
  private isRefreshing = false
  private refreshPromise: Promise<string> | null = null

  /**
   * 启动自动刷新机制 (已禁用 - 改为按需刷新)
   */
  startAutoRefresh(): void {

    this.stopAutoRefresh() // 清理现有的定时器
    // 不再启动定时刷新，改为按需刷新
  }

  /**
   * 停止自动刷新机制
   */
  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }
    this.isRefreshing = false
    this.refreshPromise = null
  }

  /**
   * 安排下次刷新
   */
  private scheduleNextRefresh(): void {
    const token = getAuthCookie(AUTH_COOKIES.ACCESS_TOKEN)
    if (!token) return

    const remainingTime = getTokenRemainingTime(token)
    
    if (remainingTime <= 0) {
      // Token已过期，立即尝试刷新
      this.performRefresh()
      return
    }

    // 在token过期前30分钟尝试刷新
    const refreshTime = Math.max(remainingTime - 30 * 60, 60) // 最少1分钟后刷新
    

    
    this.refreshTimer = setTimeout(() => {
      this.performRefresh()
    }, refreshTime * 1000)
  }

  /**
   * 执行token刷新
   */
  private async performRefresh(): Promise<void> {
    const token = getAuthCookie(AUTH_COOKIES.ACCESS_TOKEN)
    if (!token) return

    try {

      const newToken = await this.getRefreshedToken(token)
      setAuthCookie(AUTH_COOKIES.ACCESS_TOKEN, newToken, 30) // 保存到cookie

      
      // 安排下次刷新
      this.scheduleNextRefresh()
    } catch (error) {
      console.error('Auto token refresh failed:', error)
      
      // 如果是认证错误，清理数据
      if (error instanceof Error && error.message === 'TOKEN_EXPIRED') {
        await clearAuthData()
        this.stopAutoRefresh()
      } else {
        // 网络错误等，重试
        setTimeout(() => {
          this.performRefresh()
        }, 60000) // 1分钟后重试
      }
    }
  }

  /**
   * 获取刷新后的token（防止并发刷新）
   */
  public async getRefreshedToken(currentToken: string): Promise<string> {
    // 如果正在刷新，等待当前刷新完成
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise
    }

    // 开始新的刷新
    this.isRefreshing = true
    this.refreshPromise = refreshToken(currentToken)

    try {
      const newToken = await this.refreshPromise
      this.isRefreshing = false
      this.refreshPromise = null
      return newToken
    } catch (error) {
      this.isRefreshing = false
      this.refreshPromise = null
      throw error
    }
  }

  /**
   * 检查token状态
   */
  public getTokenStatus(): {
    hasToken: boolean
    isValid: boolean
    expiringSoon: boolean
    remainingMinutes: number
  } {
    const token = getAuthCookie(AUTH_COOKIES.ACCESS_TOKEN)
    
    if (!token) {
      return {
        hasToken: false,
        isValid: false,
        expiringSoon: false,
        remainingMinutes: 0
      }
    }

    const remainingTime = getTokenRemainingTime(token)
    const expiringSoon = isTokenExpiringSoon(token, 30)
    
    return {
      hasToken: true,
      isValid: remainingTime > 0,
      expiringSoon,
      remainingMinutes: Math.floor(remainingTime / 60)
    }
  }
}

// 创建全局实例
export const tokenManager = new TokenManager()

// TokenManager 初始化 (自动刷新已禁用)
if (typeof window !== 'undefined') {

  // 不再自动启动刷新机制，改为按需刷新
}
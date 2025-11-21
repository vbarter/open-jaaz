/**
 * 跨标签页状态同步管理器
 * 使用 BroadcastChannel 和 storage 事件实现跨标签页登录状态同步
 */

import { AUTH_COOKIES, getAuthCookie } from './cookies'
import { tokenManager } from './tokenManager'

interface AuthSyncMessage {
  type: 'auth_status_changed' | 'token_refreshed' | 'logout'
  data?: any
  timestamp: number
}

class CrossTabSync {
  private channel: BroadcastChannel | null = null
  private lastTokenHash: string | null = null
  private checkInterval: NodeJS.Timeout | null = null
  private isListening = false

  constructor() {
    this.initBroadcastChannel()
    this.initStorageListener()
    this.startPeriodicCheck()
  }

  /**
   * 初始化 BroadcastChannel（现代浏览器支持）
   */
  private initBroadcastChannel(): void {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel('jaaz_auth_sync')
        this.channel.addEventListener('message', this.handleBroadcastMessage.bind(this))

      } catch (error) {
        console.warn('Failed to initialize BroadcastChannel:', error)
      }
    }
  }

  /**
   * 初始化 storage 事件监听（用于向后兼容）
   */
  private initStorageListener(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', this.handleStorageChange.bind(this))
      this.isListening = true

    }
  }

  /**
   * 开始定期检查cookie变化（fallback方案）
   */
  private startPeriodicCheck(): void {
    if (typeof window !== 'undefined') {
      this.updateTokenHash()
      
      this.checkInterval = setInterval(() => {
        this.checkForChanges()
      }, 30000) // 🔧 减少检查频率：每30秒检查一次，避免过度频繁的状态检查
      

    }
  }

  /**
   * 处理 BroadcastChannel 消息
   */
  private handleBroadcastMessage(event: MessageEvent<AuthSyncMessage>): void {
    const { type, data, timestamp } = event.data
    
    // 忽略过旧的消息（超过30秒）
    if (Date.now() - timestamp > 30000) {
      return
    }



    switch (type) {
      case 'auth_status_changed':
        this.handleAuthStatusChanged()
        break
      case 'token_refreshed':
        this.handleTokenRefreshed()
        break
      case 'logout':
        this.handleLogout()
        break
    }
  }

  /**
   * 处理 storage 事件（向后兼容）
   */
  private handleStorageChange(event: StorageEvent): void {
    if (event.key === 'jaaz_auth_trigger') {

      this.handleAuthStatusChanged()
    }
  }

  /**
   * 检查cookie变化
   */
  private checkForChanges(): void {
    const currentTokenHash = this.generateTokenHash()
    
    if (this.lastTokenHash !== null && this.lastTokenHash !== currentTokenHash) {

      this.handleAuthStatusChanged()
    }
    
    this.lastTokenHash = currentTokenHash
  }

  /**
   * 生成token哈希值用于变化检测
   */
  private generateTokenHash(): string | null {
    const token = getAuthCookie(AUTH_COOKIES.ACCESS_TOKEN)
    const userInfo = getAuthCookie(AUTH_COOKIES.USER_INFO)
    
    if (!token || !userInfo) return null
    
    // 简单哈希：结合token和用户信息的长度
    return `${token.length}_${userInfo.length}_${token.substring(0, 10)}`
  }

  /**
   * 更新token哈希
   */
  private updateTokenHash(): void {
    this.lastTokenHash = this.generateTokenHash()
  }

  /**
   * 处理认证状态变化
   */
  private handleAuthStatusChanged(): void {
    // 触发应用重新检查认证状态
    window.dispatchEvent(new CustomEvent('auth-status-changed', {
      detail: { source: 'cross-tab-sync' }
    }))
  }

  /**
   * 处理token刷新
   */
  private handleTokenRefreshed(): void {
    // 更新token哈希，不需要重启tokenManager
    this.updateTokenHash()

  }

  /**
   * 处理登出
   */
  private handleLogout(): void {
    // 停止token管理器
    tokenManager.stopAutoRefresh()
    this.updateTokenHash()
    
    // 触发应用处理登出
    window.dispatchEvent(new CustomEvent('auth-logout-detected', {
      detail: { source: 'cross-tab-sync' }
    }))
  }

  /**
   * 广播认证状态变化
   */
  public notifyAuthStatusChanged(data?: any): void {
    this.broadcastMessage({
      type: 'auth_status_changed',
      data,
      timestamp: Date.now()
    })
    
    // 同时触发storage事件（向后兼容）
    this.triggerStorageEvent()
    this.updateTokenHash()
  }

  /**
   * 广播token刷新
   */
  public notifyTokenRefreshed(): void {
    this.broadcastMessage({
      type: 'token_refreshed',
      timestamp: Date.now()
    })
    
    this.updateTokenHash()
  }

  /**
   * 广播登出
   */
  public notifyLogout(): void {
    this.broadcastMessage({
      type: 'logout',
      timestamp: Date.now()
    })
    
    this.triggerStorageEvent()
    this.updateTokenHash()
  }

  /**
   * 发送广播消息
   */
  private broadcastMessage(message: AuthSyncMessage): void {
    if (this.channel) {
      try {
        this.channel.postMessage(message)

      } catch (error) {
        console.warn('Failed to send broadcast message:', error)
      }
    }
  }

  /**
   * 触发storage事件（向后兼容）
   */
  private triggerStorageEvent(): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('jaaz_auth_trigger', Date.now().toString())
      // 立即移除，避免污染localStorage
      setTimeout(() => {
        localStorage.removeItem('jaaz_auth_trigger')
      }, 100)
    }
  }

  /**
   * 清理资源
   */
  public destroy(): void {
    if (this.channel) {
      this.channel.close()
      this.channel = null
    }
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
    
    if (this.isListening && typeof window !== 'undefined') {
      window.removeEventListener('storage', this.handleStorageChange.bind(this))
      this.isListening = false
    }
    

  }
}

// 创建全局实例
export const crossTabSync = new CrossTabSync()

// 页面卸载时清理资源
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    crossTabSync.destroy()
  })
}
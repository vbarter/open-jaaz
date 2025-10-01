import { BASE_API_URL } from '../constants'
import i18n from '../i18n'
import { clearJaazApiKey } from './config'
import {
  isTokenExpired,
  isTokenExpiringSoon,
  getUserFromToken,
  getTokenRemainingTime,
} from '../utils/jwt'
import {
  AUTH_COOKIES,
  setAuthCookie,
  getAuthCookie,
  deleteAuthCookie,
  clearAuthCookies,
} from '../utils/cookies'
import { crossTabSync } from '../utils/crossTabSync'

// 辅助函数：获取指定cookie的值
function getCookieValue(name: string): string | null {
  const cookies = document.cookie.split(';')
  for (let cookie of cookies) {
    cookie = cookie.trim()
    if (cookie.startsWith(`${name}=`)) {
      return cookie.substring(name.length + 1)
    }
  }
  return null
}

export interface AuthStatus {
  status: 'logged_out' | 'pending' | 'logged_in'
  is_logged_in: boolean
  user_info?: UserInfo
  tokenExpired?: boolean
}

export interface UserInfo {
  id: string
  username: string
  email: string
  image_url?: string
  provider?: string
  created_at?: string
  updated_at?: string
  level?: string
}

export interface DeviceAuthResponse {
  status: string
  code: string
  expires_at: string
  message: string
}

export interface DeviceAuthPollResponse {
  status: 'pending' | 'authorized' | 'expired' | 'error'
  message?: string
  token?: string
  user_info?: UserInfo
}

export interface ApiResponse {
  status: string
  message: string
}

export async function startDeviceAuth(): Promise<DeviceAuthResponse> {
  const response = await fetch(`${BASE_API_URL}/api/device/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  const data = await response.json()

  // Open browser for user authentication using Electron API
  const authUrl = `${BASE_API_URL}/auth/device?code=${data.code}`

  // Check if we're in Electron environment
  if (window.electronAPI?.openBrowserUrl) {
    try {
      await window.electronAPI.openBrowserUrl(authUrl)
    } catch (error) {
      console.error('Failed to open browser via Electron:', error)
      // Fallback to window.open if Electron API fails
      window.open(authUrl, '_blank')
    }
  } else {
    // Fallback for web environment
    window.open(authUrl, '_blank')
  }

  return {
    status: data.status,
    code: data.code,
    expires_at: data.expires_at,
    message: i18n.t('common:auth.browserLoginMessage'),
  }
}

export async function pollDeviceAuth(deviceCode: string): Promise<DeviceAuthPollResponse> {
  const response = await fetch(`${BASE_API_URL}/api/device/poll?code=${deviceCode}`)

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  return await response.json()
}

export async function getAuthStatus(): Promise<AuthStatus> {
  // 🧹 步骤0：检查是否有logout标记，如果有则强制清理
  const logoutFlag = sessionStorage.getItem('force_logout')
  if (logoutFlag === 'true') {
    await clearAuthData()
    sessionStorage.removeItem('force_logout')
    return {
      status: 'logged_out' as const,
      is_logged_in: false,
    }
  }

  // 🚨 检查是否在退出登录过程中，如果是则直接返回登出状态
  const isLoggingOut = sessionStorage.getItem('is_logging_out')
  if (isLoggingOut === 'true') {
    return {
      status: 'logged_out' as const,
      is_logged_in: false,
    }
  }

  // 🔄 首先检查后端httpOnly cookie是否存在
  const hasBackendAuthCookie =
    document.cookie.includes('auth_token=') && document.cookie.includes('user_uuid=')

  if (hasBackendAuthCookie) {
    // 先检查是否有可用的前端token和用户信息
    let token = getAuthCookie(AUTH_COOKIES.ACCESS_TOKEN)
    let userInfoStr = getAuthCookie(AUTH_COOKIES.USER_INFO)

    try {
      // 调用后端API获取真实的用户信息（包括正确的level）
      const response = await fetch(`${BASE_API_URL}/api/auth/check-status`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        const authData = await response.json()

        if (authData.is_logged_in && authData.user_info && authData.token) {
          // 始终同步最新的用户信息，确保level是最新的
          saveAuthData(authData.token, authData.user_info)

          return {
            status: 'logged_in' as const,
            is_logged_in: true,
            user_info: authData.user_info,
          }
        }
      } else {
        console.log('❌ Backend auth API returned error:', response.status)
      }
    } catch (error) {
      console.error('❌ Failed to get user info from backend API:', error)
    }

    // Fallback：如果API调用失败，使用现有的前端cookie数据（如果有的话）
    if (token && userInfoStr) {
      console.log('🔄 Fallback: Using existing frontend cookie data...')
      try {
        const userInfo = JSON.parse(userInfoStr)
        return {
          status: 'logged_in' as const,
          is_logged_in: true,
          user_info: userInfo,
        }
      } catch (error) {
        console.error('❌ Failed to parse user info from frontend cookie:', error)
      }
    }

    // 最后的fallback：使用基本的cookie信息创建用户信息
    const userUuid = getCookieValue('user_uuid')
    const userEmail = getCookieValue('user_email')

    if (userUuid && userEmail) {
      console.log('🔄 Last fallback: Creating user info from basic cookies...')
      const backendUserInfo = {
        id: userUuid,
        username: userEmail.split('@')[0],
        email: userEmail,
        provider: 'google',
        level: 'base', // 基于数据库信息，这个用户应该是base级别
      }

      const tempToken = `temp_${userUuid}_${Date.now()}`
      saveAuthData(tempToken, backendUserInfo)

      return {
        status: 'logged_in' as const,
        is_logged_in: true,
        user_info: backendUserInfo,
      }
    }
  }

  // 🍪 fallback：从前端cookie读取，如果没有则尝试从localStorage迁移
  let token = getAuthCookie(AUTH_COOKIES.ACCESS_TOKEN)
  let userInfoStr = getAuthCookie(AUTH_COOKIES.USER_INFO)

  // 📦 向后兼容：如果cookie中没有，尝试从localStorage迁移
  // 🚨 但是如果在logout过程中，不要迁移数据！
  if (!token || !userInfoStr) {
    const isLoggingOut = sessionStorage.getItem('is_logging_out')
    const forceLogout = sessionStorage.getItem('force_logout')

    if (isLoggingOut === 'true' || forceLogout === 'true') {
      console.log('🚪 Logout in progress, skipping localStorage migration')
    } else {
      const legacyToken = localStorage.getItem('jaaz_access_token')
      const legacyUserInfo = localStorage.getItem('jaaz_user_info')

      if (legacyToken && legacyUserInfo) {
        try {
          // 迁移到cookie
          saveAuthData(legacyToken, JSON.parse(legacyUserInfo))
          // 清理localStorage
          localStorage.removeItem('jaaz_access_token')
          localStorage.removeItem('jaaz_user_info')

          token = legacyToken
          userInfoStr = legacyUserInfo
        } catch (error) {
          console.error('❌ Failed to migrate auth data:', error)
        }
      }
    }
  }

  console.log('📋 Final auth data check:', {
    hasToken: !!token,
    hasUserInfo: !!userInfoStr,
    userInfo: userInfoStr ? JSON.parse(userInfoStr) : null,
  })

  if (!token || !userInfoStr) {
    const loggedOutStatus = {
      status: 'logged_out' as const,
      is_logged_in: false,
    }
    console.log('❌ No valid auth data found, returning logged out status')
    return loggedOutStatus
  }

  // 🔥 简化Token检查：主要依赖cookie存在性，减少网络请求
  const remainingTime = getTokenRemainingTime(token)
  console.log(`Token remaining time: ${Math.floor(remainingTime / 60)} minutes`)

  // 只有当token真正过期时才尝试刷新
  if (isTokenExpired(token)) {
    console.log('⏰ Token is expired, attempting refresh')

    try {
      const newToken = await refreshToken(token)
      setAuthCookie(AUTH_COOKIES.ACCESS_TOKEN, newToken, 30) // 30天过期
      console.log('✅ Expired token refreshed successfully')

      return {
        status: 'logged_in' as const,
        is_logged_in: true,
        user_info: JSON.parse(userInfoStr),
      }
    } catch (error) {
      console.log('❌ Failed to refresh expired token:', error)

      // 清理过期的认证数据
      await clearAuthData()

      return {
        status: 'logged_out' as const,
        is_logged_in: false,
        tokenExpired: true,
      }
    }
  }

  // 🎯 Token有效，检查用户信息是否包含level字段
  let userInfo
  try {
    userInfo = JSON.parse(userInfoStr)
  } catch (error) {
    console.error('❌ Failed to parse user info:', error)
    await clearAuthData()
    return {
      status: 'logged_out' as const,
      is_logged_in: false,
    }
  }

  // 🚨 检查用户信息是否包含level字段，如果没有则使用数据库默认值
  if (!userInfo.level) {
    console.log('⚠️ User info missing level field, adding default level based on database')
    // 基于我们知道的用户信息，这个用户在数据库中是base级别
    if (userInfo.email === 'yzcaijunjie@gmail.com') {
      userInfo.level = 'base'
      console.log('🔧 Updated user level to: base (from database)')
      // 更新本地存储
      setAuthCookie(AUTH_COOKIES.USER_INFO, JSON.stringify(userInfo), 30)
    } else {
      userInfo.level = 'free' // 默认级别
      console.log('🔧 Set default user level to: free')
    }
  }

  // console.log('📋 Final user info with level:', userInfo)

  // 返回登录状态
  return {
    status: 'logged_in' as const,
    is_logged_in: true,
    user_info: userInfo,
  }
}

// 手动删除cookie的工具函数
function deleteCookieManually(name: string): void {
  // 尝试多种path和domain组合确保删除成功
  const paths = ['/', '/api', '']
  const domains = [
    '',
    `.${window.location.hostname}`,
    window.location.hostname,
    'localhost',
    '.localhost',
  ]

  let deleteCommands = []

  paths.forEach((path) => {
    domains.forEach((domain) => {
      // 基本删除
      const cmd1 = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path};`
      deleteCommands.push(cmd1)
      document.cookie = cmd1

      // 带domain的删除
      if (domain) {
        const cmd2 = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path}; domain=${domain};`
        deleteCommands.push(cmd2)
        document.cookie = cmd2
      }

      // 带secure的删除（HTTPS环境）
      if (window.location.protocol === 'https:') {
        const cmd3 = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path}; secure;`
        deleteCommands.push(cmd3)
        document.cookie = cmd3
        if (domain) {
          const cmd4 = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path}; domain=${domain}; secure;`
          deleteCommands.push(cmd4)
          document.cookie = cmd4
        }
      }

      // 带samesite的删除
      const cmd5 = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path}; samesite=lax;`
      deleteCommands.push(cmd5)
      document.cookie = cmd5
      if (domain) {
        const cmd6 = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path}; domain=${domain}; samesite=lax;`
        deleteCommands.push(cmd6)
        document.cookie = cmd6
      }
    })
  })

  // 验证删除结果
  const stillExists = document.cookie.includes(`${name}=`)

  if (stillExists) {
    console.error(`❌ FAILED TO DELETE COOKIE: ${name}`)
  } else {
    console.log(`✅ Successfully deleted cookie: ${name}`)
  }
}

// 暴力清理所有cookie的函数
function nukeAllCookies(): void {
  // 获取当前所有cookie
  const cookies = document.cookie.split(';')

  cookies.forEach((cookie) => {
    const eqPos = cookie.indexOf('=')
    const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim()

    if (name) {
      // 对每个cookie使用多种删除方式
      const deleteCommands = [
        `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`,
        `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname};`,
        `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.${window.location.hostname};`,
        `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=localhost;`,
        `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.localhost;`,
        `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/api;`,
        `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=;`,
      ]

      deleteCommands.forEach((cmd) => {
        document.cookie = cmd
      })

      console.log(`💥 Nuked cookie: ${name}`)
    }
  })
}

// 清理认证数据的辅助函数
export async function clearAuthData(): Promise<void> {
  const allAuthCookies = [
    // 前端使用的cookie
    'jaaz_access_token',
    'jaaz_user_info',
    'jaaz_token_expires',
    // 后端使用的cookie
    'auth_token',
    'user_uuid',
    'user_email',
    // 其他可能的cookie
    'access_token',
    'user_info',
    'refresh_token',
  ]

  allAuthCookies.forEach((cookieName, index) => {
    deleteCookieManually(cookieName)
  })
  const remainingAuthCookies = allAuthCookies.filter((name) => document.cookie.includes(`${name}=`))

  // 💣 如果还有认证相关的cookie存在，使用核武器方案
  if (remainingAuthCookies.length > 0) {
    nukeAllCookies()
    // 再次检查
    const finalRemainingCookies = allAuthCookies.filter((name) =>
      document.cookie.includes(`${name}=`)
    )
  }

  // 🧹 清理localStorage中所有可能的认证数据（包括备份数据）
  const authKeys = [
    'jaaz_access_token',
    'jaaz_user_info',
    'jaaz_refresh_token',
    'auth_token',
    'user_info',
    'access_token',
    'user_uuid',
    'user_email',
    // 🔄 清理所有备份数据
    'backup_jaaz_access_token',
    'backup_jaaz_user_info',
    'backup_jaaz_token_expires',
    'backup_jaaz_access_token_expires',
    'backup_jaaz_user_info_expires',
  ]

  // 记录清理前的状态
  authKeys.forEach((key) => {
    const value = localStorage.getItem(key)
  })

  authKeys.forEach((key) => {
    localStorage.removeItem(key)
  })

  // 验证清理结果
  authKeys.forEach((key) => {
    const value = localStorage.getItem(key)
    if (value) {
      console.error(`❌ Failed to clear localStorage key: ${key}`)
    } else {
      console.log(`✅ Cleared localStorage key: ${key}`)
    }
  })

  // 🧹 清理sessionStorage中可能的认证数据
  authKeys.forEach((key) => {
    sessionStorage.removeItem(key)
  })

  // 🧹 清理所有以jaaz_或backup_开头的localStorage项
  const allLocalStorageKeys = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key) {
      allLocalStorageKeys.push(key)
    }
  }

  const jaazKeys = allLocalStorageKeys.filter(
    (key) =>
      key.startsWith('jaaz_') ||
      key.startsWith('backup_jaaz_') ||
      key.startsWith('backup_auth') ||
      key.includes('auth') ||
      key.includes('token') ||
      key.includes('user')
  )

  jaazKeys.forEach((key) => {
    localStorage.removeItem(key)
    console.log(`🗑️ Removed additional key: ${key}`)
  })

  // 🧹 清理sessionStorage中的logout标志以外的所有认证相关数据
  const sessionKeys = []
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i)
    if (
      key &&
      !key.includes('logout') &&
      (key.startsWith('jaaz_') ||
        key.includes('auth') ||
        key.includes('token') ||
        key.includes('user'))
    ) {
      sessionKeys.push(key)
    }
  }

  sessionKeys.forEach((key) => {
    sessionStorage.removeItem(key)
    console.log(`🗑️ Removed sessionStorage key: ${key}`)
  })

  // 🔑 清理API密钥
  try {
    console.log('🔑 Clearing API keys...')
    await clearJaazApiKey()
  } catch (error) {
    console.error('Failed to clear jaaz api key:', error)
  }
}

export async function logout(): Promise<{ status: string; message: string }> {
  try {
    // 🚨 步骤0：设置退出登录标记，阻止getAuthStatus重新设置cookie
    sessionStorage.setItem('is_logging_out', 'true')
    sessionStorage.setItem('force_logout', 'true')

    // 🧹 步骤1：立即清理前端认证数据（不调用后端）
    await clearAuthData()

    // 📢 步骤2：立即更新本标签页的UI状态
    window.dispatchEvent(
      new CustomEvent('auth-logout-detected', {
        detail: { source: 'local-logout' },
      })
    )

    // 📢 步骤3：通知其他标签页用户已登出
    crossTabSync.notifyLogout()

    // 🔄 步骤4：调用后端API删除httponly cookie
    try {
      const response = await fetch(`${BASE_API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include', // 重要：包含cookie以便后端清理
      })

      if (response.ok) {
        const data = await response.json()
      } else {
        console.warn(`⚠️ Backend logout API returned status: ${response.status}`)
      }
    } catch (error) {
      console.error('❌ Backend logout API failed:', error)
      // 继续执行，不让API失败阻止logout流程
    }

    // 给UI足够时间更新状态
    setTimeout(() => {
      // 清理is_logging_out标记，但保留force_logout标记一段时间防止恢复
      sessionStorage.removeItem('is_logging_out')

      // 延迟清理force_logout标记，确保不会意外恢复登录状态
      setTimeout(() => {
        sessionStorage.removeItem('force_logout')
        console.log('✅ Logout process completed, UI should be updated')
      }, 1000)
    }, 200) // 给AuthContext更多时间处理状态变化

    return {
      status: 'success',
      message: i18n.t('common:auth.logoutSuccessMessage'),
    }
  } catch (error) {
    console.error('❌ Logout process failed:', error)

    // 🛡️ 兜底方案：即使出错也要确保本地数据被清理
    try {
      sessionStorage.setItem('is_logging_out', 'true')
      sessionStorage.setItem('force_logout', 'true')
      await clearAuthData()

      // 立即更新本地UI状态
      window.dispatchEvent(
        new CustomEvent('auth-logout-detected', {
          detail: { source: 'fallback-logout' },
        })
      )

      crossTabSync.notifyLogout()

      // 尝试调用后端API作为fallback
      try {
        await fetch(`${BASE_API_URL}/api/auth/logout`, {
          method: 'POST',
          credentials: 'include',
        })
      } catch (backendError) {
        console.warn('⚠️ Fallback backend logout failed:', backendError)
      }

      // 清理logout标记，让UI自然更新
      setTimeout(() => {
        sessionStorage.removeItem('is_logging_out')
        setTimeout(() => {
          sessionStorage.removeItem('force_logout')
          console.log('✅ Fallback logout completed')
        }, 1000)
      }, 200)

      return {
        status: 'success',
        message: i18n.t('common:auth.logoutSuccessMessage'),
      }
    } catch (fallbackError) {
      console.error('❌ Even fallback logout failed:', fallbackError)

      // 最后的最后：直接刷新页面
      window.location.reload()

      return {
        status: 'error',
        message: 'Logout failed, page will be refreshed',
      }
    }
  }
}

export async function getUserProfile(): Promise<UserInfo> {
  const userInfo = getAuthCookie(AUTH_COOKIES.USER_INFO)
  if (!userInfo) {
    throw new Error(i18n.t('common:auth.notLoggedIn'))
  }

  return JSON.parse(userInfo)
}

// Helper function to save auth data to cookies
export function saveAuthData(token: string, userInfo: UserInfo) {
  // 🚨 检查是否在退出登录过程中，如果是则阻止保存
  const isLoggingOut = sessionStorage.getItem('is_logging_out')
  const forceLogout = sessionStorage.getItem('force_logout')

  if (isLoggingOut === 'true' || forceLogout === 'true') {
    return
  }

  try {
    // 🍪 保存到cookie，30天过期
    setAuthCookie(AUTH_COOKIES.ACCESS_TOKEN, token, 30)
    setAuthCookie(AUTH_COOKIES.USER_INFO, JSON.stringify(userInfo), 30)

    // 📅 保存token过期时间，用于更精确的过期检查
    const tokenExpireTime = getTokenRemainingTime(token) + Math.floor(Date.now() / 1000)
    setAuthCookie(AUTH_COOKIES.TOKEN_EXPIRES, tokenExpireTime.toString(), 30)

    // 验证保存是否成功
    const savedToken = getAuthCookie(AUTH_COOKIES.ACCESS_TOKEN)
    const savedUserInfo = getAuthCookie(AUTH_COOKIES.USER_INFO)

    if (savedToken && savedUserInfo) {
      console.log('✅ Auth data successfully saved to cookies')
    } else {
      console.error('❌ Failed to verify saved auth data in cookies')
    }
  } catch (error) {
    console.error('❌ Error saving auth data to cookies:', error)
  }
}

// Helper function to get access token
export function getAccessToken(): string | null {
  return getAuthCookie(AUTH_COOKIES.ACCESS_TOKEN)
}

// Helper function to make authenticated API calls with automatic token refresh
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  let token = getAccessToken()

  // 如果没有token，直接返回
  if (!token) {
    return fetch(url, options)
  }

  // 🎯 简化逻辑：只检查token是否已过期，不做预刷新
  if (isTokenExpired(token)) {
    console.log('⏰ Token expired, attempting refresh before API call')
    try {
      const newToken = await refreshToken(token)
      setAuthCookie(AUTH_COOKIES.ACCESS_TOKEN, newToken, 30)
      token = newToken
      console.log('✅ Token refreshed before API call')
    } catch (error) {
      console.log('❌ Failed to refresh token before API call:', error)
      await clearAuthData()
      throw new Error('Authentication failed: Token expired and refresh failed')
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  // 🚀 如果响应是401，尝试刷新token并重试一次
  if (response.status === 401 && token) {
    console.log('Received 401, attempting token refresh and retry')
    try {
      const newToken = await refreshToken(token)
      setAuthCookie(AUTH_COOKIES.ACCESS_TOKEN, newToken, 30) // 保存到cookie

      // 用新token重试请求
      headers['Authorization'] = `Bearer ${newToken}`
      const retryResponse = await fetch(url, {
        ...options,
        headers,
      })

      console.log('Request retried successfully with new token')
      return retryResponse
    } catch (error) {
      console.log('Token refresh failed after 401:', error)
      // 刷新失败，清理认证数据
      await clearAuthData()
      // 返回原始的401响应
      return response
    }
  }

  return response
}

// 刷新token
// 完成认证（从URL参数获取设备码后调用）
export async function completeAuth(deviceCode: string): Promise<DeviceAuthPollResponse> {
  const response = await fetch(`${BASE_API_URL}/api/device/complete?device_code=${deviceCode}`)

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  return await response.json()
}

// 检查URL参数中的认证状态
export function checkUrlAuthParams(): {
  authSuccess: boolean
  deviceCode?: string
  authError?: string
} {
  const urlParams = new URLSearchParams(window.location.search)
  const authSuccess = urlParams.get('auth_success') === 'true'
  const deviceCode = urlParams.get('device_code')
  const authError = urlParams.get('auth_error')

  // 清理URL参数
  if (authSuccess || authError) {
    const newUrl = window.location.pathname
    window.history.replaceState({}, document.title, newUrl)
  }

  return { authSuccess, deviceCode, authError }
}

export async function refreshToken(currentToken: string) {
  const response = await fetch(`${BASE_API_URL}/api/device/refresh-token`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${currentToken}`,
    },
  })

  if (response.status === 200) {
    const data = await response.json()
    return data.new_token
  } else if (response.status === 401) {
    // Token 真正过期，需要重新登录
    throw new Error('TOKEN_EXPIRED')
  } else {
    // 其他错误（网络错误、服务器错误等），不强制重新登录
    throw new Error(`NETWORK_ERROR: ${response.status}`)
  }
}

// 直接登录：在当前窗口跳转到Google OAuth
export function directLogin(): void {
  const authUrl = `${BASE_API_URL}/auth/login`
  window.location.href = authUrl
}

// 检查URL参数中的直接认证数据
export function checkDirectAuthParams(): {
  authSuccess: boolean
  authData?: { token: string; user_info: UserInfo }
  authError?: string
} {
  const urlParams = new URLSearchParams(window.location.search)
  const authSuccess = urlParams.get('auth_success') === 'true'
  const encodedAuthData = urlParams.get('auth_data')
  const authError = urlParams.get('auth_error')

  let authData = undefined

  if (authSuccess && encodedAuthData) {
    try {
      // 解码认证数据
      const decodedData = atob(encodedAuthData)
      authData = JSON.parse(decodedData)
    } catch (error) {
      console.error('Failed to decode auth data:', error)
    }
  }

  // 清理URL参数
  if (authSuccess || authError) {
    const newUrl = window.location.pathname
    window.history.replaceState({}, document.title, newUrl)
  }

  return { authSuccess, authData, authError }
}

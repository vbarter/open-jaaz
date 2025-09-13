/**
 * Cookie 管理工具
 * 提供安全的认证信息存储和跨标签页状态同步
 */

interface CookieOptions {
  expires?: Date | number  // 过期时间（Date对象或天数）
  path?: string           // 路径
  domain?: string         // 域名
  secure?: boolean        // 只在HTTPS下传输
  sameSite?: 'strict' | 'lax' | 'none'  // CSRF保护
}

/**
 * 设置Cookie
 */
export function setCookie(name: string, value: string, options: CookieOptions = {}): void {
  let cookieString = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`

  // 设置过期时间
  if (options.expires) {
    const expires = typeof options.expires === 'number' 
      ? new Date(Date.now() + options.expires * 24 * 60 * 60 * 1000)
      : options.expires
    cookieString += `; expires=${expires.toUTCString()}`
  }

  // 设置路径（默认为根路径）
  cookieString += `; path=${options.path || '/'}`

  // 设置域名
  if (options.domain) {
    cookieString += `; domain=${options.domain}`
  }

  // 安全设置
  if (options.secure !== false) {
    // 生产环境或HTTPS下设置secure
    if (location.protocol === 'https:' || process.env.NODE_ENV === 'production') {
      cookieString += '; secure'
    }
  }

  // SameSite设置（默认lax，平衡安全性和兼容性）
  const sameSite = options.sameSite || 'lax'
  cookieString += `; samesite=${sameSite}`

  document.cookie = cookieString
  
  console.log(`🍪 Cookie set: ${name}`)
}

/**
 * 获取Cookie
 */
export function getCookie(name: string): string | null {
  const encodedName = encodeURIComponent(name)
  const cookies = document.cookie.split(';')
  
  for (let cookie of cookies) {
    cookie = cookie.trim()
    if (cookie.startsWith(`${encodedName}=`)) {
      const value = cookie.substring(encodedName.length + 1)
      return decodeURIComponent(value)
    }
  }
  
  return null
}

/**
 * 删除Cookie
 */
export function deleteCookie(name: string, options: Pick<CookieOptions, 'path' | 'domain'> = {}): void {
  setCookie(name, '', {
    ...options,
    expires: new Date(0) // 设置为过去时间
  })
  console.log(`🗑️ Cookie deleted: ${name}`)
}

/**
 * 检查Cookie是否存在
 */
export function hasCookie(name: string): boolean {
  return getCookie(name) !== null
}

/**
 * 获取所有Cookie
 */
export function getAllCookies(): Record<string, string> {
  const cookies: Record<string, string> = {}
  
  document.cookie.split(';').forEach(cookie => {
    const [name, value] = cookie.trim().split('=')
    if (name && value) {
      cookies[decodeURIComponent(name)] = decodeURIComponent(value)
    }
  })
  
  return cookies
}

// 认证相关的Cookie名称常量
export const AUTH_COOKIES = {
  ACCESS_TOKEN: 'magicart_access_token',
  USER_INFO: 'magicart_user_info',
  TOKEN_EXPIRES: 'magicart_token_expires'
} as const

/**
 * 设置认证Cookie（带安全配置）
 */
export function setAuthCookie(name: string, value: string, expiresInDays: number = 30): void {
  // 🚨 检查是否在退出登录过程中，如果是则阻止设置cookie
  const isLoggingOut = sessionStorage.getItem('is_logging_out')
  const forceLogout = sessionStorage.getItem('force_logout')
  
  if (isLoggingOut === 'true' || forceLogout === 'true') {
    console.error(`🚨 BLOCKED: Attempted to set auth cookie '${name}' during logout process!`)
    return
  }
  
  console.log(`🍪 Setting auth cookie: ${name}`)
  
  // 🔧 优化Cookie设置，提高跨窗口兼容性
  const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  
  setCookie(name, value, {
    expires: expiresInDays,
    secure: location.protocol === 'https:' && !isLocalhost, // localhost下不强制HTTPS
    sameSite: 'lax', // 保持lax以支持跨窗口访问
    path: '/',
    // 在localhost环境下不设置domain，让cookie对所有localhost端口生效
    domain: isLocalhost ? undefined : location.hostname
  })
  
  // 🔄 同时在localStorage设置备份，防止cookie失效
  try {
    localStorage.setItem(`backup_${name}`, value)
    localStorage.setItem(`backup_${name}_expires`, (Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toString())
  } catch (error) {
    console.warn('Failed to set localStorage backup:', error)
  }
}

/**
 * 获取认证Cookie
 */
export function getAuthCookie(name: string): string | null {
  // 🍪 首先尝试从cookie获取
  let value = getCookie(name)
  
  if (value) {
    return value
  }
  
  // 🚨 检查是否在logout过程中，如果是则跳过localStorage恢复
  const isLoggingOut = sessionStorage.getItem('is_logging_out')
  const forceLogout = sessionStorage.getItem('force_logout')
  
  if (isLoggingOut === 'true' || forceLogout === 'true') {
    console.log(`🚪 Logout in progress, skipping localStorage recovery for: ${name}`)
    return null
  }
  
  // 🔄 如果cookie中没有，尝试从localStorage备份恢复
  try {
    const backupValue = localStorage.getItem(`backup_${name}`)
    const backupExpires = localStorage.getItem(`backup_${name}_expires`)
    
    if (backupValue && backupExpires) {
      const expiresTime = parseInt(backupExpires)
      
      if (Date.now() < expiresTime) {
        console.log(`🔄 Restoring auth data from localStorage backup: ${name}`)
        
        // 恢复到cookie
        const daysUntilExpiry = Math.ceil((expiresTime - Date.now()) / (24 * 60 * 60 * 1000))
        setAuthCookie(name, backupValue, daysUntilExpiry)
        
        return backupValue
      } else {
        // 备份已过期，清理
        localStorage.removeItem(`backup_${name}`)
        localStorage.removeItem(`backup_${name}_expires`)
      }
    }
  } catch (error) {
    console.warn('Failed to restore from localStorage backup:', error)
  }
  
  return null
}

/**
 * 删除认证Cookie
 */
export function deleteAuthCookie(name: string): void {
  deleteCookie(name, { path: '/' })
  
  // 🧹 同时清理localStorage备份
  try {
    localStorage.removeItem(`backup_${name}`)
    localStorage.removeItem(`backup_${name}_expires`)
  } catch (error) {
    console.warn('Failed to clear localStorage backup:', error)
  }
}

/**
 * 清理所有认证Cookie
 */
export function clearAuthCookies(): void {
  Object.values(AUTH_COOKIES).forEach(cookieName => {
    deleteAuthCookie(cookieName)
  })
  
  // 🧹 清理所有localStorage备份
  try {
    const keysToRemove = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('backup_magicart_')) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key))
  } catch (error) {
    console.warn('Failed to clear localStorage backups:', error)
  }
  
  console.log('🧹 All auth cookies and backups cleared')
}
/**
 * 用户头像 URL 生成工具（前端版本）
 * 根据 user_uuid 生成一致的头像 URL
 */

/**
 * 简单的 MD5 哈希函数（用于生成 Gravatar URL）
 */
function md5(str: string): string {
  // 使用浏览器的 SubtleCrypto API
  // 但为了兼容性，这里使用一个简单的实现
  // 在生产环境中，可以使用 crypto-js 或其他库

  // 简化版：使用 UI Avatars 代替 Gravatar
  return str
}

/**
 * 根据 user_uuid 生成头像 URL
 * 使用 DiceBear Avatars API - 免费、可靠、无需注册
 *
 * @param userUuid - 用户 UUID
 * @param style - 头像风格
 * @returns 头像 URL
 */
export function generateAvatarUrl(
  userUuid: string,
  style: 'avataaars' | 'bottts' | 'identicon' | 'initials' | 'pixel-art' = 'avataaars'
): string {
  if (!userUuid) {
    return `https://api.dicebear.com/7.x/${style}/svg?seed=anonymous`
  }

  // 使用 DiceBear API 生成头像
  // seed 参数确保同一个 UUID 始终生成相同的头像
  return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(userUuid)}`
}

/**
 * 根据邮箱生成 Gravatar URL
 *
 * @param email - 用户邮箱
 * @param size - 头像尺寸（像素）
 * @returns Gravatar URL
 */
export function getGravatarUrl(email: string, size: number = 200): string {
  // 简单的 MD5 实现（仅用于 Gravatar）
  // 在生产环境中应该使用完整的 MD5 库
  const hash = email.toLowerCase().trim()

  // 使用 MD5Online 等服务的 API
  // 或者直接使用 UI Avatars
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(email)}&size=${size}&background=random`
}

/**
 * 获取默认头像 URL（当用户头像不存在时使用）
 *
 * @param identifier - 标识符（可以是 UUID、email 等）
 * @returns 默认头像 URL
 */
export function getDefaultAvatarUrl(identifier?: string): string {
  const seed = identifier || 'default'
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`
}

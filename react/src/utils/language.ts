/**
 * 前端与后端语言代码映射工具
 * 前端使用: 'en', 'zh-CN'
 * 后端使用: 'en', 'zh'
 */

export const mapFrontendToBackendLanguage = (frontendLang: string): string => {
  const langMap: Record<string, string> = {
    'en': 'en',
    'zh-CN': 'zh',
  }

  return langMap[frontendLang] || 'zh' // 默认中文
}

export const mapBackendToFrontendLanguage = (backendLang: string): string => {
  const langMap: Record<string, string> = {
    'en': 'en',
    'zh': 'zh-CN',
  }

  return langMap[backendLang] || 'zh-CN' // 默认中文
}

/**
 * 从 i18next 语言获取后端API语言参数
 */
export const getApiLanguage = (i18nLanguage: string): string => {
  return mapFrontendToBackendLanguage(i18nLanguage)
}
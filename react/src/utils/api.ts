/**
 * API 请求工具类
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || ''

class ApiClient {
  private async request(url: string, options: RequestInit = {}): Promise<any> {
    const fullUrl = `${API_BASE_URL}${url}`

    // 添加认证头和默认配置
    const defaultHeaders: HeadersInit = {
      'Content-Type': 'application/json',
    }

    const config: RequestInit = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
      credentials: 'include', // 包含 cookies
    }

    try {
      const response = await fetch(fullUrl, config)

      // 处理错误响应
      if (!response.ok) {
        const error = await response.json().catch(() => ({
          message: `HTTP error! status: ${response.status}`,
        }))
        throw new Error(error.message || error.detail || 'Request failed')
      }

      // 解析响应
      const data = await response.json()
      return data
    } catch (error) {
      console.error('API request failed:', error)
      throw error
    }
  }

  async get(url: string, options?: RequestInit): Promise<any> {
    return this.request(url, {
      ...options,
      method: 'GET',
    })
  }

  async post(url: string, body?: any, options?: RequestInit): Promise<any> {
    return this.request(url, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  async put(url: string, body?: any, options?: RequestInit): Promise<any> {
    return this.request(url, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  async delete(url: string, options?: RequestInit): Promise<any> {
    return this.request(url, {
      ...options,
      method: 'DELETE',
    })
  }

  async patch(url: string, body?: any, options?: RequestInit): Promise<any> {
    return this.request(url, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    })
  }
}

// 导出单例
export const api = new ApiClient()
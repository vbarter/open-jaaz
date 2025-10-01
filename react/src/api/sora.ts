/**
 * Sora2 视频生成 API
 */

export interface Sora2GenRequest {
  prompt: string
  model?: string
  aspect_ratio?: string
  duration?: number
  resolution?: string
}

export interface Sora2GenResponse {
  task_id: string
  video_url?: string
  status: 'processing' | 'completed' | 'failed'
  message: string
}

export interface Sora2TaskDetail {
  id: number
  user_uuid: string
  prompt: string
  model: string
  images: string[]
  video_url: string
  status: 'running' | 'success' | 'failed'
  remark: string
  ctime: string
  mtime: string
}

export interface Sora2TaskListResponse {
  tasks: Sora2TaskDetail[]
  total: number
  limit: number
  offset: number
}

/**
 * 生成 Sora2 视频
 */
export const generateSora2Video = async (
  request: Sora2GenRequest
): Promise<Sora2GenResponse> => {
  console.log('[API Sora2] 开始发送 Sora2 视频生成请求:', request)

  try {
    const response = await fetch('/api/sora_2_gen', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    console.log('[API Sora2] 收到响应:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[API Sora2] 请求失败，错误响应:', errorText)
      throw new Error(`Sora2 视频生成失败: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    console.log('[API Sora2] 请求成功，响应数据:', data)

    return data as Sora2GenResponse
  } catch (error) {
    console.error('[API Sora2] 请求过程中发生错误:', error)
    throw error
  }
}

/**
 * 获取 Sora2 任务列表
 */
export const getSora2Tasks = async (params?: {
  status?: 'running' | 'success' | 'failed'
  limit?: number
  offset?: number
}): Promise<Sora2TaskListResponse> => {
  console.log('[API Sora2] 获取任务列表 - 参数:', params)

  try {
    const queryParams = new URLSearchParams()
    if (params?.status) queryParams.append('status', params.status)
    if (params?.limit) queryParams.append('limit', params.limit.toString())
    if (params?.offset) queryParams.append('offset', params.offset.toString())

    const url = `/api/sora2/tasks${queryParams.toString() ? `?${queryParams}` : ''}`
    console.log('[API Sora2] 请求URL:', url)

    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include', // 包含 cookies（认证信息）
    })

    console.log('[API Sora2] 响应状态:', response.status, response.statusText)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[API Sora2] 获取任务列表失败 - 错误响应:', errorText)
      throw new Error(`获取任务列表失败: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    console.log('[API Sora2] 任务列表获取成功 - 数据:', data)

    return data as Sora2TaskListResponse
  } catch (error) {
    console.error('[API Sora2] 获取任务列表出错:', error)
    throw error
  }
}

/**
 * 获取 Sora2 单个任务详情
 */
export const getSora2Task = async (taskId: number): Promise<Sora2TaskDetail> => {
  console.log('[API Sora2] 获取任务详情:', taskId)

  try {
    const response = await fetch(`/api/sora2/tasks/${taskId}`)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[API Sora2] 获取任务详情失败:', errorText)
      throw new Error(`获取任务详情失败: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    console.log('[API Sora2] 任务详情获取成功:', data)

    return data as Sora2TaskDetail
  } catch (error) {
    console.error('[API Sora2] 获取任务详情出错:', error)
    throw error
  }
}

/**
 * 删除 Sora2 任务
 */
export const deleteSora2Task = async (taskId: string): Promise<void> => {
  console.log('[API Sora2] 删除任务:', taskId)

  try {
    const response = await fetch(`/api/sora2/tasks/${taskId}`, {
      method: 'DELETE',
      credentials: 'include',
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[API Sora2] 删除任务失败:', errorText)
      throw new Error(`删除任务失败: ${response.status} ${response.statusText}`)
    }

    console.log('[API Sora2] 任务删除成功')
  } catch (error) {
    console.error('[API Sora2] 删除任务出错:', error)
    throw error
  }
}

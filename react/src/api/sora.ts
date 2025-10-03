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
  status: 'processing' | 'completed' | 'failed' | 'insufficient_points'
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
  views?: number
  likes?: number
  share_id?: string // 分享ID
  user_image_url?: string // 用户头像 URL
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
export const generateSora2Video = async (request: Sora2GenRequest): Promise<Sora2GenResponse> => {
  try {
    const response = await fetch('/api/sora_2_gen', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[API Sora2] 请求失败，错误响应:', errorText)
      throw new Error(`Sora2 视频生成失败: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()

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
  try {
    const queryParams = new URLSearchParams()
    if (params?.status) queryParams.append('status', params.status)
    if (params?.limit) queryParams.append('limit', params.limit.toString())
    if (params?.offset) queryParams.append('offset', params.offset.toString())

    const url = `/api/sora2/tasks${queryParams.toString() ? `?${queryParams}` : ''}`

    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include', // 包含 cookies（认证信息）
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[API Sora2] 获取任务列表失败 - 错误响应:', errorText)
      throw new Error(`获取任务列表失败: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()

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
  } catch (error) {
    console.error('[API Sora2] 删除任务出错:', error)
    throw error
  }
}

/**
 * 分享相关接口
 */
export interface CreateShareResponse {
  share_id: string
  share_url: string
  views: number
  likes: number
}

export interface ShareVideoDetail {
  id?: number // 视频ID（可选，用于点赞等操作）
  share_id: string // 分享ID（主要标识符）
  prompt: string
  video_url: string
  views: number
  likes: number
  user_uuid: string
  user_image_url?: string
  ctime: string
}

/**
 * 创建分享链接
 */
export const createShare = async (videoId: number): Promise<CreateShareResponse> => {
  try {
    const response = await fetch('/api/sora2/share', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ video_id: videoId }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[API Sora2] 创建分享失败:', errorText)
      throw new Error(`创建分享失败: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data as CreateShareResponse
  } catch (error) {
    console.error('[API Sora2] 创建分享出错:', error)
    throw error
  }
}

/**
 * 获取分享视频详情（公开访问）
 */
export const getShareVideo = async (shareId: string): Promise<ShareVideoDetail> => {
  // console.log('[API Sora2] 获取分享视频:', shareId)

  try {
    const response = await fetch(`/api/sora2/share/${shareId}`)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[API Sora2] 获取分享视频失败:', errorText)
      throw new Error(`获取分享失败: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    // console.log('[API Sora2] 分享视频获取成功:', data)
    return data as ShareVideoDetail
  } catch (error) {
    console.error('[API Sora2] 获取分享视频出错:', error)
    throw error
  }
}

/**
 * 增加分享视频访问量
 */
export const incrementShareView = async (
  shareId: string
): Promise<{ success: boolean; views: number }> => {
  // console.log('[API Sora2] 增加访问量:', shareId)

  try {
    const response = await fetch(`/api/sora2/share/${shareId}/view`, {
      method: 'POST',
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[API Sora2] 增加访问量失败:', errorText)
      throw new Error(`增加访问量失败: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    // console.log('[API Sora2] 访问量增加成功:', data)
    return data
  } catch (error) {
    console.error('[API Sora2] 增加访问量出错:', error)
    throw error
  }
}

/**
 * 点赞分享视频
 */
export const likeShareVideo = async (
  shareId: string
): Promise<{ success: boolean; likes: number }> => {
  console.log('[API Sora2] 点赞分享:', shareId)

  try {
    const response = await fetch(`/api/sora2/share/${shareId}/like`, {
      method: 'POST',
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[API Sora2] 点赞失败:', errorText)
      throw new Error(`点赞失败: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    console.log('[API Sora2] 点赞成功:', data)
    return data
  } catch (error) {
    console.error('[API Sora2] 点赞出错:', error)
    throw error
  }
}

/**
 * 获取发现页面的视频列表（所有用户的成功视频）
 */
export const getDiscoverVideos = async (params?: {
  limit?: number
  offset?: number
  sort_by?: 'time' | 'likes' | 'views'
}): Promise<Sora2TaskListResponse> => {
  try {
    const queryParams = new URLSearchParams()
    if (params?.limit) queryParams.append('limit', params.limit.toString())
    if (params?.offset) queryParams.append('offset', params.offset.toString())
    if (params?.sort_by) queryParams.append('sort_by', params.sort_by)

    const url = `/api/sora2/discover${queryParams.toString() ? `?${queryParams}` : ''}`
    const response = await fetch(url, {
      method: 'GET',
    })
    if (!response.ok) {
      const errorText = await response.text()
      console.error('[API Sora2] 获取发现页面视频列表失败 - 错误响应:', errorText)
      throw new Error(`获取发现页面视频列表失败: ${response.status} ${response.statusText}`)
    }
    const data = await response.json()
    return data as Sora2TaskListResponse
  } catch (error) {
    console.error('[API Sora2] 获取发现页面视频列表出错:', error)
    throw error
  }
}

/**
 * 获取分享页面随机推荐视频（随机获取成功的视频）
 */
export const getShareShowVideo = async (params?: {
  exclude_ids?: number[] // 排除已看过的视频ID
}): Promise<Sora2TaskDetail | null> => {
  try {
    const queryParams = new URLSearchParams()
    if (params?.exclude_ids && params.exclude_ids.length > 0) {
      queryParams.append('exclude_ids', params.exclude_ids.join(','))
    }

    const url = `/api/sora2/share_show${queryParams.toString() ? `?${queryParams}` : ''}`
    const response = await fetch(url, {
      method: 'GET',
    })

    // 如果接口未实现（404），返回null触发降级
    if (response.status === 404) {
      console.warn('[API Sora2] /api/sora2/share_show 接口未实现，请实现后端接口')
      return null
    }

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[API Sora2] 获取分享推荐视频失败 - 错误响应:', errorText)
      throw new Error(`获取分享推荐视频失败: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()

    // 如果没有更多视频，返回null
    if (!data || !data.id) {
      return null
    }

    return data as Sora2TaskDetail
  } catch (error) {
    // 如果是JSON解析错误（说明返回的是HTML），说明接口未实现
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
      console.warn('[API Sora2] /api/sora2/share_show 接口未实现，返回的不是JSON格式')
      return null
    }
    console.error('[API Sora2] 获取分享推荐视频出错:', error)
    throw error
  }
}

/**
 * ==================== 互动功能接口（浏览、点赞）====================
 */

export interface RecordViewResponse {
  success: boolean
  views: number
}

export interface ToggleLikeResponse {
  success: boolean
  is_liked: boolean
  likes: number
}

export interface UserLikesResponse {
  liked_video_ids: number[]
}

/**
 * 记录视频播放次数
 */
export const recordVideoView = async (videoId: number): Promise<RecordViewResponse> => {
  try {
    const response = await fetch('/api/sora2/view', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ video_id: videoId }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[API Sora2] 记录浏览失败:', errorText)
      throw new Error(`记录浏览失败: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data as RecordViewResponse
  } catch (error) {
    console.error('[API Sora2] 记录浏览出错:', error)
    throw error
  }
}

/**
 * 切换视频点赞状态
 */
export const toggleVideoLike = async (videoId: number): Promise<ToggleLikeResponse> => {
  try {
    const response = await fetch('/api/sora2/like', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ video_id: videoId }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[API Sora2] 切换点赞失败:', errorText)
      throw new Error(`切换点赞失败: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data as ToggleLikeResponse
  } catch (error) {
    console.error('[API Sora2] 切换点赞出错:', error)
    throw error
  }
}

/**
 * 获取用户的点赞列表
 */
export const getUserLikes = async (videoIds: number[]): Promise<UserLikesResponse> => {
  try {
    const idsParam = videoIds.join(',')
    const response = await fetch(`/api/sora2/user-likes?video_ids=${idsParam}`, {
      method: 'GET',
      credentials: 'include',
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[API Sora2] 获取用户点赞列表失败:', errorText)
      throw new Error(`获取用户点赞列表失败: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data as UserLikesResponse
  } catch (error) {
    console.error('[API Sora2] 获取用户点赞列表出错:', error)
    throw error
  }
}

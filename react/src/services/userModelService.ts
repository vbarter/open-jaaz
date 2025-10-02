import { api } from '@/utils/api'

export interface UserModels {
  text_model?: {
    provider: string
    model: string
    type: string
  }
  selected_image_tool?: {
    provider: string
    id: string
    display_name?: string
    type: string
  }
  selected_video_tool?: {
    provider: string
    id: string
    display_name?: string
    type: string
  }
}

class UserModelService {
  /**
   * 获取用户保存的模型配置
   */
  async getUserModels(): Promise<UserModels | null> {
    try {
      const response = await api.get('/api/user_models')

      if (response.success && response.data) {
        return response.data
      }
      return null
    } catch (error) {
      return null
    }
  }

  /**
   * 保存用户的模型配置
   */
  async saveUserModels(models: UserModels): Promise<boolean> {
    try {
      const response = await api.post('/api/user_models', models)
      if (response.success) {
        return true
      }
      return false
    } catch (error) {
      return false
    }
  }

  /**
   * 删除用户的模型配置
   */
  async deleteUserModels(): Promise<boolean> {
    try {
      const response = await api.delete('/api/user_models')

      if (response.success) {
        return true
      }
      return false
    } catch (error) {
      return false
    }
  }
}

// 导出单例
export const userModelService = new UserModelService()

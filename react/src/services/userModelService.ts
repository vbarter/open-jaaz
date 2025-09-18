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
        console.log('📥 [UserModelService] 获取用户模型配置:', response.data)
        return response.data
      }

      console.log('ℹ️ [UserModelService] 用户没有保存的模型配置')
      return null
    } catch (error) {
      console.error('❌ [UserModelService] 获取用户模型失败:', error)
      return null
    }
  }

  /**
   * 保存用户的模型配置
   */
  async saveUserModels(models: UserModels): Promise<boolean> {
    try {
      console.log('💾 [UserModelService] 保存用户模型配置:', models)

      const response = await api.post('/api/user_models', models)

      if (response.success) {
        console.log('✅ [UserModelService] 模型配置保存成功')
        return true
      }

      console.error('❌ [UserModelService] 模型配置保存失败:', response)
      return false
    } catch (error) {
      console.error('❌ [UserModelService] 保存用户模型失败:', error)
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
        console.log('✅ [UserModelService] 模型配置删除成功')
        return true
      }

      console.error('❌ [UserModelService] 模型配置删除失败:', response)
      return false
    } catch (error) {
      console.error('❌ [UserModelService] 删除用户模型失败:', error)
      return false
    }
  }
}

// 导出单例
export const userModelService = new UserModelService()
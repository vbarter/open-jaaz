import { Message, Model } from '@/types/types'
import { ToolInfo } from './model'

export const sendMagicGenerate = async (payload: {
  sessionId: string
  canvasId: string
  newMessages: Array<{
    role: string;
    content: string | Array<{
      type: string;
      text?: string;
      image_url?: { url: string }
    }>
  }>
  systemPrompt: string | null
  templateId?: number
  aspectRatio?: string
  quantity?: number
  language?: string
}) => {

  const requestBody = {
    messages: payload.newMessages,
    canvas_id: payload.canvasId,
    session_id: payload.sessionId,
    system_prompt: payload.systemPrompt,
    template_id: payload.templateId?.toString() || '',
    aspect_ratio: payload.aspectRatio,
    quantity: payload.quantity,
    language: payload.language,
  };

  try {

    const response = await fetch(`/api/magic`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('[API Magic] 请求失败，错误响应:', errorText);
      throw new Error(`Magic generation failed: ${response.status} ${response.statusText} - ${errorText}`)
    }
    
    const data = await response.json()


    // 处理防重复机制的响应
    if (data.status === 'already_processing') {
      console.warn('[API Magic] 检测到重复请求，正在处理中');
      throw new Error('正在生成中，请稍候...');
    }

    if (data.status === 'rate_limited') {
      console.warn('[API Magic] 请求频率过高');
      throw new Error('请求过于频繁，请稍后再试');
    }

    return data as Message[]
  } catch (error) {
    console.error('[API Magic] 请求过程中发生错误:', error);
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error('[API Magic] 网络错误 - 可能是CORS或连接问题');
    }
    throw error;
  }
}

export const cancelMagicGenerate = async (sessionId: string) => {
    const response = await fetch(`/api/magic/cancel/${sessionId}`, {
        method: 'POST',
    })
    return await response.json()
}

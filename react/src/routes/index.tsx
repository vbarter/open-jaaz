import { createCanvas } from '@/api/canvas'
import ChatTextarea from '@/components/chat/ChatTextarea'
import CanvasList from '@/components/home/CanvasList'
import { LanguageAwareTextFlip } from '@/components/ui/language-aware-text-flip'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useConfigs } from '@/contexts/configs'
import { DEFAULT_SYSTEM_PROMPT } from '@/constants'
import { useMutation } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { nanoid } from 'nanoid'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import TopMenu from '@/components/TopMenu'
import Footer from '@/components/common/Footer'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { setInitCanvas } = useConfigs()

  // 读取URL中的auto_prompt参数
  const [initialPrompt, setInitialPrompt] = useState('')
  const [selectedPlugin, setSelectedPlugin] = useState('') // 🆕 Add plugin state

  useEffect(() => {
    // 从URL中获取auto_prompt参数
    const urlParams = new URLSearchParams(window.location.search)
    const autoPrompt = urlParams.get('auto_prompt')

    if (autoPrompt) {
      // URL解码并设置初始提示词
      setInitialPrompt(decodeURIComponent(autoPrompt))
    }
  }, [])

  const { mutate: createCanvasMutation, isPending } = useMutation({
    mutationFn: createCanvas,
    onSuccess: (data, variables) => {
      setInitCanvas(true)

      // 将用户消息存储到localStorage，供canvas页面立即显示
      if (variables.messages && variables.messages.length > 0) {
        const messageData = {
          sessionId: variables.session_id,
          message: variables.messages[0],
          timestamp: Date.now(),
          canvasId: data.id,
          plugin: variables.plugin // 🆕 存储插件参数
        }
        localStorage.setItem('initial_user_message', JSON.stringify(messageData))
      }

      // 立即跳转到canvas页面，移除不必要的延迟
      navigate({
        to: '/canvas/$id',
        params: { id: data.id },
        search: {
          sessionId: variables.session_id,
        },
      })
    },
    onError: (error) => {
      console.error('[debug] Canvas创建失败:', error)
      toast.error(t('common:messages.error'), {
        description: error.message,
      })
    },
  })

  return (
    <div className='flex flex-col h-screen relative overflow-hidden bg-soft-blue-radial'>
      <TopMenu />
      <ScrollArea className='h-full relative z-10'>
        <div className='relative flex flex-col items-center justify-center h-fit min-h-[calc(100vh-400px)] sm:min-h-[calc(100vh-460px)] pt-[40px] sm:pt-[60px] px-4 sm:px-6 select-none'>
          {/* 主内容区域 - 添加玻璃形态效果 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.21, 1.11, 0.81, 0.99] }}
            className='w-full max-w-4xl mx-auto p-8 sm:p-12'
          >
            <LanguageAwareTextFlip
              prefix={t('home:titlePrefix')}
              words={t('home:flipWords', { returnObjects: true }) as string[]}
              suffix={t('home:titleSuffix')}
              duration={3000}
              className='mb-6'
            />

            <p className='text-base sm:text-lg md:text-xl lg:text-2xl text-gray-700 dark:text-gray-200
                          mb-10 text-center px-2 sm:px-4 leading-relaxed font-medium'>
              {t('home:subtitle')}
            </p>

            <div className='w-full max-w-3xl mx-auto px-2 sm:px-0'>
              <div className='rounded-xl sm:rounded-2xl'>
                <ChatTextarea
                  variant='homepage'
                  className='w-full border-0 bg-transparent'
                  messages={[]}
                  initialValue={initialPrompt}
                  selectedPlugin={selectedPlugin} // 🆕 Pass state
                  setSelectedPlugin={setSelectedPlugin} // 🆕 Pass setter
                  onSend={(messages, configs) => {
                    createCanvasMutation({
                      name: t('home:newCanvas'),
                      canvas_id: nanoid(),
                      messages: messages,
                      session_id: nanoid(),
                      text_model: configs.textModel,
                      tool_list: configs.toolList,
                      model_name: configs.modelName,
                      system_prompt: localStorage.getItem('system_prompt') || DEFAULT_SYSTEM_PROMPT,
                      plugin: configs.plugin // 🆕 传递插件参数
                    })
                  }}
                  pending={isPending}
                />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Canvas 列表区域 - 添加微妙的背景 */}
        <div className='relative z-10 mt-8 sm:mt-12'>
          <CanvasList />
        </div>

        <Footer />
      </ScrollArea>
    </div>
  )
}

import { LLMConfig } from '@/types/types'

export async function getConfigExists(): Promise<{ exists: boolean }> {
  const response = await fetch('/api/config/exists')
  return await response.json()
}

export async function getConfig(): Promise<{ [key: string]: LLMConfig }> {
  const response = await fetch('/api/config')
  return await response.json()
}

export async function updateConfig(config: {
  [key: string]: LLMConfig
}): Promise<{ status: string; message: string }> {
  const response = await fetch('/api/config', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  })
  return await response.json()
}

// Update jaaz provider api_key after login
export async function updateJaazApiKey(token: string): Promise<void> {
  try {
    const config = await getConfig()

    if (config.jaaz) {
      config.jaaz.api_key = token
    }

    await updateConfig(config)
  } catch (error) {
    console.error('Error updating provider api_key:', error)
  }
}

// Clear jaaz provider api_key after logout
export async function clearJaazApiKey(): Promise<void> {
  try {
    const config = await getConfig()

    if (config.jaaz) {
      config.jaaz.api_key = ''
      await updateConfig(config)

    }
  } catch (error) {
    console.error('Error clearing provider api_key:', error)
  }
}

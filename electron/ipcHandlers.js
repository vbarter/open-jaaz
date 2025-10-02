// ipcHandlers.js
const { chromium, BrowserContext } = require('playwright')
const path = require('path')
const { app, BrowserWindow, shell } = require('electron')
const fs = require('fs')
const { spawn, fork } = require('child_process')

// Track installation process
let installationWorker = null
let installationPromise = null

module.exports = {
  // 处理打开浏览器的请求
  'open-browser-url': async (event, url) => {
    try {
      await shell.openExternal(url)
      return { success: true }
    } catch (error) {
      console.error('Failed to open browser:', error)
      return { success: false, error: error.message }
    }
  },

  publishPost: async (event, data) => {
    // console.log('🦄🦄publishPost called with data:', data)
    try {
      if (data.channel === 'xiaohongshu') {
        await publishXiaohongshu(data)
      } else if (data.channel === 'bilibili') {
        await publishBilibili(data)
      } else if (data.channel === 'youtube') {
        await publishYoutube(data)
      }
    } catch (error) {
      console.error('Error in publish post:', error)
      return { error: error.message }
    }
  },
  'install-comfyui': async (event) => {
    // Prevent multiple installations
    if (installationWorker) {
      return { error: 'Installation already in progress' }
    }

    try {
      // Create a promise to track the installation
      installationPromise = new Promise((resolve, reject) => {
        // Fork a child process to run the installation
        const workerPath = path.join(__dirname, 'comfyUIInstaller.js')

        // Prepare environment variables for the child process
        const env = {
          ...process.env,
          USER_DATA_DIR: app.getPath('userData'),
          IS_WORKER_PROCESS: 'true',
        }

        installationWorker = fork(workerPath, [], {
          stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
          env: env,
        })

        console.log('🦄 Started ComfyUI installation worker process')

        // Handle messages from worker process
        installationWorker.on('message', (message) => {
          console.log('🦄 Received message from worker:', message)

          // Forward progress, log, error, and cancelled messages to renderer
          const mainWindow = BrowserWindow.getAllWindows()[0]
          if (mainWindow) {
            if (message.type === 'progress') {
              mainWindow.webContents.executeJavaScript(`
                window.dispatchEvent(new CustomEvent('comfyui-install-progress', {
                  detail: { percent: ${message.percent}, status: "${(message.status || '').replace(
                /"/g,
                '\\"'
              )}" }
                }));
              `)
            } else if (message.type === 'log') {
              mainWindow.webContents.executeJavaScript(`
                window.dispatchEvent(new CustomEvent('comfyui-install-log', {
                  detail: { message: "${(message.message || '').replace(/"/g, '\\"')}" }
                }));
              `)
            } else if (message.type === 'error') {
              mainWindow.webContents.executeJavaScript(`
                window.dispatchEvent(new CustomEvent('comfyui-install-error', {
                  detail: { error: "${(message.error || 'Unknown error occurred').replace(
                    /"/g,
                    '\\"'
                  )}" }
                }));
              `)
            } else if (message.type === 'cancelled') {
              mainWindow.webContents.executeJavaScript(`
                window.dispatchEvent(new CustomEvent('comfyui-install-cancelled', {
                  detail: { message: "${(message.message || 'Installation cancelled').replace(
                    /"/g,
                    '\\"'
                  )}" }
                }));
              `)
            }
          }

          if (message.type === 'install-complete') {
            installationWorker = null
            installationPromise = null
            resolve(message.result)
          } else if (message.type === 'install-error') {
            installationWorker = null
            installationPromise = null
            reject(new Error(message.error || 'Unknown error occurred'))
          } else if (message.type === 'install-cancelled') {
            installationWorker = null
            installationPromise = null
            resolve({
              cancelled: true,
              message: message.message || 'Installation cancelled',
            })
          }
        })

        // Handle worker process errors
        installationWorker.on('error', (error) => {
          console.error('🦄 Worker process error:', error)
          installationWorker = null
          installationPromise = null
          reject(error)
        })

        // Handle worker process exit
        installationWorker.on('exit', (code, signal) => {
          console.log(`🦄 Worker process exited with code ${code}, signal ${signal}`)
          if (installationWorker) {
            installationWorker = null
            installationPromise = null
            if (code !== 0) {
              reject(new Error(`Installation process exited with code ${code}`))
            }
          }
        })

        // Start the installation
        installationWorker.send({ type: 'start-install' })
      })

      const result = await installationPromise
      return result
    } catch (error) {
      console.error('Error installing ComfyUI:', error)

      // Clean up worker if it still exists
      if (installationWorker) {
        installationWorker.kill('SIGTERM')
        installationWorker = null
        installationPromise = null
      }

      return { error: error.message }
    }
  },
  'cancel-comfyui-install': async (event) => {
    console.log('🦄🦄cancel-comfyui-install called')

    try {
      if (!installationWorker) {
        return { error: 'No installation in progress' }
      }

      // Send cancellation message to worker process
      installationWorker.send({ type: 'cancel-install' })

      return { success: true, message: 'Installation cancellation requested' }
    } catch (error) {
      console.error('Error cancelling ComfyUI installation:', error)

      // Force kill the worker if message sending fails
      if (installationWorker) {
        installationWorker.kill('SIGTERM')
        installationWorker = null
        installationPromise = null
      }

      return { error: error.message }
    }
  },
  'check-comfyui-installed': async (event) => {
    console.log('🦄🦄check-comfyui-installed called')

    try {
      const { isComfyUIInstalled } = require('./comfyUIManager')
      return isComfyUIInstalled()
    } catch (error) {
      console.error('Error checking ComfyUI installation:', error)
      return false
    }
  },
  'start-comfyui-process': async (event) => {
    console.log('🦄🦄start-comfyui-process called')

    try {
      const { startComfyUIProcess } = require('./comfyUIManager')
      const result = await startComfyUIProcess()
      return result
    } catch (error) {
      console.error('Error starting ComfyUI process:', error)
      return { success: false, message: error.message }
    }
  },
  'stop-comfyui-process': async (event) => {
    console.log('🦄🦄stop-comfyui-process called')

    try {
      const { stopComfyUIProcess } = require('./comfyUIManager')
      const result = await stopComfyUIProcess()
      return result
    } catch (error) {
      console.error('Error stopping ComfyUI process:', error)
      return { success: false, message: error.message }
    }
  },
  'get-comfyui-process-status': async (event) => {
    console.log('🦄🦄get-comfyui-process-status called')

    try {
      const { getComfyUIProcessStatus } = require('./comfyUIManager')
      const status = getComfyUIProcessStatus()
      return status
    } catch (error) {
      console.error('Error getting ComfyUI process status:', error)
      return { running: false }
    }
  },
  'uninstall-comfyui': async (event) => {
    console.log('🦄🦄uninstall-comfyui called')

    // Prevent multiple uninstallations
    if (installationWorker) {
      return { error: 'Installation/uninstallation already in progress' }
    }

    try {
      // Create a promise to track the uninstallation
      installationPromise = new Promise((resolve, reject) => {
        // Fork a child process to run the uninstallation
        const workerPath = path.join(__dirname, 'comfyUIInstaller.js')

        // Prepare environment variables for the child process
        const env = {
          ...process.env,
          USER_DATA_DIR: app.getPath('userData'),
          IS_WORKER_PROCESS: 'true',
        }

        installationWorker = fork(workerPath, [], {
          stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
          env: env,
        })

        console.log('🦄 Started ComfyUI uninstallation worker process')

        // Handle messages from worker process
        installationWorker.on('message', (message) => {
          console.log('🦄 Received message from worker:', message)

          // Forward progress, log, and error messages to renderer
          const mainWindow = BrowserWindow.getAllWindows()[0]
          if (mainWindow) {
            if (message.type === 'progress') {
              mainWindow.webContents.executeJavaScript(`
                window.dispatchEvent(new CustomEvent('comfyui-uninstall-progress', {
                  detail: { percent: ${message.percent}, status: "${(message.status || '').replace(
                /"/g,
                '\\"'
              )}" }
                }));
              `)
            } else if (message.type === 'log') {
              mainWindow.webContents.executeJavaScript(`
                window.dispatchEvent(new CustomEvent('comfyui-uninstall-log', {
                  detail: { message: "${(message.message || '').replace(/"/g, '\\"')}" }
                }));
              `)
            } else if (message.type === 'error') {
              mainWindow.webContents.executeJavaScript(`
                window.dispatchEvent(new CustomEvent('comfyui-uninstall-error', {
                  detail: { error: "${(message.error || 'Unknown error occurred').replace(
                    /"/g,
                    '\\"'
                  )}" }
                }));
              `)
            }
          }

          if (message.type === 'uninstall-complete') {
            installationWorker = null
            installationPromise = null
            resolve(message.result)
          } else if (message.type === 'uninstall-error') {
            installationWorker = null
            installationPromise = null
            reject(new Error(message.error || 'Unknown error occurred'))
          }
        })

        // Handle worker process errors
        installationWorker.on('error', (error) => {
          console.error('🦄 Worker process error:', error)
          installationWorker = null
          installationPromise = null
          reject(error)
        })

        // Handle worker process exit
        installationWorker.on('exit', (code, signal) => {
          console.log(`🦄 Worker process exited with code ${code}, signal ${signal}`)
          if (installationWorker) {
            installationWorker = null
            installationPromise = null
            if (code !== 0) {
              reject(new Error(`Uninstallation process exited with code ${code}`))
            }
          }
        })

        // Start the uninstallation
        installationWorker.send({ type: 'start-uninstall' })
      })

      const result = await installationPromise
      return result
    } catch (error) {
      console.error('Error uninstalling ComfyUI:', error)

      // Clean up worker if it still exists
      if (installationWorker) {
        installationWorker.kill('SIGTERM')
        installationWorker = null
        installationPromise = null
      }

      return { error: error.message }
    }
  },
}

const userDataDir = app.getPath('userData')
/** @type {BrowserContext | null} */
let browser

async function launchBrowser() {
  const context = await chromium.launchPersistentContext(path.join(userDataDir, 'browser_data'), {
    headless: false,
    channel: 'chrome',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars', // hides "Chrome is being controlled" banner
    ],
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
  })

  return context
}

/**
 * @typedef {Object} PublishData
 * @property {"youtube" | "bilibili" | "douyin" | "xiaohongshu"} channel - The platform to publish to
 * @property {string} title - The title of the post
 * @property {string} content - The content of the post
 * @property {string[]} images - Array of image paths
 * @property {string} video - Path to the video file
 */

/**
 * @param {PublishData} data - The data for publishing the post
 */
async function publishXiaohongshu(data) {
  if (!browser) {
    browser = await launchBrowser()
  }
  const page = await browser.newPage()
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    })
  })
  try {
    await page.goto('https://creator.xiaohongshu.com/publish/publish')

    // Wait for the upload container to be visible
    try {
      await page.waitForSelector('.upload-container', { timeout: 5000 })
    } catch (error) {
      throw new Error('Please login to Xiaohongshu first')
    }

    // Check if video upload tab exists
    const videoTab = await page.$('.creator-tab:has-text("上传视频")')
    if (!videoTab) {
      throw new Error('Video upload tab not found on the page')
    }

    // Click on "上传视频" (Upload Video) button
    await videoTab.click()

    // Wait for the file input to be visible
    await page.waitForSelector('input[type="file"]')

    // Check if video path exists in data
    if (!data.video) {
      throw new Error('No video file path provided in data')
    }

    // Upload the video file
    await page.setInputFiles('input[type="file"]', data.video)

    // Wait for upload progress to appear
    await page.waitForSelector('.uploading', { timeout: 10000 })

    // Wait a bit more to ensure the upload is fully processed
    await page.waitForTimeout(1000)

    const [content, uploadComplete] = await Promise.all([
      fillXiaohongshuContent(page, data.title, data.content),
      waitForXiaohongshuUploadComplete(page),
    ])

    console.log('🦄🦄uploadComplete:', uploadComplete)

    // Wait a bit to ensure content is properly set
    await page.waitForTimeout(1000)
  } catch (error) {
    console.error('Error during video upload:', error)
    throw error
  } finally {
    // await page.close();
  }
}

async function fillXiaohongshuContent(page, title, content) {
  // fill in title
  await page.waitForSelector(
    'input.d-text[placeholder="填写标题会有更多赞哦～"]',
    { timeout: 10000 } // Increase timeout if necessary
  )

  // Focus on the input field
  await page.focus('input.d-text[placeholder="填写标题会有更多赞哦～"]')
  await page.fill('input.d-text[placeholder="填写标题会有更多赞哦～"]', title || '')

  await page.waitForTimeout(1000)
  await page.waitForSelector('.ql-editor')
  await page.focus('.ql-editor')
  const { tags, content: contentWithoutTags } = getTagsFromContent(content || '')

  // Fill in the content by clipboard copying pasting
  await copyPasteContent(page, contentWithoutTags)
  await page.waitForTimeout(2000)

  await page.keyboard.press('Enter')

  await page.waitForTimeout(1000)

  // Add hashtags
  console.log('🦄🦄tags:', tags)
  for (const tag of tags) {
    await copyPasteContent(page, `#${tag}`)
    await page.waitForTimeout(2000)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1000)
  }

  await page.waitForTimeout(1000)

  return true
}

async function waitForXiaohongshuUploadComplete(page) {
  // Wait for upload to complete (100%)
  while (true) {
    const progressText = await page.evaluate(() => {
      return document.querySelector('.stage')?.textContent || ''
    })

    // Check if the text contains "上传成功" (Upload Successful)
    if (progressText.includes('上传成功')) {
      console.log('Upload completed!')
      return true
    }

    // Match the text that contains "上传中" followed by a percentage
    const progressMatch = progressText.match(/上传中\s*(\d+)%/)

    if (!progressMatch) {
      throw new Error('Could not find upload progress percentage')
    }

    const progress = parseInt(progressMatch[1])
    console.log(`⏳Upload progress: ${progress}%`)

    if (progress === 99) {
      console.log('Upload completed!')
      break
    }

    // Wait a bit before checking again
    await page.waitForTimeout(3000)
  }
  return false
}

/**
 * @param {PublishData} data - The data for publishing the post
 */

async function publishBilibili(data) {
  if (!browser) {
    browser = await launchBrowser()
  }
  const page = await browser.newPage()
  try {
    await page.goto('https://member.bilibili.com/platform/upload/video/frame')
    await page.waitForTimeout(3000) // Let Vue UI settle

    // Ensure the "上传视频" button is visible and clickable
    const uploadButton = await page.waitForSelector('.bcc-upload-wrapper', {
      timeout: 10000,
      state: 'visible',
    })

    // Listen for the file chooser BEFORE clicking
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      uploadButton.click(), // This triggers file picker
    ])

    // Use the filechooser to set your file
    await fileChooser.setFiles(data.video)
    // fill in title
    await page.locator('input[placeholder="请输入稿件标题"]').click()
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
    await page.keyboard.press('Delete')
    await copyPasteContent(page, data.title)

    const { tags, content: contentWithoutTags } = getTagsFromContent(data.content || '')
    // fill in content
    await page.focus('.ql-editor')
    await copyPasteContent(page, contentWithoutTags)
    await page.waitForTimeout(1000)
    // fill in tags
    const tagInput = await page.locator('input[placeholder="按回车键Enter创建标签"]').nth(0)
    await tagInput.click()
    await page.waitForTimeout(1000)
    for (const tag of tags) {
      await copyPasteContent(page, `${tag}`)
      await page.waitForTimeout(1000)
      await page.keyboard.press('Enter')
      await page.waitForTimeout(1000)
    }

    await page.waitForTimeout(2000)
  } catch (err) {
    console.error('Upload error:', err)
    throw err
  }
}

async function publishYoutube(data) {
  if (!browser) {
    browser = await launchBrowser()
  }
  const page = await browser.newPage()
  try {
    await page.goto('https://www.youtube.com/upload')
    await page.waitForTimeout(3000) // Let Vue UI settle
  } catch (err) {
    console.error('Upload error:', err)
    throw err
  }
}
/**
 * @param {string} content - The content of the post
 * @returns {{tags: string[], content: string}} - The tags of the post and the content without tags
 */
function getTagsFromContent(content) {
  const tags = content.match(/#(\w+)/g)
  const ret = tags ? tags.map((tag) => tag.slice(1)) : []
  console.log('🦄🦄ret:', ret)
  // remove tags from content
  for (const tag of ret) {
    content = content.replace(`#${tag}`, '')
  }
  // remove spaces and trailing \n from content
  content = content.trim().replace(/\n+$/, '')

  return { tags: ret, content }
}
async function copyPasteContent(page, content) {
  await page.evaluate(async (text) => {
    await navigator.clipboard.writeText(text)
  }, content || '')
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V')
}

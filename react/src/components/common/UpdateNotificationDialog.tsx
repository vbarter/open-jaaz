import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useConfigs } from '@/contexts/configs'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import CommonDialogContent from './DialogContent'

interface UpdateInfo {
  version: string
  files: unknown[]
  path: string
  sha512: string
  releaseDate: string
}

// show the update notification dialog when there is a new version available
const UpdateNotificationDialog = () => {
  const { t } = useTranslation()
  const { showUpdateDialog, setShowUpdateDialog } = useConfigs()
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [isInstalling, setIsInstalling] = useState(false)

  useEffect(() => {
    // Listen for update downloaded event
    const handleUpdateDownloaded = (info: UpdateInfo) => {

      setUpdateInfo(info)
      setShowUpdateDialog(true)
    }

    window.electronAPI?.onUpdateDownloaded(handleUpdateDownloaded)

    return () => {
      window.electronAPI?.removeUpdateDownloadedListener()
    }
  }, [])

  // Add test function for local development
  const handleTestUpdateDialog = () => {
    const mockUpdateInfo: UpdateInfo = {
      version: '2.1.0',
      files: [],
      path: '/mock/path',
      sha512: 'mock-sha512',
      releaseDate: new Date().toISOString(),
    }
    setUpdateInfo(mockUpdateInfo)
    setShowUpdateDialog(true)
  }

  // Add global function for testing in browser console
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      // @ts-expect-error - Adding test function to window for development
      window.testUpdateDialog = handleTestUpdateDialog
    }
  }, [])

  const handleInstallUpdate = async () => {
    setIsInstalling(true)
    try {
      await window.electronAPI?.restartAndInstall()
    } catch (error) {
      console.error('Failed to install update:', error)
      setIsInstalling(false)
    }
  }

  const handleClose = useCallback(() => {
    setShowUpdateDialog(false)
  }, [setShowUpdateDialog])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setShowUpdateDialog(open)
    },
    [setShowUpdateDialog]
  )

  if (!updateInfo) return null

  return (
    <Dialog open={showUpdateDialog} onOpenChange={handleOpenChange}>
      <CommonDialogContent open={showUpdateDialog}>
        <DialogHeader>
          <DialogTitle>{t('common:update.title')}</DialogTitle>
        </DialogHeader>

        <div className="text-sm text-muted-foreground">
          <p>
            {t('common:update.description', { version: updateInfo.version })}
          </p>
          <p className="mt-2">{t('common:update.installNote')}</p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isInstalling}
          >
            {t('common:update.laterButton')}
          </Button>
          <Button onClick={handleInstallUpdate} disabled={isInstalling}>
            {isInstalling
              ? t('common:update.installing')
              : t('common:update.installButton')}
          </Button>
        </DialogFooter>
      </CommonDialogContent>
    </Dialog>
  )
}

export default UpdateNotificationDialog

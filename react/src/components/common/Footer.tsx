import { useTranslation } from 'react-i18next'

export default function Footer() {
  const { t } = useTranslation('common')

  return (
    <footer className='relative z-10 mt-16 sm:mt-20 border-t border-stone-200/50 dark:border-gray-700/50'>
      <div className='max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12'>
        <div className='flex flex-col items-center space-y-6'>
          {/* Logo and title */}
          <div className='text-center'>
            <h3 className='text-lg sm:text-xl font-semibold bg-gradient-to-r from-gray-900 via-gray-700 to-stone-600 dark:from-white dark:via-gray-200 dark:to-stone-300 bg-clip-text text-transparent'>
              {t('footer.title')}
            </h3>
            <p className='mt-2 text-sm text-stone-600 dark:text-stone-400'>
              {t('footer.subtitle')}
            </p>
          </div>

          {/* Links */}
          <div className='flex items-center space-x-8'>
            <a
              href='/privacy'
              className='text-sm text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 transition-colors duration-200 hover:underline decoration-2 underline-offset-4'
            >
              {t('footer.privacyPolicy')}
            </a>
            <div className='w-px h-4 bg-stone-300 dark:bg-stone-600'></div>
            <a
              href='/terms'
              className='text-sm text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 transition-colors duration-200 hover:underline decoration-2 underline-offset-4'
            >
              {t('footer.termsOfService')}
            </a>
            <div className='w-px h-4 bg-stone-300 dark:bg-stone-600'></div>
            <a
              href='mailto:support@magicart.cc'
              className='text-sm text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 transition-colors duration-200 hover:underline decoration-2 underline-offset-4'
            >
              {t('footer.contactSupport')}
            </a>
          </div>

          {/* Copyright */}
          <div className='text-center pt-4 border-t border-stone-200/30 dark:border-gray-700/30 w-full max-w-md'>
            <p className='text-xs text-stone-500 dark:text-stone-500'>
              {t('footer.copyright')}
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
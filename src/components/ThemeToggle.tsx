import { Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import type { Theme } from '@/hooks/useTheme'

interface ThemeToggleProps {
  theme: Theme
  onToggle: () => void
  className?: string
}

export function ThemeToggle({ theme, onToggle, className }: ThemeToggleProps) {
  const { t } = useTranslation()
  const dark = theme === 'dark'

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={onToggle}
      className={className}
      aria-label={t(dark ? 'common.aria_theme_light' : 'common.aria_theme_dark')}
      aria-pressed={dark}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </Button>
  )
}

import { useCallback, useMemo } from 'react'
import { AnimatedToastStack, useAnimatedToastStack } from './motion/animated-toast-stack.jsx'
import { ToastContext } from '../lib/toasts.js'
import './ToastProvider.css'

export default function ToastProvider({ children }) {
  const { toasts, showToast, updateToast, dismissToast } = useAnimatedToastStack({ defaultDuration: 3600, limit: 3 })
  const show = useCallback(({ status = 'info', ...input }) => showToast({
    duration: status === 'error' || status === 'loading' ? 0 : 3600, status, ...input,
  }), [showToast])
  const value = useMemo(() => ({ show, update: updateToast, dismiss: dismissToast }), [show, updateToast, dismissToast])
  return <ToastContext value={value}>{children}<AnimatedToastStack
    toasts={toasts} onDismiss={dismissToast} position="top-center" placement="fixed" maxVisible={3}
    className="gh-toast-stack"
    classNames={{ surface: 'gh-toast-surface', iconWrap: 'gh-toast-icon', title: 'gh-toast-title', description: 'gh-toast-description', content: 'gh-toast-content', close: 'gh-toast-close', item: 'gh-toast-item' }}
  /></ToastContext>
}

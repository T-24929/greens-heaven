import { lazy, Suspense } from 'react'
import { Loading } from './components/Feedback.jsx'

const ToastProvider = lazy(() => import('./components/ToastProvider.jsx'))
const App = lazy(() => import('./App.jsx'))

export default function AppRoot() {
  return <Suspense fallback={<Loading>Loading Greens Heaven…</Loading>}>
    <ToastProvider><App /></ToastProvider>
  </Suspense>
}

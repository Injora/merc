import '@fontsource-variable/inter-tight'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource/cormorant-garamond/300.css'
import '@fontsource/cormorant-garamond/300-italic.css'
import '@fontsource/cormorant-garamond/400.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/global.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// dev-only inspection handle for scrubbing shots from the console
if (import.meta.env.DEV) {
  void Promise.all([
    import('./lib/state'),
    import('./components/cinematic/timeline'),
    import('./audio/AudioEngine'),
    import('./components/cinematic/ignition'),
  ]).then(([state, timeline, sound, ignition]) => {
    Object.assign(window, { __story: { S: state.S, flags: state.flagStore, timeline, audio: sound.audio, ignition } })
  })
}

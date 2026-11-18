import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './platform.css'
import { applyPlatform } from './platform'
applyPlatform()
createRoot(document.getElementById('root')!).render(<App />)

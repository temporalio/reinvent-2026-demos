import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import StationControl from './StationControl'


createRoot(document.getElementById('root')!).render(
  <StrictMode>{window.location.pathname === '/config' ? <StationControl /> : <App />}</StrictMode>,
)

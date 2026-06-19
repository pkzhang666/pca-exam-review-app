import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { StandaloneApp } from './StandaloneApp.tsx'

// VITE_STANDALONE=true builds the offline, self-contained study app (Android).
// Otherwise the deck/upload web app (which talks to the backend) is used.
const Root = import.meta.env.VITE_STANDALONE === 'true' ? StandaloneApp : App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './App.css'
import 'katex/dist/katex.min.css';
import { Provider } from 'react-redux'
import store from './store/store.js'
import { registerSW } from 'virtual:pwa-register'

if (import.meta.env.PROD) {
  registerSW()
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>
)

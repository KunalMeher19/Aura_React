import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import './App.css';
import AppRoutes from './AppRoutes';

function App() {
  return (
    <BrowserRouter>
        <AppRoutes />
        <Toaster 
          position="top-right"
          toastOptions={{
            style: {
              background: '#333',
              color: '#fff',
            },
            success: {
              iconTheme: {
                primary: '#22c55e',
                secondary: '#333',
              },
            },
            error: {
              iconTheme: {
                primary: '#ef4444',
                secondary: '#333',
              },
            },
          }}
        />
    </BrowserRouter>
  )
}

export default App

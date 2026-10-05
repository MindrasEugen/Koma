import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './lib/authContext.jsx'

// retry disabilitato solo in sviluppo: il retryer di React Query, dopo un
// fallimento, ritenta solo se la finestra ha il focus reale
// (focusManager.isFocused()), oltre a essere online. Nella tab controllata da
// automazione browser il focus non è mai vero, quindi con retry > 0 la query
// resta bloccata in pausa a tempo indeterminato. In produzione (utente reale,
// tab a fuoco) questo non si presenta, quindi lì i retry restano attivi.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: import.meta.env.DEV ? false : 3,
    },
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)

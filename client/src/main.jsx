import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './theme/ThemeProvider.jsx';
import { CartProvider } from './store/CartContext.jsx';
import { ConfigProvider } from './store/ConfigContext.jsx';
import App from './App.jsx';
import './styles.css';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ConfigProvider>
          <CartProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </CartProvider>
        </ConfigProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);

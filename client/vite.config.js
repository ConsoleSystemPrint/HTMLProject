import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// перенаправляем api и websocket запросы на backend
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:4000',
      '/socket.io': {
        target: 'http://127.0.0.1:4000',
        ws: true
      }
    }
  }
});

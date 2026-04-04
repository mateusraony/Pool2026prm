import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Consolida todos os ícones lucide em um único chunk
          if (id.includes('lucide-react')) return 'icons';
          // Vendor principal (React, ReactDOM)
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) return 'react-vendor';
          // Recharts + dependências de gráficos
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-')) return 'charts';
          // Radix UI / shadcn
          if (id.includes('@radix-ui')) return 'radix';
          // React Query / estado
          if (id.includes('@tanstack')) return 'query';
          // Socket.io
          if (id.includes('socket.io')) return 'socketio';
        },
      },
    },
  },
});

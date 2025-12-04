import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        // Libera o acesso externo (necessário para abrir no celular)
        host: true,
        // Libera a trava de segurança do "Blocked request" para qualquer URL (ngrok, vscode, etc)
        allowedHosts: true,
    },
});
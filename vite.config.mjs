import { defineConfig, loadEnv } from 'vite';
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd()),
    emulator = env.VITE_USE_EMULATORS === '1';
  const connections =
    "'self' https://*.googleapis.com https://*.cloudfunctions.net https://*.firebaseio.com wss://*.firebaseio.com https://*.firebasedatabase.app wss://*.firebasedatabase.app" +
    (emulator
      ? ' http://127.0.0.1:* ws://127.0.0.1:* http://localhost:* ws://localhost:*'
      : '');
  return {
    plugins:
      command === 'build'
        ? [
            {
              name: 'workspace-csp',
              transformIndexHtml: () => [
                {
                  tag: 'meta',
                  attrs: {
                    'http-equiv': 'Content-Security-Policy',
                    content:
                      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src " +
                      connections +
                      "; frame-src 'self' https://embed.figma.com https://www.figma.com https://monexus-main-db.firebaseapp.com" +
                      (emulator ? ' http://127.0.0.1:*' : '') +
                      "; object-src 'none'; base-uri 'self'",
                  },
                  injectTo: 'head-prepend',
                },
              ],
            },
          ]
        : [],
  };
});

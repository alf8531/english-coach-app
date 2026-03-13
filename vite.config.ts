import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  // Explicitly read .env.local
  let manualKey = env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || '';
  try {
    const envFile = fs.readFileSync(path.resolve(__dirname, '.env.local'), 'utf-8');
    const match = envFile.match(/(?:VITE_)?GEMINI_API_KEY=(.*)/);
    if (match) {
      manualKey = match[1].split('#')[0].trim();
    }
  } catch (e) {
    console.error("Could not read .env.local manually:", e);
  }

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      {
        name: 'youtube-transcript-backend-proxy',
        configureServer(server) {
          server.middlewares.use('/api/transcript', async (req, res) => {
            const urlObj = new URL(req.originalUrl || req.url || '', `http://${req.headers?.host}`);
            const videoId = urlObj.searchParams.get('v');

            if (!videoId) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Missing video ID' }));
              return;
            }

            try {
              // ── yt-dlp approach ───────────────────────────────────────────────
              // Plain HTTP fetch cannot download YouTube captions (bot detection).
              // yt-dlp handles authentication/token extraction internally.
              const os = await import('os');
              const { execFile } = await import('child_process');
              const { promisify } = await import('util');
              const execFileAsync = promisify(execFile);

              const tmpDir = os.tmpdir();
              const outTemplate = path.join(tmpDir, `yt_${videoId}`);

              console.log(`[transcript-proxy] Fetching captions for ${videoId} via yt-dlp...`);

              try {
                await execFileAsync('python', [
                  '-m', 'yt_dlp',
                  '--write-auto-sub',
                  '--write-sub',
                  '--sub-lang', 'en',
                  '--skip-download',
                  '--no-warnings',
                  '--convert-subs', 'vtt',
                  '-o', outTemplate,
                  `https://www.youtube.com/watch?v=${videoId}`,
                ], { timeout: 30000 });
              } catch (dlErr: any) {
                const errMsg = dlErr.stderr || dlErr.message || '';
                console.error('[transcript-proxy] yt-dlp failed:', errMsg.substring(0, 300));
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'No captions found for this video. It may not have auto-generated captions, or they are disabled. You can upload an SRT file instead.' }));
                return;
              }

              // Find the downloaded .vtt file
              let vttContent = '';
              try {
                const allFiles = fs.readdirSync(tmpDir);
                const vttFile = allFiles.find((f: string) => f.startsWith(`yt_${videoId}`) && f.endsWith('.vtt'));
                if (vttFile) {
                  const fullPath = path.join(tmpDir, vttFile);
                  vttContent = fs.readFileSync(fullPath, 'utf-8');
                  try { fs.unlinkSync(fullPath); } catch (_) { }
                }
              } catch (readErr: any) {
                console.error('[transcript-proxy] VTT read error:', readErr.message);
              }

              if (!vttContent) {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'Captions were not available for this video. Try uploading an SRT file.' }));
                return;
              }

              // ── Parse WebVTT → transcript lines ──────────────────────────────
              const lines: any[] = [];
              const blocks = vttContent.split(/\n\n+/);

              for (const block of blocks) {
                const rows = block.trim().split('\n');
                const tsRow = rows.find((r: string) => r.includes('-->'));
                if (!tsRow) continue;

                const m = tsRow.match(/(\d+):(\d+):(\d+)[.,](\d+)\s*-->\s*(\d+):(\d+):(\d+)[.,](\d+)/);
                if (!m) continue;

                const startTime = +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
                const endTime = +m[5] * 3600 + +m[6] * 60 + +m[7] + +m[8] / 1000;
                const dur = Math.max(endTime - startTime, 0.5);

                const tsIdx = rows.indexOf(tsRow);
                const rawText = rows.slice(tsIdx + 1)
                  .join(' ')
                  .replace(/<[^>]+>/g, '')    // strip VTT inline tags
                  .replace(/&amp;/g, '&')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>')
                  .replace(/&quot;/g, '"')
                  .replace(/&#39;/g, "'")
                  .replace(/\s+/g, ' ')
                  .trim();

                if (!rawText) continue;

                // De-duplicate consecutive identical lines (yt-dlp auto-sub quirk)
                if (lines.length > 0 &&
                  lines[lines.length - 1].text === rawText &&
                  Math.abs(lines[lines.length - 1].startTime - startTime) < 1) {
                  continue;
                }

                const wordStrs = rawText.split(/\s+/).filter(Boolean);
                const tpw = dur / Math.max(wordStrs.length, 1);

                lines.push({
                  text: rawText,
                  startTime,
                  endTime,
                  words: wordStrs.map((w: string, i: number) => ({
                    word: w,
                    startTime: startTime + i * tpw,
                    endTime: startTime + (i + 1) * tpw,
                  })),
                });
              }

              if (lines.length === 0) {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'Captions were downloaded but could not be parsed. Try uploading an SRT file.' }));
                return;
              }

              console.log(`[transcript-proxy] ✓ ${lines.length} transcript lines for video ${videoId}`);
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Cache-Control', 'public, max-age=86400');
              res.end(JSON.stringify(lines));

            } catch (err: any) {
              console.error('[transcript-proxy] Error:', err);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message || 'Unknown proxy error' }));
            }
          });

          server.middlewares.use('/api/stories', async (req, res) => {
            const dataPath = path.resolve(__dirname, 'data', 'stories.json');
            res.setHeader('Content-Type', 'application/json');

            if (req.method === 'GET') {
              try {
                if (!fs.existsSync(dataPath)) {
                  if (!fs.existsSync(path.dirname(dataPath))) {
                    fs.mkdirSync(path.dirname(dataPath), { recursive: true });
                  }
                  fs.writeFileSync(dataPath, '[]');
                }
                const data = fs.readFileSync(dataPath, 'utf-8');
                res.end(data || '[]');
              } catch (e: any) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: e.message }));
              }
            } else if (req.method === 'POST') {
              let body = '';
              req.on('data', chunk => { body += chunk.toString(); });
              req.on('end', () => {
                try {
                  const stories = JSON.parse(body);
                  if (!fs.existsSync(path.dirname(dataPath))) {
                    fs.mkdirSync(path.dirname(dataPath), { recursive: true });
                  }
                  fs.writeFileSync(dataPath, JSON.stringify(stories, null, 2));
                  res.end(JSON.stringify({ success: true }));
                } catch (e: any) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: e.message }));
                }
              });
            }
          });
        }
      },
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: 'American English Mastery & Fluency Coach',
          short_name: 'FluentAI',
          description: 'AI-powered English learning platform',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          ],
        },
        workbox: {
          // Cache app shell + assets offline
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } }
            },
          ],
        },
      }),
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(manualKey),
      'process.env.GEMINI_API_KEY': JSON.stringify(manualKey),
      'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(manualKey)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});

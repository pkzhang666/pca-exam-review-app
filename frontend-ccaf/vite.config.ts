import { defineConfig, type Plugin, type ViteDevServer, type PreviewServer } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

const PROGRESS_FILE = path.resolve(import.meta.dirname, 'progress.json')

function progressFileMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
  if (!req.url || !req.url.startsWith('/api/progress')) {
    next()
    return
  }

  if (req.method === 'GET') {
    if (fs.existsSync(PROGRESS_FILE)) {
      res.setHeader('Content-Type', 'application/json')
      fs.createReadStream(PROGRESS_FILE).pipe(res)
    } else {
      res.statusCode = 404
      res.end()
    }
    return
  }

  if (req.method === 'POST') {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      try {
        // validate it's JSON before writing to disk
        JSON.parse(body)
        fs.writeFileSync(PROGRESS_FILE, body)
        res.statusCode = 204
        res.end()
      } catch {
        res.statusCode = 400
        res.end()
      }
    })
    return
  }

  res.statusCode = 405
  res.end()
}

// Persists quiz progress to progress.json in the project root, so it
// travels with the project folder (e.g. when copied to another machine)
// instead of being trapped in a single browser's localStorage.
function progressApiPlugin(): Plugin {
  return {
    name: 'progress-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(progressFileMiddleware)
    },
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use(progressFileMiddleware)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), progressApiPlugin()],
})

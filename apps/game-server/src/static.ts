import fs from 'node:fs'
import path from 'node:path'
import type { NextFunction, Request, Response } from 'express'

const HASHED_ASSET_PATTERN = /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/i

function isBackendPath(pathname: string): boolean {
  return (
    pathname === '/health' ||
    pathname === '/__healthcheck' ||
    pathname === '/matchmake' ||
    pathname.startsWith('/matchmake/')
  )
}

function cacheHeaderFor(pathname: string): string {
  if (pathname.endsWith('.html')) return 'no-cache'
  if (HASHED_ASSET_PATTERN.test(pathname)) return 'public, max-age=31536000, immutable'
  return 'public, max-age=3600'
}

export function createStaticMiddleware(staticDir: string) {
  const rootDir = path.resolve(staticDir)
  const indexPath = path.join(rootDir, 'index.html')

  if (!fs.existsSync(indexPath)) {
    throw new Error(`No se encontró index.html en STATIC_DIR: ${rootDir}`)
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next()
      return
    }

    let decodedPath: string
    try {
      decodedPath = decodeURIComponent(req.path)
    } catch {
      res.status(400).end()
      return
    }

    if (decodedPath.includes('\0') || decodedPath.includes('\\')) {
      res.status(400).end()
      return
    }

    if (isBackendPath(decodedPath)) {
      next()
      return
    }

    const segments = decodedPath.split('/').filter(Boolean)
    if (segments.some((segment) => segment === '..')) {
      res.status(403).end()
      return
    }

    const relativePath = segments.join('/')
    const candidate = path.resolve(rootDir, relativePath)

    if (candidate !== rootDir && !candidate.startsWith(rootDir + path.sep)) {
      res.status(403).end()
      return
    }

    void fs.promises
      .stat(candidate)
      .then((stat) => {
        if (stat.isFile()) {
          res.setHeader('Cache-Control', cacheHeaderFor(decodedPath))
          res.sendFile(candidate, (err) => {
            if (err && !res.headersSent) next(err)
          })
          return
        }
        sendSpaFallback()
      })
      .catch(() => {
        if (path.extname(decodedPath) !== '') {
          res.status(404).end()
          return
        }
        sendSpaFallback()
      })

    function sendSpaFallback() {
      res.setHeader('Cache-Control', 'no-cache')
      res.sendFile(indexPath, (err) => {
        if (err && !res.headersSent) next(err)
      })
    }
  }
}

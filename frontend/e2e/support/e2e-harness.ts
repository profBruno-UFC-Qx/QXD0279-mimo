import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

export interface SeedData {
  users: {
    superadmin: { id: number; email: string; name: string }
    adminLinked: { id: number; email: string; name: string }
    adminUnlinked: { id: number; email: string; name: string }
    userA: { id: number; email: string; name: string }
    userB: { id: number; email: string; name: string }
  }
  buildings: {
    main: { id: number; name: string }
    library: { id: number; name: string }
    unlinked: { id: number; name: string }
  }
  categories: {
    electronics: { id: number; name: string }
    documents: { id: number; name: string }
    unlinked: { id: number; name: string }
  }
  items: {
    available: { id: number; title: string }
    oldAvailable: { id: number; title: string }
    eligible: { id: number; title: string }
    handedOver: { id: number; title: string }
    sold: { id: number; title: string }
  }
  lostReports: {
    openA1: { id: number; description: string }
    openA2: { id: number; description: string }
    resolvedA: { id: number; description: string }
    openB: { id: number; description: string }
  }
}

export interface E2EServerContext {
  tempDir: string
  dbPath: string
  seed: SeedData
  e2ePass: string
  stop: () => Promise<void>
}

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..')
const backendDir = path.join(repoRoot, 'backend')
const frontendDir = path.join(repoRoot, 'frontend')
const tsxCliPath = path.join(backendDir, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const viteBinPath = path.join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js')
const seedScriptPath = path.join(frontendDir, 'e2e', 'support', 'seed-e2e-db.ts')

async function isPortOpen(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    socket.setTimeout(500)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('error', () => {
      socket.destroy()
      resolve(false)
    })
    socket.connect(port, host)
  })
}

async function assertPortFree(port: number) {
  const openV4 = await isPortOpen(port, '127.0.0.1')
  const openV6 = await isPortOpen(port, '::1')
  if (openV4 || openV6) {
    throw new Error(`Port ${port} is already in use. Refusing to attach to an existing server.`)
  }
}

async function waitForHttp(url: string, timeoutMs: number, processName: string, child: ChildProcess) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${processName} exited early with code ${child.exitCode}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // retry until ready
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`Timed out waiting for ${processName} at ${url}`)
}

async function terminateProcess(child: ChildProcess | null) {
  if (!child || child.exitCode !== null || !child.pid) return

  child.kill('SIGTERM')
  const waited = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), 3000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve(true)
    })
  })

  if (!waited && child.exitCode === null) {
    if (process.platform === 'win32') {
      try {
        execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
      } catch {
        // ignore if already exited
      }
    } else {
      child.kill('SIGKILL')
    }
  }
}

export async function startIsolatedE2EStack(): Promise<E2EServerContext> {
  await assertPortFree(3000)
  await assertPortFree(5173)

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achadex-e2e-'))
  const dbPath = path.join(tempDir, 'test.sqlite')
  const jwtSecret = crypto.randomBytes(32).toString('hex')
  const e2ePass = 'TestE2ePass!99'

  let backendChild: ChildProcess | null = null
  let frontendChild: ChildProcess | null = null

  const cleanup = async () => {
    await terminateProcess(frontendChild)
    await terminateProcess(backendChild)
    frontendChild = null
    backendChild = null
    fs.rmSync(tempDir, { recursive: true, force: true })
  }

  try {
    const seedOutput = execFileSync(process.execPath, [tsxCliPath, seedScriptPath], {
      cwd: backendDir,
      encoding: 'utf-8',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        SQLITE_DB_PATH: dbPath,
        JWT_SECRET: jwtSecret,
        E2E_USER_PASSWORD: e2ePass,
      },
    })

    const jsonLine = seedOutput
      .trim()
      .split(/\r?\n/)
      .reverse()
      .find((line) => line.trim().startsWith('{'))
    if (!jsonLine) {
      throw new Error(`E2E seed script produced no JSON output: ${seedOutput}`)
    }
    const seed = JSON.parse(jsonLine) as SeedData

    const backendLogs: string[] = []
    backendChild = spawn(process.execPath, [tsxCliPath, 'src/server.ts'], {
      cwd: backendDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        SQLITE_DB_PATH: dbPath,
        JWT_SECRET: jwtSecret,
      },
    })
    backendChild.stdout?.on('data', (chunk) => backendLogs.push(String(chunk)))
    backendChild.stderr?.on('data', (chunk) => backendLogs.push(String(chunk)))

    await waitForHttp('http://127.0.0.1:3000/api/v1/health', 20_000, 'E2E backend', backendChild)

    const frontendLogs: string[] = []
    frontendChild = spawn(process.execPath, [viteBinPath, '--port', '5173', '--strictPort'], {
      cwd: frontendDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        VITE_API_URL: '/api/v1',
      },
    })
    frontendChild.stdout?.on('data', (chunk) => frontendLogs.push(String(chunk)))
    frontendChild.stderr?.on('data', (chunk) => frontendLogs.push(String(chunk)))

    await waitForHttp('http://localhost:5173/', 20_000, 'E2E frontend', frontendChild)

    return {
      tempDir,
      dbPath,
      seed,
      e2ePass,
      stop: cleanup,
    }
  } catch (err) {
    await cleanup()
    throw err
  }
}

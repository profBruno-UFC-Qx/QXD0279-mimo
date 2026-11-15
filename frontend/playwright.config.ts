import { defineConfig } from '@playwright/test'
import fs from 'node:fs'

const chromeCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
]

const executablePath = chromeCandidates.find((candidate) => fs.existsSync(candidate))

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'off',
    video: 'off',
    launchOptions: executablePath ? { executablePath } : {},
  },
})

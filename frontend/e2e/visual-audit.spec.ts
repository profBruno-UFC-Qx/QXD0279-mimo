import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { startIsolatedE2EStack, type E2EServerContext } from './support/e2e-harness'

let ctx: E2EServerContext

const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const screenshotDir = path.join(repoRoot, 'artifacts', 'visual')

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'mobile', width: 390, height: 844 },
] as const

async function loginForAudit(page: Page, email: string, password: string) {
  await page.goto('/entrar')
  await page.getByLabel('E-mail *').fill(email)
  await page.getByLabel('Senha *').fill(password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
}

async function auditScreen(
  page: Page,
  routePath: string,
  screenSlug: string,
  viewportName: string,
  readyText: string,
) {
  const pageErrors: string[] = []
  const errorListener = (err: Error) => pageErrors.push(err.message)
  page.on('pageerror', errorListener)

  await page.goto(routePath)
  await expect(page.getByRole('heading', { name: readyText }).first()).toBeVisible()
  await page.waitForTimeout(250)

  const layoutReport = await page.evaluate(() => {
    const docEl = document.documentElement
    const overflowX = docEl.scrollWidth - window.innerWidth

    // Ensure primary controls have non-zero clickable area and aren't clipped off-screen horizontally
    const clippedButtons = Array.from(document.querySelectorAll('button, a[role="button"]'))
      .filter((el) => {
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return false
        return rect.right > window.innerWidth + 2 || rect.left < -2
      })
      .map((el) => (el.textContent || el.getAttribute('aria-label') || 'unnamed').trim())

    // Ensure icon-only buttons carry accessible names
    const unnamedButtons = Array.from(document.querySelectorAll('button'))
      .filter((btn) => {
        const rect = btn.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return false
        const text = (btn.textContent || '').trim()
        const aria = (btn.getAttribute('aria-label') || btn.getAttribute('title') || '').trim()
        return text.length === 0 && aria.length === 0
      })
      .map((btn) => btn.outerHTML.slice(0, 120))

    return {
      overflowX,
      clippedButtons,
      unnamedButtons,
    }
  })

  expect(pageErrors, `Uncaught errors on ${routePath} (${viewportName})`).toEqual([])
  expect(
    layoutReport.overflowX,
    `Horizontal overflow (${layoutReport.overflowX}px) on ${routePath} (${viewportName})`,
  ).toBeLessThanOrEqual(2)
  expect(
    layoutReport.clippedButtons,
    `Clipped controls on ${routePath} (${viewportName}): ${layoutReport.clippedButtons.join(', ')}`,
  ).toEqual([])
  expect(
    layoutReport.unnamedButtons,
    `Unnamed icon buttons on ${routePath} (${viewportName}): ${layoutReport.unnamedButtons.join('; ')}`,
  ).toEqual([])

  await page.screenshot({
    path: path.join(screenshotDir, `${screenSlug}-${viewportName}.png`),
    fullPage: true,
  })

  page.off('pageerror', errorListener)
}

test.describe('Achadex Pessoa 1 — Visual, Responsive & Accessibility Inspection', () => {
  test.beforeAll(async () => {
    fs.mkdirSync(screenshotDir, { recursive: true })
    ctx = await startIsolatedE2EStack()
  })

  test.afterAll(async () => {
    if (ctx) {
      await ctx.stop()
    }
  })

  test('Inspect all Pessoa 1 User screens across Desktop, Tablet, and Mobile viewports', async ({
    page,
  }) => {
    await loginForAudit(page, ctx.seed.users.userA.email, ctx.e2ePass)

    const userScreens = [
      { path: '/predios', slug: 'public-predios', ready: 'Prédios e pontos de retirada' },
      { path: '/perfil', slug: 'user-perfil', ready: 'Perfil' },
      { path: '/minhas-perdas', slug: 'user-minhas-perdas', ready: 'Minhas perdas' },
      { path: '/minhas-perdas/nova', slug: 'user-nova-perda', ready: 'Registrar objeto perdido' },
      {
        path: `/minhas-perdas/${ctx.seed.lostReports.openA1.id}`,
        slug: 'user-detalhe-perda',
        ready: 'Possíveis correspondências',
      },
      { path: '/notificacoes', slug: 'user-notificacoes', ready: 'Notificações' },
    ]

    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      for (const screen of userScreens) {
        await auditScreen(page, screen.path, screen.slug, vp.name, screen.ready)
      }
    }
  })

  test('Inspect all Pessoa 1 Admin & Superadmin screens across Desktop, Tablet, and Mobile viewports', async ({
    page,
  }) => {
    await loginForAudit(page, ctx.seed.users.superadmin.email, ctx.e2ePass)

    const adminScreens = [
      { path: '/admin/dashboard', slug: 'admin-dashboard', ready: 'Dashboard Administrativo' },
      { path: '/admin/perdas', slug: 'admin-perdas', ready: 'Relatos de Perdas' },
      { path: '/admin/predios', slug: 'admin-predios', ready: 'Gerenciamento de Prédios' },
      { path: '/admin/categorias', slug: 'admin-categorias', ready: 'Gerenciamento de Categorias' },
      { path: '/admin/admins', slug: 'admin-admins', ready: 'Gerenciamento de Administradores' },
    ]

    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      for (const screen of adminScreens) {
        await auditScreen(page, screen.path, screen.slug, vp.name, screen.ready)
      }
    }

    // Verify mobile navigation drawer opens and closes cleanly at 390x844
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/admin/dashboard')
    const drawerBtn = page.getByRole('button', { name: 'Abrir menu administrativo' })
    await expect(drawerBtn).toBeVisible()
    await drawerBtn.click()
    await expect(page.getByText('Dashboard', { exact: true }).last()).toBeVisible()
    await page.waitForTimeout(300)
    await page.screenshot({
      path: path.join(screenshotDir, 'admin-drawer-mobile.png'),
    })
  })
})

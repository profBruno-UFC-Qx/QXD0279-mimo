import { expect, test, type Page, type Request } from '@playwright/test'
import { startIsolatedE2EStack, type E2EServerContext } from './support/e2e-harness'

let ctx: E2EServerContext

async function loginViaUi(page: Page, email: string, password: string) {
  await page.goto('/entrar')
  await page.getByLabel('E-mail *').fill(email)
  await page.getByLabel('Senha *').fill(password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
}

async function logoutViaUi(page: Page) {
  await page.getByRole('button', { name: 'Menu do usuário' }).click()
  await page.getByText('Sair', { exact: true }).click()
  await expect(page).toHaveURL(/\/entrar/)
}

async function dismissConfirmDialog(page: Page) {
  const dialog = page.locator('.v-dialog--active, [role="dialog"]').last()
  await expect(dialog).toBeVisible()
  await dialog.locator('.v-card-actions button').first().click()
  await expect(dialog).toBeHidden()
}

async function acceptConfirmDialog(page: Page) {
  const dialog = page.locator('.v-dialog--active, [role="dialog"]').last()
  await expect(dialog).toBeVisible()
  await dialog.locator('.v-card-actions button').last().click()
  await expect(dialog).toBeHidden()
}

test.describe.serial('Achadex Pessoa 1 — E2E Integrated Journeys', () => {
  test.beforeAll(async () => {
    ctx = await startIsolatedE2EStack()
  })

  test.afterAll(async () => {
    if (ctx) {
      await ctx.stop()
    }
  })

  test('Flow 01: Public visitor catalog, filters, item details, broken-image handling, and buildings', async ({
    page,
  }) => {
    const consoleErrors: string[] = []
    page.on('pageerror', (err) => consoleErrors.push(err.message))

    await page.goto('/')
    await expect(page.getByText(ctx.seed.items.available.title)).toBeVisible()
    await expect(page.getByText(ctx.seed.items.oldAvailable.title)).toBeVisible()
    await expect(page.getByText(ctx.seed.items.eligible.title)).toBeVisible()

    // Non-public statuses must stay hidden from the public catalog
    await expect(page.getByText(ctx.seed.items.handedOver.title)).toHaveCount(0)
    await expect(page.getByText(ctx.seed.items.sold.title)).toHaveCount(0)

    // Filter by keyword targeting oldAvailable (with broken photo URL)
    const searchInput = page.getByPlaceholder(/buscar/i).or(page.getByLabel(/buscar/i)).first()
    await searchInput.fill('Carregador USB-C')
    await page.keyboard.press('Enter')
    await expect(page.getByText(ctx.seed.items.oldAvailable.title)).toBeVisible()

    // Open item details and verify pickup point + service hours without exposing admin data
    await page.getByText(ctx.seed.items.oldAvailable.title).first().click()
    await expect(page).toHaveURL(new RegExp(`/itens/${ctx.seed.items.oldAvailable.id}$`))
    await expect(page.getByText('Balcao Terreo')).toBeVisible()
    await expect(page.getByText('Seg a Sex, 07:30-20:00')).toBeVisible()
    await expect(page.getByText('superadmin@e2e.local')).toHaveCount(0)

    // Visit public buildings directory
    await page.goto('/predios')
    await expect(page.getByText(ctx.seed.buildings.main.name)).toBeVisible()
    await expect(page.getByText(ctx.seed.buildings.library.name)).toBeVisible()
    await expect(page.getByText(ctx.seed.buildings.unlinked.name)).toBeVisible()

    expect(consoleErrors).toEqual([])
  })

  test('Flow 02: Registration, invalid login, profile update + reload persistence, logout, and session isolation', async ({
    page,
  }) => {
    // Wrong password shows error and stays on /entrar
    await loginViaUi(page, ctx.seed.users.userA.email, 'SenhaIncorreta!00')
    await expect(page.getByText(/e-mail ou senha inválidos/i)).toBeVisible()
    await expect(page).toHaveURL(/\/entrar/)

    // Register a brand-new USER account
    const newEmail = 'novo.usuario@e2e.local'
    await page.goto('/registrar')
    await page.getByLabel('Nome completo *').fill('Clara Cadastro E2E')
    await page.getByLabel('E-mail *').fill(newEmail)
    await page.getByLabel('Telefone / WhatsApp *').fill('(85) 97777-4444')
    await page.getByLabel('Senha *', { exact: true }).fill(ctx.e2ePass)
    await page.getByLabel('Confirmar senha *').fill(ctx.e2ePass)
    await page.getByRole('button', { name: 'Criar conta', exact: true }).click()
    await expect(page).toHaveURL(/\/$/)

    // Profile loads and persists edits after reload
    await page.goto('/perfil')
    await expect(page.locator('#profile-email')).toHaveValue(newEmail)
    await expect(page.locator('#profile-role')).toHaveValue('USER')
    await page.locator('#profile-name').fill('Clara Atualizada E2E')
    await page.locator('#profile-phone').fill('(85) 97777-5555')
    await page.getByRole('button', { name: 'Salvar', exact: true }).click()
    await expect(page.locator('#profile-name')).toHaveValue('Clara Atualizada E2E')

    await page.reload()
    await expect(page.locator('#profile-name')).toHaveValue('Clara Atualizada E2E')
    await expect(page.locator('#profile-phone')).toHaveValue('(85) 97777-5555')

    await logoutViaUi(page)

    // Session isolation: User A -> User B
    await loginViaUi(page, ctx.seed.users.userA.email, ctx.e2ePass)
    await expect(page).toHaveURL(/\/$/)
    await page.goto('/minhas-perdas')
    await expect(page.getByText(ctx.seed.lostReports.openA1.description)).toBeVisible()
    await expect(page.getByText(ctx.seed.lostReports.openB.description)).toHaveCount(0)

    await logoutViaUi(page)
    await loginViaUi(page, ctx.seed.users.userB.email, ctx.e2ePass)
    await expect(page).toHaveURL(/\/$/)
    await page.goto('/minhas-perdas')
    await expect(page.getByText(ctx.seed.lostReports.openB.description)).toBeVisible()
    await expect(page.getByText(ctx.seed.lostReports.openA1.description)).toHaveCount(0)
  })

  test('Flow 03 & Flow 04: Create lost report without duplicates, edit + reload, cancel dismissal/confirm, and ownership check', async ({
    page,
  }) => {
    await loginViaUi(page, ctx.seed.users.userA.email, ctx.e2ePass)
    await expect(page).toHaveURL(/\/$/)

    await page.goto('/minhas-perdas/nova')

    // Validation keeps submit disabled while required fields are missing or invalid
    const submitBtn = page.getByRole('button', { name: 'Registrar perda', exact: true })
    await expect(submitBtn).toBeDisabled()

    // Select Category via CategorySelect, leave building null
    await page.locator('.v-select').first().click()
    await page.getByRole('option', { name: ctx.seed.categories.electronics.name }).click()

    const createdDescription = 'Mochila preta E2E perdida perto do estacionamento.'
    await page.getByLabel('Descrição *').fill(createdDescription)

    // Pick lossDate from DatePickerField calendar
    await page.getByLabel('Data da perda *').click()
    await page.locator('.v-date-picker button').filter({ hasText: /^10$/ }).click()

    await expect(submitBtn).toBeEnabled()

    let createRequests = 0
    const countCreate = (req: Request) => {
      if (req.method() === 'POST' && req.url().includes('/api/v1/lost-reports')) {
        createRequests += 1
      }
    }
    page.on('request', countCreate)
    await submitBtn.click()
    await expect(page).toHaveURL(/\/minhas-perdas\/\d+$/)
    page.off('request', countCreate)
    expect(createRequests).toBe(1)

    const createdReportUrl = page.url()
    await expect(page.getByText(createdDescription)).toBeVisible()

    // Check /minhas-perdas lists it as Aberta
    await page.goto('/minhas-perdas')
    await expect(page.getByText(createdDescription)).toBeVisible()

    // Edit description and verify reload persistence
    await page.goto(createdReportUrl)
    await page.getByRole('button', { name: 'Editar perda', exact: true }).click()
    const editedDescription = 'Mochila preta E2E atualizada com chaveiro azul.'
    await page.getByLabel('Descrição *').fill(editedDescription)
    await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click()
    await expect(page.getByText(editedDescription)).toBeVisible()
    await page.reload()
    await expect(page.getByText(editedDescription)).toBeVisible()

    // Dismiss cancel dialog -> stays OPEN with Edit button still available
    await page.getByRole('button', { name: 'Cancelar perda', exact: true }).click()
    await dismissConfirmDialog(page)
    await expect(page.getByRole('button', { name: 'Editar perda', exact: true })).toBeVisible()

    // Confirm cancel dialog -> becomes Cancelada and actions hide
    await page.getByRole('button', { name: 'Cancelar perda', exact: true }).click()
    await acceptConfirmDialog(page)
    await expect(page.getByText('Cancelada', { exact: false }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Editar perda', exact: true })).toHaveCount(0)

    // Non-owner isolation: User B cannot view User A's report
    await logoutViaUi(page)
    await loginViaUi(page, ctx.seed.users.userB.email, ctx.e2ePass)
    await expect(page).toHaveURL(/\/$/)
    await page.goto(`/minhas-perdas/${ctx.seed.lostReports.openA1.id}`)
    await expect(page.getByText(ctx.seed.lostReports.openA1.description)).toHaveCount(0)
  })

  test('Flow 05: Lost report suggestions and notifications unread counter/mark-read persistence', async ({
    page,
  }) => {
    await loginViaUi(page, ctx.seed.users.userA.email, ctx.e2ePass)
    await expect(page).toHaveURL(/\/$/)

    await page.goto(`/minhas-perdas/${ctx.seed.lostReports.openA1.id}`)
    await expect(page.getByText('Possíveis correspondências')).toBeVisible()
    await expect(page.getByText(ctx.seed.items.available.title)).toBeVisible()

    // Confirm suggestion button -> cancel modal does NOT POST
    let suggestionPosts = 0
    const countPosts = (req: Request) => {
      if (req.method() === 'POST' && req.url().includes('/suggestions/') && req.url().includes('/confirm')) {
        suggestionPosts += 1
      }
    }
    page.on('request', countPosts)
    await page.getByRole('button', { name: /É este!/i }).first().click()
    await dismissConfirmDialog(page)
    expect(suggestionPosts).toBe(0)

    // Confirm suggestion -> sends 1 POST
    await page.getByRole('button', { name: /É este!/i }).first().click()
    await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/suggestions/') &&
          res.url().includes('/confirm') &&
          res.request().method() === 'POST' &&
          res.status() === 200,
      ),
      acceptConfirmDialog(page),
    ])
    page.off('request', countPosts)
    expect(suggestionPosts).toBe(1)
    await expect(page.getByText(/Item confirmado: #/i)).toBeVisible()

    // Notifications: mark unread as read and verify persistence across reload + detail link
    await page.goto('/notificacoes')
    await expect(page.getByText('Não lida').first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ver detalhes' }).first()).toBeVisible()
    await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes('/notifications/') && res.url().includes('/read'),
      ),
      page.getByRole('button', { name: 'Marcar como lida' }).first().click(),
    ])
    await page.reload()
    await expect(page.getByRole('button', { name: 'Marcar como lida' })).toHaveCount(0)
  })

  test('Flow 06: Admin lost reports filtering, resolution confirmation, author notification, and USER guard', async ({
    page,
  }) => {
    // USER blocked from /admin/perdas
    await loginViaUi(page, ctx.seed.users.userA.email, ctx.e2ePass)
    await expect(page).toHaveURL(/\/$/)
    await page.goto('/admin/perdas')
    await expect(page).toHaveURL(/\/403/)

    await logoutViaUi(page)
    await loginViaUi(page, ctx.seed.users.adminLinked.email, ctx.e2ePass)
    await expect(page).toHaveURL(/\/$/)

    await page.goto('/admin/perdas')
    await expect(page.getByText(ctx.seed.lostReports.openB.description)).toBeVisible()

    // Resolve openB: dismiss first -> keeps OPEN, then confirm -> RESOLVED
    const cardB = page.locator('.v-card', { hasText: ctx.seed.lostReports.openB.description }).first()
    await cardB.getByRole('button', { name: 'Resolver perda', exact: true }).click()
    await dismissConfirmDialog(page)
    await expect(cardB.getByText('Aberto', { exact: false })).toBeVisible()

    await cardB.getByRole('button', { name: 'Resolver perda', exact: true }).click()
    await acceptConfirmDialog(page)
    await expect(cardB.getByText('Resolvido', { exact: false })).toBeVisible()

    // Author (User B) receives corresponding REPORT_RESOLVED notification
    await logoutViaUi(page)
    await loginViaUi(page, ctx.seed.users.userB.email, ctx.e2ePass)
    await expect(page).toHaveURL(/\/$/)
    await page.goto('/notificacoes')
    await expect(page.getByText('Não lida').first()).toBeVisible()
  })

  test('Flow 07: Admin buildings & categories CRUD, public propagation, and 409 conflict preservation', async ({
    page,
  }) => {
    await loginViaUi(page, ctx.seed.users.adminLinked.email, ctx.e2ePass)
    await expect(page).toHaveURL(/\/$/)

    // Buildings CRUD + 409 + Public propagation
    await page.goto('/admin/predios')
    await page.getByRole('button', { name: /novo prédio/i }).click()
    await page.getByLabel('Nome do prédio *').fill('Bloco Novo E2E')
    await page.getByLabel('Endereço *').fill('Rua Nova, 99')
    await page.getByLabel('Ponto de retirada *').fill('Portaria Nova')
    await page.getByLabel('Horário de atendimento *').fill('08:00-18:00')
    await page.getByRole('dialog').getByRole('button', { name: /cadastrar|salvar/i }).click()
    await expect(page.getByText('Bloco Novo E2E')).toBeVisible()

    await page.goto('/predios')
    await expect(page.getByText('Bloco Novo E2E')).toBeVisible()

    await page.goto('/admin/predios')
    const newBuildingCard = page.locator('.v-card', { hasText: 'Bloco Novo E2E' }).first()
    await newBuildingCard.getByRole('button', { name: 'Editar', exact: true }).click()
    await page.getByLabel('Nome do prédio *').fill('Bloco Editado E2E')
    await page.getByRole('dialog').getByRole('button', { name: /salvar/i }).click()
    await expect(page.getByText('Bloco Editado E2E')).toBeVisible()

    // 409 Conflict preserves linked building
    const linkedBuildingCard = page
      .locator('.v-card', { hasText: ctx.seed.buildings.main.name })
      .first()
    await linkedBuildingCard.getByRole('button', { name: 'Excluir', exact: true }).click()
    await acceptConfirmDialog(page)
    await expect(page.getByText(ctx.seed.buildings.main.name, { exact: true })).toBeVisible()

    // Delete unlinked created building -> removed cleanly
    const editedBuildingCard = page.locator('.v-card', { hasText: 'Bloco Editado E2E' }).first()
    await editedBuildingCard.getByRole('button', { name: 'Excluir', exact: true }).click()
    await acceptConfirmDialog(page)
    await expect(page.getByText('Bloco Editado E2E', { exact: true })).toHaveCount(0)

    // Categories CRUD + 409 + Catalog/Select propagation
    await page.goto('/admin/categorias')
    await page.getByRole('button', { name: /nova categoria/i }).click()
    await page.getByLabel('Nome da categoria *').fill('Categoria Nova E2E')
    await page.getByRole('dialog').getByRole('button', { name: /cadastrar|salvar/i }).click()
    await expect(page.getByText('Categoria Nova E2E', { exact: true })).toBeVisible()

    const newCatRow = page.locator('[data-test="category-row"]', { hasText: 'Categoria Nova E2E' })
    await newCatRow.getByRole('button', { name: 'Editar', exact: true }).click()
    await page.getByLabel('Nome da categoria *').fill('Categoria Editada E2E')
    await page.getByRole('dialog').getByRole('button', { name: /salvar/i }).click()
    await expect(page.getByText('Categoria Editada E2E', { exact: true })).toBeVisible()

    // Verify propagated to NewLostReport CategorySelect
    await page.goto('/minhas-perdas/nova')
    await page.locator('.v-select').first().click()
    await expect(page.getByRole('option', { name: 'Categoria Editada E2E' })).toBeVisible()
    await page.keyboard.press('Escape')

    // Linked category delete returns 409 and preserves it
    await page.goto('/admin/categorias')
    const linkedCatRow = page.locator('[data-test="category-row"]', {
      hasText: ctx.seed.categories.electronics.name,
    })
    await linkedCatRow.getByRole('button', { name: 'Excluir', exact: true }).click()
    await acceptConfirmDialog(page)
    await expect(page.getByText(ctx.seed.categories.electronics.name, { exact: true })).toBeVisible()

    // Unlinked created category deletes cleanly
    const editedCatRow = page.locator('[data-test="category-row"]', {
      hasText: 'Categoria Editada E2E',
    })
    await editedCatRow.getByRole('button', { name: 'Excluir', exact: true }).click()
    await acceptConfirmDialog(page)
    await expect(page.getByText('Categoria Editada E2E', { exact: true })).toHaveCount(0)
  })

  test('Flow 08: SUPERADMIN admin management, RBAC isolation, initialPassword login, and 409 conflict', async ({
    page,
  }) => {
    // Common ADMIN must be blocked from /admin/admins
    await loginViaUi(page, ctx.seed.users.adminLinked.email, ctx.e2ePass)
    await expect(page).toHaveURL(/\/$/)
    await page.goto('/admin/admins')
    await expect(page).toHaveURL(/\/403/)

    await logoutViaUi(page)
    await loginViaUi(page, ctx.seed.users.superadmin.email, ctx.e2ePass)
    await expect(page).toHaveURL(/\/$/)

    await page.goto('/admin/admins')
    await expect(page.getByText(ctx.seed.users.adminLinked.email)).toBeVisible()
    await expect(page.getByText(ctx.seed.users.superadmin.email)).toHaveCount(0)

    // Create new ADMIN with initialPassword
    const createdAdminEmail = 'admin.criado@e2e.local'
    await page.getByRole('button', { name: /novo administrador/i }).click()
    await page.getByLabel('Nome *').fill('Admin Criado E2E')
    await page.getByLabel('E-mail *').fill(createdAdminEmail)
    await page.getByLabel('Senha inicial *').fill(ctx.e2ePass)
    await page.getByRole('dialog').getByRole('button', { name: /cadastrar|salvar/i }).click()
    await expect(page.getByText(createdAdminEmail)).toBeVisible()

    // View details modal
    const createdRow = page.locator('[data-test="admin-row"]', { hasText: createdAdminEmail })
    await createdRow.locator('[data-test="admin-detail-btn"]').click()
    await expect(page.getByRole('dialog').getByText('Admin Criado E2E')).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: /fechar/i }).click()

    // Attempt delete linked admin -> 409 preserves
    const linkedAdminRow = page.locator('[data-test="admin-row"]', {
      hasText: ctx.seed.users.adminLinked.email,
    })
    await linkedAdminRow.locator('[data-test="admin-delete-btn"]').click()
    await acceptConfirmDialog(page)
    await expect(page.getByText(/conflita com registros relacionados/i)).toBeVisible()
    await expect(page.getByText(ctx.seed.users.adminLinked.email, { exact: true })).toBeVisible()

    // Newly created ADMIN can log in with initialPassword and still cannot open /admin/admins
    await logoutViaUi(page)
    await loginViaUi(page, createdAdminEmail, ctx.e2ePass)
    await expect(page).toHaveURL(/\/$/)
    await page.goto('/admin/admins')
    await expect(page).toHaveURL(/\/403/)

    // Back as SUPERADMIN: delete the newly created (unlinked) ADMIN -> 204 removes it cleanly
    await logoutViaUi(page)
    await loginViaUi(page, ctx.seed.users.superadmin.email, ctx.e2ePass)
    await expect(page).toHaveURL(/\/$/)
    await page.goto('/admin/admins')
    const removableRow = page.locator('[data-test="admin-row"]', { hasText: createdAdminEmail })
    await removableRow.locator('[data-test="admin-delete-btn"]').click()
    await acceptConfirmDialog(page)
    await expect(page.getByText(createdAdminEmail, { exact: true })).toHaveCount(0)
  })

  test('Flow 09: Admin dashboard real metrics, GET-only refresh, and confirmed eligibility job revalidation', async ({
    page,
  }) => {
    await loginViaUi(page, ctx.seed.users.adminLinked.email, ctx.e2ePass)
    await expect(page).toHaveURL(/\/$/)

    let jobPosts = 0
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/jobs/disposition-eligibility')) {
        jobPosts += 1
      }
    })

    await page.goto('/admin/dashboard')
    await expect(page.getByText('Relatos cadastrados', { exact: true })).toBeVisible()
    await expect(page.getByText('Relatos em aberto', { exact: true })).toBeVisible()
    await expect(page.getByText('Itens disponíveis', { exact: true })).toBeVisible()
    await expect(page.getByText('Itens elegíveis', { exact: true })).toBeVisible()

    const availableCard = page.locator('.v-card', { hasText: 'Itens disponíveis' }).first()
    const eligibleCard = page.locator('.v-card', { hasText: 'Itens elegíveis' }).first()
    await expect(availableCard).toContainText('2')
    await expect(eligibleCard).toContainText('1')

    // Refresh uses GET only, never runs eligibility POST
    await page.getByRole('button', { name: 'Atualizar indicadores', exact: true }).click()
    expect(jobPosts).toBe(0)

    // Dismissing eligibility confirm dialog never sends POST
    await page.getByRole('button', { name: 'Executar processamento', exact: true }).click()
    await dismissConfirmDialog(page)
    expect(jobPosts).toBe(0)

    // Confirm runs 1 POST and flips oldAvailable (45d > 30d rule) -> ELIGIBLE
    await page.getByRole('button', { name: 'Executar processamento', exact: true }).click()
    const [jobResp] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/api/v1/jobs/disposition-eligibility') &&
          res.request().method() === 'POST',
      ),
      acceptConfirmDialog(page),
    ])
    expect(jobResp.status()).toBe(200)
    expect(jobPosts).toBe(1)

    await expect(availableCard).toContainText('1')
    await expect(eligibleCard).toContainText('2')
  })

  test('Flow 10 (E2E-ENV-01..03): Startup without VITE_API_URL, API outage resilience, HTML 200 rejection with retry, and auth navigation', async ({
    page,
  }) => {
    const pageErrors: string[] = []
    const consoleWarnings: string[] = []
    const observedApiResponses: { url: string; status: number; contentType: string }[] = []

    page.on('pageerror', (err) => pageErrors.push(err.message))
    page.on('console', (msg) => {
      if (msg.type() === 'warning' || msg.type() === 'error') {
        consoleWarnings.push(msg.text())
      }
    })
    page.on('response', (res) => {
      if (res.url().includes('/api/v1/')) {
        observedApiResponses.push({
          url: new URL(res.url()).pathname,
          status: res.status(),
          contentType: res.headers()['content-type'] ?? '',
        })
      }
    })

    // E2E-ENV-01: Frontend started without VITE_API_URL reaches /api/v1/* via default baseURL and Vite proxy
    const healthRes = await page.request.get('http://localhost:5173/api/v1/health')
    expect(healthRes.status()).toBe(200)
    expect(healthRes.headers()['content-type']).toContain('application/json')
    expect(await healthRes.json()).toMatchObject({
      success: true,
      data: {
        status: 'healthy',
        database: 'connected',
      },
    })

    await page.goto('/')
    await expect(page.getByText(ctx.seed.items.available.title)).toBeVisible()

    // Hard reload on Home preserves catalog, filters, and zero runtime/deprecation errors
    await page.reload()
    await expect(page.getByText(ctx.seed.items.available.title)).toBeVisible()

    expect(
      observedApiResponses.some(
        (r) => r.url === '/api/v1/items' && r.status === 200 && r.contentType.includes('application/json'),
      ),
    ).toBe(true)
    expect(
      observedApiResponses.some(
        (r) => r.url === '/api/v1/buildings' && r.status === 200 && r.contentType.includes('application/json'),
      ),
    ).toBe(true)
    expect(
      observedApiResponses.some(
        (r) => r.url === '/api/v1/categories' && r.status === 200 && r.contentType.includes('application/json'),
      ),
    ).toBe(true)
    expect(pageErrors).toEqual([])
    expect(consoleWarnings.join('\n')).not.toContain("'dense' is deprecated")

    const appBar = page.locator('header')
    await appBar.getByRole('link', { name: 'Entrar' }).click()
    await expect(page).toHaveURL(/\/entrar$/)
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()

    await page.goBack()
    await expect(page).toHaveURL(/\/$/)
    await appBar.getByRole('link', { name: 'Criar conta' }).click()
    await expect(page).toHaveURL(/\/registrar$/)
    await expect(page.getByRole('heading', { name: 'Criar conta' })).toBeVisible()

    // E2E-ENV-02: Simulated API outage preserves navigation to /entrar and /registrar without stuck loading
    let simulateOutage = true
    const outageHandler = async (route: Parameters<Parameters<Page['route']>[1]>[0]) => {
      if (simulateOutage) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: { code: 503, details: 'Service Unavailable' } }),
        })
        return
      }
      await route.continue()
    }
    await page.route('**/api/v1/items*', outageHandler)
    await page.route('**/api/v1/buildings*', outageHandler)
    await page.route('**/api/v1/categories*', outageHandler)

    await page.goto('/')
    await expect(page.getByText('Não foi possível carregar os dados')).toBeVisible()
    await expect(page.getByText('Carregando itens...')).toHaveCount(0)
    expect(pageErrors).toEqual([])

    await appBar.getByRole('link', { name: 'Entrar' }).click()
    await expect(page).toHaveURL(/\/entrar$/)
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()

    await page.goBack()
    await expect(page).toHaveURL(/\/$/)
    await appBar.getByRole('link', { name: 'Criar conta' }).click()
    await expect(page).toHaveURL(/\/registrar$/)
    await expect(page.getByRole('heading', { name: 'Criar conta' })).toBeVisible()

    simulateOutage = false
    await page.unroute('**/api/v1/items*', outageHandler)
    await page.unroute('**/api/v1/buildings*', outageHandler)
    await page.unroute('**/api/v1/categories*', outageHandler)

    // E2E-ENV-03: Simulated HTTP 200 HTML on /api/v1/items is rejected safely, allows retry recovery, and keeps navigation working
    let serveHtmlOnce = true
    const htmlHandler = async (route: Parameters<Parameters<Page['route']>[1]>[0]) => {
      if (serveHtmlOnce) {
        serveHtmlOnce = false
        await route.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: '<!doctype html><html><head><title>Fallback</title></head><body><div id="app"></div></body></html>',
        })
        return
      }
      await route.continue()
    }
    await page.route('**/api/v1/items*', htmlHandler)

    await page.goto('/')
    await expect(page.getByText('Não foi possível carregar os dados')).toBeVisible()
    await expect(page.getByText('Carregando itens...')).toHaveCount(0)
    await expect(page.getByText(ctx.seed.items.available.title)).toHaveCount(0)
    expect(pageErrors).toEqual([])

    // Retry recovers catalog listing from real backend
    await page.getByRole('button', { name: 'Tentar novamente' }).first().click()
    await expect(page.getByText(ctx.seed.items.available.title)).toBeVisible()
    await expect(page.getByText('Não foi possível carregar os dados')).toHaveCount(0)

    await appBar.getByRole('link', { name: 'Entrar' }).click()
    await expect(page).toHaveURL(/\/entrar$/)
    await appBar.getByRole('link', { name: 'Criar conta' }).click()
    await expect(page).toHaveURL(/\/registrar$/)
    expect(pageErrors).toEqual([])

    await page.unroute('**/api/v1/items*', htmlHandler)
  })
})

import path from 'node:path'
import os from 'node:os'
import { pathToFileURL } from 'node:url'

async function main() {
  const rawDbPath = process.env.SQLITE_DB_PATH
  if (!rawDbPath) {
    throw new Error('Aborting E2E seed: SQLITE_DB_PATH is required.')
  }

  const resolvedDbPath = path.resolve(rawDbPath)
  const resolvedTmpDir = path.resolve(os.tmpdir())
  if (!resolvedDbPath.toLowerCase().startsWith(resolvedTmpDir.toLowerCase())) {
    throw new Error(`Aborting E2E seed: database must live under os.tmpdir() (${resolvedTmpDir}), got ${resolvedDbPath}`)
  }

  const backendRoot = process.cwd()
  await import(pathToFileURL(path.join(backendRoot, 'node_modules/reflect-metadata/Reflect.js')).href)
  const loadBackend = async (relPath: string) => import(pathToFileURL(path.join(backendRoot, relPath)).href)

  const { AppDataSource } = await loadBackend('src/data-source.ts')
  const { User } = await loadBackend('src/models/user.ts')
  const { Building } = await loadBackend('src/models/building.ts')
  const { Category } = await loadBackend('src/models/category.ts')
  const { Item } = await loadBackend('src/models/item.ts')
  const { ItemPhoto } = await loadBackend('src/models/item-photo.ts')
  const { LostReport } = await loadBackend('src/models/lost-report.ts')
  const { DispositionRule } = await loadBackend('src/models/disposition-rule.ts')
  const { Notification } = await loadBackend('src/models/notification.ts')
  const {
    UserRole,
    ItemStatus,
    LostReportStatus,
    DispositionType,
    NotificationType,
  } = await loadBackend('src/models/enums.ts')
  const { hashPassword } = await loadBackend('src/shared/password.ts')

  const e2ePass = process.env.E2E_USER_PASSWORD
  if (!e2ePass) {
    throw new Error('Aborting E2E seed: E2E_USER_PASSWORD is required.')
  }

  await AppDataSource.initialize()
  try {
    const userRepo = AppDataSource.getRepository(User)
    const buildingRepo = AppDataSource.getRepository(Building)
    const categoryRepo = AppDataSource.getRepository(Category)
    const itemRepo = AppDataSource.getRepository(Item)
    const photoRepo = AppDataSource.getRepository(ItemPhoto)
    const lostReportRepo = AppDataSource.getRepository(LostReport)
    const ruleRepo = AppDataSource.getRepository(DispositionRule)
    const notificationRepo = AppDataSource.getRepository(Notification)

    const passwordHash = await hashPassword(e2ePass)

    const superadmin = await userRepo.save(
      userRepo.create({
        name: 'Super Admin E2E',
        email: 'superadmin@e2e.local',
        passwordHash,
        phone: '(85) 99999-0001',
        role: UserRole.SUPERADMIN,
      }),
    )

    const adminLinked = await userRepo.save(
      userRepo.create({
        name: 'Admin Vinculado E2E',
        email: 'admin.linked@e2e.local',
        passwordHash,
        phone: '(85) 99999-0002',
        role: UserRole.ADMIN,
      }),
    )

    const adminUnlinked = await userRepo.save(
      userRepo.create({
        name: 'Admin Removivel E2E',
        email: 'admin.unlinked@e2e.local',
        passwordHash,
        phone: '(85) 99999-0003',
        role: UserRole.ADMIN,
      }),
    )

    const userA = await userRepo.save(
      userRepo.create({
        name: 'Alice Estudante',
        email: 'user.a@e2e.local',
        passwordHash,
        phone: '(85) 98888-1111',
        role: UserRole.USER,
      }),
    )

    const userB = await userRepo.save(
      userRepo.create({
        name: 'Bruno Visitante',
        email: 'user.b@e2e.local',
        passwordHash,
        phone: '(85) 98888-2222',
        role: UserRole.USER,
      }),
    )

    const buildingMain = await buildingRepo.save(
      buildingRepo.create({
        name: 'Bloco E2E Principal',
        address: 'Rua Teste E2E, 100 - Campus Pici',
        pickupPoint: 'Sala 101 - Portaria Central',
        serviceHours: 'Seg a Sex, 08:00-17:00',
      }),
    )

    const buildingLibrary = await buildingRepo.save(
      buildingRepo.create({
        name: 'Biblioteca E2E Central',
        address: 'Av. Universitaria, 200 - Campus Pici',
        pickupPoint: 'Balcao Terreo',
        serviceHours: 'Seg a Sex, 07:30-20:00',
      }),
    )

    const buildingUnlinked = await buildingRepo.save(
      buildingRepo.create({
        name: 'Anexo E2E Sem Vinculo',
        address: 'Rua Secundaria, 300',
        pickupPoint: 'Guarita Norte',
        serviceHours: 'Seg a Sex, 09:00-16:00',
      }),
    )

    const categoryElectronics = await categoryRepo.save(
      categoryRepo.create({ name: 'Eletronicos E2E' }),
    )
    const categoryDocuments = await categoryRepo.save(
      categoryRepo.create({ name: 'Documentos E2E' }),
    )
    const categoryUnlinked = await categoryRepo.save(
      categoryRepo.create({ name: 'Acessorios E2E' }),
    )

    await ruleRepo.save(
      ruleRepo.create({
        days: 30,
        destination: DispositionType.DONATED,
        active: true,
        locked: false,
        createdBy: adminLinked.id,
      }),
    )

    const daysAgo = (days: number) => {
      const date = new Date()
      date.setDate(date.getDate() - days)
      return date
    }

    const itemAvailable = await itemRepo.save(
      itemRepo.create({
        title: 'Notebook Prata E2E',
        description: 'Notebook prata com capa cinza encontrado na sala 102.',
        categoryId: categoryElectronics.id,
        buildingId: buildingMain.id,
        foundLocation: 'Sala 102',
        foundDate: daysAgo(5),
        status: ItemStatus.AVAILABLE,
        plannedDestination: null,
        createdBy: adminLinked.id,
      }),
    )

    // Item with >30 days so POST /jobs/disposition-eligibility flips AVAILABLE -> ELIGIBLE in Flow 09
    const itemOldAvailable = await itemRepo.save(
      itemRepo.create({
        title: 'Carregador USB-C E2E',
        description: 'Carregador branco USB-C deixado proximo a tomada da biblioteca.',
        categoryId: categoryElectronics.id,
        buildingId: buildingLibrary.id,
        foundLocation: 'Bancada Leste',
        foundDate: daysAgo(45),
        status: ItemStatus.AVAILABLE,
        plannedDestination: null,
        createdBy: adminLinked.id,
      }),
    )

    // Photo URL intentionally pointing to non-existent asset on itemOldAvailable to check broken-image fallback
    await photoRepo.save(
      photoRepo.create({
        itemId: itemOldAvailable.id,
        url: '/api/v1/uploads/nonexistent-e2e-image.png',
      }),
    )

    const itemEligible = await itemRepo.save(
      itemRepo.create({
        title: 'Carteira Azul E2E',
        description: 'Carteira azul marinho encontrada na leitura.',
        categoryId: categoryDocuments.id,
        buildingId: buildingLibrary.id,
        foundLocation: 'Mesa 04',
        foundDate: daysAgo(40),
        status: ItemStatus.ELIGIBLE,
        plannedDestination: DispositionType.DONATED,
        createdBy: adminLinked.id,
      }),
    )

    const itemHandedOver = await itemRepo.save(
      itemRepo.create({
        title: 'Garrafa Entregue E2E',
        description: 'Nao deve aparecer no catalogo publico.',
        categoryId: categoryElectronics.id,
        buildingId: buildingMain.id,
        foundLocation: 'Corredor A',
        foundDate: daysAgo(2),
        status: ItemStatus.HANDED_OVER,
        plannedDestination: null,
        createdBy: adminLinked.id,
      }),
    )

    const itemSold = await itemRepo.save(
      itemRepo.create({
        title: 'Casaco Vendido E2E',
        description: 'Nao deve aparecer no catalogo publico.',
        categoryId: categoryDocuments.id,
        buildingId: buildingMain.id,
        foundLocation: 'Auditorio',
        foundDate: daysAgo(60),
        status: ItemStatus.SOLD,
        plannedDestination: DispositionType.SOLD,
        createdBy: adminLinked.id,
      }),
    )

    const reportOpenA1 = await lostReportRepo.save(
      lostReportRepo.create({
        userId: userA.id,
        categoryId: categoryElectronics.id,
        buildingId: buildingMain.id,
        confirmedItemId: null,
        description: 'Notebook prata com adesivo perdido proximo ao laboratorio.',
        lossDate: daysAgo(6),
        status: LostReportStatus.OPEN,
      }),
    )

    const reportOpenA2 = await lostReportRepo.save(
      lostReportRepo.create({
        userId: userA.id,
        categoryId: categoryDocuments.id,
        buildingId: null,
        confirmedItemId: null,
        description: 'Carteira azul perdida em trajeto entre predios.',
        lossDate: daysAgo(4),
        status: LostReportStatus.OPEN,
      }),
    )

    const reportResolvedA = await lostReportRepo.save(
      lostReportRepo.create({
        userId: userA.id,
        categoryId: categoryDocuments.id,
        buildingId: buildingLibrary.id,
        confirmedItemId: itemEligible.id,
        description: 'Documento estudantil ja recuperado anteriormente.',
        lossDate: daysAgo(15),
        status: LostReportStatus.RESOLVED,
      }),
    )

    const reportOpenB = await lostReportRepo.save(
      lostReportRepo.create({
        userId: userB.id,
        categoryId: categoryElectronics.id,
        buildingId: buildingMain.id,
        confirmedItemId: null,
        description: 'Fone sem fio preto esquecido na sala de estudos.',
        lossDate: daysAgo(3),
        status: LostReportStatus.OPEN,
      }),
    )

    await notificationRepo.save(
      notificationRepo.create({
        userId: userA.id,
        type: NotificationType.MATCH_FOUND,
        linkUrl: `/lost-reports/${reportOpenA1.id}`,
        readAt: null,
      }),
    )

    await notificationRepo.save(
      notificationRepo.create({
        userId: userA.id,
        type: NotificationType.REPORT_RESOLVED,
        linkUrl: `/lost-reports/${reportResolvedA.id}`,
        readAt: new Date(),
      }),
    )

    console.log(
      JSON.stringify({
        users: {
          superadmin: { id: superadmin.id, email: superadmin.email, name: superadmin.name },
          adminLinked: { id: adminLinked.id, email: adminLinked.email, name: adminLinked.name },
          adminUnlinked: { id: adminUnlinked.id, email: adminUnlinked.email, name: adminUnlinked.name },
          userA: { id: userA.id, email: userA.email, name: userA.name },
          userB: { id: userB.id, email: userB.email, name: userB.name },
        },
        buildings: {
          main: { id: buildingMain.id, name: buildingMain.name },
          library: { id: buildingLibrary.id, name: buildingLibrary.name },
          unlinked: { id: buildingUnlinked.id, name: buildingUnlinked.name },
        },
        categories: {
          electronics: { id: categoryElectronics.id, name: categoryElectronics.name },
          documents: { id: categoryDocuments.id, name: categoryDocuments.name },
          unlinked: { id: categoryUnlinked.id, name: categoryUnlinked.name },
        },
        items: {
          available: { id: itemAvailable.id, title: itemAvailable.title },
          oldAvailable: { id: itemOldAvailable.id, title: itemOldAvailable.title },
          eligible: { id: itemEligible.id, title: itemEligible.title },
          handedOver: { id: itemHandedOver.id, title: itemHandedOver.title },
          sold: { id: itemSold.id, title: itemSold.title },
        },
        lostReports: {
          openA1: { id: reportOpenA1.id, description: reportOpenA1.description },
          openA2: { id: reportOpenA2.id, description: reportOpenA2.description },
          resolvedA: { id: reportResolvedA.id, description: reportResolvedA.description },
          openB: { id: reportOpenB.id, description: reportOpenB.description },
        },
      }),
    )
  } finally {
    await AppDataSource.destroy()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

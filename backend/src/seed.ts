import 'reflect-metadata';
import 'dotenv/config';
import { AppDataSource } from './data-source.js';
import { User } from './models/user.js';
import { Building } from './models/building.js';
import { Category } from './models/category.js';
import { Item } from './models/item.js';
import { ItemPhoto } from './models/item-photo.js';
import { LostReport } from './models/lost-report.js';
import { Handover } from './models/handover.js';
import { Disposition } from './models/disposition.js';
import { DispositionRule } from './models/disposition-rule.js';
import { Notification } from './models/notification.js';
import { UserRole, ItemStatus, LostReportStatus, DispositionType, NotificationType } from './models/enums.js';
import { hashPassword } from './shared/password.js';

async function seed() {
  console.log('🌱 Iniciando o povoamento do banco de dados do Achadex...');

  await AppDataSource.initialize();
  console.log('📦 Conexão com o banco de dados estabelecida.');

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();

  // Limpar tabelas existentes na ordem correta de dependência (de baixo para cima)
  console.log('🧹 Limpando dados anteriores...');
  await queryRunner.query('DELETE FROM notifications');
  await queryRunner.query('DELETE FROM dispositions');
  await queryRunner.query('DELETE FROM handovers');
  await queryRunner.query('DELETE FROM item_photos');
  await queryRunner.query('DELETE FROM lost_reports');
  await queryRunner.query('DELETE FROM items');
  await queryRunner.query('DELETE FROM disposition_rules');
  await queryRunner.query('DELETE FROM categories');
  await queryRunner.query('DELETE FROM buildings');
  await queryRunner.query('DELETE FROM users');

  const userRepository = AppDataSource.getRepository(User);
  const buildingRepository = AppDataSource.getRepository(Building);
  const categoryRepository = AppDataSource.getRepository(Category);
  const itemRepository = AppDataSource.getRepository(Item);
  const itemPhotoRepository = AppDataSource.getRepository(ItemPhoto);
  const lostReportRepository = AppDataSource.getRepository(LostReport);
  const handoverRepository = AppDataSource.getRepository(Handover);
  const dispositionRepository = AppDataSource.getRepository(Disposition);
  const dispositionRuleRepository = AppDataSource.getRepository(DispositionRule);
  const notificationRepository = AppDataSource.getRepository(Notification);

  // 1. Criar Superadmin e Admin
  console.log('👤 Criando usuários administradores...');
  const hashedPassword = await hashPassword('Senha123!');

  const superadmin = await userRepository.save(
    userRepository.create({
      name: 'Super Administrador Geral',
      email: 'superadmin@achadex.com',
      passwordHash: hashedPassword,
      phone: '+55 (11) 99999-0001',
      role: UserRole.SUPERADMIN,
    })
  );

  const admin = await userRepository.save(
    userRepository.create({
      name: 'Carlos Administrador',
      email: 'admin@achadex.com',
      passwordHash: hashedPassword,
      phone: '+55 (11) 99999-0002',
      role: UserRole.ADMIN,
    })
  );

  // 2. Criar Usuários Normais (25 usuários)
  console.log('👥 Criando 25 usuários comuns...');
  const firstNames = ['Ana', 'Bruno', 'Carla', 'Daniel', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Karina', 'Lucas', 'Mariana', 'Nicolas', 'Olivia', 'Pedro', 'Rafaela', 'Samuel', 'Tatiane', 'Vitor', 'Yasmin', 'Zeca', 'Beatriz', 'Diego', 'Camila'];
  const lastNames = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Almeida', 'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa'];

  const users: User[] = [superadmin, admin];
  for (let i = 1; i <= 25; i++) {
    const fn = firstNames[(i - 1) % firstNames.length];
    const ln = lastNames[(i - 1) % lastNames.length];
    const u = await userRepository.save(
      userRepository.create({
        name: `${fn} ${ln} ${i}`,
        email: `usuario${i}@achadex.com`,
        passwordHash: hashedPassword,
        phone: `+55 (11) 9${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`,
        role: UserRole.USER,
      })
    );
    users.push(u);
  }

  // 3. Criar Prédios (Buildings - 6 unidades)
  console.log('🏢 Criando prédios do campus...');
  const buildingsData = [
    { name: 'Prédio Central', address: 'Av. Principal, 1000 - Campus Universitário', pickupPoint: 'Portaria Principal - Achados e Perdidos', serviceHours: 'Segunda a Sexta, das 08:00 às 18:00' },
    { name: 'Biblioteca Reitora Maria', address: 'Praça das Letras, 200 - Campus Universitário', pickupPoint: 'Balcão de Atendimento do Térreo', serviceHours: 'Segunda a Sábado, das 07:00 às 22:00' },
    { name: 'Centro de Tecnologia (CT)', address: 'Rua dos Engenheiros, 500 - Campus Universitário', pickupPoint: 'Sala da Administração do Bloco A', serviceHours: 'Segunda a Sexta, das 09:00 às 17:00' },
    { name: 'Faculdade de Direito', address: 'Largo da Justiça, 50 - Centro', pickupPoint: 'Secretaria Acadêmica', serviceHours: 'Segunda a Sexta, das 08:00 às 19:00' },
    { name: 'Refeitório Universitário (RU)', address: 'Av. da Fome, 300 - Campus Universitário', pickupPoint: 'Sala da Nutrição e Apoio', serviceHours: 'Segunda a Sexta, das 11:00 às 14:30' },
    { name: 'Hospital das Clínicas (HC)', address: 'Av. da Saúde, 1500 - Zona Leste', pickupPoint: 'Serviço Social - Térreo', serviceHours: 'Segunda a Domingo, 24 horas' },
  ];

  const buildings: Building[] = [];
  for (const b of buildingsData) {
    const building = await buildingRepository.save(buildingRepository.create(b));
    buildings.push(building);
  }

  // 4. Criar Categorias (8 categorias)
  console.log('🏷️ Criando categorias de itens...');
  const categoriesData = [
    'Eletrônicos e Gadgets',
    'Documentos e Cartões',
    'Chaves e Chaveiros',
    'Roupas e Agasalhos',
    'Livros, Cadernos e Apostilas',
    'Bolsas, Mochilas e Carteiras',
    'Óculos e Relógios',
    'Garrafas, Copos e Squeezes',
  ];

  const categories: Category[] = [];
  for (const cName of categoriesData) {
    const cat = await categoryRepository.save(categoryRepository.create({ name: cName }));
    categories.push(cat);
  }

  // 5. Criar Regras de Destinação (Disposition Rules)
  console.log('📋 Criando regras de destinação...');
  await dispositionRuleRepository.save([
    dispositionRuleRepository.create({ days: 30, destination: DispositionType.DONATED, active: true, locked: true, createdBy: superadmin.id }),
    dispositionRuleRepository.create({ days: 60, destination: DispositionType.SOLD, active: true, locked: false, createdBy: superadmin.id }),
    dispositionRuleRepository.create({ days: 90, destination: DispositionType.DISCARDED, active: true, locked: false, createdBy: admin.id }),
  ]);

  // 6. Criar Itens Achados (Items - 120 itens com variedade de status)
  console.log('📦 Criando 120 itens achados realistas...');
  const itemTemplates = [
    { title: 'iPhone 13 Pro Max Azul', desc: 'Aparelho celular com capa protetora transparente e pelagem trincada no canto superior.', catIdx: 0 },
    { title: 'MacBook Air M1 Cinza Espacial', desc: 'Notebook com adesivos de programação na tampa. Carregador original incluso.', catIdx: 0 },
    { title: 'Fone de Ouvido AirPods Pro', desc: 'Estojo de carregamento branco com marcas de uso.', catIdx: 0 },
    { title: 'Carteira de Couro Marrom com CNH', desc: 'Contém documentos em nome de Carlos Silva, cartões de crédito e R$ 45 em espécie.', catIdx: 5 },
    { title: 'RG e Cartão do Metrô', desc: 'Documento de identidade estudantil e bilhete único.', catIdx: 1 },
    { title: 'Chaveiro com Chaves de Carro Ford e Casa', desc: 'Chaveiro de pelúcia em formato de panda.', catIdx: 2 },
    { title: 'Moletom Preto Universitário G', desc: 'Moletom com capuz, estampa do curso de Engenharia.', catIdx: 3 },
    { title: 'Jaqueta Jeans Azul Escuro M', desc: 'Marca Levi\'s, bolsos internos contendo lenços de papel.', catIdx: 3 },
    { title: 'Livro "Calculo A - Stewart 7ª Edição"', desc: 'Livro em bom estado com anotações a lápis nas margens.', catIdx: 4 },
    { title: 'Caderno Espiral 10 Matérias Tilibra', desc: 'Capa azul com adesivos de física quântica.', catIdx: 4 },
    { title: 'Mochila Executiva Preto Targus', desc: 'Mochila impermeável com compartimento para notebook de até 15.6 polegadas.', catIdx: 5 },
    { title: 'Óculos de Sol Ray-Ban Aviador', desc: 'Armação dourada com lentes escuras degradê, acompanha estojo.', catIdx: 6 },
    { title: 'Relógio Casio Vintage Digital', desc: 'Pulseira de aço prateado.', catIdx: 6 },
    { title: 'Garrafa Térmica Stanley Verde 750ml', desc: 'Garrafa com arranhões na base.', catIdx: 7 },
    { title: 'Squeeze Inox Azul 500ml', desc: 'Com adesivo de academia.', catIdx: 7 },
  ];

  const statuses = [ItemStatus.AVAILABLE, ItemStatus.ELIGIBLE, ItemStatus.HANDED_OVER, ItemStatus.SOLD, ItemStatus.DONATED, ItemStatus.DISCARDED];
  const items: Item[] = [];

  for (let i = 1; i <= 120; i++) {
    const template = itemTemplates[(i - 1) % itemTemplates.length];
    const building = buildings[(i * 3) % buildings.length];
    const category = categories[template.catIdx];
    const status = statuses[i % statuses.length];
    
    // Gerar data nos últimos 120 dias
    const daysAgo = Math.floor(Math.random() * 120);
    const foundDate = new Date();
    foundDate.setDate(foundDate.getDate() - daysAgo);

    const item = await itemRepository.save(
      itemRepository.create({
        title: `${template.title} #${i}`,
        description: `${template.desc} (Encontrado no bloco ${building.name})`,
        categoryId: category.id,
        buildingId: building.id,
        foundLocation: `Corredor principal próximo à sala ${100 + (i % 50)}`,
        foundDate,
        status,
        plannedDestination: status === ItemStatus.ELIGIBLE ? DispositionType.DONATED : null,
        createdBy: admin.id,
      })
    );

    // Adicionar 1 ou 2 fotos para cada item
    await itemPhotoRepository.save([
      itemPhotoRepository.create({
        itemId: item.id,
        url: `https://picsum.photos/seed/achadex-item-${item.id}-1/600/400`,
      }),
    ]);
    if (i % 2 === 0) {
      await itemPhotoRepository.save([
        itemPhotoRepository.create({
          itemId: item.id,
          url: `https://picsum.photos/seed/achadex-item-${item.id}-2/600/400`,
        }),
      ]);
    }

    // Se o status for HANDED_OVER, criar handover
    if (status === ItemStatus.HANDED_OVER) {
      const recipientUser = users[2 + (i % (users.length - 2))];
      await handoverRepository.save(
        handoverRepository.create({
          itemId: item.id,
          withdrawnName: recipientUser.name,
          withdrawnCpf: `${Math.floor(100 + Math.random() * 900)}.${Math.floor(100 + Math.random() * 900)}.${Math.floor(100 + Math.random() * 900)}-${Math.floor(10 + Math.random() * 90)}`,
          adminId: admin.id,
          withdrawnUserId: recipientUser.id,
        })
      );
    }

    // Se o status for SOLD, DONATED ou DISCARDED, criar disposition
    if ([ItemStatus.SOLD, ItemStatus.DONATED, ItemStatus.DISCARDED].includes(status)) {
      const destMap: Record<string, DispositionType> = {
        [ItemStatus.SOLD]: DispositionType.SOLD,
        [ItemStatus.DONATED]: DispositionType.DONATED,
        [ItemStatus.DISCARDED]: DispositionType.DISCARDED,
      };
      await dispositionRepository.save(
        dispositionRepository.create({
          itemId: item.id,
          destination: destMap[status],
          adminId: admin.id,
          receiverDocument: `${Math.floor(10 + Math.random() * 90)}.${Math.floor(100 + Math.random() * 900)}.${Math.floor(100 + Math.random() * 900)}/${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(10 + Math.random() * 90)}`,
        })
      );
    }

    items.push(item);
  }

  // 7. Criar Registros de Perda (Lost Reports - 40 registros)
  console.log('🔍 Criando 40 registros de objetos perdidos...');
  const lostReportStatuses = [LostReportStatus.OPEN, LostReportStatus.RESOLVED, LostReportStatus.CANCELLED];
  
  for (let i = 1; i <= 40; i++) {
    const user = users[2 + (i % (users.length - 2))];
    const category = categories[i % categories.length];
    const building = i % 2 === 0 ? buildings[i % buildings.length] : null;
    const lrStatus = lostReportStatuses[i % lostReportStatuses.length];
    
    const daysAgo = Math.floor(Math.random() * 60);
    const lossDate = new Date();
    lossDate.setDate(lossDate.getDate() - daysAgo);

    const matchedItem = lrStatus === LostReportStatus.RESOLVED && items.length > 0 ? items[i % items.length] : null;

    await lostReportRepository.save(
      lostReportRepository.create({
        userId: user.id,
        categoryId: category.id,
        buildingId: building ? building.id : null,
        description: `Perdi meu objeto da categoria ${category.name} por volta das ${10 + (i % 10)}:00 perto do campus.`,
        lossDate,
        status: lrStatus,
        confirmedItemId: matchedItem ? matchedItem.id : null,
      })
    );
  }

  // 8. Criar Notificações (Notifications)
  console.log('🔔 Criando notificações para os usuários...');
  for (let i = 1; i <= 30; i++) {
    const user = users[i % users.length];
    const type = [NotificationType.MATCH_FOUND, NotificationType.ITEM_CLAIMED, NotificationType.REPORT_RESOLVED][i % 3];
    
    await notificationRepository.save(
      notificationRepository.create({
        userId: user.id,
        type,
        linkUrl: `/lost-reports/${i}`,
        readAt: i % 2 === 0 ? new Date() : null,
      })
    );
  }

  console.log('✨ Povoamento do banco de dados concluído com sucesso!');
  console.log('🔑 Credenciais úteis para teste:');
  console.log('   - Superadmin: superadmin@achadex.com / Senha123!');
  console.log('   - Admin:      admin@achadex.com / Senha123!');
  console.log('   - Usuários:   usuario1@achadex.com até usuario25@achadex.com / Senha123!');

  await queryRunner.release();
  await AppDataSource.destroy();
}

seed().catch((err) => {
  console.error('❌ Erro durante o povoamento do banco de dados:', err);
  process.exit(1);
});

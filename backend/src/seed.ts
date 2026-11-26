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
  console.log('Iniciando o povoamento do banco de dados do Achadex...');

  await AppDataSource.initialize();
  console.log('Conexão com o banco de dados estabelecida.');

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();

  // Limpar tabelas existentes na ordem correta de dependência (de baixo para cima)
  console.log('Limpando dados anteriores...');
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
  console.log('Criando usuários administradores...');
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
  console.log('Criando 25 usuários comuns...');
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
  console.log('Criando prédios do campus...');
  const buildingsData = [
    { name: 'Reitoria da UFC', address: 'Av. da Universidade, 2853 - Benfica, Fortaleza - CE, CEP 60020-181', pickupPoint: 'Recepção da Reitoria - térreo', serviceHours: 'Segunda a sexta, das 08:00 às 17:00' },
    { name: 'Centro de Tecnologia (CT)', address: 'Campus do Pici, Av. Humberto Monte, s/n - Pici, Fortaleza - CE', pickupPoint: 'Secretaria administrativa do Centro de Tecnologia', serviceHours: 'Segunda a sexta, das 08:00 às 17:00' },
    { name: 'Faculdade de Direito (FADIR)', address: 'Rua Meton de Alencar, s/n - Centro, Fortaleza - CE', pickupPoint: 'Recepção da Faculdade de Direito', serviceHours: 'Segunda a sexta, das 08:00 às 17:00' },
    { name: 'Restaurante Universitário - Campus do Pici', address: 'Campus do Pici, Av. Humberto Monte, s/n - Pici, Fortaleza - CE', pickupPoint: 'Guichê de atendimento do Restaurante Universitário', serviceHours: 'Segunda a sexta, das 08:00 às 17:00' },
    { name: 'Hospital Universitário Walter Cantídio (HUWC)', address: 'Rua Pastor Samuel Munguba, 1290 - Rodolfo Teófilo, Fortaleza - CE', pickupPoint: 'Recepção principal do Hospital Universitário', serviceHours: 'Segunda a sexta, das 08:00 às 17:00' },
    { name: 'Instituto de Ciências do Mar (Labomar)', address: 'Av. da Abolição, 3207 - Meireles, Fortaleza - CE', pickupPoint: 'Recepção do Instituto de Ciências do Mar', serviceHours: 'Segunda a sexta, das 08:00 às 17:00' },
  ];

  const buildings: Building[] = [];
  for (const b of buildingsData) {
    const building = await buildingRepository.save(buildingRepository.create(b));
    buildings.push(building);
  }

  // 4. Criar Categorias (9 categorias)
  console.log('Criando categorias de itens...');
  const categoriesData = [
    'Eletrônicos',
    'Documentos',
    'Chaves',
    'Vestuário',
    'Papelaria',
    'Bolsas',
    'Acessórios',
    'Garrafas',
    'Outros',
  ];


  const categories: Category[] = [];
  for (const cName of categoriesData) {
    const cat = await categoryRepository.save(categoryRepository.create({ name: cName }));
    categories.push(cat);
  }
  const categoriesByName = new Map(categories.map((category) => [category.name, category]));

  // 5. Criar Regras de Destinação (Disposition Rules)
  console.log('Criando regras de destinação...');
  const seededRules = await dispositionRuleRepository.save([
    dispositionRuleRepository.create({ days: 30, destination: DispositionType.DONATED, active: true, locked: true, createdBy: superadmin.id }),
    dispositionRuleRepository.create({ days: 60, destination: DispositionType.SOLD, active: true, locked: false, createdBy: superadmin.id }),
    dispositionRuleRepository.create({ days: 90, destination: DispositionType.DISCARDED, active: true, locked: false, createdBy: admin.id }),
  ]);
  const rulesByDaysDesc = [...seededRules].sort((a, b) => b.days - a.days);

  // 6. Criar Itens Achados (Items - 120 itens com variedade de status)
  console.log('Criando 120 itens achados realistas...');


  const itemTemplates = [
  {
    title: 'iPhone 13',
    desc: 'Estava com capinha transparente já meio amarelada e tem um trincado pequeno na película, bem no canto de cima. A tela de bloqueio tem foto de um cachorro.',
    category: 'Eletrônicos',
    photoUrl: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&h=400&fit=crop',
  },
  {
    title: 'MacBook Air M1',
    desc: 'Tem vários adesivos de linguagens de programação e Linux colados na tampa. Estava dentro de uma capa cinza junto com o carregador original.',
    category: 'Eletrônicos',
    photoUrl: 'https://images.pexels.com/photos/129205/pexels-photo-129205.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
  },
  {
    title: 'Fone de Ouvido AirPods',
    desc: 'Caixinha branca meio arranhada de ficar no bolso. Só está com o fone do lado direito dentro, o esquerdo não estava junto.',
    category: 'Eletrônicos',
    photoUrl: 'https://images.pexels.com/photos/3921872/pexels-photo-3921872.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
  },
  {
    title: 'Carteira de Couro com CNH',
    desc: 'Carteira marrom um pouco gasta. Tem CNH em nome de Carlos Silva, cartão do banco roxo, carteirinha do RU e algumas notas trocadas.',
    category: 'Bolsas',
    photoUrl: 'https://images.unsplash.com/photo-1627123424574-724758594e93?w=600&h=400&fit=crop',
  },
  {
    title: 'RG e Cartão',
    desc: 'Encontrado caído perto da catraca. Estão juntos em um plástico transparente: um RG e um cartão de passe estudantil.',
    category: 'Documentos',
    photoUrl: 'https://images.pexels.com/photos/7108126/pexels-photo-7108126.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
  },
  {
    title: 'Chaveiro',
    desc: 'Molho com três chaves comuns e uma tag azul de condomínio, preso num chaveiro de pelúcia de panda meio sujinho.',
    category: 'Chaves',
    photoUrl: 'https://images.pexels.com/photos/14721/pexels-photo.jpg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
  },
  {
    title: 'Moletom Preto',
    desc: 'Tamanho G, com estampa da atlética de Engenharia nas costas. Estava dobrado em cima de uma carteira no fundo da sala.',
    category: 'Vestuário',
    photoUrl: 'https://images.pexels.com/photos/28701960/pexels-photo-28701960/free-photo-of-young-man-in-black-hoodie-against-gray-background.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
  },
  {
    title: 'Jaqueta Jeans Azul',
    desc: 'Lavagem clara, tamanho M. Tem um pacote de lenços e um ingresso de cinema amassado no bolso de dentro.',
    category: 'Vestuário',
    photoUrl: 'https://images.pexels.com/photos/36607477/pexels-photo-36607477/free-photo-of-stylish-man-posing-in-dark-denim-outfit.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
  },
  {
    title: 'Livro "Calculo A - Stewart 7ª Edição"',
    desc: 'Capa bem surrada nas pontas, com várias anotações a lápis e post-its coloridos marcando os capítulos de derivadas.',
    category: 'Papelaria',
    photoUrl: 'https://images.pexels.com/photos/240163/pexels-photo-240163.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
  },
  {
    title: 'Caderno',
    desc: 'Caderno universitário de 10 matérias, capa azul com adesivos de física e uma folha solta com lista de exercícios no meio.',
    category: 'Papelaria',
    photoUrl: 'https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=600&h=400&fit=crop',
  },
  {
    title: 'Mochila Preta',
    desc: 'Mochila de lona preta com um zíper lateral meio emperrado. Dentro tem apenas um guarda-chuva dobrável e um carregador.',
    category: 'Bolsas',
    photoUrl: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&h=400&fit=crop',
  },
  {
    title: 'Óculos de Sol Aviador',
    desc: 'Armação dourada fina e lentes escuras. Estava solto em cima da mesa da cantina, sem a caixinha.',
    category: 'Acessórios',
    photoUrl: 'https://images.pexels.com/photos/26575042/pexels-photo-26575042.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
  },
  {
    title: 'Relógio Casio',
    desc: 'Modelo clássico prateado digital, com uns risquinhos leves no vidro e fecho um pouco frouxo.',
    category: 'Acessórios',
    photoUrl: 'https://images.pexels.com/photos/39102103/pexels-photo-39102103.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
  },
  {
    title: 'Garrafa Stanley',
    desc: 'Garrafa térmica verde musgo, com um amassado pequeno na parte de baixo e sem a tampa protetora do bocal.',
    category: 'Garrafas',
    photoUrl: 'https://images.pexels.com/photos/8330506/pexels-photo-8330506.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
  },
  {
    title: 'Estojo',
    desc: 'Estojo preto de tecido bem cheio, com várias canetas coloridas, marca-texto amarelo, borracha e uma lapiseira 0.7.',
    category: 'Papelaria',
    photoUrl: 'https://images.pexels.com/photos/37187501/pexels-photo-37187501.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
  },
  ];

  const statuses = [ItemStatus.AVAILABLE, ItemStatus.ELIGIBLE, ItemStatus.HANDED_OVER, ItemStatus.SOLD, ItemStatus.DONATED, ItemStatus.DISCARDED];
  const items: Item[] = [];

  for (let i = 1; i <= 120; i++) {
    const template = itemTemplates[(i - 1) % itemTemplates.length];
    const building = buildings[(i * 3) % buildings.length];
    const category = categoriesByName.get(template.category);
    if (!category) {
      throw new Error(`Categoria "${template.category}" não encontrada para o item "${template.title}".`);
    }
    const status = statuses[i % statuses.length];
    
    // Gerar data coerente com o status e com as regras de destinação
    const daysAgo =
      status === ItemStatus.ELIGIBLE
        ? 30 + Math.floor(Math.random() * 91)
        : status === ItemStatus.AVAILABLE
          ? Math.floor(Math.random() * 29)
          : Math.floor(Math.random() * 120);
    const foundDate = new Date();
    foundDate.setDate(foundDate.getDate() - daysAgo);

    const matchingRule =
      status === ItemStatus.ELIGIBLE
        ? rulesByDaysDesc.find((rule) => rule.active && daysAgo >= rule.days) ?? null
        : null;

    const item = await itemRepository.save(
      itemRepository.create({
        title: `${template.title}`,
        description: `${template.desc}`,
        categoryId: category.id,
        buildingId: building.id,
        foundLocation: `Corredor principal próximo à sala ${100 + (i % 50)}`,
        foundDate,
        status,
        plannedDestination: matchingRule ? matchingRule.destination : null,
        createdBy: admin.id,
      })
    );

    // Usa a imagem definida no template para manter a foto relacionada ao item.
    await itemPhotoRepository.save(
      itemPhotoRepository.create({
        itemId: item.id,
        url: template.photoUrl,
      })
    );

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
  console.log('Criando 40 registros de objetos perdidos...');
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
  console.log('Criando notificações para os usuários...');
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

  console.log('Povoamento do banco de dados concluído com sucesso!');
  console.log('Credenciais úteis para teste:');
  console.log('   - Superadmin: superadmin@achadex.com / Senha123!');
  console.log('   - Admin:      admin@achadex.com / Senha123!');
  console.log('   - Usuários:   usuario1@achadex.com até usuario25@achadex.com / Senha123!');

  await queryRunner.release();
  await AppDataSource.destroy();
}

seed().catch((err) => {
  console.error('Erro durante o povoamento do banco de dados:', err);
  process.exit(1);
});

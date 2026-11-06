# Passo a Passo para Implementação dos Endpoints Restantes do Achadex Backend

## 1. Módulo: Confirmação de Sugestão de Perda (`lost-report-suggestion-confirmation`)
Requisitos correspondentes: **RF12 (Sugerir achados compatíveis - Confirmação única)**, **RF27 (Notificações no app - ITEM_CLAIMED)**.

- [ ] **1.1. Modelo e Persistência (`lost-report.ts`)**
  - [ ] Adicionar campo `confirmedItemId` (inteiro, opcional/nullable, com índice e `@ManyToOne` para `Item`) na entidade `LostReport` para registrar qual item foi confirmado.
  - [ ] Atualizar repositório (`lost-report.repository.ts`) para suportar a busca e atualização da perda com o item confirmado, garantindo que o relato pertença ao usuário autenticado e esteja com status `OPEN`.

- [ ] **1.2. Serviço de Confirmação (`lost-report.service.ts`)**
  - [ ] Implementar regra de negócio para confirmar item sugerido (`POST /api/lost-reports/:id/suggestions/:itemId/confirm`):
    - Validar se o relato de perda existe e pertence ao usuário autenticado.
    - Validar se o relato está com status `OPEN`.
    - Validar se o relato **já possui um item confirmado** (caso já possua, retornar erro **409 Conflict** conforme especificado nas regras de unicidade de confirmação).
    - Validar se o item sugerido (`itemId`) existe.
    - Atualizar o relato de perda gravando `confirmedItemId`.
    - Gravar notificações do tipo `ITEM_CLAIMED` para todos os administradores e superadministradores (RF27), com link para o painel do item.

- [ ] **1.3. Controller (`lost-report.controller.ts`)**
  - [ ] Substituir `notImplemented` em `lostReportRouter.post('/:id/suggestions/:itemId/confirm', authenticate, ...)` com a lógica chamando o serviço.

- [ ] **1.4. Testes (`backend/src/tests/lost-report-confirm.test.ts`)**
  - [ ] Criar suíte de testes cobrindo:
    - Confirmação bem-sucedida de item sugerido para uma perda própria em aberto.
    - Geração correta da notificação `ITEM_CLAIMED` para administradores.
    - Rejeição (409 Conflict) ao tentar confirmar um segundo item para a mesma perda.
    - Rejeição (404/403) para perda inexistente ou pertencente a outro usuário.
    - Rejeição se a perda não estiver em status `OPEN`.

---

## 2. Módulo: Admin Lost Reports (`admin-lost-reports`)
Requisitos correspondentes: **RF17 (Encerrar registro de perda)**, **RF07-RF09 (Consultas administrativas de perdas)**.

- [ ] **2.1. Repositório (`admin-lost-report.repository.ts` ou expansão em `lost-report.repository.ts`)**
  - [ ] Implementar método para listar perdas de todos os usuários com filtros (`status`, `categoryId`, `buildingId`) e paginação.
  - [ ] Implementar método para buscar perda por ID (sem restrição de usuário autor, visível para administradores).
  - [ ] Implementar método para atualizar o status de uma perda para `RESOLVED` e registrar notificação `REPORT_RESOLVED` para o autor da perda.

- [ ] **2.2. Serviço (`admin-lost-report.service.ts` ou expansão em `lost-report.service.ts`)**
  - [ ] Criar regras de negócio para listagem administrativa com validação de parâmetros de filtro e paginação.
  - [ ] Criar regras de negócio para detalhamento administrativo (retornando erro 404 se não encontrado).
  - [ ] Criar regras de negócio para encerramento de perda como resolvida (validação de estado OPEN/RESOLVED, geração de notificação `REPORT_RESOLVED`).

- [ ] **2.3. Controller (`admin-lost-report.controller.ts`)**
  - [ ] Substituir `notImplemented` em `GET /api/admin/lost-reports` (protegido por `authenticate` e `requireAdmin`, aceitando query params `status`, `categoryId`, `buildingId`, `page`, `perPage`).
  - [ ] Substituir `notImplemented` em `GET /api/admin/lost-reports/:id` (protegido por `authenticate` e `requireAdmin`).
  - [ ] Substituir `notImplemented` em `POST /api/admin/lost-reports/:id/resolve` (protegido por `authenticate` e `requireAdmin`).

- [ ] **2.4. Testes (`backend/src/tests/admin-lost-report-*.test.ts`)**
  - [ ] Criar suíte de testes cobrindo autenticação, restrição de acesso (401/403 para não-admins), listagem com filtros, detalhamento e resolução de perda com geração de notificação.

---

## 3. Módulo: Handovers (`handovers`)
Requisitos correspondentes: **RF16 (Registrar a entrega presencial)**, **RF11 (Histórico de itens recuperados)**.

- [ ] **3.1. Repositório (`handover.repository.ts`)**
  - [ ] Criar repositório TypeORM para `Handover`.
  - [ ] Implementar criação de registro de entrega (`itemId`, `withdrawnName`, `withdrawnCpf`, `withdrawnUserId`, `adminId`, `handedAt`) e atualização atômica do status do item para `HANDED_OVER`.
  - [ ] Implementar listagem/histórico de retiradas por usuário (`withdrawnUserId`).
  - [ ] Implementar listagem administrativa de retiradas com filtros (`itemId`, `adminId`, `from`, `to`) e paginação.
  - [ ] Implementar consulta de detalhes de uma retirada por ID.

- [ ] **3.2. Serviço (`handover.service.ts`)**
  - [ ] Implementar validações de negócio para registro de entrega (item existe, status é `AVAILABLE` ou `ELIGIBLE` cuja destinação não foi executada, CPF válido, etc.).
  - [ ] Implementar listagem do histórico pessoal do usuário (`GET /api/handovers/mine`).
  - [ ] Implementar listagem administrativa e consulta detalhada de handovers.

- [ ] **3.3. Controller (`handover.controller.ts`)**
  - [ ] Implementar `POST /api/handovers` (Registro de entrega presencial, admin).
  - [ ] Implementar `GET /api/handovers/mine` (Histórico pessoal de retiradas, usuário autenticado).
  - [ ] Implementar `GET /api/handovers` (Listagem geral/administrativa de retiradas com filtros).
  - [ ] Implementar `GET /api/handovers/:id` (Consulta de retirada específica).

- [ ] **3.4. Testes (`backend/src/tests/handover-*.test.ts`)**
  - [ ] Criar testes unitários e de integração cobrindo registro de entrega para itens `AVAILABLE` e `ELIGIBLE`, restrições de itens já entregues/destinados, validação de CPF, histórico `mine`, listagem com filtros e detalhamento.

---

## 4. Módulo: Dispositions (`dispositions`)
Requisitos correspondentes: **RF22 (Executar a destinação)**.

- [ ] **4.1. Repositório (`disposition.repository.ts`)**
  - [ ] Criar repositório TypeORM para `Disposition`.
  - [ ] Implementar registro de destinação (`itemId`, `destination` [SOLD, AUCTIONED, DONATED, DISCARDED], `adminId`, `receiverDocument` [CPF/CNPJ]) e atualização atômica do status do item correspondente na tabela `items`.
  - [ ] Implementar listagem de destinações executadas com filtros (`destination`, `from`, `to`) e paginação.
  - [ ] Implementar consulta de detalhes de uma destinação por ID (se necessário).

- [ ] **4.2. Serviço (`disposition.service.ts`)**
  - [ ] Implementar regras de negócio para execução de destinação (item deve existir e estar com status `ELIGIBLE`, documento do recebedor válido, etc.).
  - [ ] Implementar listagem de destinações com filtros e paginação.

- [ ] **4.3. Controller (`disposition.controller.ts`)**
  - [ ] Implementar `POST /api/dispositions` (Execução de destinação de item elegível, admin).
  - [ ] Implementar `GET /api/dispositions` (Listagem de destinações executadas, admin).

- [ ] **4.4. Testes (`backend/src/tests/disposition-*.test.ts`)**
  - [ ] Criar suíte de testes cobrindo execução de destinação em itens elegíveis, rejeição de itens não-elegíveis ou já destinados/entregues, validação de CPF/CNPJ do recebedor, e listagem com filtros.

---

## 5. Módulo: Jobs (`jobs`)
Requisitos correspondentes: **RF21 (Aplicar prazos de destinação)**.

- [ ] **5.1. Repositório / Serviço de Elegibilidade (`job.service.ts`)**
  - [ ] Implementar lógica de processamento diário (RF21):
    - Buscar todos os itens com status `AVAILABLE`.
    - Buscar todas as `disposition_rules` ativas.
    - Calcular para cada item o prazo cumprido (dias decorridos desde `foundDate`).
    - Determinar a regra aplicável de maior prazo cumprido.
    - Atualizar o status do item para `ELIGIBLE` e definir o destino previsto (`destination`).
  - [ ] Garantir transacionalidade e tratamento de múltiplos itens.

- [ ] **5.2. Controller (`job.controller.ts`)**
  - [ ] Implementar `POST /api/jobs/disposition-eligibility` (Disparo do job de elegibilidade, protegido por autenticação de administrador).

- [ ] **5.3. Testes (`backend/src/tests/job-eligibility.test.ts`)**
  - [ ] Criar testes para verificar se itens com prazo vencido passam para `ELIGIBLE` com o destino correto, se itens dentro do prazo continuam `AVAILABLE`, e se a regra de maior prazo prevalece em caso de sobreposição.

---

## 6. Validação Geral e Homologação
- [ ] Executar bateria completa de testes do backend (`npm test` ou equivalente).
- [ ] Validar documentação Swagger gerada / atualizada.
- [ ] Revisão final de conformidade com os requisitos RF11, RF12, RF16, RF17, RF21, RF22, RF27.

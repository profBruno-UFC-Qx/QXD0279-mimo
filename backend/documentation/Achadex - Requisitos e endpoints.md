
## 1. Visitante (usuário não registrado)

**RF01 Consultar itens encontrados**: O sistema lê items disponíveis e junta, para cada um, o nome da category e do building. As fotos vêm de item_photos.

**RF02 Filtrar e buscar**: Mesma leitura do RF01, mas o sistema aplica as condições escolhidas (prédio, categoria) e a palavra-chave sobre título e descrição de items.

**RF03 Ver detalhes de um item**: Vê category, suas item_photos, building, ponto de retirada e o horário de atendimento.

**RF04 Consultar prédios**: nome, endereço, ponto de retirada e horário.

**RF05 Criar conta**: Grava um novo registro em users com papel de usuário comum.

- O superadmin é cadastrado via SQL pelos devs; os admins padrão são cadastrados pelo superadmin (RF25).

**RF06 Autenticar**: Localiza o usuário em users pelo e-mail e confere a senha.
## 2. Usuário registrado

**RF07 Registrar objeto perdido**: Grava em lost_reports um registro com autor, categoria, prédio provável (opcional), descrição e data da perda. Status inicial: OPEN.

**RF08 Editar/cancelar a própria perda**: Atualiza ou cancela em lost_reports.

**RF09 Acompanhar suas perdas**: Lê os lost_reports dele e mostra o status de cada: aberta, resolvida ou cancelada.

**RF10 Editar perfil**: Atualiza nome, telefone e senha em users.

**RF11 Histórico de itens recuperados**: Lê handovers em que ele é o withdrawn_by (retirante), mostrando data, prédio e responsável pela entrega.

**RF12 Sugerir achados compatíveis**: Ao salvar o registro de perda (RF07) o sistema calcula na hora os items compatíveis com status e os exibe como sugestões. O autor precisa responder: confirmar um dos itens como seu ou descartar (nenhum é dele). 
- Descartar não grava nada, a perda segue OPEN.
- Confirmar vale uma única vez por perda: grava a notification ITEM_CLAIMED para os administradores (RF27).
## 3. Administrador

**RF13 Cadastrar item achado**: Grava em items. Status inicial: AVAILABLE.

**RF14 Editar/excluir item e fotos**: Atualiza ou remove em items; adiciona/remove linhas em item_photos. Não é permitido editar item já entregue (HANDED_OVER) nem já destinado (SOLD, AUCTIONED, DONATED, DISCARDED).

**RF15 Ver todos os itens**: Lê items de todos os prédios, disponíveis, elegíveis, entregues e destinados, com filtros, inclusive por status de destinação.

**RF16 Registrar a entrega presencial**: Grava em handovers: item, nome e CPF do retirante e admin responsável. Em seguida, atualiza o item para o status HANDED_OVER (sai da lista pública). Vale para itens AVAILABLE e também para itens ELIGIBLE cuja destinação ainda não foi executada.

**RF17 Encerrar registro de perda**: Quando o dono retirar o item e possuir um lost_report aberto, o admin localiza o registro e atualiza o status para RESOLVED.

**RF18 Gerenciar prédios**: Cria, edita e exclui em buildings, definindo ponto de retirada e horário de atendimento.

**RF19 Gerenciar categorias**: Cria, edita e exclui em categories.

**RF20 Configurar regras de destinação**: Cria, edita e exclui em disposition_rules. Cada regra define um prazo em dias, contado da data do achado, e um destino pretendido: SOLD, AUCTIONED, DONATED ou DISCARDED. A regra vale para todos os prédios. Regra travada pelo superadmin (RF26) fica somente leitura para o admin.

**RF21 Aplicar prazos de destinação**: Uma vez por dia, o sistema lê items com status AVAILABLE e as disposition_rules ativas; o item que cumpriu o prazo de uma regra aplicável passa a ELIGIBLE, com o destino previsto pela regra. As regras atuais são globais; quando mais de uma se aplica ao item, prevalece a de maior prazo cumprido. Enquanto ELIGIBLE, o item segue visível na consulta pública e aceita entrega (RF16) até a execução da destinação.

**RF22 Executar a destinação**: Sobre um item ELIGIBLE, o admin registra a destinação: grava em dispositions (item, destino, admin responsável, cpf ou cnpj de quem recebeu) e atualiza o item para SOLD, AUCTIONED, DONATED ou DISCARDED, removendo-o da lista pública.

**RF23 Detectar donos prováveis**: Ao cadastrar o item (RF13), no mesmo request, o sistema lê lost_reports com status OPEN, calcula os compatíveis com o item e, para cada perda compatível, grava uma notification do tipo MATCH_FOUND para o autor, com link para a tela da perda.  No painel do item, o admin lê os donos prováveis calculados na hora: as perdas OPEN compatíveis.
## 4. Superadministrador

O superadministrador exerce todos os requisitos de administrador (RF13–RF23) e é o único que pode:

**RF24 Conta única e protegida**: Existe um único registro em users com papel SUPERADMIN, cadastrado exclusivamente pelos devs, via SQL. A conta não pode ser excluída.

**RF25 Cadastrar e gerenciar administradores**: Cria em users o registro de cada admin padrão — nome, e-mail e senha  —  e pode remover um admin.

**RF26 Travar e sobrescrever regras de destinação**: Edita ou exclui uma regra em disposition_rules;
## 5. Usuário, Administrador e Superadministrador

**RF27 Notificações no app**: Grava eventos em notifications e permite a qualquer usuário autenticado ver o contador de não lidas, listar suas notificações e marcá-las como lidas. O sistema grava notificações em três eventos:

- MATCH_FOUND — um item recém-cadastrado é compatível com a perda do usuário (RF23): autor da perda; link para a tela da perda.
- ITEM_CLAIMED — o usuário confirmou uma sugestão (RF12): administradores; link para o painel do item.
- REPORT_RESOLVED — a perda foi encerrada (RF17): autor da perda; link para a tela da perda.

LINK DA MODELAGEM DO DB: https://dbdiagram.io/d/Achadex-6ab184d69ba2420e18d47b12

---

## Contrato HTTP da API

Prefixo de todos os endpoints: `/api`. IDs são inteiros positivos. Datas são strings ISO `YYYY-MM-DD`; filtros `from` e `to` são inclusivos. Corpos de escrita usam JSON e nomes de campos em `camelCase`.

Respostas JSON seguem `ApiResponse<T>`:

```json
{ "success": true, "data": {} }
```

Erros seguem `{ "success": false, "data": null, "error": { "code": 400, "details": "..." } }`. Endpoints reservados ainda sem implementação respondem HTTP 501 no mesmo envelope, com `error.code: 501`. Operações descritas como `204` não retornam corpo quando implementadas. Os dois endpoints de prédios já funcionais (`POST /api/buildings` e `GET /api/buildings/:id`) mantêm seu comportamento atual.

### 1. Cadastro, autenticação e perfil

| Método e caminho | Parâmetros/payload | Resposta de sucesso |
| --- | --- | --- |
| `POST /api/auth/register` | `{ name, email, password, phone? }` | `201`, `ApiResponse<User>` |
| `POST /api/auth/login` | `{ email, password }` | `200`, `ApiResponse<{ token, user }>` |
| `GET /api/users/me` | Dados da conta obtidos da identidade autenticada | `200`, `ApiResponse<User>` |
| `PATCH /api/users/me` | `{ name?, phone?, password? }` | `200`, `ApiResponse<User>` |

`User` nunca inclui senha/hash de senha na resposta.

### 2. Catálogo público

| Método e caminho | Parâmetros/payload | Resposta de sucesso |
| --- | --- | --- |
| `GET /api/items` | Query: `categoryId?`, `buildingId?`, `search?`, `page?`, `per_page?` | `200`, `ApiResponse<Paginated<Item>>`; apenas itens `AVAILABLE` e `ELIGIBLE`, incluindo categoria, prédio e fotos |
| `GET /api/items/:id` | Path: `id` | `200`, `ApiResponse<{ item, photos, building }>`; inclui ponto de retirada e horário do prédio |
| `GET /api/buildings` | Sem parâmetros | `200`, `ApiResponse<Building[]>` |
| `GET /api/categories` | Sem parâmetros | `200`, `ApiResponse<Category[]>` |

Listagens paginadas usam o contrato existente `Paginated<T> = { data: T[], pagination: { total, page, per_page, total_pages } }`. `page` começa em 1; `per_page` usa 20 por padrão e aceita de 1 a 100.

### 3. Perdas do usuário

| Método e caminho | Parâmetros/payload | Resposta de sucesso |
| --- | --- | --- |
| `POST /api/lost-reports` | `{ categoryId, buildingId?, description, lossDate }` | `201`, `ApiResponse<{ lostReport, suggestions: Item[] }>` |
| `GET /api/lost-reports/mine` | Query: `status?` (`OPEN`, `RESOLVED`, `CANCELLED`) | `200`, `ApiResponse<LostReport[]>` |
| `GET /api/lost-reports/:id` | Path: `id`; somente perda do autor | `200`, `ApiResponse<LostReport>` |
| `PATCH /api/lost-reports/:id` | `{ categoryId?, buildingId?, description?, lossDate? }`; somente enquanto `OPEN` | `200`, `ApiResponse<LostReport>` |
| `POST /api/lost-reports/:id/cancel` | Path: `id` | `200`, `ApiResponse<LostReport>` |
| `POST /api/lost-reports/:id/suggestions/:itemId/confirm` | Path: `id` e `itemId` | `204`; confirma uma sugestão e notifica os administradores |

### 4. Notificações

| Método e caminho | Parâmetros/payload | Resposta de sucesso |
| --- | --- | --- |
| `GET /api/notifications` | Query: `read?` (boolean) | `200`, `ApiResponse<Notification[]>` |
| `GET /api/notifications/unread-count` | Sem parâmetros | `200`, `ApiResponse<{ count: number }>` |
| `PATCH /api/notifications/:id/read` | Path: `id` | `200`, `ApiResponse<Notification>` |
| `PATCH /api/notifications/read-all` | Sem payload | `204` |

`NotificationType`: `MATCH_FOUND`, `ITEM_CLAIMED` ou `REPORT_RESOLVED`.

### 5. Itens (admin)

| Método e caminho | Parâmetros/payload | Resposta de sucesso |
| --- | --- | --- |
| `POST /api/admin/items` | `{ title, description?, categoryId, buildingId, foundLocation?, foundDate, photos: string[] }` | `201`, `ApiResponse<Item>` |
| `GET /api/admin/items` | Query: `status?`, `categoryId?`, `buildingId?`, `search?`, `page?`, `per_page?` | `200`, `ApiResponse<Paginated<Item>>`; todos os status |
| `GET /api/admin/items/:id` | Path: `id` | `200`, `ApiResponse<{ item, photos }>` |
| `GET /api/admin/items/:id/possible-owners` | Path: `id` | `200`, `ApiResponse<LostReport[]>`; perdas `OPEN` compatíveis |
| `PATCH /api/admin/items/:id` | `{ title?, description?, categoryId?, buildingId?, foundLocation?, foundDate?, photosToAdd?: string[], photosToRemove?: number[] }`; fotos removidas são identificadas pelo ID de `ItemPhoto` | `200`, `ApiResponse<Item>` |
| `DELETE /api/admin/items/:id` | Path: `id` | `204` |

Atualização e exclusão são bloqueadas para itens `HANDED_OVER` ou com destinação executada. Ao cadastrar item, a regra de negócio prevista também gera notificações `MATCH_FOUND` para perdas compatíveis.

### 6. Entregas e histórico

| Método e caminho | Parâmetros/payload | Resposta de sucesso |
| --- | --- | --- |
| `POST /api/handovers` | `{ itemId, withdrawnName, withdrawnCpf, withdrawnUserId? }`; `adminId` vem da identidade autenticada | `201`, `ApiResponse<Handover>` |
| `GET /api/handovers/mine` | Identidade do usuário autenticado | `200`, `ApiResponse<Handover[]>` |
| `GET /api/handovers` | Query: `itemId?`, `adminId?`, `from?`, `to?` | `200`, `ApiResponse<Handover[]>` |
| `GET /api/handovers/:id` | Path: `id` | `200`, `ApiResponse<Handover>` |

`withdrawnCpf` é um CPF. Uma entrega aceita item `AVAILABLE` ou `ELIGIBLE` ainda não destinado e altera seu status para `HANDED_OVER`.

### 7. Gestão de perdas (admin)

| Método e caminho | Parâmetros/payload | Resposta de sucesso |
| --- | --- | --- |
| `GET /api/admin/lost-reports` | Query: `status?`, `categoryId?`, `buildingId?` | `200`, `ApiResponse<LostReport[]>` |
| `GET /api/admin/lost-reports/:id` | Path: `id` | `200`, `ApiResponse<LostReport>` |
| `POST /api/admin/lost-reports/:id/resolve` | Path: `id` | `200`, `ApiResponse<LostReport>`; status `RESOLVED` |

### 8. Prédios e categorias (admin)

| Método e caminho | Parâmetros/payload | Resposta de sucesso |
| --- | --- | --- |
| `POST /api/buildings` | `{ name, address, pickupPoint, serviceHours }` | `201`, `ApiResponse<Building>`; já implementado |
| `GET /api/buildings/:id` | Path: `id` | `200`, `ApiResponse<Building>`; já implementado |
| `PATCH /api/buildings/:id` | `{ name?, address?, pickupPoint?, serviceHours? }` | `200`, `ApiResponse<Building>` |
| `DELETE /api/buildings/:id` | Path: `id` | `204`; bloqueado se houver itens ou perdas vinculados |
| `POST /api/categories` | `{ name }` | `201`, `ApiResponse<Category>` |
| `PATCH /api/categories/:id` | `{ name }` | `200`, `ApiResponse<Category>` |
| `DELETE /api/categories/:id` | Path: `id` | `204`; bloqueado se houver itens ou perdas vinculados |

### 9. Regras de destinação

| Método e caminho | Parâmetros/payload | Resposta de sucesso |
| --- | --- | --- |
| `GET /api/disposition-rules` | Query: `active?` (boolean) | `200`, `ApiResponse<DispositionRule[]>` |
| `GET /api/disposition-rules/:id` | Path: `id` | `200`, `ApiResponse<DispositionRule>` |
| `POST /api/disposition-rules` | `{ days, destination }` | `201`, `ApiResponse<DispositionRule>` |
| `PATCH /api/disposition-rules/:id` | `{ days?, destination?, active?, locked? }` | `200`, `ApiResponse<DispositionRule>` |
| `DELETE /api/disposition-rules/:id` | Path: `id` | `204`; regra travada não pode ser alterada/excluída por admin padrão |

`destination` aceita `SOLD`, `AUCTIONED`, `DONATED` ou `DISCARDED`; `days` deve ser um inteiro positivo. As regras previstas no modelo atual são globais.

### 10. Destinações e job diário

| Método e caminho | Parâmetros/payload | Resposta de sucesso |
| --- | --- | --- |
| `POST /api/jobs/disposition-eligibility` | Sem payload; operação interna diária | `200`, `ApiResponse<{ eligibleCount: number }>` |
| `POST /api/dispositions` | `{ itemId, destination, receiverDocument }`; `receiverDocument` aceita CPF ou CNPJ | `201`, `ApiResponse<Disposition>` |
| `GET /api/dispositions` | Query: `destination?`, `from?`, `to?` | `200`, `ApiResponse<Disposition[]>` |

O job considera itens `AVAILABLE` e regras ativas; a destinação só pode ser executada para item `ELIGIBLE`.

### 11. Administradores (superadmin)

| Método e caminho | Parâmetros/payload | Resposta de sucesso |
| --- | --- | --- |
| `GET /api/admins` | Sem parâmetros | `200`, `ApiResponse<User[]>` |
| `GET /api/admins/:id` | Path: `id` | `200`, `ApiResponse<User>` |
| `POST /api/admins` | `{ name, email, initialPassword }` | `201`, `ApiResponse<User>` |
| `DELETE /api/admins/:id` | Path: `id` | `204`; nunca permite excluir o superadmin |
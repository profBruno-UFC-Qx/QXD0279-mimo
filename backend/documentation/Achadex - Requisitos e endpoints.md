
## 1. Visitante (usuário não registrado)

**RF01 Consultar itens encontrados**: O sistema lê items disponíveis e junta, para cada um, o nome da category e do building. As fotos vêm de item_photos.

**RF02 Filtrar e buscar**: Mesma leitura do RF01, mas o sistema aplica as condições escolhidas (prédio, categoria) e a palavra-chave sobre título e descrição de items.

**RF03 Ver detalhes de um item**: Vê category, suas item_photos, building, ponto de retirada e o horário de atendimento.

**RF04 Consultar prédios**: nome, endereço, ponto de retirada e horário.

**RF05 Criar conta**: Grava um novo registro em users com papel de usuário comum.

- O superadmin é cadastrado via SQL pelos devs; os admins padrão são cadastrados pelo superadmin (RF26).

**RF06 Autenticar**: Localiza o usuário em users pelo e-mail e confere a senha.
## 2. Usuário registrado

**RF07 Registrar objeto perdido**: Grava em lost_reports um registro com autor, categoria, prédio provável (opcional), descrição e data da perda. Status inicial: OPEN.

**RF08 Editar/cancelar a própria perda**: Atualiza ou cancela em lost_reports.

**RF09 Acompanhar suas perdas**: Lê os lost_reports dele e mostra o status de cada: aberta, resolvida ou cancelada.

**RF10 Editar perfil**: Atualiza nome, telefone e senha em users.

**RF11 Histórico de itens recuperados**: Lê handovers em que ele é o withdrawn_by (retirante), mostrando data, prédio e responsável pela entrega.

**RF12 Sugerir achados compatíveis**: Ao salvar o registro de perda (RF07) o sistema calcula na hora os items compatíveis com status e os exibe como sugestões. O autor precisa responder: confirmar um dos itens como seu ou descartar (nenhum é dele). 
- Descartar não grava nada, a perda segue OPEN.
- Confirmar vale uma única vez por perda: grava a notification ITEM_CLAIMED para os administradores (RF29).
## 3. Administrador

**RF13 Cadastrar item achado**: Grava em items. Status inicial: AVAILABLE.

**RF14 Editar/excluir item e fotos**: Atualiza ou remove em items; adiciona/remove linhas em item_photos. Não é permitido editar item já entregue (HANDED_OVER) nem já destinado (SOLD, AUCTIONED, DONATED, DISCARDED).

**RF15 Ver todos os itens**: Lê items de todos os prédios, disponíveis, elegíveis, entregues e destinados, com filtros, inclusive por status de destinação.

**RF16 Registrar a entrega presencial**: Grava em handovers: item, nome e CPF do retirante e admin responsável. Em seguida, atualiza o item para o status HANDED_OVER (sai da lista pública). Vale para itens AVAILABLE e também para itens ELIGIBLE cuja destinação ainda não foi executada.

**RF17 Encerrar registro de perda**: Quando o dono retirar o item e possuir um lost_report aberto, o admin localiza o registro e atualiza o status para RESOLVED.

**RF18 Gerenciar prédios**: Cria, edita e exclui em buildings, definindo ponto de retirada e horário de atendimento.

**RF19 Gerenciar categorias**: Cria, edita e exclui em categories.

**RF20 Configurar regras de destinação**: Cria, edita e exclui em disposition_rules. Cada regra define um prazo em dias, contado da data do achado, e um destino pretendido: SOLD, AUCTIONED, DONATED ou DISCARDED. A regra vale para todos os prédios. Regra travada pelo superadmin (RF27) fica somente leitura para o admin.

**RF21 Aplicar prazos de destinação**: Uma vez por dia, o sistema lê items com status AVAILABLE e as disposition_rules ativas; o item que cumpriu o prazo de uma regra aplicável passa a ELIGIBLE, com o destino previsto pela regra. Quando mais de uma regra se aplica, prevalece a de maior prazo cumprido; regras de prédio prevalecem sobre as globais. Enquanto ELIGIBLE, o item segue visível na consulta pública e aceita entrega (RF16) até a execução da destinação.

**RF22 Executar a destinação**: Sobre um item ELIGIBLE, o admin registra a destinação: grava em dispositions (item, destino, admin responsável, cpf ou cnpj de quem recebeu) e atualiza o item para SOLD, AUCTIONED, DONATED ou DISCARDED, removendo-o da lista pública.

**RF23 Detectar donos prováveis**: Ao cadastrar o item (RF13), no mesmo request, o sistema lê lost_reports com status OPEN, calcula os compatíveis com o item e, para cada perda compatível, grava uma notification do tipo MATCH_FOUND para o autor, com link para a tela da perda.  No painel do item, o admin lê os donos prováveis calculados na hora: as perdas OPEN compatíveis.
## 4. Superadministrador

O superadministrador exerce todos os requisitos de administrador (RF13–RF24) e é o único que pode:

**RF24 Conta única e protegida**: Existe um único registro em users com papel SUPERADMIN, cadastrado exclusivamente pelos devs, via SQL. A conta não pode ser excluída.

**RF25 Cadastrar e gerenciar administradores**: Cria em users o registro de cada admin padrão — nome, e-mail e senha  —  e pode remover um admin.

**RF26 Travar e sobrescrever regras de destinação**: Edita ou exclui uma regra em disposition_rules;
## 5. Usuário, Administrador e Superadministrador

**RF27 Notificações no app**: Grava eventos em notifications e permite a qualquer usuário autenticado ver o contador de não lidas, listar suas notificações e marcá-las como lidas. O sistema grava notificações em três eventos:

- MATCH_FOUND — um item recém-cadastrado é compatível com a perda do usuário (RF24): autor da perda; link para a tela da perda.
- ITEM_CLAIMED — o usuário confirmou uma sugestão (RF12): administradores; link para o painel do item.
- REPORT_RESOLVED — a perda foi encerrada (RF17): autor da perda; link para a tela da perda.

LINK DA MODELAGEM DO DB: https://dbdiagram.io/d/Achadex-6ab184d69ba2420e18d47b12

---

## 1. Cadastro e Login

- **registerUser**({ name, email, password, phone? }) retorna User.
- **login**({ email, password }) retorna { token, user }. 
- **getProfile**() retorna User. Dados da conta do próprio token.
- **updateProfile**({ name?, phone?, password? }) retorna User.
## 2. Catálogo público

- **getAllItems**({ categoryId?, buildingId?, search?, page?, pageSize? }) 
	retorna { items: Item[], total }. Cada item com category, building e photos; somente status AVAILABLE e ELIGIBLE; search aplica sobre título e descrição.
- **getItemById**(id) retorna { item, photos, building }. Inclui ponto de retirada e horário de atendimento do prédio.
- **getAllBuildings**() retorna Building[]. Nome, endereço, ponto de retirada e horário.
- **getAllCategories**() retorna Category[]. 
## 3. Perdas (usuário)

- **createLostReport**({ categoryId, buildingId?, description, lossDate }) 
	retorna { lostReport, suggestions: Item[] }. 
- **updateLostReport**(id, { categoryId?, buildingId?, description?, lossDate? }) retorna LostReport. Só enquanto OPEN.
- **cancelLostReport**(id) retorna LostReport.
- **getAllMyLostReports**({ status? }) retorna LostReport[]. 
- **getLostReportById**(id) retorna LostReport. Somente se for do autor.
- **confirmSuggestion**({ lostReportId, itemId }) retorna void (204). Grava notification ITEM_CLAIMED para cada admin.
## 4. Notificações

- **getAllMyNotifications**({ read? }) retorna Notification[]. Filtro por lidas/não lidas.
- **getUnreadNotificationsCount**() retorna { count }. Contador para o indicador visual
- **markNotificationAsRead**(id) retorna Notification. Preenche readAt.
- **markAllNotificationsAsRead**() retorna void.
## 5. Itens (admin)

- **createItem**({ title, description?, categoryId, buildingId, foundLocation?, foundDate, photos}) retorna Item. Status AVAILABLE; grava uma linha em item_photos por foto; no mesmo request calcula as perdas OPEN compatíveis e notifica MATCH_FOUND para cada autor.
- **getAllItems**({ status?, categoryId?, buildingId?, search?, page?, pageSize? }) retorna { items: Item[], total }. Todos os status, inclusive HANDED_OVER e destinados.
- **getItemById**(id) retorna { item, photos }. Painel do item.
- **getPossibleOwnersByItem**(itemId) retorna LostReport[]. Donos prováveis calculados na hora. Perdas OPEN compatíveis.
- **updateItem**(id, { title?, description?, categoryId?, buildingId?, foundLocation?, foundDate?, photosToAdd?: string[], photosToRemove?: string[] }) retorna Item. Bloqueado se HANDED_OVER ou já destinado.
- **deleteItem**(id) retorna void. Mesmo bloqueio do update.
## 6. Entregas e histórico

- **registerHandover**({ itemId, withdrawnName, withdrawnCpf, withdrawnUserId? }) retorna Handover. Grava a entrega e move o item para HANDED_OVER; vale para AVAILABLE e ELIGIBLE ainda não destinados; vincula a conta de user só se o retirante tiver uma.
- **getAllHandovers**({ itemId?, adminId?, from?, to? }) retorna Handover[]. Histórico completo de retiradas.
- **getHandoverById**(id) retorna Handover.
## 7. Gestão de perdas (admin)

- **getAllLostReports**({ status?, categoryId?, buildingId? }) retorna LostReport[]. Perdas de todos os autores.
- **getLostReportById**(id) retorna LostReport. Qualquer perda.
- **resolveLostReport**(id) retorna LostReport. Status RESOLVED quando o dono retirou o item.
## 8. Prédios e categorias (admin)

- **createBuilding**({ name, address, pickupPoint, serviceHours }) retorna Building. Cria prédio com ponto de retirada e horário.
- **updateBuilding**(id, { name?, address?, pickupPoint?, serviceHours? }) retorna Building. Edita dados do prédio.
- **deleteBuilding**(id) retorna void. Bloqueado se houver items ou lost_reports vinculados.
- **createCategory**({ name }) retorna Category. Cria categoria.
- **updateCategory**(id, { name }) retorna Category. Renomeia categori.
- **deleteCategory**(id) retorna void. Bloqueado se houver items ou lost_reports vinculados.
## 9. Regras de destinação

- **getAllDispositionRules**({ active? }) retorna DispositionRule[]. Regras globais de prazo e destino.
- **getDispositionRuleById**(id) retorna DispositionRule. Uma regra específica.
- **createDispositionRule**({ days, destination }) retorna DispositionRule. Prazo contado da data do achado.
- **deleteDispositionRule**(id) retorna void. Bloqueada se locked (RF20, RF26).
## 10. Destinação e job diário

- **runEligibilityJob**() retorna { eligibleCount } interno. Uma vez por dia: itens AVAILABLE que cumpriram o prazo de regra ativa passam a ELIGIBLE com plannedDestination; prevalece o maior prazo cumprido.
- **executeDisposition**({ itemId, destination, receiverDocument }) retorna Disposition. Item precisa estar ELIGIBLE; grava a destinação e move o item para SOLD, AUCTIONED, DONATED ou DISCARDED.
- **getAllDispositions**({ destination?, from?, to? }) retorna Disposition[]. Histórico de destinações executadas.
## 11. Administradores (superadmin)

- **getAllAdmins**() retorna User[]. 
- **getAdminById**(id) retorna User.
- **createAdmin**({ name, email, initialPassword }) retorna User. 
- **deleteAdmin**(id) retorna void. Exclui admin; nunca o superadmin (RF24, RF25).
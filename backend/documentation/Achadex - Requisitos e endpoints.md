
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
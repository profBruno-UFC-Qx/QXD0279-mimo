# :checkered_flag: Achadex

Sistema de achados e perdidos institucional: centraliza o registro de itens encontrados, permite consulta pública com fotos e filtros, recebe relatos de objetos perdidos e formaliza a devolução — com regras de destinação configuráveis para itens não reclamados (venda, leilão, doação ou descarte).

## :technologist: Membros da equipe

- 554554 - WESLEY FREITAS SOBRINHO - CC
- 556027 - KAUAN PABLO DE SOUZA SILVA - CC
- 556280 - LINYKER VINICIUS GOMES BARBOSA - CC

## :bulb: Objetivo Geral
Gerenciar o ciclo completo de achados e perdidos de uma instituição desconcentrada, como, por exemplo, a administração pública municipal ou uma empresa com filiais — do registro do item encontrado até a devolução ao dono ou a destinação final do item não reclamado.

## :eyes: Público-Alvo
Instituições desconcentradas (prefeituras, franquias, universidades) e seus frequentadores.

## :star2: Impacto Esperado

- Mais devoluções: o dono localiza o item sozinho pela busca pública, sem precisar ir ao balcão
- Padronização entre unidades: prédios desconcentrados passam a seguir o mesmo fluxo.
- Menos carga no balcão: o cidadão localiza o item sozinho pela busca pública com fotos;
- Menos itens parados em custódia: mais devoluções significam menos estoque acumulado e menor custo de armazenagem — e o item não reclamado ganha destino definido por regra, em vez de acumular indefinidamente
- Imagem institucional: transparência e modernização do atendimento, reforçando a confiança do cidadão/cliente no serviço.

## :people_holding_hands: Papéis ou tipos de usuário da aplicação

- **Visitante** (não registrado): consulta itens, prédios e pontos de retirada; cria conta
- **Usuário registrado**: além do acesso público, registra e acompanha objetos perdidos
- **Administrador**: gerencia itens, entregas, prédios, categorias e regras de destinação
- **Superadministrador**: conta única, cadastrada via SQL pelos devs; gerencia administradores e trava/sobrescreve regras de destinação

> Tenha em mente que obrigatoriamente a aplicação deve possuir funcionalidades acessíveis a todos os tipos de usuário e outra funcionalidades restritas a certos tipos de usuários.

## :triangular_flag_on_post:	 Principais funcionalidades da aplicação

*Acesso público (visitante)*
- Consultar itens encontrados, com fotos, categoria e prédio
- Filtrar/buscar por prédio, categoria, situação e palavra-chave
- Ver detalhes do item (ponto de retirada e horário de atendimento)
- Consultar prédios
- Criar conta e autenticar

*Usuário registrado*
- Registrar objeto perdido (categoria, prédio provável, descrição, data)
- Ver, na hora do registro, sugestões de itens achados compatíveis com a perda, e confirmar ("É este!") ou descartar
- Editar ou cancelar as próprias perdas
- Editar perfil
- Consultar histórico de itens recuperados
- Receber notificações no app quando um item compatível for cadastrado

*Administrador*
- Cadastrar item achado com fotos; editar/excluir
- Ao cadastrar um item, notificações são enviadas aos possíveis donos que registraram perdas compatíveis
- Ver, no painel do item, os donos prováveis calculados na hora (perdas abertas compatíveis)
- Ver todos os itens, de todos os prédios, com filtros, inclusive por status de destinação
- Registrar entrega presencial (nome e CPF do retirante, com vínculo opcional à conta → item sai da lista pública)
- Encerrar registro de perda ao devolver o objeto
- Gerenciar prédios e categorias
- Configurar regras de destinação: prazo em dias, contado da data do achado, e destino pretendido
- Job diário aplica os prazos: o item que cumpriu o prazo de uma regra ativa passa a elegível, com destino previsto, e segue visível e aceitando entrega até a execução
- Executar a destinação de itens elegíveis: venda, leilão, doação ou descarte, registrando o documento de quem recebeu
- Receber notificações no app quando um usuário confirmar a sugestão de um item

*Superadministrador*
- Conta única e protegida, cadastrada exclusivamente pelos devs, via SQL
- Cadastrar e remover administradores
- Travar e sobrescrever regras de destinação (regra travada fica somente leitura para admins)

## :spiral_calendar: Entidades ou tabelas do sistema
- users — usuários, administradores e o superadmin (papel via role)
- buildings — prédios, com ponto de retirada e horário de atendimento
- categories — classificação dos itens (eletrônicos, documentos, roupas…)
- items — itens encontrados; ciclo de vida: AVAILABLE → ELIGIBLE → HANDED_OVER / SOLD / AUCTIONED / DONATED / DISCARDED
- item_photos — fotos de cada item
- lost_reports — registros de objetos perdidos feitos pelos usuários; as sugestões são calculadas na hora e não ficam gravadas
- handovers — comprovante da entrega presencial (1:1 com o item), com nome e CPF do retirante e vínculo opcional à conta
- disposition_rules — prazo em dias, contado da data do achado, e destino pretendido para itens não reclamados
- dispositions — execução da destinação: destino aplicado, admin responsável e documento de quem recebeu
- notifications — notificações in-app por usuário (novo match, sugestão confirmada)

**Modelagem completa do banco de dados:** https://dbdiagram.io/d/Achadex-6ab184d69ba2420e18d47b12

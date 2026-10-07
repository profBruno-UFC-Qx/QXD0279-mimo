# :checkered_flag: Achadex

Sistema de achados e perdidos institucional: centraliza o registro de itens encontrados, permite consulta pública com fotos e filtros, recebe relatos de objetos perdidos e formaliza a devolução.

## :technologist: Membros da equipe

- 554554 - WESLEY FREITAS SOBRINHO - CC
- 556027 - KAUAN PABLO DE SOUZA SILVA - CC
- 556280 - LINYKER VINICIUS GOMES BARBOSA - CC

## :bulb: Objetivo Geral
Gerenciar o ciclo completo de achados e perdidos de uma instituição desconcentrada, como, por exemplo, a administração pública municipal ou uma empresa com filiais.

## :eyes: Público-Alvo
Instituições desconcentradas (prefeituras, franquias, universidades) e seus frequentadores.

## :star2: Impacto Esperado

- ais devoluções: o dono localiza o item sozinho pela busca pública, sem precisar ir ao balcão
- Padronização entre unidades: prédios desconcentrados passam a seguir o mesmo fluxo.
- Menos carga no balcão: o cidadão localiza o item sozinho pela busca pública com fotos;
- Menos itens parados em custódia: mais devoluções significam menos estoque acumulado e menor custo de armazenagem
- Imagem institucional: transparência e modernização do atendimento, reforçando a confiança do cidadão/cliente no serviço.

## :people_holding_hands: Papéis ou tipos de usuário da aplicação

Visitante (não registrado): consulta itens, prédios e pontos de retirada; cria conta
Usuário registrado: além do acesso público, registra e acompanha objetos perdidos
Administrador: gerencia itens, entregas, prédios, categorias, administradores e auditoria

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
- Ver sugestões de itens achados compatíveis com a perda, com grau de compatibilidade e justificativa, e confirmar interesse ("É este!") ou descartar
- Editar ou cancelar as próprias perdas
- Editar perfil
- Consultar histórico de itens recuperados.
- Receber notificações no app quando um item compatível for cadastrado.

*Administrador*
- Cadastrar item achado com fotos; editar/excluir. 
- Ao cadastrar um item, notifcações são enviadas para possíveis donos que cadastraram items perdidos.
- Ver todos os itens, de todos os prédios, com filtros
- Registrar entrega presencial (nome e CPF do retirante → item sai da lista pública)
- Encerrar registro de perda ao devolver o objeto
- Gerenciar prédios, categorias e administradores
- Consultar logs de auditoria (somente leitura)
- Receber notificações no app quando um usuário confirmar a sugestão de um item

## :spiral_calendar: Entidades ou tabelas do sistema
- users — usuários e administradores (papel via role)
- buildings — prédios, com ponto de retirada único e horário de atendimento
- categories — classificação dos itens (eletrônicos, documentos, roupas…)
- items — itens encontrados; visíveis ao público enquanto AVAILABLE
- item_photos — fotos de cada item
- lost_reports — registros de objetos perdidos feitos pelos usuários
- item_matches — sugestões de correspondência perda↔️item, com pontuação, justificativa e status (sugerida, confirmada, descartada)
- handovers — comprovante da entrega presencial (1:1 com o item), com nome e CPF do retirante
- notifications — notificações in-app por usuário (novo match, interesse confirmado, perda encerra


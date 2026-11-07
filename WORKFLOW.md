Este documento define o fluxo de trabalho dos desenvolvedores do projeto.

# Branches

## 1. Estrutura das branches

- `main`: branch principal e estável
- `Wexxley-patch-1`: branch de integração da equipe

- Não enviamos alterações diretamente para `main`
- A branch `Wexxley-patch-1` será usada como a branch de integração.
- Cada integrante trabalha em sua própria branch pessoal


Cada membro com sua branch, por exemplo:
- `feature/Wesley`
- `feature/Kauan`
- `feature/Lyniker`

## 2. Fluxo recomendado de branches

Atualizar a branch de desenvolvimento
```bash
git checkout Wexxley-patch-1
git pull origin Wexxley-patch-1
```

Criar a branch pessoal
```bash
git checkout -b feature/Wesley
```

Trabalhar na branch pessoal
```bash
git add .
git commit -m "Implementa parte principal do módulo"
```

Enviar a branch pessoal para o GitHub (na primeira vez, use `-u` para configurar o upstream):
```bash
git push -u origin feature/Wesley
```

Depois que a branch pessoal estiver no GitHub, integrar as alterações na branch `Wexxley-patch-1`:
```bash
git checkout Wexxley-patch-1
git pull origin Wexxley-patch-1
git merge feature/Wesley
git push origin Wexxley-patch-1
```

Nas próximas alterações, envie commits adicionais da branch pessoal com `git push`.

## 3. Como resolver conflitos


1. Veja quais arquivos estão em conflito:

  ```bash
  git status
  ```

2. Abra cada arquivo listado e procure os marcadores `<<<<<<<`, `=======` e `>>>>>>>`. Eles delimitam as versões concorrentes. Edite o trecho para manter ou combinar a versão correta e remova todos os marcadores.

3. Revise o resultado e valide o backend:

  ```bash
  cd backend
  npm run build
  ```

4. ,marque os arquivos resolvidos e conclua o merge:

  ```bash
  git add .
  git commit
  git push origin Wexxley-patch-1
  ```

Se não souber como combinar as mudanças, converse com quem alterou o outro trecho. Para cancelar o merge e voltar ao estado anterior, use `git merge --abort`.

Não use `git push --force`. 

## 4. Primeiro acesso após clonar

Cada dev configura o backend localmente. Não compartilhe o arquivo SQLite nem o `.env` pelo Git.

1. Clone o repositório e entre na pasta do backend:

  ```bash
  git clone <url-do-repositorio>
  cd QXD0279-mimo/backend
  ```

2. Instale as dependências:

  ```bash
  npm install
  ```

3. Crie sua configuração local a partir do exemplo:

  ```bash
  cp .env.example .env
  ```

4. Inicie o backend, sempre a partir da pasta `backend`:

  ```bash
  npm run dev
  ```

  Esse comando gera o `swagger-output.json` e inicia o servidor.


## 5. Organização do backend

- `src/models/`: entidades TypeORM e enums.
- `src/repository/`: acesso e persistência de dados com TypeORM.
- `src/services/`: regras e operações da aplicação.
- `src/controllers/`: Converte parâmetros em chamadas ao service e monta respostas `ApiResponse`.
- `src/middlewares/`: tratamento de requisições e erros.
- `src/shared/`: tipos e utilitários compartilhados.
- `src/server.ts`: configura Express, monta os routers e middlewares e inicializa o DataSource.

## 6. Fluxo para implementar uma funcionalidade


1. **Verifique o model**: confira se a entidade representa corretamente os requisitos, campos obrigatórios e opcionais, tipos, enums, índices, relações e nomes das colunas.
2. **Crie ou ajuste o repository**: implemente as operações de leitura e gravação usando o repository do TypeORM.
3. **Crie ou ajuste o service**: concentre regras de negócio e coordenação das operações do repository.
4. **Crie ou ajuste o controller**: associe os endpoints ao router do recurso. Use `HttpError` para erros HTTP conhecidos, o formato `ApiResponse` nas respostas e pagination quando preciso.
5. **Registre no server.ts**: importe o router do controller e registre no server

```text
Model → Repository → Service → Controller/Router → server.ts
```

## 7. Banco SQLite e trabalho em equipe

**O uso de migrations ainda não foi padronizado.** Por enquanto, não assumam que uma migration está sendo gerada ou aplicada. Até lá, mantenham as entidades e o `synchronize: true` local alinhados e avisem a equipe quando uma alteração de model exigir recriar/atualizar a base local.
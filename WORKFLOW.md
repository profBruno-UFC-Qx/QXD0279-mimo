Este documento define o padrão de trabalho em equipe 

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

## 2. Fluxo recomendado branchs

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

Enviar a branch para o GitHub
```bash
git push -u origin feature/Wesley
```

Merge na branch `Wexxley-patch-1`:
```bash
git checkout Wexxley-patch-1
git pull origin Wexxley-patch-1
git merge feature/Wesley
git push origin Wexxley-patch-1
```

---

  "start": "tsx src/swagger.ts",
    "dev": "tsx src/swagger.ts",
    "build": "tsc"

---

camadas 

- routes = “qual caminho responde”
- controllers = “recebe a requisição e chama o que precisa”
- services = “faz a regra de negócio”
- models = “representa os dados”


- routes:
  - conhece URL, método HTTP, path
  - chama o controller certo
  - não deveria ter regra de negócio

- controllers:
  - recebe request e response
  - valida entrada simples
  - extrai params/query/body
  - chama o service
  - devolve resposta HTTP
  - não deveria decidir regra de negócio profunda

- services:
  - executa a lógica do caso de uso
  - chama repository/model/banco
  - valida regra de negócio
  - decide o que fazer com o dado

- models:
  - definem a estrutura dos dados
  - podem ser interfaces/types/classes de entidade


Routes:
- GET /users/:id
- POST /users

Controller:
- UserController.getById(req, res)
- UserController.create(req, res)

Service:
- UserService.findById(id)
- UserService.createUser(data)

Model:
- interface User
- type UserInput

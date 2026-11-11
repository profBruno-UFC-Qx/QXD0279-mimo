# Achadex

Sistema de achados e perdidos institucional.

> **Em desenvolvimento.** O sistema ainda está sendo construído; algumas telas e funcionalidades estão incompletas.

## Tecnologias

- **Frontend:** Vue 3, TypeScript, Vuetify e Vite
- **Backend:** Node.js, TypeScript, Express, TypeORM e SQLite

## Executar localmente

É necessário ter Node.js e npm instalados. Em dois terminais, instale as dependências e inicie cada aplicação:

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Para popular o banco com dados, execute `npm run seed` dentro da pasta `backend` (Esse comando recria os dados do banco por completo)


```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```
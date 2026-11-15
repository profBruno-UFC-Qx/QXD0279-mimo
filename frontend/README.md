# AchaDex

Guia básico para executar, popular (seed), testar e gerar o build do backend e do frontend.

## Backend

```bash
cd backend
npm install

# Popular o banco de dados (seed)
npm run seed

# Iniciar em desenvolvimento (http://localhost:3000)
npm run dev

# Build
npm run build

# Testes
node --import tsx --test src/tests/*.test.ts
```

## Frontend

```bash
cd frontend
npm install

# Iniciar em desenvolvimento (http://localhost:5173)
npm run dev

# Verificação de tipos e build de produção
npm run type-check
npm run build

# Testes unitários/integração e E2E
npm test
npm run test:e2e
```

import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import type { DataSource } from 'typeorm';
import { Building } from '../../models/building.js';
import { Category } from '../../models/category.js';
import { UserRole } from '../../models/enums.js';
import { User } from '../../models/user.js';
import { generateToken, type GenerateTokenOptions } from '../../shared/token.js';

export type TestApiBody<T = any> = {
  success: boolean;
  data: T;
  error?: { code: number; details: string } | null;
};

export type TestResponse<T = any> = {
  status: number;
  body: TestApiBody<T>;
};

export interface TestApp {
  dataSource: DataSource;
  baseUrl: string;
  request<T = any>(method: string, route: string, token?: string, body?: unknown): Promise<TestResponse<T>>;
  createUser(role?: UserRole, email?: string): Promise<User>;
  tokenFor(user: User, options?: GenerateTokenOptions): string;
  createCategory(name?: string): Promise<Category>;
  createBuilding(name?: string): Promise<Building>;
  close(): Promise<void>;
}

export async function startTestApp(): Promise<TestApp> {
  const { AppDataSource } = await import('../../data-source.js');
  const { apiRouter } = await import('../../routes/index.js');
  const { errorHandler } = await import('../../middlewares/error-handler.js');

  await AppDataSource.initialize();

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  app.use(errorHandler);

  const server = app.listen(0);
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let sequence = 0;

  const request = async <T = any>(
    method: string,
    route: string,
    token?: string,
    body?: unknown,
  ): Promise<TestResponse<T>> => {
    const headers: Record<string, string> = {};
    if (token !== undefined) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetch(`${baseUrl}${route}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: (text ? JSON.parse(text) : null) as TestApiBody<T>,
    };
  };

  const createUser = async (role: UserRole = UserRole.USER, email?: string): Promise<User> => {
    sequence++;
    const repository = AppDataSource.getRepository(User);
    return repository.save(repository.create({
      name: `Test ${role} ${sequence}`,
      email: email ?? `admin-auth-${role.toLowerCase()}-${sequence}-${Date.now()}@example.com`,
      passwordHash: `scrypt:${'a'.repeat(32)}:${'b'.repeat(64)}`,
      phone: null,
      role,
    }));
  };

  const tokenFor = (user: User, options?: GenerateTokenOptions): string =>
    generateToken({ sub: String(user.id) }, process.env.JWT_SECRET!, options);

  const createCategory = async (name?: string): Promise<Category> => {
    sequence++;
    const repository = AppDataSource.getRepository(Category);
    return repository.save(repository.create({
      name: name ?? `Test Category ${sequence}-${Date.now()}`,
    }));
  };

  const createBuilding = async (name?: string): Promise<Building> => {
    sequence++;
    const repository = AppDataSource.getRepository(Building);
    return repository.save(repository.create({
      name: name ?? `Test Building ${sequence}-${Date.now()}`,
      address: 'Rua de Teste, 123',
      pickupPoint: 'Recepcao',
      serviceHours: 'Segunda a sexta, 9h as 17h',
    }));
  };

  const close = async (): Promise<void> => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  };

  return {
    dataSource: AppDataSource,
    baseUrl,
    request,
    createUser,
    tokenFor,
    createCategory,
    createBuilding,
    close,
  };
}

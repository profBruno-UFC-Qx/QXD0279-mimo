import { Router, type Request, type Response } from 'express';
import { validate } from 'class-validator';
import { Building } from '../models/building.js';
import { HttpError } from '../middlewares/http-error.js';
import { BuildingService } from '../services/building.service.js';
import type { ApiResponse } from '../shared/api-response.js';

const buildingService = new BuildingService();
export const buildingRouter = Router();

type BuildingData = Pick<Building, 'name' | 'address' | 'pickupPoint' | 'serviceHours'>;

const buildingFields: (keyof BuildingData)[] = [
  'name',
  'address',
  'pickupPoint',
  'serviceHours',
];

async function validateBuildingData(
  body: unknown,
  partial: boolean,
): Promise<Partial<BuildingData>> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'O corpo da requisição deve ser um objeto JSON.');
  }

  const payload = body as Record<string, unknown>;
  const keys = Object.keys(payload);

  if (partial && keys.length === 0) {
    throw new HttpError(400, 'Informe ao menos um campo para atualização.');
  }

  if (keys.some((key) => !buildingFields.includes(key as keyof BuildingData))) {
    throw new HttpError(400, 'O corpo contém campos não permitidos.');
  }

  if (!partial && buildingFields.some((field) => !Object.hasOwn(payload, field))) {
    throw new HttpError(400, 'Todos os campos do prédio são obrigatórios.');
  }

  const data: Partial<BuildingData> = {};
  for (const field of buildingFields) {
    if (!Object.hasOwn(payload, field)) continue;
    if (typeof payload[field] !== 'string') {
      throw new HttpError(400, 'Todos os campos informados devem ser textos válidos.');
    }
    data[field] = payload[field];
  }

  const building = Object.assign(new Building(), data);
  const validationErrors = await validate(building, { skipMissingProperties: partial });
  if (validationErrors.length > 0) {
    throw new HttpError(400, 'Um ou mais campos possuem tamanho ou formato inválido.');
  }

  return data;
}

function parseBuildingId(rawId: string): number {
  if (!/^\d+$/.test(rawId)) {
    throw new HttpError(400, 'O ID do prédio deve ser um número inteiro positivo.');
  }

  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new HttpError(400, 'O ID do prédio deve ser um número inteiro positivo.');
  }

  return id;
}

export async function createBuilding(req: Request, res: Response): Promise<void> {
  /* #swagger.tags = ['Buildings'] */
  /* #swagger.summary = 'Criar prédio' */
  /* #swagger.description = 'Operação administrativa. Autorização real ainda não está integrada; integrar antes da exposição pública.' */
  /* #swagger.parameters['body'] = {
    in: 'body',
    required: true,
    schema: {
      name: 'Campus Central',
      address: 'Rua Exemplo, 123',
      pickupPoint: 'Recepção principal',
      serviceHours: 'Segunda a sexta, das 9h às 17h'
    }
  } */
  /* #swagger.responses[201] = { description: 'Prédio criado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'Payload inválido', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[409] = { description: 'Já existe um prédio com esse nome', schema: { $ref: '#/definitions/ApiResponse' } } */
  const data = await validateBuildingData(req.body, false);
  const building = await buildingService.create(data as BuildingData);
  const response: ApiResponse<Building> = { success: true, data: building };
  res.status(201).json(response);
}

export async function getBuildings(_req: Request, res: Response): Promise<void> {
  const buildings = await buildingService.list();
  const response: ApiResponse<Building[]> = { success: true, data: buildings };
  res.json(response);
}

export async function getBuildingById(req: Request<{ id: string }>, res: Response): Promise<void> {
  const id = parseBuildingId(req.params.id);
  const building = await buildingService.getById(id);
  if (!building) {
    throw new HttpError(404, 'Não existe prédio cadastrado com esse ID.');
  }

  res.json({ success: true, data: building });
}

buildingRouter.get(
  '/',
  /* #swagger.tags = ['Buildings'] */
  /* #swagger.summary = 'Listar prédios para consulta pública' */
  /* #swagger.responses[200] = { description: 'Prédios ordenados por nome', schema: { $ref: '#/definitions/ApiResponse' } } */
  getBuildings,
);

buildingRouter.post('/', createBuilding);
buildingRouter.get(
  '/:id',
  /* #swagger.tags = ['Buildings'] */
  /* #swagger.summary = 'Consultar prédio por ID' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[200] = { description: 'Prédio encontrado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'ID inválido' } */
  /* #swagger.responses[404] = { description: 'Prédio não encontrado' } */
  getBuildingById,
);

buildingRouter.patch(
  '/:id',
  /* #swagger.tags = ['Buildings'] */
  /* #swagger.summary = 'Atualizar prédio' */
  /* #swagger.description = 'Operação administrativa. Autorização real ainda não está integrada; integrar antes da exposição pública.' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.parameters['body'] = { in: 'body', required: true, schema: { name: 'Campus Central', address: 'Rua Exemplo, 123', pickupPoint: 'Recepção principal', serviceHours: 'Segunda a sexta, das 9h às 17h' } } */
  /* #swagger.responses[200] = { description: 'Prédio atualizado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'ID ou payload inválido', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[404] = { description: 'Prédio não encontrado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[409] = { description: 'Já existe um prédio com esse nome', schema: { $ref: '#/definitions/ApiResponse' } } */
  async (req: Request<{ id: string }>, res: Response): Promise<void> => {
    const id = parseBuildingId(req.params.id);
    const data = await validateBuildingData(req.body, true);
    const building = await buildingService.update(id, data);
    if (!building) {
      throw new HttpError(404, 'Não existe prédio cadastrado com esse ID.');
    }

    const response: ApiResponse<Building> = { success: true, data: building };
    res.json(response);
  },
);

buildingRouter.delete(
  '/:id',
  /* #swagger.tags = ['Buildings'] */
  /* #swagger.summary = 'Excluir prédio' */
  /* #swagger.description = 'Operação administrativa. Autorização real ainda não está integrada; integrar antes da exposição pública.' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[204] = { description: 'Prédio excluído sem corpo de resposta' } */
  /* #swagger.responses[400] = { description: 'ID inválido', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[404] = { description: 'Prédio não encontrado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[409] = { description: 'Prédio possui itens ou perdas vinculados', schema: { $ref: '#/definitions/ApiResponse' } } */
  async (req: Request<{ id: string }>, res: Response): Promise<void> => {
    const id = parseBuildingId(req.params.id);
    const result = await buildingService.delete(id);
    if (result === 'not_found') {
      throw new HttpError(404, 'Não existe prédio cadastrado com esse ID.');
    }
    if (result === 'linked') {
      throw new HttpError(409, 'Não é possível excluir um prédio com itens ou perdas vinculados.');
    }

    res.status(204).end();
  },
);

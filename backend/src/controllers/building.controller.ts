import { Router, type Request, type Response } from 'express';
import { HttpError } from '../middlewares/http-error.js';
import { BuildingService } from '../services/building.service.js';
import { notImplemented } from '../shared/not-implemented.js';

const buildingService = new BuildingService();
export const buildingRouter = Router();

export async function createBuilding(req: Request, res: Response): Promise<void> {
  /* #swagger.tags = ['Buildings'] */
  /* #swagger.summary = 'Criar prédio' */
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
  const building = await buildingService.create(req.body);
  res.status(201).json({ success: true, data: building });
}

export async function getBuildingById(req: Request<{ id: string }>, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new HttpError(400, 'O ID do prédio deve ser um número inteiro positivo.');
  }

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
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Listagem de prédios'),
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
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.parameters['body'] = { in: 'body', required: true, schema: { name: 'Campus Central', address: 'Rua Exemplo, 123', pickupPoint: 'Recepção principal', serviceHours: 'Segunda a sexta, das 9h às 17h' } } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Atualização de prédio'),
);

buildingRouter.delete(
  '/:id',
  /* #swagger.tags = ['Buildings'] */
  /* #swagger.summary = 'Excluir prédio' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Exclusão de prédio'),
);

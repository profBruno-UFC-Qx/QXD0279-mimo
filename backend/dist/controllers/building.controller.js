import { Router } from 'express';
import { HttpError } from '../shared/http-error.js';
import { BuildingService } from '../services/building.service.js';
const buildingService = new BuildingService();
export const buildingRouter = Router();
export async function createBuilding(req, res) {
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
    const building = await buildingService.create(req.body);
    res.status(201).json({ success: true, data: building });
}
export async function getBuildingById(req, res) {
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
buildingRouter.post('/', createBuilding);
buildingRouter.get('/:id', getBuildingById);

import { Router } from 'express';
import { Building } from '../models/building.js';
import { BuildingService } from '../services/building.service.js';
const buildingService = new BuildingService();
export const buildingRouter = Router();
export async function createBuilding(req, res) {
    try {
        const building = await buildingService.create(req.body);
        res.status(201).json({ success: true, data: building });
    }
    catch (error) {
        console.error('Erro ao criar prédio:', error);
        res.status(500).json({
            success: false,
            data: null,
            error: { code: 500, details: 'Falha interna ao criar o prédio.' },
        });
    }
}
export async function getBuildingById(req, res) {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
        res.status(400).json({
            success: false,
            data: null,
            error: { code: 400, details: 'O ID do prédio deve ser um número inteiro positivo.' },
        });
        return;
    }
    try {
        const building = await buildingService.getById(id);
        if (!building) {
            res.status(404).json({
                success: false,
                data: null,
                error: { code: 404, details: 'Não existe prédio cadastrado com esse ID.' },
            });
            return;
        }
        res.json({ success: true, data: building });
    }
    catch (error) {
        console.error('Erro ao consultar prédio:', error);
        res.status(500).json({
            success: false,
            data: null,
            error: { code: 500, details: 'Falha interna ao consultar o prédio.' },
        });
    }
}
buildingRouter.post('/', createBuilding);
buildingRouter.get('/:id', getBuildingById);

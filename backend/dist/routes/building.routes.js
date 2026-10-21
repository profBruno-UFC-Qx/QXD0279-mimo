import { Router } from 'express';
import { createBuilding, getBuildingById } from '../controllers/building.controller.js';
const buildingRoutes = Router();
buildingRoutes.post('/', createBuilding);
buildingRoutes.get('/:id', getBuildingById);
export default buildingRoutes;

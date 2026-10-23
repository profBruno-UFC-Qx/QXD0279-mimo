import { Router } from 'express';
import { notImplemented } from '../shared/not-implemented.js';

export const dispositionRuleRouter = Router();

dispositionRuleRouter.get(
  '/',
  /* #swagger.tags = ['Disposition Rules'] */
  /* #swagger.summary = 'Listar regras de destinação' */
  /* #swagger.parameters['active'] = { in: 'query', type: 'boolean' } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Listagem de regras de destinação'),
);

dispositionRuleRouter.post(
  '/',
  /* #swagger.tags = ['Disposition Rules'] */
  /* #swagger.summary = 'Criar regra de destinação' */
  /* #swagger.parameters['body'] = { in: 'body', required: true, schema: { days: 30, destination: 'DONATED' } } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Criação de regra de destinação'),
);

dispositionRuleRouter.get(
  '/:id',
  /* #swagger.tags = ['Disposition Rules'] */
  /* #swagger.summary = 'Consultar regra de destinação' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Consulta de regra de destinação'),
);

dispositionRuleRouter.patch(
  '/:id',
  /* #swagger.tags = ['Disposition Rules'] */
  /* #swagger.summary = 'Atualizar regra de destinação' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.parameters['body'] = { in: 'body', required: true, schema: { days: 45, destination: 'AUCTIONED', active: true, locked: false } } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Atualização de regra de destinação'),
);

dispositionRuleRouter.delete(
  '/:id',
  /* #swagger.tags = ['Disposition Rules'] */
  /* #swagger.summary = 'Excluir regra de destinação' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Exclusão de regra de destinação'),
);

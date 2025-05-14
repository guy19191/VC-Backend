import { Router } from 'express';
import { EntityController } from '../controllers/entity.controller';

export const createEntityRouter = (controller: EntityController): Router => {
  const router = Router();

  router.post('/add', controller.addEntity.bind(controller));
  router.put('/update/:id', controller.updateEntity.bind(controller));
  router.post('/update-by-query', controller.updateEntityByQueryEndpoint.bind(controller));
  router.post('/query', controller.queryEntities.bind(controller));

  return router;
};

export const createTriggerRouter = (controller: EntityController): Router => {
  const router = Router();

  router.post('/new', controller.addTrigger.bind(controller));
  router.put('/update/:id', controller.updateTrigger.bind(controller));
  router.get('/query', controller.queryTriggers.bind(controller));
  router.get('/getAll', controller.getAllTriggers.bind(controller));

  return router;
}; 
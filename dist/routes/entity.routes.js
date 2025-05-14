"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTriggerRouter = exports.createEntityRouter = void 0;
const express_1 = require("express");
const createEntityRouter = (controller) => {
    const router = (0, express_1.Router)();
    router.post('/add', controller.addEntity.bind(controller));
    router.put('/update/:id', controller.updateEntity.bind(controller));
    router.post('/update-by-query', controller.updateEntityByQueryEndpoint.bind(controller));
    router.post('/query', controller.queryEntities.bind(controller));
    return router;
};
exports.createEntityRouter = createEntityRouter;
const createTriggerRouter = (controller) => {
    const router = (0, express_1.Router)();
    router.post('/new', controller.addTrigger.bind(controller));
    router.put('/update/:id', controller.updateTrigger.bind(controller));
    router.get('/query', controller.queryTriggers.bind(controller));
    router.get('/getAll', controller.getAllTriggers.bind(controller));
    return router;
};
exports.createTriggerRouter = createTriggerRouter;

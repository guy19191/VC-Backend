"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const index_1 = require("../index");
const trigger_model_1 = require("../models/trigger.model");
describe('API Tests', () => {
    // Test data
    const testEntity = {
        type: 'person',
        properties: {
            name: 'Test Entity',
            status: 'active'
        },
        position: { lat: 40.7128, lng: -74.0060 },
        vector: [0.1, 0.2, 0.3],
        source: 'both'
    };
    const testGeoRuleTrigger = {
        type: 'geoRule',
        sourceQuery: { type: 'person' },
        targetQuery: { type: 'location' },
        position: { lat: 40.7128, lng: -74.0060 },
        radius: 1000,
        source: 'both'
    };
    const testLayerTrigger = {
        type: 'layer',
        layerId: 'test-layer',
        query: { type: 'person' },
        source: 'both'
    };
    const testTimeOutTrigger = {
        type: 'timeOut',
        timeoutMs: 5000,
        source: 'both'
    };
    // Clean up database before each test
    beforeEach(async () => {
        await trigger_model_1.TriggerModel.deleteMany({});
    });
    // Entity API Tests
    describe('Entity API', () => {
        it('should add a new entity', async () => {
            const response = await (0, supertest_1.default)(index_1.app)
                .post('/entities/add')
                .send(testEntity);
            expect(response.status).toBe(201);
            expect(response.body).toMatchObject(testEntity);
            expect(response.body.id).toBeDefined();
        });
        it('should update an existing entity', async () => {
            // First add the entity
            const createResponse = await (0, supertest_1.default)(index_1.app)
                .post('/entities/add')
                .send(testEntity);
            const entityId = createResponse.body.id;
            // Update the entity
            const updatedEntity = {
                ...testEntity,
                properties: {
                    ...testEntity.properties,
                    status: 'inactive'
                }
            };
            const response = await (0, supertest_1.default)(index_1.app)
                .put(`/entities/update/${entityId}`)
                .send(updatedEntity);
            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Entity updated successfully');
        });
        it('should query entities with filters', async () => {
            // First add the entity
            await (0, supertest_1.default)(index_1.app)
                .post('/entities/add')
                .send(testEntity);
            const response = await (0, supertest_1.default)(index_1.app)
                .post('/entities/query')
                .send({
                type: 'person',
                source: 'both'
            });
            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThan(0);
            expect(response.body[0].type).toBe('person');
            expect(response.body[0].id).toBeDefined();
        });
    });
    // Trigger API Tests
    describe('Trigger API', () => {
        it('should create a new geo rule trigger', async () => {
            const response = await (0, supertest_1.default)(index_1.app)
                .post('/triggers/new')
                .send(testGeoRuleTrigger);
            expect(response.status).toBe(201);
            expect(response.body).toMatchObject(testGeoRuleTrigger);
            expect(response.body.id).toBeDefined();
        });
        it('should query triggers by type', async () => {
            // Create multiple triggers
            await (0, supertest_1.default)(index_1.app)
                .post('/triggers/new')
                .send(testGeoRuleTrigger);
            await (0, supertest_1.default)(index_1.app)
                .post('/triggers/new')
                .send(testLayerTrigger);
            const response = await (0, supertest_1.default)(index_1.app)
                .get('/triggers/query')
                .query({
                type: 'geoRule',
                source: 'both'
            });
            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThan(0);
            expect(response.body[0].type).toBe('geoRule');
            expect(response.body[0].id).toBeDefined();
        });
    });
    // Integration Tests
    describe('Integration Tests', () => {
        it('should execute action when trigger matches', async () => {
            // Create multiple actions
            const actionResponses = await Promise.all([
                (0, supertest_1.default)(index_1.app)
                    .post('/actions/new')
                    .send({
                    type: 'notification',
                    payload: {
                        message: 'Test notification 1',
                        level: 'info'
                    }
                }),
                (0, supertest_1.default)(index_1.app)
                    .post('/actions/new')
                    .send({
                    type: 'notification',
                    payload: {
                        message: 'Test notification 2',
                        level: 'warning'
                    }
                })
            ]);
            // Create a trigger with multiple action IDs
            const triggerWithActions = {
                ...testGeoRuleTrigger,
                actionIds: actionResponses.map(response => response.body._id)
            };
            const triggerResponse = await (0, supertest_1.default)(index_1.app)
                .post('/triggers/new')
                .send(triggerWithActions);
            // Add an entity that matches the trigger
            const entityResponse = await (0, supertest_1.default)(index_1.app)
                .post('/entities/add')
                .send(testEntity);
            expect(entityResponse.status).toBe(201);
            expect(entityResponse.body._id).toBeDefined();
            // Note: WebSocket events would need to be tested separately
        });
        it('should execute add entity action when trigger matches', async () => {
            // Create multiple actions
            const actionResponses = await Promise.all([
                (0, supertest_1.default)(index_1.app)
                    .post('/actions/new')
                    .send({
                    type: 'addEntity',
                    payload: {
                        type: 'person',
                        properties: {
                            name: 'New Entity 1',
                            status: 'active'
                        },
                        position: { lat: 40.7128, lng: -74.0060 },
                        vector: [0.1, 0.2, 0.3],
                        source: 'both'
                    }
                }),
                (0, supertest_1.default)(index_1.app)
                    .post('/actions/new')
                    .send({
                    type: 'addEntity',
                    payload: {
                        type: 'person',
                        properties: {
                            name: 'New Entity 2',
                            status: 'active'
                        },
                        position: { lat: 40.7128, lng: -74.0060 },
                        vector: [0.1, 0.2, 0.3],
                        source: 'both'
                    }
                })
            ]);
            // Create a trigger with multiple action IDs
            const triggerWithActions = {
                ...testLayerTrigger,
                actionIds: actionResponses.map(response => response.body._id)
            };
            const triggerResponse = await (0, supertest_1.default)(index_1.app)
                .post('/triggers/new')
                .send(triggerWithActions);
            // Add an entity that matches the trigger
            const entityResponse = await (0, supertest_1.default)(index_1.app)
                .post('/entities/add')
                .send(testEntity);
            expect(entityResponse.status).toBe(201);
            expect(entityResponse.body._id).toBeDefined();
            // Note: WebSocket events would need to be tested separately
        });
    });
});

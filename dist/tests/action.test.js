"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const mongoose_1 = __importDefault(require("mongoose"));
const index_1 = require("../index");
describe('Action API Tests', () => {
    // Test data
    const testAction = {
        type: 'notification',
        payload: {
            message: 'Test notification',
            level: 'info'
        }
    };
    const testAddEntityAction = {
        type: 'addEntity',
        payload: {
            type: 'person',
            properties: {
                name: 'New Entity',
                status: 'active'
            },
            position: { lat: 40.7128, lng: -74.0060 },
            vector: [0.1, 0.2, 0.3],
            source: 'both'
        }
    };
    const testUpdateEntityAction = {
        type: 'updateEntity',
        payload: {
            id: 'test-entity-1',
            properties: {
                status: 'inactive'
            }
        }
    };
    const testUpdateEntityByQueryAction = {
        type: 'updateEntity',
        payload: {
            query: {
                type: 'person',
                properties: {
                    status: 'active'
                }
            },
            properties: {
                status: 'inactive'
            }
        }
    };
    beforeEach(async () => {
        // Clear the database before each test
        await mongoose_1.default.connection.dropDatabase();
    });
    it('should create a new notification action', async () => {
        const response = await (0, supertest_1.default)(index_1.app)
            .post('/actions/new')
            .send(testAction);
        expect(response.status).toBe(201);
        expect(response.body).toMatchObject(testAction);
        expect(response.body._id).toBeDefined();
    });
    it('should create a new add entity action', async () => {
        const response = await (0, supertest_1.default)(index_1.app)
            .post('/actions/new')
            .send(testAddEntityAction);
        expect(response.status).toBe(201);
        expect(response.body).toMatchObject(testAddEntityAction);
        expect(response.body._id).toBeDefined();
    });
    it('should create a new update entity action', async () => {
        const response = await (0, supertest_1.default)(index_1.app)
            .post('/actions/new')
            .send(testUpdateEntityAction);
        expect(response.status).toBe(201);
        expect(response.body).toMatchObject(testUpdateEntityAction);
        expect(response.body._id).toBeDefined();
    });
    it('should create a new update entity action with query', async () => {
        const response = await (0, supertest_1.default)(index_1.app)
            .post('/actions/new')
            .send(testUpdateEntityByQueryAction);
        expect(response.status).toBe(201);
        expect(response.body).toMatchObject(testUpdateEntityByQueryAction);
        expect(response.body._id).toBeDefined();
    });
    it('should get an action by id', async () => {
        // First create an action
        const createResponse = await (0, supertest_1.default)(index_1.app)
            .post('/actions/new')
            .send(testAction);
        const response = await (0, supertest_1.default)(index_1.app)
            .get(`/actions/${createResponse.body._id}`);
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject(testAction);
    });
    it('should update an action', async () => {
        // First create an action
        const createResponse = await (0, supertest_1.default)(index_1.app)
            .post('/actions/new')
            .send(testAction);
        const updatedAction = {
            ...testAction,
            payload: {
                message: 'Updated notification',
                level: 'warning'
            }
        };
        const response = await (0, supertest_1.default)(index_1.app)
            .put(`/actions/${createResponse.body._id}`)
            .send(updatedAction);
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject(updatedAction);
    });
    it('should delete an action', async () => {
        // First create an action
        const createResponse = await (0, supertest_1.default)(index_1.app)
            .post('/actions/new')
            .send(testAction);
        const response = await (0, supertest_1.default)(index_1.app)
            .delete(`/actions/${createResponse.body._id}`);
        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Action deleted successfully');
        // Verify the action is deleted
        const getResponse = await (0, supertest_1.default)(index_1.app)
            .get(`/actions/${createResponse.body._id}`);
        expect(getResponse.status).toBe(404);
    });
});

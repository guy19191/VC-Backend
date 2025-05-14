import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../index';
import { Action } from '../types';

describe('Action API Tests', () => {
  // Test data
  const testAction: Omit<Action, '_id'> = {
    type: 'notification',
    payload: {
      message: 'Test notification',
      level: 'info'
    }
  };

  const testAddEntityAction: Omit<Action, '_id'> = {
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

  const testUpdateEntityAction: Omit<Action, '_id'> = {
    type: 'updateEntity',
    payload: {
      id: 'test-entity-1',
      properties: {
        status: 'inactive'
      }
    }
  };

  const testUpdateEntityByQueryAction: Omit<Action, '_id'> = {
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
    await mongoose.connection.dropDatabase();
  });

  it('should create a new notification action', async () => {
    const response = await request(app)
      .post('/actions/new')
      .send(testAction);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject(testAction);
    expect(response.body._id).toBeDefined();
  });

  it('should create a new add entity action', async () => {
    const response = await request(app)
      .post('/actions/new')
      .send(testAddEntityAction);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject(testAddEntityAction);
    expect(response.body._id).toBeDefined();
  });

  it('should create a new update entity action', async () => {
    const response = await request(app)
      .post('/actions/new')
      .send(testUpdateEntityAction);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject(testUpdateEntityAction);
    expect(response.body._id).toBeDefined();
  });

  it('should create a new update entity action with query', async () => {
    const response = await request(app)
      .post('/actions/new')
      .send(testUpdateEntityByQueryAction);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject(testUpdateEntityByQueryAction);
    expect(response.body._id).toBeDefined();
  });

  it('should get an action by id', async () => {
    // First create an action
    const createResponse = await request(app)
      .post('/actions/new')
      .send(testAction);

    const response = await request(app)
      .get(`/actions/${createResponse.body._id}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject(testAction);
  });

  it('should update an action', async () => {
    // First create an action
    const createResponse = await request(app)
      .post('/actions/new')
      .send(testAction);

    const updatedAction = {
      ...testAction,
      payload: {
        message: 'Updated notification',
        level: 'warning'
      }
    };

    const response = await request(app)
      .put(`/actions/${createResponse.body._id}`)
      .send(updatedAction);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject(updatedAction);
  });

  it('should delete an action', async () => {
    // First create an action
    const createResponse = await request(app)
      .post('/actions/new')
      .send(testAction);

    const response = await request(app)
      .delete(`/actions/${createResponse.body._id}`);

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Action deleted successfully');

    // Verify the action is deleted
    const getResponse = await request(app)
      .get(`/actions/${createResponse.body._id}`);

    expect(getResponse.status).toBe(404);
  });
}); 
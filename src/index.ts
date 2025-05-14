import express from 'express';
import { createServer } from 'http';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { WebSocketService } from './websocket';
import { TriggerService } from './services/trigger.service';
import { createEntityRouter, createTriggerRouter } from './routes/entity.routes';
import { EntityController } from './controllers/entity.controller';
import { TriggerController } from './controllers/trigger.controller';
import { ActionService } from './services/action.service';
import { ActionController } from './controllers/action.controller';
import actionRoutes from './routes/action.routes';

// Load environment variables
dotenv.config();

export const app = express();
const server = createServer(app);

// Initialize WebSocket service
const wsService = new WebSocketService(server);

// Initialize controllers
const actionController = new ActionController();
const triggerController = new TriggerController(wsService);

// Initialize entity controller
const entityController = new EntityController(undefined, wsService);

// Initialize action service
const actionService = new ActionService(actionController, entityController, wsService);

// Initialize trigger service
const triggerService = new TriggerService(
  wsService,
  Number(process.env.GEO_THRESHOLD_METERS) || 10,
  Number(process.env.VECTOR_DIMENSION) || 128,
  process.env.AGENT_MODEL_URL || 'http://localhost:3001/api/agent',
  triggerController,
  actionService
);

// Update entity controller with trigger service
entityController.setTriggerService(triggerService);

// Middleware
app.use(express.json());

// Routes
app.use('/entities', createEntityRouter(entityController));
app.use('/triggers', createTriggerRouter(entityController));
app.use('/actions', actionRoutes);

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/trigger-service')
  .then(() => {
    console.log('Connected to MongoDB');
    
    // Start server
    const port = process.env.PORT || 3000;
    server.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }); 
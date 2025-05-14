"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const websocket_1 = require("./websocket");
const trigger_service_1 = require("./services/trigger.service");
const entity_routes_1 = require("./routes/entity.routes");
const entity_controller_1 = require("./controllers/entity.controller");
const trigger_controller_1 = require("./controllers/trigger.controller");
const action_service_1 = require("./services/action.service");
const action_controller_1 = require("./controllers/action.controller");
const action_routes_1 = __importDefault(require("./routes/action.routes"));
// Load environment variables
dotenv_1.default.config();
exports.app = (0, express_1.default)();
const server = (0, http_1.createServer)(exports.app);
// Initialize WebSocket service
const wsService = new websocket_1.WebSocketService(server);
// Initialize controllers
const actionController = new action_controller_1.ActionController();
const triggerController = new trigger_controller_1.TriggerController(wsService);
// Initialize entity controller
const entityController = new entity_controller_1.EntityController(undefined, wsService);
// Initialize action service
const actionService = new action_service_1.ActionService(actionController, entityController, wsService);
// Initialize trigger service
const triggerService = new trigger_service_1.TriggerService(wsService, Number(process.env.GEO_THRESHOLD_METERS) || 10, Number(process.env.VECTOR_DIMENSION) || 128, process.env.AGENT_MODEL_URL || 'http://localhost:3001/api/agent', triggerController, actionService);
// Update entity controller with trigger service
entityController.setTriggerService(triggerService);
// Middleware
exports.app.use(express_1.default.json());
// Routes
exports.app.use('/entities', (0, entity_routes_1.createEntityRouter)(entityController));
exports.app.use('/triggers', (0, entity_routes_1.createTriggerRouter)(entityController));
exports.app.use('/actions', action_routes_1.default);
// Connect to MongoDB
mongoose_1.default
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

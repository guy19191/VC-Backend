"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionService = void 0;
class ActionService {
    constructor(actionController, entityController, wsService) {
        this.actionController = actionController;
        this.entityController = entityController;
        this.wsService = wsService;
    }
    async executeAction(actionId, triggerId, entity) {
        try {
            const action = await this.actionController.getActionById(actionId);
            if (!action) {
                throw new Error('Action not found');
            }
            let result;
            switch (action.type) {
                case 'notification':
                    result = await this.handleNotification(action.payload);
                    break;
                case 'addEntity':
                    result = await this.handleAddEntity(action.payload);
                    break;
                case 'updateEntity':
                    result = await this.handleUpdateEntity(action);
                    break;
                default:
                    throw new Error('Unknown action type');
            }
            // Emit WebSocket event with action result
            this.wsService.emit('actionExecuted', {
                triggerId,
                actionId,
                result
            });
        }
        catch (error) {
            console.error('Error executing action:', error);
            throw error;
        }
    }
    async handleNotification(payload) {
        this.wsService.emit('notification', payload);
    }
    async handleAddEntity(payload) {
        return await this.entityController.createEntity(payload, false);
    }
    async handleUpdateEntity(action) {
        const { payload, query, id } = action;
        if (query) {
            return await this.entityController.updateEntityByQuery(query, payload, false);
        }
        else if (id) {
            return await this.entityController.updateEntityLogic(id, payload, false);
        }
        else {
            throw new Error('Either id or query must be provided for updateEntity action');
        }
    }
}
exports.ActionService = ActionService;

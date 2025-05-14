import { Action, ActionType, Entity } from '../types';
import { ActionController } from '../controllers/action.controller';
import { EntityController } from '../controllers/entity.controller';
import { WebSocketService } from '../websocket';
import { AnyARecord } from 'node:dns';

export class ActionService {
  constructor(
    private actionController: ActionController,
    private entityController: EntityController,
    private wsService: WebSocketService
  ) {}

  async executeAction(actionId: string, triggerId: string, entity: Entity | undefined): Promise<void> {
    try {
      const action = await this.actionController.getActionById(actionId);
      if (!action) {
        throw new Error('Action not found');
      }

      let result: any;

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
    } catch (error) {
      console.error('Error executing action:', error);
      throw error;
    }
  }

  private async handleNotification(payload: any): Promise<void> {
    this.wsService.emit('notification', payload);
  }

  private async handleAddEntity(payload: any): Promise<any> {
    return await this.entityController.createEntity(payload as any, false);
  }

  private async handleUpdateEntity(action: any): Promise<any> {
    const { payload, query, id } = action;
    
    if (query) {
      return await this.entityController.updateEntityByQuery(query, payload as Partial<Entity>, false);
    } else if (id) {
      return await this.entityController.updateEntityLogic(id, payload as Partial<Entity>, false);
    } else {
      throw new Error('Either id or query must be provided for updateEntity action');
    }
  }
} 
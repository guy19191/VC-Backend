import { QdrantClient } from '@qdrant/js-client-rest';
import { TriggerModel, TriggerDocument } from '../models/trigger.model';
import { Entity, Trigger, TriggerMatch, isGeoRuleTrigger, isLayerTrigger, isTimeOutTrigger, GeoPosition, AgentModelResponse, BaseTrigger, TriggerType, ActionType } from '../types';
import { isWithinDistance } from '../utils/geo';
import { WebSocketService } from '../websocket';
import axios from 'axios';
import { TriggerController } from '../controllers/trigger.controller';
import { ActionService } from './action.service';
import { ActionModel } from '../models/action.model';
import { v4 as uuidv4 } from 'uuid';
import { EntityModel } from '../models/entity.model';

export class TriggerService {
  private qdrantClient: QdrantClient;
  private wsService: WebSocketService;
  private geoThresholdMeters: number;
  private vectorDimension: number;
  private agentModelUrl: string;
  private triggerController: TriggerController;
  private actionService: ActionService;

  constructor(
    wsService: WebSocketService, 
    geoThresholdMeters: number, 
    vectorDimension: number = 128,
    agentModelUrl: string = process.env.AGENT_MODEL_URL || 'http://localhost:3001/api/agent',
    triggerController: TriggerController,
    actionService: ActionService
  ) {
    this.wsService = wsService;
    this.geoThresholdMeters = geoThresholdMeters;
    this.vectorDimension = vectorDimension;
    this.agentModelUrl = agentModelUrl;
    this.qdrantClient = new QdrantClient({ url: process.env.QDRANT_URL });
    this.triggerController = triggerController;
    this.actionService = actionService;
    this.initializeQdrantCollections();
  }

  private async initializeQdrantCollections() {
    try {
      // Initialize triggers collection
      const collections = await this.qdrantClient.getCollections();
      const triggersExists = collections.collections.some(c => c.name === 'triggers');
      
      if (!triggersExists) {
        await this.qdrantClient.createCollection('triggers', {
          vectors: {
            size: this.vectorDimension,
            distance: 'Cosine'
          }
        });
        console.log('Triggers collection created successfully');
      }
    } catch (error) {
      console.error('Error initializing Qdrant collections:', error);
    }
  }

  private async checkGeoRule(trigger: TriggerDocument, entity: Entity): Promise<boolean> {
    const triggerData = trigger.toObject();
    if (!isGeoRuleTrigger(triggerData)) return false;
    
    // Check if entity matches the target query
    const targetEntity = await EntityModel.findOne({
      _id: entity._id,
      ...triggerData.targetQuery
    });
    if (!targetEntity) return false;
    
    // Get the first entity that matches the source query
    const sourceEntity = await EntityModel.findOne(triggerData.sourceQuery);
    if (!sourceEntity) return false;

    if (!sourceEntity.position || !entity.position) return false;

    const sourceEntityData: any = sourceEntity.toObject();

    return isWithinDistance(sourceEntityData.position, entity.position, this.geoThresholdMeters, entity.type);
  }

  private async checkLayer(trigger: TriggerDocument, entity: Entity): Promise<boolean> {
    const triggerData = trigger.toObject();
    if (!isLayerTrigger(triggerData)) return false;
    try {
     const targetEntity = await EntityModel.findOne({
      _id: entity._id,
      ...triggerData.query
    });
    return targetEntity ? true : false;
    } catch (error) {
      console.error('Error checking layer trigger:', error);
      return false;
    }
  }

  private setupTimeOutTrigger(trigger: TriggerDocument, entity: Entity): void {
    const triggerData = trigger.toObject();
    if (!isTimeOutTrigger(triggerData)) return;

    setTimeout(() => {
      this.emitTriggerMatch(trigger, entity);
    }, triggerData.timeoutMs);
  }

  private async callAgentModel(trigger: TriggerDocument, entity: Entity): Promise<AgentModelResponse> {
    try {
      const response = await axios.post(this.agentModelUrl, {
        trigger: {
          id: trigger.id,
          type: trigger.type,
          data: trigger.toObject()
        },
        entity: {
          id: entity._id,
          type: entity.type,
          properties: entity.properties,
          position: entity.position
        }
      });

      return response.data as AgentModelResponse;
    } catch (error) {
      console.error('Error calling agent model:', error);
      throw error;
    }
  }

  public async createActionFromObject(actionObject: { type: ActionType; payload: any; query?: Record<string, any>; id?: string }): Promise<string> {
    try {
      const action = new ActionModel({
        _id: uuidv4(),
        type: actionObject.type,
        payload: actionObject.payload,
        query: actionObject.query,
        id: actionObject.id
      });
      await action.save();
      return action._id as string;
    } catch (error) {
      console.error('Error creating action from object:', error);
      throw error;
    }
  }

  private async emitTriggerMatch(trigger: TriggerDocument, entity: Entity): Promise<void> {
    try {
      const triggerData = trigger.toObject();
      // Prevent re-processing if already matched
      if (triggerData.status === 'matched') return;
      // Update trigger status
      await this.triggerController.updateTriggerStatus(triggerData._id.toString(), 'matched');

      // Emit WebSocket event
      this.wsService.emit('triggerMatch', {
        trigger: {
          ...triggerData,
          vector: undefined
        },
        entity: {
          ...entity,
          vector: undefined
        }
      });
      await this.triggerController.callLLMWithMatch(triggerData, entity);
      // Check if trigger has action objects without IDs
      if (!triggerData.actionIds && triggerData.actions && Array.isArray(triggerData.actions)) {
        const actionIds: string[] = [];
        
        // Create new actions from objects
        for (const actionObject of triggerData.actions) {
          const actionId = await this.createActionFromObject(actionObject);
          actionIds.push(actionId);
        }
        
        // Update trigger with new action IDs
        const updateResult = await TriggerModel.updateOne(
          { _id: triggerData._id },
          {
            $set: {
              actionIds,
              actions: undefined // Remove the action objects
            }
          }
        );

        if (updateResult.modifiedCount === 0) {
          throw new Error('Failed to update trigger with new action IDs');
        }

        // Execute all the newly created actions
        for (const actionId of actionIds) {
          await this.actionService.executeAction(actionId, triggerData._id.toString(), entity);
        }
      }
      // Execute all associated actions if they exist
      else if (triggerData.actionIds && Array.isArray(triggerData.actionIds)) {
        for (const actionId of triggerData.actionIds) {
          await this.actionService.executeAction(
            actionId.toString(),
            triggerData._id.toString(),
            entity
          );
        }
      }
    } catch (error) {
      console.error('Error in emitTriggerMatch:', error);
      throw error;
    }
  }

  public async processEntity(entity: Entity): Promise<void> {
    try {

      const triggers = await TriggerModel.find();

      for (const trigger of triggers) {
        const triggerData = trigger.toObject();
        const triggerWithId = { 
          ...triggerData, 
          id: trigger.id 
        } as unknown as Trigger;
        
        if (isGeoRuleTrigger(triggerWithId)) {
          if (await this.checkGeoRule(trigger, entity)) {
            this.emitTriggerMatch(trigger, entity);
          }
        } else if (isLayerTrigger(triggerWithId)) {
          if (await this.checkLayer(trigger, entity)) {
            this.emitTriggerMatch(trigger, entity);
          }
        } else if (isTimeOutTrigger(triggerWithId)) {
          this.setupTimeOutTrigger(trigger, entity);
        }
      }
    } catch (error) {
      console.error('Error processing entity:', error);
      throw error;
    }
  }

  public async createTrigger(triggerData: Trigger): Promise<TriggerDocument> {
    try {
      // Check if trigger has action objects without IDs
      if (!triggerData.actionIds && triggerData.actions && Array.isArray(triggerData.actions)) {
        const actionIds: string[] = [];
        
        // Create new actions from objects
        for (const actionObject of triggerData.actions) {
          const actionId = await this.createActionFromObject(actionObject);
          actionIds.push(actionId);
        }
        
        // Create trigger with the new action IDs
        const trigger = new TriggerModel({
          ...triggerData,
          actionIds,
          actions: undefined, // Remove the action objects
          validity: true
        });
        await trigger.save();

        // Emit WebSocket event for trigger creation
        this.wsService.emit('triggerCreated', {
          ...trigger.toObject(),
          vector: undefined // Don't send vector in WebSocket event
        });

        return trigger;
      }

      // Create trigger without action handling
      const trigger = new TriggerModel({
        ...triggerData,
        validity: true
      });
      await trigger.save();

      // Emit WebSocket event for trigger creation
      this.wsService.emit('triggerCreated', {
        ...trigger.toObject(),
        vector: undefined // Don't send vector in WebSocket event
      });

      return trigger;
    } catch (error) {
      console.error('Error creating trigger:', error);
      throw error;
    }
  }

  public async updateTrigger(triggerData: Trigger): Promise<TriggerDocument> {
    try {
      if (!triggerData._id) {
        throw new Error('Trigger ID is required for update');
      }
      const trigger = await TriggerModel.findByIdAndUpdate(
        triggerData._id,
        triggerData,
        { new: true }
      );
      if (!trigger) {
        throw new Error('Trigger not found');
      }
      return trigger;
    } catch (error) {
      console.error('Error updating trigger:', error);
      throw error;
    }
  }

  public async queryEntities(
    query: Record<string, any>,
    limit: number,
    offset: number
  ): Promise<Entity[]> {
    try {
      const searchResult = await this.qdrantClient.search(process.env.QDRANT_COLLECTION!, {
        vector: query.vector || [],
        limit,
        offset,
        filter: query.filter || {},
      });

      return searchResult
        .filter((result): result is typeof result & { payload: NonNullable<typeof result.payload> } => {
          const position = result.payload?.position as { lat?: number; lng?: number } | undefined;
          return result.payload !== null && 
            result.payload !== undefined &&
            Array.isArray(result.vector) &&
            (!position || (
              typeof position === 'object' &&
              typeof position.lat === 'number' &&
              typeof position.lng === 'number'
            ));
        })
        .map((result): Entity => ({
          _id: result.id as string,
          type: (result.payload.type as string) || 'unknown',
          properties: (result.payload.properties as Record<string, any>) || {},
          position: result.payload.position as { lat: number; lng: number } | undefined,
          vector: result.vector as number[],
          source: 'qdrant'
        }));
    } catch (error) {
      console.error('Error querying entities:', error);
      throw error;
    }
  }

  public async queryTriggers(
    type: string,
    limit: number,
    offset: number
  ): Promise<TriggerDocument[]> {
    try {
      const query: any = {};
      if (type) {
        query.type = type;
      }

      return await TriggerModel.find(query)
        .limit(limit)
        .skip(offset)
        .sort({ createdAt: -1 });
    } catch (error) {
      console.error('Error querying triggers:', error);
      throw error;
    }
  }

  async processEntityForTriggers(entity: Entity): Promise<void> {
    try {
      const triggers = await TriggerModel.find({ validity: true });
      
      for (const trigger of triggers) {
        if (this.isTriggerMatch(trigger, entity)) {
          await this.handleTriggerMatch(trigger, entity);
        }
      }
    } catch (error) {
      console.error('Error processing entity for triggers:', error);
      throw error;
    }
  }

  private isTriggerMatch(trigger: TriggerDocument, entity: Entity): boolean {
    // Check if entity has required properties
    if (!entity || typeof entity !== 'object') {
      return false;
    }

    // Use type assertion to handle optional properties
    const entityWithProperties = entity as Entity & { properties: Record<string, any> };
    const properties = entityWithProperties.properties;

    // Implement your trigger matching logic here
    // This is a placeholder implementation
    return true;
  }

  private async handleTriggerMatch(trigger: TriggerDocument, entity: Entity): Promise<void> {
    try {
      const triggerData = trigger.toObject();
      // Prevent re-processing if already matched
      if (triggerData.status === 'matched') return;
      // Update trigger status
      await this.triggerController.updateTriggerStatus(triggerData._id.toString(), 'matched');
      await this.triggerController.callLLMWithMatch(triggerData, entity);
      // Execute associated action if exists
      if (triggerData.actionIds && Array.isArray(triggerData.actionIds)) {
        for (const actionId of triggerData.actionIds) {
          await this.actionService.executeAction(
            actionId.toString(),
            triggerData._id.toString(),
            entity
          );
        }
      }
    } catch (error) {
      console.error('Error handling trigger match:', error);
      throw error;
    }
  }

  private async handleMatch(trigger: BaseTrigger, entity: Entity): Promise<void> {
    try {
      // Emit WebSocket event for trigger match
      this.wsService.emit('triggerMatched', {
        triggerId: trigger._id,
        entityId: entity._id,
        matchType: trigger.type
      });

      // Execute associated action if exists
      if (trigger.actionIds && Array.isArray(trigger.actionIds)) {
        for (const actionId of trigger.actionIds) {
          await this.actionService.executeAction(
            actionId.toString(),
            trigger._id,
            entity
          );
        }
      }
    } catch (error) {
      console.error('Error handling trigger match:', error);
    }
  }
} 
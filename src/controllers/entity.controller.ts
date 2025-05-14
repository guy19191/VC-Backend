import { Request, Response } from 'express';
import { TriggerService } from '../services/trigger.service';
import { 
  Entity, 
  DatabaseSource, 
  Trigger, 
  TriggerType, 
  GeoPosition,
  TimeOutTrigger,
  GeoRuleTrigger,
  LayerTrigger
} from '../types';
import { EntityModel } from '../models/entity.model';
import { TriggerModel, TriggerDocument } from '../models/trigger.model';
import { QdrantClient } from '@qdrant/js-client-rest';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { GeoRuleTriggerModel, LayerTriggerModel, TimeOutTriggerModel } from '../models/trigger.model';
import { WebSocketService } from '../websocket';
import { generateVectorAndMetadata } from '../utils/openai';

export class EntityController {
  private qdrantClient: QdrantClient;
  private triggerService: TriggerService | undefined;
  private wsService: WebSocketService;

  constructor(triggerService: TriggerService | undefined, wsService: WebSocketService) {
    this.qdrantClient = new QdrantClient({
      url: process.env.QDRANT_URL || 'http://localhost:6333'
    });
    this.triggerService = triggerService;
    this.wsService = wsService;
    this.initializeCollections();
  }

  private async initializeCollections() {
    try {
      // Create entities collection if it doesn't exist
      await this.qdrantClient.createCollection('entities', {
        vectors: {
          size: 1536,
          distance: 'Cosine'
        }
      });
    } catch (error) {
      // Collection might already exist, which is fine
      console.log('Collections already initialized or error:', error);
    }
  }

  public setTriggerService(triggerService: TriggerService) {
    this.triggerService = triggerService;
  }

  private async ensureQdrantCollection(collectionName: string, vectorSize: number) {
    // Check if collection exists, create if not
    const collections = await this.qdrantClient.getCollections();
    const exists = collections.collections.some(c => c.name === collectionName);
    if (!exists) {
      await this.qdrantClient.createCollection(collectionName, {
        vectors: {
          size: vectorSize,
          distance: 'Cosine'
        }
      });
    }
  }

  private async generateVector(
    entity: Omit<Entity, 'id'> | Omit<Trigger, 'id'>,
    updates?: Partial<Entity> | Partial<Trigger>,
    embeddingModel: string = 'text-embedding-ada-002'
  ): Promise<{ vector: number[]; metadata: string }> {
    // Pass both original and updates to the OpenAI utility, with model
    return await generateVectorAndMetadata(entity, updates);
  }

  private async upsertToQdrant(
    id: string,
    entity: Entity,
    vector: number[],
    metadata: string,
    collectionName: string = 'entities'
  ) {
    try {
      const point = {
        id,
        vector,
        payload: entity,
        metadata: metadata
      };
      await this.qdrantClient.upsert(collectionName, {
        points: [point]
      });
    } catch (error) {
      console.error('Error upserting to Qdrant:', error);
      throw new Error('Failed to upsert entity to Qdrant');
    }
  }

  async createEntity(entity: Entity, processEntity: boolean = true, embeddingModel: string = 'text-embedding-ada-002', collectionName: string = 'entities') {
    try {
      const source: DatabaseSource = entity.source || 'both';
      entity._id = uuidv4();
      entity.createdAt = new Date();
      entity.updatedAt = new Date();

      // Generate vector and metadata
      const { vector, metadata } = await this.generateVector(entity, undefined, embeddingModel);
      entity.vector = vector;
      entity.metadata = metadata;

      if (source === 'mongodb' || source === 'both') {
        const mongoEntity = new EntityModel({
          ...entity,
          vector: undefined // Don't store vector in MongoDB
        });
        await mongoEntity.save();
      }

      if (source === 'qdrant' || source === 'both') {
        // Ensure Qdrant collection matches OpenAI vector size
        await this.upsertToQdrant(entity._id, entity, vector, metadata, collectionName);
      }

      if (this.triggerService && processEntity) {
        await this.triggerService.processEntity(entity);
      }

      this.wsService.emit('entityCreated', entity);
      return entity;
    } catch (error) {
      console.error('Error creating entity:', error);
      throw new Error('Failed to create entity');
    }
  }

  async addEntity(req: Request, res: Response) {
    try {
      const entity: any = req.body;
      const createdEntity = await this.createEntity(entity);
      res.status(201).json(createdEntity);

    } catch (error) {
      console.error('Error adding entity:', error);
      res.status(500).json({ error: 'Failed to add entity' });
    }
  }

  async updateEntityLogic(id: string, updates: Partial<Entity>, processEntity: boolean = true) {
    try {
      const source: DatabaseSource = updates.source || 'both';
      let updatedEntity: Entity | undefined;

      // Add updated timestamp
      updates.updatedAt = new Date();

      if (source === 'mongodb' || source === 'both') {
        const mongoEntity = await EntityModel.findByIdAndUpdate(
          id,
          { $set: updates },
          { new: true }
        );

        if (!mongoEntity) {
          throw new Error('Entity not found in MongoDB');
        }

        const data = mongoEntity.toObject();
        updatedEntity = {
          _id: data.id,
          type: data.type,
          properties: data.properties,
          position: data.position,
          vector: data.vector,
          source: data.source,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        };
      }

      if (source === 'qdrant' || source === 'both') {
        // First, retrieve the existing entity from Qdrant
        const existingEntity = await this.qdrantClient.retrieve('entities', {
          ids: [id]
        });

        if (!existingEntity.length) {
          throw new Error('Entity not found in Qdrant');
        }

        // Merge the existing entity with updates
        const currentEntity = existingEntity[0].payload as unknown as Entity;

        // Generate new vector and metadata for the updated entity
        const { vector: newVector, metadata } = await this.generateVector(currentEntity, updates);

        const mergedEntity: Entity = {
          _id: id,
          type: currentEntity.type,
          properties: { ...currentEntity.properties, ...updates.properties },
          position: updates.position || currentEntity.position,
          vector: newVector,
          metadata,
          ...updates
        };

        // Update in Qdrant
        await this.upsertToQdrant(id, mergedEntity, newVector, metadata);

        // Update the updatedEntity with new vector if it exists
        if (updatedEntity) {
          updatedEntity.vector = newVector;
          updatedEntity.metadata = metadata;
        } else {
          updatedEntity = {
            ...mergedEntity,
            vector: newVector,
            metadata,
            source: 'qdrant'
          };
        }
      }

      // Process updated entity for trigger matching
      if (updatedEntity && this.triggerService && processEntity) {
        await this.triggerService.processEntity(updatedEntity);
      }

      // Emit WebSocket event for entity update
      this.wsService.emit('entityUpdated', updatedEntity);
      return updatedEntity;
    } catch (error) {
      console.error('Error updating entity:', error);
      throw new Error('Failed to update entity');
    }
  }

  async updateEntity(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const updates: Partial<Entity> = req.body;
      const updatedEntity = await this.updateEntityLogic(id, updates);
      res.status(200).json(updatedEntity);
    } catch (error) {
      console.error('Error updating entity:', error);
      res.status(500).json({ error: 'Failed to update entity' });
    }
  }

  async queryEntities(req: Request, res: Response) {
    try {
      const query = req.body;
      let results: Entity[] = [];

      if (true) {
        const mongoResults = await EntityModel.find(query);
        results = results.concat(mongoResults.map(doc => ({
          _id: doc.id,
          type: doc.type,
          properties: doc.properties,
          position: doc.position,
          vector: doc.vector,
          source: doc.source
        })));
      }

      if (false) {
        const vectorQuery = query.vector ? 
          (Array.isArray(query.vector) ? 
            query.vector.map((v: any) => Number(v)) : 
            [Number(query.vector)]) : 
          [];
        const qdrantResults = await this.qdrantClient.search('entities', {
          vector: vectorQuery,
          limit: 10
        });
        const qdrantEntities: Entity[] = qdrantResults.map(result => ({
          _id: result.id as string,
          type: result.payload?.type as string,
          properties: result.payload?.properties || {},
          position: result.payload?.position as { lat: number; lng: number } | undefined,
          vector: result.vector as number[],
          source: 'qdrant' as const
        }));
        results = results.concat(qdrantEntities);
      }

      res.json(results);
    } catch (error) {
      console.error('Error querying entities:', error);
      res.status(500).json({ error: 'Failed to query entities' });
    }
  }

  async addTrigger(req: Request, res: Response) {
    try {
      const trigger: any = req.body;
      const source: DatabaseSource = req.body.source || 'both';
      trigger._id = uuidv4();
      
      if (trigger.actions && Array.isArray(trigger.actions)) {
        const actionIds: string[] = [];
        // Create new actions from objects
        for (const actionObject of trigger.actions) {
          const actionId = await this.triggerService?.createActionFromObject(actionObject);
          if (actionId) {
            actionIds.push(actionId);
          }
        }
        trigger.actionIds = actionIds;
      }

      // TODO: Replace with actual LLM API call for vector generation
      const { vector, metadata } = await this.generateVector(trigger);

      if (source === 'mongodb' || source === 'both') {
        const mongoTrigger = new TriggerModel(trigger);
        await mongoTrigger.save();
      }

      if (source === 'qdrant' || source === 'both') {
        await this.qdrantClient.upsert('triggers', {
          points: [{
            id: trigger._id,
            vector: vector,
            payload: trigger,
            metadata: metadata
          }]
        });
      }

      res.status(201).json(trigger);
    } catch (error) {
      console.error('Error adding trigger:', error);
      res.status(500).json({ error: 'Failed to add trigger' });
    }
  }

  async updateTrigger(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const updates: Partial<Entity> = req.body;
      const source: DatabaseSource = req.body.source || 'both';
      let updateTriger: Trigger | undefined;
      let mongoTrigger: TriggerDocument | null |undefined;
      if (source === 'mongodb' || source === 'both') {
        mongoTrigger = await TriggerModel.findByIdAndUpdate(
          id,
          { $set: updates },
          { new: true }
        );
        if (!mongoTrigger) {
          return res.status(404).json({ error: 'Trigger not found in MongoDB' });
        }
      }

      const data = mongoTrigger?.toObject();


      const { vector, metadata } = await this.generateVector(data, updates);

      if (source === 'qdrant' || source === 'both') {
          await this.qdrantClient.upsert('triggers', {
            points: [{
              id,
              vector: vector,
              payload:updates,
              metadata: metadata
            }]
          });
      }

      res.json({ message: 'Trigger updated successfully' });
    } catch (error) {
      console.error('Error updating trigger:', error);
      res.status(500).json({ error: 'Failed to update trigger' });
    }
  }

  async queryTriggers(req: Request, res: Response) {
    try {
      const { source = 'mongodb', ...query } = req.query;
      let results: Trigger[] = [];

      if (source === 'mongodb' || source === 'both') {
        const mongoResults = await TriggerModel.find(query);
        const mongoTriggers: Trigger[] = mongoResults.map(doc => {
          const data = doc.toObject() as TriggerDocument & {
            _id: string;
            timeoutMs?: number;
            position?: GeoPosition;
            layerId?: string;
            query?: Record<string, any>;
          };

          const baseTrigger = {
            _id: data._id,
            type: data.type as TriggerType,
            entityId: data.entityId,
            vector: data.vector,
            validity: data.validity || true,
            status: data.status || 'active',
            source: 'mongodb' as const,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt
          };

          switch (data.type) {
            case 'timeOut':
              if (!data.timeoutMs) {
                throw new Error('timeoutMs is required for timeOut trigger');
              }
              return {
                ...baseTrigger,
                type: 'timeOut',
                timeoutMs: data.timeoutMs
              } as unknown as TimeOutTrigger;
            case 'geoRule':
              if (!data.sourceQuery || !data.targetQuery) {
                throw new Error('sourceQuery and targetQuery are required for geoRule trigger');
              }
              return {
                ...baseTrigger,
                type: 'geoRule',
                sourceQuery: data.sourceQuery,
                targetQuery: data.targetQuery
              } as unknown as GeoRuleTrigger;
            case 'layer':
              if (!data.layerId || !data.query) {
                throw new Error('layerId and query are required for layer trigger');
              }
              return {
                ...baseTrigger,
                type: 'layer',
                query: {
                  layerId: data.layerId,
                  properties: data.query
                }
              } as unknown as LayerTrigger;
            default:
              throw new Error(`Unknown trigger type: ${data.type}`);
          }
        });
        results = results.concat(mongoTriggers);
      }

      if (source === 'qdrant' && query.vector) {
        const vectorQuery = query.vector ? 
          (Array.isArray(query.vector) ? 
            query.vector.map((v: any) => Number(v)) : 
            [Number(query.vector)]) : 
          [];
        const qdrantResults = await this.qdrantClient.search('triggers', {
          vector: vectorQuery,
          limit: 10
        });
        const qdrantTriggers: Trigger[] = qdrantResults.map(result => {
          const payload = result.payload as {
            type: TriggerType;
            entityId: string;
            validity: boolean;
            status: 'active' | 'matched' | 'expired';
            timeoutMs?: number;
            position?: GeoPosition;
            layerId?: string;
            query?: Record<string, any>;
            sourceQuery?: Record<string, any>;
            targetQuery?: Record<string, any>;
            createdAt?: string;
            updatedAt?: string;
          } || {};

          const baseTrigger = {
            _id: result.id,
            type: payload.type as TriggerType,
            entityId: payload.entityId as string,
            vector: result.vector as number[],
            validity: Boolean(payload.validity),
            status: payload.status as 'active' | 'matched' | 'expired',
            source: 'qdrant' as const,
            createdAt: payload.createdAt ? new Date(payload.createdAt) : undefined,
            updatedAt: payload.updatedAt ? new Date(payload.updatedAt) : undefined
          };

          switch (payload.type) {
            case 'timeOut':
              if (!payload.timeoutMs) {
                throw new Error('timeoutMs is required for timeOut trigger');
              }
              return {
                ...baseTrigger,
                type: 'timeOut' as const,
                timeoutMs: payload.timeoutMs
              } as unknown as TimeOutTrigger;
            case 'geoRule':
              if (!payload.sourceQuery || !payload.targetQuery) {
                throw new Error('sourceQuery and targetQuery are required for geoRule trigger');
              }
              return {
                ...baseTrigger,
                type: 'geoRule' as const,
                sourceQuery: payload.sourceQuery,
                targetQuery: payload.targetQuery
              } as unknown as GeoRuleTrigger;
            case 'layer':
              if (!payload.layerId || !payload.query) {
                throw new Error('layerId and query are required for layer trigger');
              }
              return {
                ...baseTrigger,
                type: 'layer' as const,
                layerId: payload.layerId,
                query: payload.query
              } as unknown as LayerTrigger;
            default:
              throw new Error(`Unknown trigger type: ${payload.type}`);
          }
        });
        results = results.concat(qdrantTriggers);
      }

      res.json(results);
    } catch (error) {
      console.error('Error querying triggers:', error);
      res.status(500).json({ error: 'Failed to query triggers' });
    }
  }

  async getAllTriggers(req: Request, res: Response) {
    try {
      const { source = 'mongodb' } = req.query;
      let results: Trigger[] = [];

      if (source === 'mongodb') {
        const mongoResults = await TriggerModel.find();
        results = mongoResults.map(doc => {
          const data = doc.toObject() as TriggerDocument & {
            _id: string;
            timeoutMs?: number;
            position?: GeoPosition;
            layerId?: string;
            query?: Record<string, any>;
          };

          const baseTrigger = {
            _id: data._id,
            type: data.type as TriggerType,
            entityId: data.entityId,
            vector: data.vector,
            validity: data.validity || true,
            status: data.status || 'active',
            source: 'mongodb' as const,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt
          };

          switch (data.type) {
            case 'timeOut':
              if (!data.timeoutMs) {
                throw new Error('timeoutMs is required for timeOut trigger');
              }
              return {
                ...baseTrigger,
                type: 'timeOut',
                timeoutMs: data.timeoutMs
              } as unknown as TimeOutTrigger;
            case 'geoRule':
              if (!data.sourceQuery || !data.targetQuery) {
                throw new Error('sourceQuery and targetQuery are required for geoRule trigger');
              }
              return {
                ...baseTrigger,
                type: 'geoRule',
                sourceQuery: data.sourceQuery,
                targetQuery: data.targetQuery
              } as unknown as GeoRuleTrigger;
            case 'layer':
              if (!data.layerId || !data.query) {
                throw new Error('layerId and query are required for layer trigger');
              }
              return {
                ...baseTrigger,
                type: 'layer',
                query: {
                  layerId: data.layerId,
                  properties: data.query
                }
              } as unknown as LayerTrigger;
            default:
              throw new Error(`Unknown trigger type: ${data.type}`);
          }
        });
      }

      if (source === 'qdrant') {
        const qdrantResults = await this.qdrantClient.scroll('triggers', {
          limit: 100
        });
        results = qdrantResults.points.map(point => {
          const payload = point.payload as {
            type: TriggerType;
            entityId: string;
            validity: boolean;
            status: 'active' | 'matched' | 'expired';
            createdAt?: string;
            updatedAt?: string;
            position?: { lat: number; lng: number };
            radius?: number;
            layerId?: string;
            query?: Record<string, any>;
            sourceQuery?: Record<string, any>;
            targetQuery?: Record<string, any>;
            timeoutMs?: number;
          } || {};

          const baseTrigger = {
            id: point.id as string,
            type: payload.type as TriggerType,
            entityId: payload.entityId as string,
            vector: point.vector as number[],
            validity: Boolean(payload.validity),
            status: payload.status as 'active' | 'matched' | 'expired',
            source: 'qdrant' as const,
            createdAt: payload.createdAt ? new Date(payload.createdAt as string) : undefined,
            updatedAt: payload.updatedAt ? new Date(payload.updatedAt as string) : undefined
          };

          switch (payload.type) {
            case 'timeOut':
              if (!payload.timeoutMs) {
                throw new Error('timeoutMs is required for timeOut trigger');
              }
              return { ...baseTrigger, type: 'timeOut', timeoutMs: payload.timeoutMs, _id: point.id as string } as TimeOutTrigger;
            case 'geoRule':
              if (!payload.sourceQuery || !payload.targetQuery) {
                throw new Error('sourceQuery and targetQuery are required for geoRule trigger');
              }
              return { 
                ...baseTrigger, 
                type: 'geoRule', 
                sourceQuery: payload.sourceQuery,
                targetQuery: payload.targetQuery,
                _id: point.id as string
              } as GeoRuleTrigger;
            case 'layer':
              if (!payload.layerId || !payload.query) {
                throw new Error('layerId and query are required for layer trigger');
              }
              return { 
                ...baseTrigger, 
                type: 'layer', 
                query: {
                  layerId: payload.layerId,
                  properties: payload.query,
                  _id: point.id as string
                }
              } as unknown as LayerTrigger;
            default:
              throw new Error(`Unknown trigger type: ${payload.type}`);
          }
        });
      }

      res.json(results);
    } catch (error) {
      console.error('Error getting all triggers:', error);
      res.status(500).json({ error: 'Failed to get triggers' });
    }
  }

  async updateEntityByQuery(query: any, updates: Partial<Entity>, processEntity: boolean = true) {
    try {
      const source: DatabaseSource = updates.source || 'both';
      let updatedEntities: Entity[] = [];

      // Add updated timestamp
      updates.updatedAt = new Date();

      if (source === 'mongodb' || source === 'both') {
        const mongoEntities = await EntityModel.find(query);
        
        if (!mongoEntities.length) {
          throw new Error('No entities found matching the query in MongoDB');
        }

        for (const mongoEntity of mongoEntities) {
          const updatedMongoEntity = await EntityModel.findByIdAndUpdate(
            mongoEntity._id,
            { $set: updates },
            { new: true }
          );

          if (updatedMongoEntity) {
            const data = updatedMongoEntity.toObject();
            updatedEntities.push({
              _id: data.id,
              type: data.type,
              properties: data.properties,
              position: data.position,
              vector: data.vector,
              source: data.source,
              createdAt: data.createdAt,
              updatedAt: data.updatedAt
            });
          }
        }
      }

      if (source === 'qdrant' || source === 'both') {
        // Search for entities in Qdrant matching the query
        const searchResults = await this.qdrantClient.search('entities', {
          vector: await this.generateVector(query).then(result => result.vector),
          limit: 100 // Adjust limit as needed
        });

        if (!searchResults.length) {
          throw new Error('No entities found matching the query in Qdrant');
        }

        for (const result of searchResults) {
          const currentEntity = result.payload as unknown as Entity;
          
          // Generate new vector and metadata for the updated entity
          const { vector: newVector, metadata } = await this.generateVector(currentEntity, updates);

          const mergedEntity: Entity = {
            _id: currentEntity._id,
            type: currentEntity.type,
            properties: { ...currentEntity.properties, ...updates.properties },
            position: updates.position || currentEntity.position,
            vector: newVector,
             metadata,
            ...updates
          };

          // Update in Qdrant
          await this.upsertToQdrant(currentEntity._id, mergedEntity, newVector, metadata);

          updatedEntities.push({
            ...mergedEntity,
            vector: newVector,
            metadata,
            source: 'qdrant'
          });
        }
      }

      // Process updated entities for trigger matching
      if (updatedEntities.length > 0 && this.triggerService && processEntity) {
        for (const entity of updatedEntities) {
          await this.triggerService.processEntity(entity);
        }
      }

      // Emit WebSocket event for entity updates
      this.wsService.emit('entitiesUpdated', updatedEntities);

      return updatedEntities;
    } catch (error) {
      console.error('Error updating entities by query:', error);
      throw new Error('Failed to update entities by query');
    }
  }

  async updateEntityByQueryEndpoint(req: Request, res: Response) {
    try {
      const { query, updates } = req.body;
      const updatedEntities = await this.updateEntityByQuery(query, updates);
      res.status(200).json(updatedEntities);
    } catch (error) {
      console.error('Error updating entities by query:', error);
      res.status(500).json({ error: 'Failed to update entities by query' });
    }
  }
} 
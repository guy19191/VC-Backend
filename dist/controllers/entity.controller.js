"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityController = void 0;
const entity_model_1 = require("../models/entity.model");
const trigger_model_1 = require("../models/trigger.model");
const js_client_rest_1 = require("@qdrant/js-client-rest");
const uuid_1 = require("uuid");
class EntityController {
    constructor(triggerService, wsService) {
        this.qdrantClient = new js_client_rest_1.QdrantClient({
            url: process.env.QDRANT_URL || 'http://localhost:6333'
        });
        this.triggerService = triggerService;
        this.wsService = wsService;
        this.initializeCollections();
    }
    async initializeCollections() {
        try {
            // Create entities collection if it doesn't exist
            await this.qdrantClient.createCollection('entities', {
                vectors: {
                    size: 128,
                    distance: 'Cosine'
                }
            });
        }
        catch (error) {
            // Collection might already exist, which is fine
            console.log('Collections already initialized or error:', error);
        }
    }
    setTriggerService(triggerService) {
        this.triggerService = triggerService;
    }
    async upsertToQdrant(id, entity, vector, metadata) {
        try {
            const point = {
                id,
                vector,
                payload: entity,
                metadata: metadata
            };
            await this.qdrantClient.upsert('entities', {
                points: [point]
            });
        }
        catch (error) {
            console.error('Error upserting to Qdrant:', error);
            throw new Error('Failed to upsert entity to Qdrant');
        }
    }
    async createEntity(entity, processEntity = true) {
        try {
            const source = entity.source || 'both';
            // Add id and timestamps to the entity
            entity._id = (0, uuid_1.v4)();
            entity.createdAt = new Date();
            entity.updatedAt = new Date();
            // Generate vector and metadata
            const { vector, metadata } = await this.generateVector(entity);
            entity.vector = vector;
            entity.metadata = metadata;
            if (source === 'mongodb' || source === 'both') {
                const mongoEntity = new entity_model_1.EntityModel({
                    ...entity,
                    vector: undefined // Don't store vector in MongoDB
                });
                await mongoEntity.save();
            }
            if (source === 'qdrant' || source === 'both') {
                await this.upsertToQdrant(entity._id, entity, vector, metadata);
            }
            // Process entity for trigger matching
            if (this.triggerService && processEntity) {
                await this.triggerService.processEntity(entity);
            }
            // Emit WebSocket event for entity creation
            this.wsService.emit('entityCreated', entity);
            return entity;
        }
        catch (error) {
            console.error('Error creating entity:', error);
            throw new Error('Failed to create entity');
        }
    }
    async addEntity(req, res) {
        try {
            const entity = req.body;
            const createdEntity = await this.createEntity(entity);
            res.status(201).json(createdEntity);
        }
        catch (error) {
            console.error('Error adding entity:', error);
            res.status(500).json({ error: 'Failed to add entity' });
        }
    }
    async updateEntityLogic(id, updates, processEntity = true) {
        try {
            const source = updates.source || 'both';
            let updatedEntity;
            // Add updated timestamp
            updates.updatedAt = new Date();
            if (source === 'mongodb' || source === 'both') {
                const mongoEntity = await entity_model_1.EntityModel.findByIdAndUpdate(id, { $set: updates }, { new: true });
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
                const currentEntity = existingEntity[0].payload;
                // Generate new vector and metadata for the updated entity
                const { vector: newVector, metadata } = await this.generateVector(currentEntity, updates);
                const mergedEntity = {
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
                }
                else {
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
        }
        catch (error) {
            console.error('Error updating entity:', error);
            throw new Error('Failed to update entity');
        }
    }
    async updateEntity(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body;
            const updatedEntity = await this.updateEntityLogic(id, updates);
            res.status(200).json(updatedEntity);
        }
        catch (error) {
            console.error('Error updating entity:', error);
            res.status(500).json({ error: 'Failed to update entity' });
        }
    }
    async queryEntities(req, res) {
        try {
            const query = req.body;
            let results = [];
            if (true) {
                const mongoResults = await entity_model_1.EntityModel.find(query);
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
                        query.vector.map((v) => Number(v)) :
                        [Number(query.vector)]) :
                    [];
                const qdrantResults = await this.qdrantClient.search('entities', {
                    vector: vectorQuery,
                    limit: 10
                });
                const qdrantEntities = qdrantResults.map(result => ({
                    _id: result.id,
                    type: result.payload?.type,
                    properties: result.payload?.properties || {},
                    position: result.payload?.position,
                    vector: result.vector,
                    source: 'qdrant'
                }));
                results = results.concat(qdrantEntities);
            }
            res.json(results);
        }
        catch (error) {
            console.error('Error querying entities:', error);
            res.status(500).json({ error: 'Failed to query entities' });
        }
    }
    async addTrigger(req, res) {
        try {
            const trigger = req.body;
            const source = req.body.source || 'both';
            trigger._id = (0, uuid_1.v4)();
            if (trigger.actions && Array.isArray(trigger.actions)) {
                const actionIds = [];
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
                const mongoTrigger = new trigger_model_1.TriggerModel(trigger);
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
        }
        catch (error) {
            console.error('Error adding trigger:', error);
            res.status(500).json({ error: 'Failed to add trigger' });
        }
    }
    async updateTrigger(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body;
            const source = req.body.source || 'both';
            let updateTriger;
            let mongoTrigger;
            if (source === 'mongodb' || source === 'both') {
                mongoTrigger = await trigger_model_1.TriggerModel.findByIdAndUpdate(id, { $set: updates }, { new: true });
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
                            payload: updates,
                            metadata: metadata
                        }]
                });
            }
            res.json({ message: 'Trigger updated successfully' });
        }
        catch (error) {
            console.error('Error updating trigger:', error);
            res.status(500).json({ error: 'Failed to update trigger' });
        }
    }
    async queryTriggers(req, res) {
        try {
            const { source = 'mongodb', ...query } = req.query;
            let results = [];
            if (source === 'mongodb' || source === 'both') {
                const mongoResults = await trigger_model_1.TriggerModel.find(query);
                const mongoTriggers = mongoResults.map(doc => {
                    const data = doc.toObject();
                    const baseTrigger = {
                        _id: data._id,
                        type: data.type,
                        entityId: data.entityId,
                        vector: data.vector,
                        validity: data.validity || true,
                        status: data.status || 'active',
                        source: 'mongodb',
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
                            };
                        case 'geoRule':
                            if (!data.sourceQuery || !data.targetQuery) {
                                throw new Error('sourceQuery and targetQuery are required for geoRule trigger');
                            }
                            return {
                                ...baseTrigger,
                                type: 'geoRule',
                                sourceQuery: data.sourceQuery,
                                targetQuery: data.targetQuery
                            };
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
                            };
                        default:
                            throw new Error(`Unknown trigger type: ${data.type}`);
                    }
                });
                results = results.concat(mongoTriggers);
            }
            if (source === 'qdrant' && query.vector) {
                const vectorQuery = query.vector ?
                    (Array.isArray(query.vector) ?
                        query.vector.map((v) => Number(v)) :
                        [Number(query.vector)]) :
                    [];
                const qdrantResults = await this.qdrantClient.search('triggers', {
                    vector: vectorQuery,
                    limit: 10
                });
                const qdrantTriggers = qdrantResults.map(result => {
                    const payload = result.payload || {};
                    const baseTrigger = {
                        _id: result.id,
                        type: payload.type,
                        entityId: payload.entityId,
                        vector: result.vector,
                        validity: Boolean(payload.validity),
                        status: payload.status,
                        source: 'qdrant',
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
                                type: 'timeOut',
                                timeoutMs: payload.timeoutMs
                            };
                        case 'geoRule':
                            if (!payload.sourceQuery || !payload.targetQuery) {
                                throw new Error('sourceQuery and targetQuery are required for geoRule trigger');
                            }
                            return {
                                ...baseTrigger,
                                type: 'geoRule',
                                sourceQuery: payload.sourceQuery,
                                targetQuery: payload.targetQuery
                            };
                        case 'layer':
                            if (!payload.layerId || !payload.query) {
                                throw new Error('layerId and query are required for layer trigger');
                            }
                            return {
                                ...baseTrigger,
                                type: 'layer',
                                layerId: payload.layerId,
                                query: payload.query
                            };
                        default:
                            throw new Error(`Unknown trigger type: ${payload.type}`);
                    }
                });
                results = results.concat(qdrantTriggers);
            }
            res.json(results);
        }
        catch (error) {
            console.error('Error querying triggers:', error);
            res.status(500).json({ error: 'Failed to query triggers' });
        }
    }
    async getAllTriggers(req, res) {
        try {
            const { source = 'mongodb' } = req.query;
            let results = [];
            if (source === 'mongodb') {
                const mongoResults = await trigger_model_1.TriggerModel.find();
                results = mongoResults.map(doc => {
                    const data = doc.toObject();
                    const baseTrigger = {
                        _id: data._id,
                        type: data.type,
                        entityId: data.entityId,
                        vector: data.vector,
                        validity: data.validity || true,
                        status: data.status || 'active',
                        source: 'mongodb',
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
                            };
                        case 'geoRule':
                            if (!data.sourceQuery || !data.targetQuery) {
                                throw new Error('sourceQuery and targetQuery are required for geoRule trigger');
                            }
                            return {
                                ...baseTrigger,
                                type: 'geoRule',
                                sourceQuery: data.sourceQuery,
                                targetQuery: data.targetQuery
                            };
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
                            };
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
                    const payload = point.payload || {};
                    const baseTrigger = {
                        id: point.id,
                        type: payload.type,
                        entityId: payload.entityId,
                        vector: point.vector,
                        validity: Boolean(payload.validity),
                        status: payload.status,
                        source: 'qdrant',
                        createdAt: payload.createdAt ? new Date(payload.createdAt) : undefined,
                        updatedAt: payload.updatedAt ? new Date(payload.updatedAt) : undefined
                    };
                    switch (payload.type) {
                        case 'timeOut':
                            if (!payload.timeoutMs) {
                                throw new Error('timeoutMs is required for timeOut trigger');
                            }
                            return { ...baseTrigger, type: 'timeOut', timeoutMs: payload.timeoutMs, _id: point.id };
                        case 'geoRule':
                            if (!payload.sourceQuery || !payload.targetQuery) {
                                throw new Error('sourceQuery and targetQuery are required for geoRule trigger');
                            }
                            return {
                                ...baseTrigger,
                                type: 'geoRule',
                                sourceQuery: payload.sourceQuery,
                                targetQuery: payload.targetQuery,
                                _id: point.id
                            };
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
                                    _id: point.id
                                }
                            };
                        default:
                            throw new Error(`Unknown trigger type: ${payload.type}`);
                    }
                });
            }
            res.json(results);
        }
        catch (error) {
            console.error('Error getting all triggers:', error);
            res.status(500).json({ error: 'Failed to get triggers' });
        }
    }
    async updateEntityByQuery(query, updates, processEntity = true) {
        try {
            const source = updates.source || 'both';
            let updatedEntities = [];
            // Add updated timestamp
            updates.updatedAt = new Date();
            if (source === 'mongodb' || source === 'both') {
                const mongoEntities = await entity_model_1.EntityModel.find(query);
                if (!mongoEntities.length) {
                    throw new Error('No entities found matching the query in MongoDB');
                }
                for (const mongoEntity of mongoEntities) {
                    const updatedMongoEntity = await entity_model_1.EntityModel.findByIdAndUpdate(mongoEntity._id, { $set: updates }, { new: true });
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
                    const currentEntity = result.payload;
                    // Generate new vector and metadata for the updated entity
                    const { vector: newVector, metadata } = await this.generateVector(currentEntity, updates);
                    const mergedEntity = {
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
        }
        catch (error) {
            console.error('Error updating entities by query:', error);
            throw new Error('Failed to update entities by query');
        }
    }
    async updateEntityByQueryEndpoint(req, res) {
        try {
            const { query, updates } = req.body;
            const updatedEntities = await this.updateEntityByQuery(query, updates);
            res.status(200).json(updatedEntities);
        }
        catch (error) {
            console.error('Error updating entities by query:', error);
            res.status(500).json({ error: 'Failed to update entities by query' });
        }
    }
    // TODO: Replace with actual LLM API integration
    async generateVector(entity, updates) {
        // Merge entity with updates if provided
        const dataToVectorize = updates ? { ...entity, ...updates } : entity;
        // Placeholder for LLM vector generation and metadata
        // This will be replaced with actual API call to LLM service
        const vector = Array(128).fill(0).map(() => Math.random());
        // Normalize the vector
        const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
        const normalizedVector = vector.map(val => val / magnitude);
        // Generate metadata text from entity data
        const metadata = `Entity type: ${dataToVectorize.type}, Properties: ${JSON.stringify(dataToVectorize.properties || {})}, Position: ${JSON.stringify(dataToVectorize.position || {})}`;
        return {
            vector: normalizedVector,
            metadata
        };
    }
}
exports.EntityController = EntityController;

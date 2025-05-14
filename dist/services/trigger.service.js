"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TriggerService = void 0;
const js_client_rest_1 = require("@qdrant/js-client-rest");
const trigger_model_1 = require("../models/trigger.model");
const types_1 = require("../types");
const geo_1 = require("../utils/geo");
const axios_1 = __importDefault(require("axios"));
const action_model_1 = require("../models/action.model");
const uuid_1 = require("uuid");
const entity_model_1 = require("../models/entity.model");
class TriggerService {
    constructor(wsService, geoThresholdMeters, vectorDimension = 128, agentModelUrl = process.env.AGENT_MODEL_URL || 'http://localhost:3001/api/agent', triggerController, actionService) {
        this.wsService = wsService;
        this.geoThresholdMeters = geoThresholdMeters;
        this.vectorDimension = vectorDimension;
        this.agentModelUrl = agentModelUrl;
        this.qdrantClient = new js_client_rest_1.QdrantClient({ url: process.env.QDRANT_URL });
        this.triggerController = triggerController;
        this.actionService = actionService;
        this.initializeQdrantCollections();
    }
    async initializeQdrantCollections() {
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
        }
        catch (error) {
            console.error('Error initializing Qdrant collections:', error);
        }
    }
    async checkGeoRule(trigger, entity) {
        const triggerData = trigger.toObject();
        if (!(0, types_1.isGeoRuleTrigger)(triggerData))
            return false;
        // Check if entity matches the target query
        const targetEntity = await entity_model_1.EntityModel.findOne({
            _id: entity._id,
            ...triggerData.targetQuery
        });
        if (!targetEntity)
            return false;
        // Get the first entity that matches the source query
        const sourceEntity = await entity_model_1.EntityModel.findOne(triggerData.sourceQuery);
        if (!sourceEntity)
            return false;
        if (!sourceEntity.position || !entity.position)
            return false;
        const sourceEntityData = sourceEntity.toObject();
        return (0, geo_1.isWithinDistance)(sourceEntityData.position, entity.position, this.geoThresholdMeters, entity.type);
    }
    async checkLayer(trigger, entity) {
        const triggerData = trigger.toObject();
        if (!(0, types_1.isLayerTrigger)(triggerData))
            return false;
        try {
            const targetEntity = await entity_model_1.EntityModel.findOne({
                _id: entity._id,
                ...triggerData.query
            });
            return targetEntity ? true : false;
        }
        catch (error) {
            console.error('Error checking layer trigger:', error);
            return false;
        }
    }
    setupTimeOutTrigger(trigger, entity) {
        const triggerData = trigger.toObject();
        if (!(0, types_1.isTimeOutTrigger)(triggerData))
            return;
        setTimeout(() => {
            this.emitTriggerMatch(trigger, entity);
        }, triggerData.timeoutMs);
    }
    async callAgentModel(trigger, entity) {
        try {
            const response = await axios_1.default.post(this.agentModelUrl, {
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
            return response.data;
        }
        catch (error) {
            console.error('Error calling agent model:', error);
            throw error;
        }
    }
    async createActionFromObject(actionObject) {
        try {
            const action = new action_model_1.ActionModel({
                _id: (0, uuid_1.v4)(),
                type: actionObject.type,
                payload: actionObject.payload,
                query: actionObject.query,
                id: actionObject.id
            });
            await action.save();
            return action._id;
        }
        catch (error) {
            console.error('Error creating action from object:', error);
            throw error;
        }
    }
    async emitTriggerMatch(trigger, entity) {
        try {
            const triggerData = trigger.toObject();
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
            // Check if trigger has action objects without IDs
            if (!triggerData.actionIds && triggerData.actions && Array.isArray(triggerData.actions)) {
                const actionIds = [];
                // Create new actions from objects
                for (const actionObject of triggerData.actions) {
                    const actionId = await this.createActionFromObject(actionObject);
                    actionIds.push(actionId);
                }
                // Update trigger with new action IDs
                const updateResult = await trigger_model_1.TriggerModel.updateOne({ _id: triggerData._id }, {
                    $set: {
                        actionIds,
                        actions: undefined // Remove the action objects
                    }
                });
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
                    await this.actionService.executeAction(actionId.toString(), triggerData._id.toString(), entity);
                }
            }
        }
        catch (error) {
            console.error('Error in emitTriggerMatch:', error);
            throw error;
        }
    }
    async processEntity(entity) {
        try {
            const triggers = await trigger_model_1.TriggerModel.find();
            for (const trigger of triggers) {
                const triggerData = trigger.toObject();
                const triggerWithId = {
                    ...triggerData,
                    id: trigger.id
                };
                if ((0, types_1.isGeoRuleTrigger)(triggerWithId)) {
                    if (await this.checkGeoRule(trigger, entity)) {
                        this.emitTriggerMatch(trigger, entity);
                    }
                }
                else if ((0, types_1.isLayerTrigger)(triggerWithId)) {
                    if (await this.checkLayer(trigger, entity)) {
                        this.emitTriggerMatch(trigger, entity);
                    }
                }
                else if ((0, types_1.isTimeOutTrigger)(triggerWithId)) {
                    this.setupTimeOutTrigger(trigger, entity);
                }
            }
        }
        catch (error) {
            console.error('Error processing entity:', error);
            throw error;
        }
    }
    async createTrigger(triggerData) {
        try {
            // Check if trigger has action objects without IDs
            if (!triggerData.actionIds && triggerData.actions && Array.isArray(triggerData.actions)) {
                const actionIds = [];
                // Create new actions from objects
                for (const actionObject of triggerData.actions) {
                    const actionId = await this.createActionFromObject(actionObject);
                    actionIds.push(actionId);
                }
                // Create trigger with the new action IDs
                const trigger = new trigger_model_1.TriggerModel({
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
            const trigger = new trigger_model_1.TriggerModel({
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
        }
        catch (error) {
            console.error('Error creating trigger:', error);
            throw error;
        }
    }
    async updateTrigger(triggerData) {
        try {
            if (!triggerData._id) {
                throw new Error('Trigger ID is required for update');
            }
            const trigger = await trigger_model_1.TriggerModel.findByIdAndUpdate(triggerData._id, triggerData, { new: true });
            if (!trigger) {
                throw new Error('Trigger not found');
            }
            return trigger;
        }
        catch (error) {
            console.error('Error updating trigger:', error);
            throw error;
        }
    }
    async queryEntities(query, limit, offset) {
        try {
            const searchResult = await this.qdrantClient.search(process.env.QDRANT_COLLECTION, {
                vector: query.vector || [],
                limit,
                offset,
                filter: query.filter || {},
            });
            return searchResult
                .filter((result) => {
                const position = result.payload?.position;
                return result.payload !== null &&
                    result.payload !== undefined &&
                    Array.isArray(result.vector) &&
                    (!position || (typeof position === 'object' &&
                        typeof position.lat === 'number' &&
                        typeof position.lng === 'number'));
            })
                .map((result) => ({
                _id: result.id,
                type: result.payload.type || 'unknown',
                properties: result.payload.properties || {},
                position: result.payload.position,
                vector: result.vector,
                source: 'qdrant'
            }));
        }
        catch (error) {
            console.error('Error querying entities:', error);
            throw error;
        }
    }
    async queryTriggers(type, limit, offset) {
        try {
            const query = {};
            if (type) {
                query.type = type;
            }
            return await trigger_model_1.TriggerModel.find(query)
                .limit(limit)
                .skip(offset)
                .sort({ createdAt: -1 });
        }
        catch (error) {
            console.error('Error querying triggers:', error);
            throw error;
        }
    }
    async processEntityForTriggers(entity) {
        try {
            const triggers = await trigger_model_1.TriggerModel.find({ validity: true });
            for (const trigger of triggers) {
                if (this.isTriggerMatch(trigger, entity)) {
                    await this.handleTriggerMatch(trigger, entity);
                }
            }
        }
        catch (error) {
            console.error('Error processing entity for triggers:', error);
            throw error;
        }
    }
    isTriggerMatch(trigger, entity) {
        // Check if entity has required properties
        if (!entity || typeof entity !== 'object') {
            return false;
        }
        // Use type assertion to handle optional properties
        const entityWithProperties = entity;
        const properties = entityWithProperties.properties;
        // Implement your trigger matching logic here
        // This is a placeholder implementation
        return true;
    }
    async handleTriggerMatch(trigger, entity) {
        try {
            const triggerData = trigger.toObject();
            // Update trigger status
            await this.triggerController.updateTriggerStatus(triggerData._id.toString(), 'matched');
            // Execute associated action if exists
            if (triggerData.actionIds && Array.isArray(triggerData.actionIds)) {
                for (const actionId of triggerData.actionIds) {
                    await this.actionService.executeAction(actionId.toString(), triggerData._id.toString(), entity);
                }
            }
        }
        catch (error) {
            console.error('Error handling trigger match:', error);
            throw error;
        }
    }
    async handleMatch(trigger, entity) {
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
                    await this.actionService.executeAction(actionId.toString(), trigger._id, entity);
                }
            }
        }
        catch (error) {
            console.error('Error handling trigger match:', error);
        }
    }
}
exports.TriggerService = TriggerService;

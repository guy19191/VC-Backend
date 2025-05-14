"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TriggerController = void 0;
const langgraph_sdk_1 = require("@langchain/langgraph-sdk");
const trigger_model_1 = require("../models/trigger.model");
const js_client_rest_1 = require("@qdrant/js-client-rest");
const uuid_1 = require("uuid");
class TriggerController {
    constructor(wsService) {
        this.qdrantClient = new js_client_rest_1.QdrantClient({
            url: process.env.QDRANT_URL || 'http://localhost:6333'
        });
        this.wsService = wsService;
        this.llmClient = new langgraph_sdk_1.Client({ apiUrl: process.env.LANGCHAIN_ENDPOINT });
    }
    async addTrigger(req, res) {
        try {
            const trigger = req.body;
            const source = req.body.source || 'both';
            trigger._id = (0, uuid_1.v4)();
            trigger.validity = true;
            trigger.status = 'active';
            trigger.createdAt = new Date();
            trigger.updatedAt = new Date();
            // Generate vector and metadata
            const { vector, metadata } = await this.generateVector(trigger);
            trigger.vector = vector;
            trigger.metadata = metadata;
            if (source === 'mongodb' || source === 'both') {
                const mongoTrigger = new trigger_model_1.TriggerModel({
                    ...trigger,
                    vector: undefined // Don't store vector in MongoDB
                });
                await mongoTrigger.save();
            }
            if (source === 'qdrant' || source === 'both') {
                await this.qdrantClient.upsert('triggers', {
                    points: [{
                            id: trigger._id,
                            vector: trigger.vector,
                            payload: {
                                ...trigger,
                                vector: undefined // Don't store vector in payload
                            }
                        }]
                });
            }
            // Emit WebSocket event for trigger creation
            this.wsService.emit('triggerCreated', {
                ...trigger,
                vector: undefined // Don't send vector in WebSocket event
            });
            res.status(201).json({
                ...trigger,
                vector: undefined // Don't send vector in response
            });
        }
        catch (error) {
            console.error('Error creating trigger:', error);
            res.status(500).json({ error: 'Failed to create trigger' });
        }
    }
    async updateTrigger(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body;
            const source = req.body.source || 'both';
            let updatedTrigger;
            // Add updated timestamp
            updates.updatedAt = new Date();
            if (source === 'mongodb' || source === 'both') {
                const mongoTrigger = await trigger_model_1.TriggerModel.findByIdAndUpdate(id, {
                    $set: {
                        ...updates,
                        vector: undefined // Don't store vector in MongoDB
                    }
                }, { new: true });
                if (!mongoTrigger) {
                    return res.status(404).json({ error: 'Trigger not found in MongoDB' });
                }
                const data = mongoTrigger.toObject();
                updatedTrigger = {
                    _id: data._id,
                    type: data.type,
                    entityId: data.entityId,
                    vector: data.vector,
                    validity: data.validity,
                    source: data.source,
                    metadata: data.metadata,
                    createdAt: data.createdAt,
                    updatedAt: data.updatedAt,
                    ...(data.type === 'geoRule' && { position: data.position }),
                    ...(data.type === 'layer' && { query: data.query }),
                    ...(data.type === 'timeOut' && { timeoutMs: data.timeoutMs })
                };
            }
            if (source === 'qdrant' || source === 'both') {
                // First, retrieve the existing trigger from Qdrant
                const existingTrigger = await this.qdrantClient.retrieve('triggers', {
                    ids: [id]
                });
                if (!existingTrigger || existingTrigger.length === 0) {
                    return res.status(404).json({ error: 'Trigger not found in Qdrant' });
                }
                // Merge the existing trigger with updates
                const currentTrigger = existingTrigger[0].payload;
                // Generate new vector and metadata for the updated trigger
                const { vector: newVector, metadata } = await this.generateVector(currentTrigger, updates);
                const mergedTrigger = {
                    ...currentTrigger,
                    ...updates,
                    vector: newVector,
                    metadata
                };
                // Update in Qdrant with new vector and merged data
                await this.qdrantClient.upsert('triggers', {
                    points: [{
                            id,
                            vector: newVector,
                            payload: mergedTrigger,
                            metadata: metadata
                        }]
                });
                // Update the updatedTrigger with new vector if it exists
                if (updatedTrigger) {
                    updatedTrigger.vector = newVector;
                    updatedTrigger.metadata = metadata;
                }
                else {
                    updatedTrigger = {
                        ...mergedTrigger,
                        vector: newVector,
                        metadata,
                        source: 'qdrant'
                    };
                }
            }
            // Emit WebSocket event for trigger update
            this.wsService.emit('triggerUpdated', { updatedTrigger });
            res.json({
                message: 'Trigger updated successfully',
                trigger: {
                    ...updatedTrigger,
                    vector: undefined // Don't send vector in response
                }
            });
        }
        catch (error) {
            console.error('Error updating trigger:', error);
            res.status(500).json({ error: 'Failed to update trigger' });
        }
    }
    async updateTriggerStatus(id, status) {
        try {
            // Map status to valid Trigger.status values
            let triggerStatus = 'inactive';
            if (status === 'active') {
                triggerStatus = 'active';
            }
            // Add a separate matchStatus property for business logic
            const updates = {
                status: triggerStatus,
                validity: status === 'active',
                updatedAt: new Date(),
                matchStatus: status // keep track of the match status separately
            };
            // Update in MongoDB
            await trigger_model_1.TriggerModel.findByIdAndUpdate(id, { $set: updates }, { new: true });
            // Update in Qdrant
            const existingTrigger = await this.qdrantClient.retrieve('triggers', {
                ids: [id]
            });
            if (existingTrigger && existingTrigger.length > 0) {
                const currentTrigger = existingTrigger[0].payload;
                const updatedTrigger = {
                    ...currentTrigger,
                    ...updates
                };
                const { vector, metadata } = await this.generateVector(currentTrigger, updates);
                await this.qdrantClient.upsert('triggers', {
                    points: [{
                            id,
                            vector: vector,
                            payload: updatedTrigger,
                            metadata: metadata
                        }]
                });
                // Emit WebSocket event for trigger status update
                this.wsService.emit('triggerStatusUpdated', {
                    id,
                    status,
                    validity: updates.validity
                });
                return updatedTrigger;
            }
        }
        catch (error) {
            console.error('Error updating trigger status:', error);
            throw error;
        }
    }
    // TODO: Replace with actual LLM API integration
    async generateVector(trigger, updates) {
        // Merge trigger with updates if provided
        const dataToVectorize = updates ? { ...trigger, ...updates } : trigger;
        // Placeholder for LLM vector generation and metadata
        // This will be replaced with actual API call to LLM service
        const vector = Array(128).fill(0).map(() => Math.random());
        // Normalize the vector
        const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
        const normalizedVector = vector.map(val => val / magnitude);
        // Generate metadata text based on trigger type
        let metadata = `Trigger type: ${dataToVectorize.type}, Entity ID: ${dataToVectorize.entityId}`;
        switch (dataToVectorize.type) {
            case 'geoRule':
                metadata += `, Position: ${JSON.stringify(dataToVectorize.position)}`;
                metadata += `, Source Query: ${JSON.stringify(dataToVectorize.sourceQuery)}`;
                metadata += `, Target Query: ${JSON.stringify(dataToVectorize.targetQuery)}`;
                break;
            case 'layer':
                metadata += `, Query: ${JSON.stringify(dataToVectorize.query)}`;
                break;
            case 'timeOut':
                metadata += `, Timeout: ${dataToVectorize.timeoutMs}ms`;
                break;
        }
        return {
            vector: normalizedVector,
            metadata
        };
    }
    /**
     * Send the matched trigger and entity to the LLM API
     */
    async callLLMWithMatch(trigger, entity) {
        try {
            // List all assistants
            const assistants = await this.llmClient.assistants.search({
                metadata: null,
                offset: 0,
                limit: 10,
            });
            const agent = assistants.find((a) => a.graph_id === 'action');
            // We auto-create an assistant for each graph you register in config.
            const thread = await this.llmClient.threads.create();
            // Start a streaming run
            const messages = [{ trigger: trigger, entity: entity }];
            const streamResponse = this.llmClient.runs.stream(thread["thread_id"], agent["assistant_id"], {
                input: { messages },
            });
            this.wsService.emit('chatResponse', streamResponse);
        }
        catch (error) {
            console.error('Error calling LLM API:', error);
            // Optionally rethrow or handle error
            return null;
        }
    }
    async handleTriggerMatch(triggerId, entity) {
        try {
            // Update trigger status to matched
            const updatedTrigger = await this.updateTriggerStatus(triggerId, 'matched');
            if (!updatedTrigger) {
                throw new Error('Failed to update trigger status or trigger not found');
            }
            // Emit WebSocket event for trigger match
            this.wsService.emit('triggerMatch', {
                triggerId,
                status: 'matched',
                entity: {
                    ...entity,
                    vector: undefined // Don't send vector in WebSocket event
                },
                trigger: {
                    ...updatedTrigger,
                    vector: undefined // Don't send vector in WebSocket event
                }
            });
            // Send to LLM API
            await this.callLLMWithMatch(updatedTrigger, entity);
            return updatedTrigger;
        }
        catch (error) {
            console.error('Error handling trigger match:', error);
            throw error;
        }
    }
}
exports.TriggerController = TriggerController;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionController = void 0;
const action_model_1 = require("../models/action.model");
const uuid_1 = require("uuid");
class ActionController {
    async addAction(req, res) {
        try {
            const action = {
                _id: (0, uuid_1.v4)(),
                type: req.body.type,
                payload: req.body.payload,
                query: req.body.query,
                id: req.body.id,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            const newAction = new action_model_1.ActionModel(action);
            await newAction.save();
            res.status(201).json(newAction);
        }
        catch (error) {
            res.status(500).json({ error: 'Failed to create action' });
        }
    }
    async updateAction(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body;
            const updatedAction = await action_model_1.ActionModel.findByIdAndUpdate(id, { $set: { ...updates, updatedAt: new Date() } }, { new: true });
            if (!updatedAction) {
                return res.status(404).json({ error: 'Action not found' });
            }
            res.json(updatedAction);
        }
        catch (error) {
            res.status(500).json({ error: 'Failed to update action' });
        }
    }
    async deleteAction(req, res) {
        try {
            const { id } = req.params;
            const deletedAction = await action_model_1.ActionModel.findByIdAndDelete(id);
            if (!deletedAction) {
                return res.status(404).json({ error: 'Action not found' });
            }
            res.json({ message: 'Action deleted successfully' });
        }
        catch (error) {
            res.status(500).json({ error: 'Failed to delete action' });
        }
    }
    async getActionById(id) {
        try {
            const action = await action_model_1.ActionModel.findById(id);
            if (!action) {
                return null;
            }
            return action.toObject();
        }
        catch (error) {
            console.error('Error getting action:', error);
            throw error;
        }
    }
    async getAction(req, res) {
        try {
            const { id } = req.params;
            const action = await this.getActionById(id);
            if (!action) {
                return res.status(404).json({ error: 'Action not found' });
            }
            res.json(action);
        }
        catch (error) {
            res.status(500).json({ error: 'Failed to get action' });
        }
    }
}
exports.ActionController = ActionController;

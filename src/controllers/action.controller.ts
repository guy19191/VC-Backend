import { Request, Response } from 'express';
import { ActionModel } from '../models/action.model';
import { Action, ActionType } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class ActionController {
  async addAction(req: Request, res: Response) {
    try {
      const action: Action = {
        _id: uuidv4(),
        type: req.body.type as ActionType,
        payload: req.body.payload,
        query: req.body.query,
        id: req.body.id,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const newAction = new ActionModel(action);
      await newAction.save();

      res.status(201).json(newAction);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create action' });
    }
  }

  async updateAction(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const updatedAction = await ActionModel.findByIdAndUpdate(
        id,
        { $set: { ...updates, updatedAt: new Date() } },
        { new: true }
      );

      if (!updatedAction) {
        return res.status(404).json({ error: 'Action not found' });
      }

      res.json(updatedAction);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update action' });
    }
  }

  async deleteAction(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const deletedAction = await ActionModel.findByIdAndDelete(id);

      if (!deletedAction) {
        return res.status(404).json({ error: 'Action not found' });
      }

      res.json({ message: 'Action deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete action' });
    }
  }

  async getActionById(id: string): Promise<Action | null> {
    try {
      const action = await ActionModel.findById(id);
      if (!action) {
        return null;
      }
      return action.toObject() as Action;
    } catch (error) {
      console.error('Error getting action:', error);
      throw error;
    }
  }

  async getAction(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const action = await this.getActionById(id);

      if (!action) {
        return res.status(404).json({ error: 'Action not found' });
      }

      res.json(action);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get action' });
    }
  }
} 
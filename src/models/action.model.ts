import mongoose, { Document } from 'mongoose';
import { Action, ActionType } from '../types';

export interface ActionDocument extends Omit<Action, '_id' | 'id'>, Document {
  id: string;
}

const actionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['notification', 'addEntity', 'updateEntity'],
    required: true
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  query: {
    type: mongoose.Schema.Types.Mixed,
    required: false
  },
  id: {
    type: String,
    required: false
  },
  _id: { type: String, required: true, unique: true }
}, { timestamps: true });

export const ActionModel = mongoose.model<ActionDocument>('Action', actionSchema); 
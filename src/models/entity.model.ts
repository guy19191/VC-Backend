import mongoose, { Document } from 'mongoose';
import { Entity } from '../types';

export interface EntityDocument extends Omit<Entity, '_id'>, Document {}

const entitySchema = new mongoose.Schema({
  type: {
    type: String,
    required: true
  },
  properties: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  position: {
    lat: Number,
    lng: Number,
    entityTypes: [String]
  },
  vector: [Number],
  source: {
    type: String,
    enum: ['mongodb', 'qdrant', 'both'],
    default: 'both'
  },
  metadata: String,
  _id: { type: String, required: true, unique: true }
}, { timestamps: true });

export const EntityModel = mongoose.model<EntityDocument>('Entity', entitySchema); 
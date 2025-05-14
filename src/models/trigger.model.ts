import mongoose, { Document, Schema } from 'mongoose';
import { Trigger, DatabaseSource, GeoPosition, TriggerType, BaseTrigger, ActionType } from '../types';

export interface TriggerDocument extends Omit<BaseTrigger, '_id'>, Document {
  position?: {
    lat: number;
    lng: number;
  };
  radius?: number;
  layerId?: string;
  query?: any;
  timeoutMs?: number;
  sourceQuery?: Record<string, any>;
  targetQuery?: Record<string, any>;
}

interface TriggerSchemaDefinition {
  _id: { type: typeof String; required: boolean; unique: boolean };
  type: { type: typeof String; required: boolean; enum: TriggerType[] };
  actionIds: { type: [typeof String] };
  actions: { type: [{ type: ActionType; payload: any }] };
  validity: { type: typeof Boolean; default: boolean };
  status: { type: typeof String; enum: ['active', 'inactive']; default: string };
  entityId: { type: typeof String };
  vector: { type: [typeof Number]; default: number[] };
  source: { 
    type: typeof String; 
    enum: DatabaseSource[];
    default: DatabaseSource;
  };
  metadata: { type: typeof String };
  position: {
    lat: { type: typeof Number };
    lng: { type: typeof Number };
  };
  radius: { type: typeof Number };
  layerId: { type: typeof String };
  query: { type: typeof Schema.Types.Mixed };
  timeoutMs: { type: typeof Number };
  sourceQuery: { type: typeof Schema.Types.Mixed };
  targetQuery: { type: typeof Schema.Types.Mixed };
}

const triggerSchema = new Schema({
  _id: { type: String, required: true, unique: true },
  type: {
    type: String,
    enum: ['geoRule', 'layer', 'timeOut'],
    required: true
  },
  actionIds: [String],
  actions: [{
    type: {
      type: String,
      enum: ['notification', 'addEntity', 'updateEntity'],
      required: true
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true
    }
  }],
  validity: {
    type: Boolean,
    default: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  entityId: String,
  vector: { type: [Number], default: [] },
  source: { 
    type: String, 
    enum: ['mongodb', 'qdrant', 'both'],
    default: 'both'
  },
  metadata: String,
  position: {
    lat: { type: Number },
    lng: { type: Number }
  },
  radius: { type: Number },
  layerId: { type: String },
  query: { type: Schema.Types.Mixed },
  timeoutMs: { type: Number },
  sourceQuery: { type: Schema.Types.Mixed },
  targetQuery: { type: Schema.Types.Mixed }
} as const, { timestamps: true });

const geoRuleSchema = new Schema({
  sourceQuery: { type: Schema.Types.Mixed },
  targetQuery: { type: Schema.Types.Mixed }
});

const layerSchema = new Schema({
  layerId: { type: String },
  query: { type: Schema.Types.Mixed }
});

const timeOutSchema = new Schema({
  timeoutMs: { type: Number }
});

export const TriggerModel = mongoose.model<TriggerDocument>('Trigger', triggerSchema);
export const GeoRuleTriggerModel = TriggerModel.discriminator('geoRule', geoRuleSchema);
export const LayerTriggerModel = TriggerModel.discriminator('layer', layerSchema);
export const TimeOutTriggerModel = TriggerModel.discriminator('timeOut', timeOutSchema); 
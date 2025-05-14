export interface GeoPosition {
  lat: number;
  lng: number;
  entityTypes?: string | string[];  // Optional field for entity type(s)
}

export type DatabaseSource = 'mongodb' | 'qdrant' | 'both';

export interface Entity {
  _id: string;
  type: string;
  properties?: Record<string, any>;
  position?: GeoPosition;
  vector?: number[];
  source?: DatabaseSource;
  metadata?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type TriggerType = 'geoRule' | 'layer' | 'timeOut';

export type ActionType = 'notification' | 'addEntity' | 'updateEntity';

export interface Action {
  _id: string;
  type: ActionType;
  payload: any;
  createdAt?: Date;
  updatedAt?: Date;
  query?: Record<string, any>;
  id?: string;
}

// Base trigger interface with common properties
export interface BaseTrigger {
  _id: string;
  type: TriggerType;
  actionIds?: string[];
  actions?: {
    type: ActionType;
    payload: any;
  }[];
  validity?: boolean;
  status?: 'active' | 'inactive';
  entityId?: string;
  vector?: number[];
  source?: DatabaseSource;
  metadata?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// Specific trigger types with their unique properties
export interface GeoRuleTrigger extends BaseTrigger {
  type: 'geoRule';
  sourceQuery: Record<string, any>;
  targetQuery: Record<string, any>;
  position?: GeoPosition;
}

export interface LayerTrigger extends BaseTrigger {
  type: 'layer';
  query: Record<string, any>;
}

export interface TimeOutTrigger extends BaseTrigger {
  type: 'timeOut';
  timeoutMs: number;
}

// Union type of all trigger types
export type Trigger = GeoRuleTrigger | LayerTrigger | TimeOutTrigger;

// Type guard functions
export function isGeoRuleTrigger(trigger: Trigger): trigger is GeoRuleTrigger {
  return trigger.type === 'geoRule';
}

export function isLayerTrigger(trigger: Trigger): trigger is LayerTrigger {
  return trigger.type === 'layer';
}

export function isTimeOutTrigger(trigger: Trigger): trigger is TimeOutTrigger {
  return trigger.type === 'timeOut';
}

export interface AgentModelResponse {
  action: string;
  confidence: number;
  metadata?: Record<string, any>;
}

export interface TriggerMatch {
  triggerId: string;
  status: 'matched';
  entity: Entity;
  agentResponse?: AgentModelResponse;
} 
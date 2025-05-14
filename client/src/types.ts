export interface GeoPosition {
  lat: number;
  lng: number;
  entityTypes?: string | string[];
}

export interface Entity {
  _id: string;
  type: string;
  properties: Record<string, any>;
  position?: GeoPosition;
  vector?: number[];
  source: 'mongodb' | 'qdrant' | 'both';
}

export interface Trigger {
  id: string;
  type: 'geoRule' | 'layer' | 'timeOut';
  entityId: string;
  vector: number[];
  validity?: boolean;
  source: 'mongodb' | 'qdrant' | 'both';
  position?: GeoPosition;
  query?: Record<string, any>;
  timeoutMs?: number;
}

export interface TriggerMatch {
  triggerId: string;
  status: 'matched';
  entity: Entity;
  agentResponse?: {
    action: string;
    confidence: number;
    metadata?: Record<string, any>;
  };
} 
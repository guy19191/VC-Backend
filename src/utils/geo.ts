import { GeoPosition } from '../types';

const EARTH_RADIUS_KM = 6371;

export function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

export function calculateDistance(point1: GeoPosition, point2: GeoPosition): number {
  // Validate input points
  if (!point1 || !point2 || 
      typeof point1.lat !== 'number' || typeof point1.lng !== 'number' ||
      typeof point2.lat !== 'number' || typeof point2.lng !== 'number') {
    throw new Error('Invalid coordinates provided');
  }

  // Handle same point case
  if (point1.lat === point2.lat && point1.lng === point2.lng) {
    return 0;
  }

  const lat1Rad = degreesToRadians(point1.lat);
  const lat2Rad = degreesToRadians(point2.lat);
  const deltaLat = degreesToRadians(point2.lat - point1.lat);
  const deltaLng = degreesToRadians(point2.lng - point1.lng);

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) *
    Math.cos(lat2Rad) *
    Math.sin(deltaLng / 2) *
    Math.sin(deltaLng / 2);

  // Handle potential floating point errors
  const aClamped = Math.min(Math.max(a, 0), 1);
  const c = 2 * Math.atan2(Math.sqrt(aClamped), Math.sqrt(1 - aClamped));
  const distanceKm = EARTH_RADIUS_KM * c;

  // Convert to meters and ensure non-negative
  return Math.max(0, distanceKm * 1000);
}

export function isWithinDistance(
  point1: GeoPosition,
  point2: GeoPosition,
  thresholdMeters: number,
  entityType?: string
): boolean {
  if (thresholdMeters < 0) {
    throw new Error('Threshold must be non-negative');
  }

  const distance = calculateDistance(point1, point2);
  return distance <= thresholdMeters;
} 
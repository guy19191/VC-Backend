# Trigger Service

A Node.js + TypeScript service that handles different types of triggers using MongoDB, Qdrant, and WebSocket.

## Features

- Three types of triggers:
  - `geoRule`: Activates when a user's position is within a configurable radius
  - `layer`: Activates when a user matches specific criteria
  - `timeOut`: Activates after a specified delay
- Real-time notifications via WebSocket
- Vector storage using Qdrant
- MongoDB for trigger persistence

## Prerequisites

- Node.js (v14 or higher)
- MongoDB
- Qdrant

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and configure your environment variables:
   ```bash
   cp .env.example .env
   ```

## Environment Variables

- `PORT`: Server port (default: 3000)
- `MONGODB_URI`: MongoDB connection string
- `QDRANT_URL`: Qdrant server URL
- `QDRANT_COLLECTION`: Qdrant collection name
- `GEO_THRESHOLD_METERS`: Distance threshold for geo triggers

## API Endpoints

### Add User
```http
POST /users/add
Content-Type: application/json

{
  "vector": number[],
  "position": {
    "lat": number,
    "lng": number
  },
  "metadata": {
    // Any additional user data
  }
}
```

### Update User
```http
PUT /users/update
Content-Type: application/json

{
  "vector": number[],
  "position": {
    "lat": number,
    "lng": number
  },
  "metadata": {
    // Any additional user data
  }
}
```

### Create Trigger
```http
POST /users/trigger
Content-Type: application/json

// GeoRule Trigger
{
  "type": "geoRule",
  "position": {
    "lat": number,
    "lng": number
  }
}

// Layer Trigger
{
  "type": "layer",
  "query": {
    // MongoDB-style query object
  }
}

// TimeOut Trigger
{
  "type": "timeOut",
  "timeoutMs": number
}
```

## WebSocket Events

### Trigger Match
```typescript
{
  triggerId: string;
  status: "matched";
  user: {
    vector: number[];
    position: {
      lat: number;
      lng: number;
    };
    metadata: Record<string, any>;
  }
}
```

## Development

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Build for production:
   ```bash
   npm run build
   ```

3. Start production server:
   ```bash
   npm start
   ```

## Project Structure

```
src/
├── config/                   # Configuration
├── routes/                   # Express routes
├── controllers/             # API route logic
├── services/               # Business logic
├── websocket/              # WebSocket server
├── models/                 # MongoDB models
├── utils/                  # Utility functions
└── index.ts               # App entry point
``` # VC-Server
# VC-Backend

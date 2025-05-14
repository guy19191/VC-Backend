import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import { io, Socket } from 'socket.io-client';
import { Box, Paper, Typography, Button, TextField, Select, MenuItem, FormControl, InputLabel, Snackbar, Alert, AlertColor } from '@mui/material';
import { Entity, Trigger, TriggerMatch } from './types';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icons in Leaflet with React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

const API_URL = 'http://10.2.3.9:5000';
const socket: Socket = io(API_URL);

function App() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [matches, setMatches] = useState<TriggerMatch[]>([]);
  const [notification, setNotification] = useState<{ message: string; type: AlertColor } | null>(null);
  const [newEntity, setNewEntity] = useState<Partial<Entity>>({
    type: 'person',
    properties: {},
    position: { lat: 0, lng: 0 },
    source: 'mongodb'
  });
  const [newTrigger, setNewTrigger] = useState<Partial<Trigger>>({
    type: 'geoRule',
    entityId: '',
    vector: [],
    source: 'mongodb',
    position: { lat: 0, lng: 0 }
  });

  useEffect(() => {
    // Fetch initial data
    fetchEntities();
    fetchTriggers();

    // Listen for WebSocket events
    socket.on('triggerMatch', (match: TriggerMatch) => {
      setMatches(prev => [...prev, match]);
      setNotification({
        message: `Trigger match: ${match.entity.type} entity matched with trigger ${match.triggerId}`,
        type: 'info'
      });
    });

    socket.on('notification', (payload: { message: string; level: string }) => {
      setNotification({
        message: payload.message,
        type: payload.level as AlertColor
      });
    });

    socket.on('actionExecuted', (data: { triggerId: string; actionId: string; result: any }) => {
      setNotification({
        message: `Action executed: ${data.actionId} for trigger ${data.triggerId}`,
        type: 'success'
      });
    });

    socket.on('entityCreated', (entity: Entity) => {
      setEntities(prev => [...prev, entity]);
      setNotification({
        message: `Entity created: ${entity.type} at (${entity.position?.lat}, ${entity.position?.lng})`,
        type: 'success'
      });
    });

    socket.on('entityUpdated', (entity: Entity) => {
      setEntities(prev => prev.map(e => e._id === entity._id ? entity : e));
      setNotification({
        message: `Entity updated: ${entity.type} at (${entity.position?.lat}, ${entity.position?.lng})`,
        type: 'info'
      });
    });

    socket.on('triggerCreated', (trigger: Trigger) => {
      setTriggers(prev => [...prev, trigger]);
      setNotification({
        message: `Trigger created: ${trigger.type} at (${trigger.position?.lat}, ${trigger.position?.lng})`,
        type: 'success'
      });
    });

    socket.on('triggerUpdated', (trigger: Trigger) => {
      setTriggers(prev => prev.map(t => t.id === trigger.id ? trigger : t));
      setNotification({
        message: `Trigger updated: ${trigger.type} at (${trigger.position?.lat}, ${trigger.position?.lng})`,
        type: 'info'
      });
    });

    return () => {
      socket.off('triggerMatch');
      socket.off('notification');
      socket.off('actionExecuted');
      socket.off('entityCreated');
      socket.off('entityUpdated');
      socket.off('triggerCreated');
      socket.off('triggerUpdated');
    };
  }, []);

  const handleCloseNotification = () => {
    setNotification(null);
  };

  const fetchEntities = async () => {
    try {
      const response = await fetch(`${API_URL}/entities/query`);
      const data = await response.json();
      setEntities(data);
    } catch (error) {
      console.error('Error fetching entities:', error);
    }
  };

  const fetchTriggers = async () => {
    try {
      const response = await fetch(`${API_URL}/triggers/getAll`);
      const data = await response.json();
      setTriggers(data);
    } catch (error) {
      console.error('Error fetching triggers:', error);
    }
  };

  const handleAddEntity = async () => {
    try {
      const response = await fetch(`${API_URL}/entities/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEntity)
      });
      const data = await response.json();
      setEntities(prev => [...prev, data]);
      setNewEntity({
        type: 'person',
        properties: {},
        position: { lat: 0, lng: 0 },
        source: 'mongodb'
      });
    } catch (error) {
      console.error('Error adding entity:', error);
    }
  };

  const handleAddTrigger = async () => {
    try {
      const response = await fetch(`${API_URL}/triggers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTrigger)
      });
      const data = await response.json();
      setTriggers(prev => [...prev, data]);
      setNewTrigger({
        type: 'geoRule',
        entityId: '',
        vector: [],
        source: 'mongodb',
        position: { lat: 0, lng: 0 }
      });
    } catch (error) {
      console.error('Error adding trigger:', error);
    }
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <Box sx={{ flex: 1, p: 2 }}>
        <MapContainer
          center={[51.505, -0.09]}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          {entities.map(entity => (
            entity.position && (
              <Marker
                key={entity._id}
                position={[entity.position.lat, entity.position.lng]}
              >
                <Popup>
                  <Typography variant="subtitle1">Type: {entity.type}</Typography>
                  <Typography variant="body2">
                    Properties: {JSON.stringify(entity.properties)}
                  </Typography>
                </Popup>
              </Marker>
            )
          ))}
          {triggers.map(trigger => (
            trigger.position && (
              <Circle
                key={trigger.id}
                center={[trigger.position.lat, trigger.position.lng]}
                radius={100}
                pathOptions={{ color: 'red', fillColor: 'red' }}
              >
                <Popup>
                  <Typography variant="subtitle1">Type: {trigger.type}</Typography>
                </Popup>
              </Circle>
            )
          ))}
        </MapContainer>
      </Box>
      <Box sx={{ width: 400, p: 2, overflow: 'auto' }}>
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6" gutterBottom>Add Entity</Typography>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Type</InputLabel>
            <Select
              value={newEntity.type}
              onChange={(e) => setNewEntity(prev => ({ ...prev, type: e.target.value }))}
            >
              <MenuItem value="person">Person</MenuItem>
              <MenuItem value="vehicle">Vehicle</MenuItem>
              <MenuItem value="drone">Drone</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="Latitude"
            type="number"
            value={newEntity.position?.lat}
            onChange={(e) => setNewEntity(prev => ({
              ...prev,
              position: { ...prev.position!, lat: parseFloat(e.target.value) }
            }))}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Longitude"
            type="number"
            value={newEntity.position?.lng}
            onChange={(e) => setNewEntity(prev => ({
              ...prev,
              position: { ...prev.position!, lng: parseFloat(e.target.value) }
            }))}
            sx={{ mb: 2 }}
          />
          <Button variant="contained" onClick={handleAddEntity} fullWidth>
            Add Entity
          </Button>
        </Paper>

        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6" gutterBottom>Add Trigger</Typography>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Type</InputLabel>
            <Select
              value={newTrigger.type}
              onChange={(e) => setNewTrigger(prev => ({ ...prev, type: e.target.value as Trigger['type'] }))}
            >
              <MenuItem value="geoRule">Geo Rule</MenuItem>
              <MenuItem value="layer">Layer</MenuItem>
              <MenuItem value="timeOut">Time Out</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="Latitude"
            type="number"
            value={newTrigger.position?.lat}
            onChange={(e) => setNewTrigger(prev => ({
              ...prev,
              position: { ...prev.position!, lat: parseFloat(e.target.value) }
            }))}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Longitude"
            type="number"
            value={newTrigger.position?.lng}
            onChange={(e) => setNewTrigger(prev => ({
              ...prev,
              position: { ...prev.position!, lng: parseFloat(e.target.value) }
            }))}
            sx={{ mb: 2 }}
          />
          <Button variant="contained" onClick={handleAddTrigger} fullWidth>
            Add Trigger
          </Button>
        </Paper>

        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>Trigger Matches</Typography>
          {matches.map((match, index) => (
            <Box key={index} sx={{ mb: 2, p: 1, bgcolor: 'background.default' }}>
              <Typography variant="subtitle2">Trigger ID: {match.triggerId}</Typography>
              <Typography variant="body2">Entity Type: {match.entity.type}</Typography>
              {match.agentResponse && (
                <>
                  <Typography variant="body2">Action: {match.agentResponse.action}</Typography>
                  <Typography variant="body2">
                    Confidence: {(match.agentResponse.confidence * 100).toFixed(1)}%
                  </Typography>
                </>
              )}
            </Box>
          ))}
        </Paper>
      </Box>
      
      <Snackbar
        open={!!notification}
        autoHideDuration={6000}
        onClose={handleCloseNotification}
      >
        <Alert 
          onClose={handleCloseNotification} 
          severity={notification?.type || 'info'}
          sx={{ width: '100%' }}
        >
          {notification?.message || ''}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default App; 
import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
import { TriggerMatch } from './types';

export class WebSocketService {
  private io: Server;

  constructor(server: HttpServer) {
    this.io = new Server(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    this.io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });
  }

  public emitTriggerMatch(match: TriggerMatch): void {
    this.io.emit('triggerMatch', match);
  }

  public emit(event: string, data: any): void {
    this.io.emit(event, data);
  }
} 
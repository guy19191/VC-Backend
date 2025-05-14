import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { TriggerMatch } from '../types';

export class WebSocketService {
  private io: Server;

  constructor(server: HttpServer) {
    this.io = new Server(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    this.io.on('connection', this.handleConnection.bind(this));
  }

  private handleConnection(socket: Socket): void {
    console.log('Client connected:', socket.id);

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  }

  public emitTriggerMatch(match: TriggerMatch): void {
    this.io.emit('triggerMatch', match);
  }
} 
import express, { Express } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app: Express = express();
const server = createServer(app);
const io = new Server(server);

app.get('/', (req, res) => {
  res.send('Hello World!');
});

io.on('connection', (socket) => {
  console.log('a user connected');
});

server.listen(3000, () => {
  console.log('Server running on port 3000');
});
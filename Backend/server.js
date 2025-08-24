require('dotenv').config()
const http = require('http');
const app = require('./src/app');
const initSocketServer = require('./src/sockets/socket.server')
const connectToDB = require('./src/db/db')

const httpServer = http.createServer(app);
const PORT = process.env.PORT | 3000;

/* Connecting to database */ 
connectToDB();
initSocketServer(httpServer)

httpServer.listen(PORT,()=>{
    console.log(`server is running on port ${PORT}`)
})
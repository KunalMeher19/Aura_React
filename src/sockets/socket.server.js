const { Server } = require('socket.io');

function initSocketServer(httpServer) {

    const io = new Server(httpServer, {});

    io.on("connection", (socket) => {
        console.log("A new user connected:", socket.id);

        /* Middlewware to check the user is loggedin or not */
        io.use(async (socket, next) => {
            
        })

        socket.on("disconnect", () => {
            console.log(`user ${socket.id}  disconnected`)
        })
    })

}

module.exports = initSocketServer;
const { Server } = require('socket.io');
const cookie = require('cookie')
const jwt = require('jsonwebtoken');
const userModel = require('../models/user.model')

function initSocketServer(httpServer) {

    const io = new Server(httpServer, {});

    io.on("connection", (socket) => {
        console.log("A new user connected:", socket.id);

        /* Middlewware to check the user is loggedin or not */
        io.use(async (socket, next) => {
            const cookies = cookie.parse(socket.handshake.headers?.cookie || "");

            if(!cookie.token){
                next(new Error("Authentication error: No token provided"));
            }

            try{

                const decoded = jwt.verify(cookies.token, process.env.JWT_SECRET);

                const user = await userModel.findOne(decoded.id);

                socket.user = user;

                next();
            }catch(err){
                next(new Error("Authentication error: Invalid token"))
            }
        })

        socket.on("disconnect", () => {
            console.log(`user ${socket.id}  disconnected`)
        })
    })

}

module.exports = initSocketServer;
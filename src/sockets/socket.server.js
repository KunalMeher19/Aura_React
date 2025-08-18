const { Server } = require('socket.io');
const cookie = require('cookie')
const jwt = require('jsonwebtoken');
const userModel = require('../models/user.model')

function initSocketServer(httpServer) {

    const io = new Server(httpServer, {});

    /* Middlewware to check the user is loggedin or not */
    io.use(async (socket, next) => {
        /* We are doing the cookie.parse(...) because we are actually sending a or many strings of cookies inside the HTTP header */
        /* cookie.parser(...) takes that raw cookie string and turns it into an object we can work with */
        const cookies = cookie.parse(socket.handshake.headers?.cookie || "");

        if (!cookies.token) {
            next(new Error("Authentication error: No token provided"));
        }

        try {
            const decoded = jwt.verify(cookies.token, process.env.JWT_SECRET);
            const user = await userModel.findById(decoded.id);
            socket.user = user;
            next();
        } catch (err) {
            next(new Error("Authentication error: Invalid token"))
        }
    })


    io.on("connection", (socket) => {
        console.log("User connected:", socket.user.fullName.firstName)
        
        socket.on("ai-message",(messagePayload)=>{
            console.log(messagePayload);
        })
        socket.on("disconnect", () => {
            console.log(`user ${socket.id}  disconnected`)
        })
    })

}

module.exports = initSocketServer;
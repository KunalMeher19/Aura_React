const { Server } = require('socket.io');
const cookie = require('cookie')
const jwt = require('jsonwebtoken');
const userModel = require('../models/user.model')
const aiService = require('../services/ai.service');
const messageModel = require('../models/message.model')
const { createMemory, queryMemory } = require('../services/vector.service');

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
        console.log("User connected:", socket.user.fullName.firstName, socket.id)

        socket.on("ai-message", async (messagePayload) => {

            const message = await messageModel.create({
                user: socket.user._id,
                chat: messagePayload.chat,
                content: messagePayload.content,
                role: "user"
            })

            const vectors = await aiService.embeddingGenerator(messagePayload.content);

            const memory = await queryMemory({
                queryVector: vectors,
                limit: 3,
                metadata:{}
            })

            await createMemory({
                vectors,
                messageId: message._id,
                metadata: {
                    chat: messagePayload.chat,
                    user: socket.user._id,
                    text: messagePayload.content
                }
            })

            console.log(memory)  

            const chatHistory = (await messageModel.find({
                chat: messagePayload.chat
            }).sort({ createdAt: -1 }).limit(20).lean()).reverse()
            /* We are here providing last 20 message to the ai because if we don't do that then the pricing to send a whole bunch of data to the ai will get increase so to optimise that we only remember last 20 message */


            const response = await aiService.contentGenerator(chatHistory.map(item => {
                return {
                    role: item.role,
                    parts: [{ text: item.content }]
                }
            }))

            const resposneMessage = await messageModel.create({
                user: socket.user._id,
                chat: messagePayload.chat,
                content: response,
                role: "model"
            })

            const resoponseVectors = await aiService.embeddingGenerator(response);

            await createMemory({
                vectors: resoponseVectors,
                messageId: resposneMessage._id,
                metadata: {
                    chat: messagePayload.chat,
                    user: socket.user._id,
                    text: response
                }
            })

            socket.emit("ai-response", {
                content: response,
                chat: messagePayload.chat
            })
        })

        socket.on("disconnect", () => {
            console.log(`user ${socket.id}  disconnected`)
        })
    })

}

module.exports = initSocketServer;
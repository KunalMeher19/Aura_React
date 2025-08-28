const { Server } = require('socket.io');
const cookie = require('cookie')
const jwt = require('jsonwebtoken');
const userModel = require('../models/user.model')
const aiService = require('../services/ai.service');
const messageModel = require('../models/message.model')
const { createMemory, queryMemory } = require('../services/vector.service');

function initSocketServer(httpServer) {

    const io = new Server(httpServer, {
        cors: {
            origin: "http://localhost:5173",
            allowedHeaders: [ "Content-Type", "Authorization" ],
            credentials: true
        }
    });

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
        socket.on("ai-message", async (messagePayload) => {

            try {
                // Save message and generate embeddings in parallel
                const [message, vectors] = await Promise.all([
                    messageModel.create({
                        user: socket.user._id,
                        chat: messagePayload.chat,
                        content: messagePayload.content,
                        role: "user"
                    }),
                    aiService.embeddingGenerator(messagePayload.content)
                ])

                // Query memory, create memory, and get chat history in parallel
                const [memory, chatHistory] = await Promise.all([
                    queryMemory({
                        queryVector: vectors,
                        limit: 3,
                        metadata:{
                            user: socket.user._id
                        }
                    }),
                    messageModel.find({ chat: messagePayload.chat }).sort({ createdAt: -1 }).limit(20).lean().then(messages => messages.reverse()),
                    createMemory({
                        vectors,
                        messageId: message._id,
                        metadata: {
                            chat: messagePayload.chat,
                            user: socket.user._id,
                            text: messagePayload.content
                        }
                    })
                ]);

                const stm = chatHistory.map(item => {
                    return {
                        role: item.role,
                        parts: [{ text: item.content }]
                    }
                })

                const ltm = [
                    {
                        role: "user",
                        parts: [{
                            text: `
                        The following are retrieved messages from previous chats. They are provided as context to help you respond consistently.
                        -Always prioritize the most recent messages over older ones.
                        -Use this history only to maintain continuity and relevance.
                        -If the retrieved context is irrelevant, ignore it and respond naturally to the latest user query.

                        ${memory.map(item => item.metadata.text).join("\n")}
                        `
                        }]
                    }
                ]

                const response = await aiService.contentGenerator([...ltm, ...stm])

                // Save response and embeddings in parallel
                const [resposneMessage, resoponseVectors] = await Promise.all([ 
                    messageModel.create({
                        user: socket.user._id,
                        chat: messagePayload.chat,
                        content: response,
                        role: "model"
                    }),
                    aiService.embeddingGenerator(response)
                ])
                
                // Emit response early
                socket.emit("ai-response", {
                    content: response,
                    chat: messagePayload.chat
                })


                // Store AI response memory
                await createMemory({
                    vectors: resoponseVectors,
                    messageId: resposneMessage._id,
                    metadata: {
                        chat: messagePayload.chat,
                        user: socket.user._id,
                        text: response
                    }
                })

            } catch (error) {
                console.error("Socket AI handler error:", error);
                socket.emit("ai-response", {
                    content: "Something went wrong, please try again.",
                    chat: messagePayload.chat
                });
            }
        })

        socket.on("disconnect", () => {
            console.log(`user ${socket.id}  disconnected`)
        })
    })

}

module.exports = initSocketServer;
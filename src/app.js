const express = require('express');
const cookieParser = require('cookie-parser');

// Routes Imports
const authRouter = require('./routers/auth.router')
const chatRouter = require('./routers/chat.router');

const app = express();

// Middlewares
app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/api/auth', authRouter);
app.use('/api/chat', chatRouter);


module.exports = app;
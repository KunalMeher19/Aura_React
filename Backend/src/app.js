const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');

// Routes Imports
const authRouter = require('./routers/auth.router')
const chatRouter = require('./routers/chat.router');

const app = express();

// Middlewares
app.use(cors(
    {
        origin: 'http://localhost:5173',
        credentials: true,
    }
))
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')))

// Routes
app.use('/api/auth', authRouter);
app.use('/api/chat', chatRouter);

app.get('*name',(req,res)=>{
    res.sendFile(path.join(__dirname,'../public/index.html'))
})

module.exports = app;
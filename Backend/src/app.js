const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');

// Routes Imports
const authRouter = require('./routers/auth.router')
const chatRouter = require('./routers/chat.router');

const app = express();

const allowedOrigins = [
  'https://aura-autologin.netlify.app',
  'https://aura-x4bd.onrender.com',     // app origin
  'http://localhost:5173'               // dev origin
];

// CORS: use a function to echo the incoming origin if it's allowed
app.use(cors({
  origin: function(origin, callback) {
    // allow requests with no origin (mobile apps, curl, tests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, origin);
    return callback(new Error('CORS: Origin not allowed'), false);
  },
  credentials: true,        // allow cookies to be sent
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With']
}));

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
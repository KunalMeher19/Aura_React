require('dotenv').config()
const app = require('./src/app');
const connectToDB = require('./db/db')

const PORT = process.env.PORT | 3000;

// Connecting to database
connectToDB();

app.listen(PORT),()=>{
    console.logg(`server is running on port ${PORT}`)
}
const mongoose = require('mongoose');

async function connectToDB() {
    try{
        await mongoose.connect(process.env.MONGO_URI)
        .then(()=>{
            console.log('Connected to DB');
        })
    }catch(err){
        console.log("DB Error: ", err);
    }
}

module.exports = connectToDB;
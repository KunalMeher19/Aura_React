const Imagekit = require('imagekit');
/* This is used to store user-uploaded images and for re-rendering the image if the page is reloaded */

const imagekit = new Imagekit({
    publicKey: process.env.IMAGEKIT_PUBLICKEY,
    privateKey: process.env.IMAGEKIT_PRIVATEKEY,
    urlEndpoint: process.env.IMAGEKIT_URL
})

async function uploadFile(file, fileName){
    const response = await imagekit.upload({
        file: file,
        fileName: fileName,
        folder: "Aura_User_Uploads"
    })

    return response;
}

module.exports = uploadFile;
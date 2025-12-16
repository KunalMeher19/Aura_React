const Imagekit = require('imagekit');
/* This is used to store user-uploaded images and for re-rendering the image if the page is reloaded */

// Validate environment variables
const requiredEnvVars = ['IMAGEKIT_PUBLICKEY', 'IMAGEKIT_PRIVATEKEY', 'IMAGEKIT_URL'];
const missing = requiredEnvVars.filter(varName => !process.env[varName]);

if (missing.length > 0) {
    console.warn(`[storage.service] WARNING: Missing ImageKit environment variables: ${missing.join(', ')}`);
    console.warn('[storage.service] Image uploads will fail until these are configured.');
}

const imagekit = new Imagekit({
    publicKey: process.env.IMAGEKIT_PUBLICKEY || '',
    privateKey: process.env.IMAGEKIT_PRIVATEKEY || '',
    urlEndpoint: process.env.IMAGEKIT_URL || ''
})

async function uploadFile(file, fileName) {
    try {
        // Check if credentials are configured
        if (missing.length > 0) {
            throw new Error(`ImageKit not configured. Missing: ${missing.join(', ')}`);
        }

        // Log upload attempt
        console.log(`[storage.service] Attempting to upload file: ${fileName}`);

        const response = await imagekit.upload({
            file: file,
            fileName: fileName,
            folder: "Aura_User_Uploads"
        });

        console.log(`[storage.service] Upload successful: ${response.url || response.filePath}`);
        return response;
    } catch (error) {
        console.error(`[storage.service] Upload failed for ${fileName}:`, error.message);
        // Provide more helpful error message
        if (error.message.includes('ImageKit not configured')) {
            throw new Error('Image upload service not configured. Please contact support.');
        }
        throw error;
    }
}

module.exports = uploadFile;
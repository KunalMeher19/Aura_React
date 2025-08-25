// Import the Pinecone library
const { Pinecone } = require('@pinecone-database/pinecone');

// Initialize a Pinecone client with your API key
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

// Create a dense index with integrated embedding
const gptEmbeddingsIndex = pc.index('gpt-embeddings')

/* This is fnc to save the messages into the pinecode in embedded form */
async function createMemory({ vectors, metadata, messageId }) {
    await gptEmbeddingsIndex.upsert([{
        id: messageId,
        values: vectors,
        metadata
    }])
}

/* This fnc query out the related vector we provided the ai as input prompt for context(LTM) */
async function queryMemory({ queryVector, limit, metadata }) {
    const data = await gptEmbeddingsIndex.query({
        vector: queryVector,
        topK: limit,
        filter: metadata ? metadata : undefined,
        includeMetadata: true
    })
    return data.matches
}

async function deleteChatMemory(chatId) {
  await gptEmbeddingsIndex.deleteMany({
    chat: { $eq: chatId } 
  });
}


module.exports = { createMemory, queryMemory, deleteChatMemory }
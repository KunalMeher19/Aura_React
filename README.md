## Aura — Chat GPT (React + Node)

This repository contains a React + Vite frontend and an Express (Node) backend that together implement a chat application with user auth, file uploads, Pinecone vector memory storage, and real-time messaging via Socket.IO.

Live backend (API): https://aura-x4bd.onrender.com

Note: the frontend in this project is configured to call the backend at the URL above (see `Frontend/src/pages/*`). If you have a deployed frontend site, replace the Live link or add the frontend URL below.

## Contents

- `Frontend/` — React + Vite application (client)
- `Backend/` — Express server, Socket.IO, DB, services (server)

## Key features

- User registration & login (JWT stored in cookie)
- Real-time chat using Socket.IO
- File uploads (ImageKit)
- Vector storage with Pinecone for memory/embeddings
- MongoDB for persistent storage
- PWA support via `vite-plugin-pwa`

## Tech stack

- Frontend: React, Vite, Redux Toolkit, react-router, axios
- Backend: Node.js, Express, Socket.IO, Mongoose
- Services: Pinecone, ImageKit

## Quick start (development)

Prerequisites:

- Node.js (v18+ recommended)
- npm (or yarn)

1) Clone the repository

2) Backend (server)

```bash
cd Backend
npm install
npm run dev
```

The backend uses `dotenv`; create a `.env` file in `Backend/` with the variables listed below.

3) Frontend (client)

```bash
cd Frontend
npm install
npm run dev
```

Open the dev frontend at the address printed by Vite (typically `http://localhost:5173`). The frontend in this project is configured to talk to `https://aura-x4bd.onrender.com` by default — update the client API URLs in `Frontend/src/pages` or set up an env-based base URL if you run a local backend.

## Production build

Frontend:

```bash
cd Frontend
npm run build
# Serve the `dist` folder using any static server, or integrate with your backend to serve static files.
```

Backend:

```bash
cd Backend
npm install
# Ensure environment variables are set, then run:
node server.js
# or for development with auto-reload:
npx nodemon server.js
```

## Required environment variables

Create a `.env` file in `Backend/` with at least the following entries:

- `MONGO_URI` — MongoDB connection string (e.g. from MongoDB Atlas)
- `JWT_SECRET` — secret key used to sign JWT tokens
- `IMAGEKIT_PUBLICKEY` — ImageKit public key (for file uploads)
- `IMAGEKIT_PRIVATEKEY` — ImageKit private key
- `IMAGEKIT_URL` — ImageKit URL endpoint
- `PINECONE_API_KEY` — Pinecone API key
- `PORT` — (optional) port for the backend server (defaults to 3000)

Example `.env` (do not commit this file):

```
MONGO_URI=mongodb+srv://user:pass@cluster.example.mongodb.net/dbname
JWT_SECRET=your_jwt_secret_here
IMAGEKIT_PUBLICKEY=your_imagekit_public_key
IMAGEKIT_PRIVATEKEY=your_imagekit_private_key
IMAGEKIT_URL=https://ik.imagekit.io/your_endpoint
PINECONE_API_KEY=your_pinecone_api_key
PORT=3000
```

Security note: keep keys and secrets out of source control. Use your cloud provider secrets manager or environment configuration for production.

## Where the API base URL is configured in the client

The frontend currently calls the deployed backend using full URLs inside these files (search `https://aura-x4bd.onrender.com`):

- `Frontend/src/pages/Register.jsx`
- `Frontend/src/pages/Login.jsx`
- `Frontend/src/pages/Home.jsx`
- `Frontend/src/components/chat/LogoutButton.jsx`

Recommendation: replace hard-coded URLs with a single `VITE_API_URL` environment variable and use `import.meta.env.VITE_API_URL` to build requests. This makes switching between local and deployed backends trivial.

## Running tests / linting

- Frontend lint script: run `npm run lint` inside `Frontend/` (requires ESLint configured)

There are no unit tests included in the repo at the time of writing.

## Deployment notes

- The backend can be deployed to platforms like Render, Heroku, Railway, or any server that supports Node.js. Ensure env vars and database connectivity are configured.
- The frontend produced by `npm run build` can be hosted on static hosts (Netlify, Vercel, S3) or served from the backend.

If you want me to add Github Actions or a deploy pipeline (Netlify/Vercel/Render) for automatic deployment, tell me which provider you prefer and I can wire it up.

## Memory system (STM / LTM) and RAG

This project implements a hybrid short-term memory (STM) and long-term memory (LTM) flow using the following pieces:

- STM (Short-Term Memory): recent messages from the current chat are pulled from MongoDB. In the socket handler this is the `chatHistory` array which is loaded by:

	- `messageModel.find({ chat: messagePayload.chat }).sort({ createdAt: -1 }).limit(20).lean()` (see `Backend/src/sockets/socket.server.js`).

	Those recent messages are used to build a message-style array `stm` which preserves order and roles and is passed directly to the content generator.

- LTM (Long-Term Memory): relevant past messages are retrieved from Pinecone using vector similarity. The Pinecone client is wrapped in `Backend/src/services/vector.service.js` which exposes `createMemory`, `queryMemory`, and `deleteChatMemory`.

	- When a new message is processed the code generates embeddings via `aiService.embeddingGenerator(...)` and calls `createMemory(...)` to upsert vectors into the `gpt-embeddings` index.
	- For each incoming user message the server calls `queryMemory({ queryVector: vectors, limit: 3, metadata: { user: socket.user._id } })` to fetch the top-k semantically related memories and includes them in `ltm`.

- RAG (Retrieval Augmented Generation): the system composes `ltm` (retrieved, semantically-similar past messages) and `stm` (recent chat history) into a messages array which is then fed to `aiService.contentGeneratorFromMessages([...ltm, ...stm])`. This keeps responses grounded in both immediate context and longer-term memory.

Design notes & behaviour:

- Memory metadata: each stored vector includes metadata `{ chat, user, text }` so the retrieval layer can filter or surface user/chat-specific context.
- The code prioritizes recency in the STM block and relevance in the LTM block; RAG is implemented by concatenating LTM before STM so the model sees retrieved context first but still receives the fresh chat.
- The project stores both user messages and model responses as memories so the system can learn patterns of useful model replies over time.

Extension points:

- Adjust retrieval size: change `limit` passed to `queryMemory` to tune recall vs noise.
- Add metadata filters to scope retrieval (for example by chat topic tags or privacy flags).
- Implement memory aging or LRU eviction by adding timestamps and periodically deleting older vectors with `deleteChatMemory`.

## Deep-thinking / Deep-linking mode

This project includes a lightweight "deep-thinking" mode (called `mode: 'thinking'` in socket payloads) that requests a higher-capability model for complex or multi-step tasks.

- How it's triggered: the frontend may include `mode: 'thinking'` when emitting `ai-message` or `ai-image-message` events. When set, the server sets `modelOverride = 'gemini-2.5-flash'` and passes the override into the AI service call. See `Backend/src/sockets/socket.server.js`.

- What it does: the override requests a stronger model and (optionally) could change other generation parameters (temperature, max tokens, or special system instructions). The current implementation only changes the `model` value; you can extend `aiService` to accept and apply other generation `opts`.

- Deep-linking for complex problems: the app's approach to complex problems combines several tactics:
	1. Use the RAG stack to surface related prior conversations and facts.
	2. Use STM to provide the recent stepwise interaction.
	3. Use `mode: 'thinking'` to request a stronger model and (optionally) a longer response budget.

Developer recommendations for better deep-thinking behaviour:

- Increase `limit` for `queryMemory` to bring more related LTM context for very complex domain problems.
- Add specialized system instructions (or a different persona) when `mode: 'thinking'` to force step-by-step problem solving, verification checks, or math-focused formatting (the AI persona in `ai.service.js` already contains a strong problem-solving workflow which will be used by the model).
- Consider a multi-pass approach: 1) run an initial retrieval+generate pass, 2) extract sub-questions from the response, 3) re-retrieve for each sub-question, and 4) synthesize final answer. This can be implemented in `ai.service` or as another orchestration layer in the socket handler.

## Implementation references (files)

- Vector memory: `Backend/src/services/vector.service.js`
- AI generation & embeddings: `Backend/src/services/ai.service.js`
- Socket handlers, STM/LTM composition and mode handling: `Backend/src/sockets/socket.server.js`
- Image upload handling (image flows use the same STM/LTM pattern): `Backend/src/services/storage.service.js` and `Backend/src/sockets/socket.server.js`

## Examples

Example payload to trigger deep-thinking mode from the front-end (socket emit):

```js
socket.emit('ai-message', {
	chat: '<chatId>',
	content: 'Solve this differential equation: y\\'\\' + 4y = 1 with initial conditions y(0)=1, y'(0)=0',
	mode: 'thinking'
});
```

Example flow for RAG (high-level):

1. User sends a message. Server creates a message document and an embedding for the message.
2. Server queries Pinecone for nearest vectors (LTM) using the message embedding.
3. Server fetches recent chat messages (STM) from MongoDB.
4. Server composes LTM + STM into a messages array and calls `contentGeneratorFromMessages`.
5. Response is returned to the client and stored as a memory (embedding created and upserted).

---

I added the above STM/LTM and deep-thinking descriptions and noted the key extension points. Would you like me to:

- implement `VITE_API_URL` in the frontend and replace the hard-coded backend URLs? (small, safe change)
- add a `.env.example` into `Backend/` with the env variables listed? (small, safe change)
- add a short developer doc `docs/memory.md` with code snippets for changing retrieval parameters and a sample multi-pass orchestration? (more work)

Pick one and I'll implement it next.
## Troubleshooting

- If the frontend cannot reach the backend, check the API base URL in the client code and ensure CORS and cookies are correctly configured on the backend.
- DB connection errors indicate a wrong `MONGO_URI` or network access rules (e.g., IP whitelist on MongoDB Atlas).

## Contributing

If you want to contribute, fork the repo and open a PR with a short description of the change. For major changes, open an issue first to discuss.

## License

This repo does not contain a license file. Add a `LICENSE` if you want to define usage terms.

---

If you want I can:

- update the frontend to use `VITE_API_URL` instead of hard-coded URLs (small code change)
- add a `.env.example` file with placeholders
- add a GitHub Action to build the frontend and deploy the backend to Render/Heroku

Tell me which of the above you'd like next.

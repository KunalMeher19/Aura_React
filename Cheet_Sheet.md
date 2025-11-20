# Aura (AI Assistant) – Interview Study Guide

This guide maps your CV bullets to the actual code so you can explain Aura clearly in interviews. It includes architecture, data flow, RAG/memory, Deep Think mode, trade-offs, and Q&A with concrete references to files in this repo.

## Executive summary
Aura is a full‑stack AI chat assistant with context‑aware responses, long‑term memory (RAG), and a Deep Think mode for harder queries. Stack: React/Vite (Frontend), Node/Express + Socket.IO (Backend), MongoDB (chat history), Pinecone (vector memory), Google Gemini (LLM + embeddings), ImageKit (media hosting).

---

## Architecture overview
- Frontend (React, Vite)
  - Components: `Frontend/src/components/chat/*` (Composer, Messages, Sidebar)
  - Real‑time via Socket.IO: configured in `Frontend/src/pages/Home.jsx`
  - Mode toggle: Normal vs Thinking in `ChatComposer.jsx` → sent with each message
  - Markdown + KaTeX rendering of AI output: `ChatMessages.jsx`
- Backend (Node/Express)
  - HTTP API: `Backend/src/routers/chat.router.js` → `chat.controllers.js`
  - Real‑time: `Backend/src/sockets/socket.server.js`
  - AI provider (Gemini): `Backend/src/services/ai.service.js`
  - Vector memory (Pinecone): `Backend/src/services/vector.service.js`
  - Image storage (ImageKit): `Backend/src/services/storage.service.js`
  - Data models: `Backend/src/models/*.js` (user, chat, message)
  - DB connection: `Backend/src/db/db.js`

### Data stores and their roles
- MongoDB (Mongoose)
  - Users: auth + identity (`user.model.js`)
  - Chats: titles, timestamps, `isTemp` flag (`chat.model.js`)
  - Messages: user/model role, content, image URL, prompt (`message.model.js`)
- Pinecone
  - Index: `gpt-embeddings`
  - Vectors: 768‑dim embeddings from `gemini-embedding-001`
  - Metadata: `{ user, chat, text }`
- ImageKit
  - Stores uploaded images; we display a hosted URL after background upload completes

---

## Core flows (step‑by‑step)

### 1) Text message (Normal mode)
1. User types message → `ChatComposer.jsx` → `Home.jsx` emits `ai-message` on the socket with `{ chat, content, mode: 'normal' }`.
2. Server handler (`socket.server.js`):
   - Persist user message in Mongo (`messageModel.create`).
   - Generate embeddings for the prompt (`ai.service.embeddingGenerator`).
   - Retrieve Short‑Term Memory (STM): last 20 messages of this chat from Mongo.
   - Retrieve Long‑Term Memory (LTM): Pinecone `queryMemory` with topK=3, filter `{ user: <userId> }`.
   - Build model input as messages array: [LTM preamble with instructions] + [STM turn‑by‑turn].
   - Choose model: `gemini-2.0-flash` (normal) → `contentGeneratorFromMessages`.
   - Emit `ai-response` to client with text and possibly updated chat title.
   - In background: embed the AI response and upsert both user+AI messages to Pinecone.

### 2) Text message (Deep Think / Thinking mode)
Same as Normal mode, but server switches to `gemini-2.5-flash` when `mode === 'thinking'` for deeper reasoning.

### 3) Image + text message
1. User attaches an image → `ChatComposer.jsx` shows a local preview. `Home.jsx` emits `ai-image-message` with a data URL plus optional prompt.
2. Server (`socket.server.js`):
   - Parse/normalize base64; detect/convert image (HEIC/HEIF → JPEG), optionally resize via Sharp.
   - Persist the user message immediately (fast UX); generate AI response with `contentGenerator` (image + text parts).
   - Emit `ai-response` right away (no upload blocking).
   - Background upload to ImageKit → when done, emit `image-uploaded` so client replaces preview with hosted URL.
   - Background embeddings for user prompt and AI response → create Pinecone memories.

### 4) New chat, list chats, fetch messages, delete chat
- New chat: `POST /api/chat` → creates a chat with a title (or temp chat on login). First real message auto‑renames temp chats via `generateTitleFromText`.
- List chats: `GET /api/chat` (sorted by recent activity; temp chat cleanup logic included).
- Fetch messages: `GET /api/chat/messages/:id` (chronological).
- Delete chat: `DELETE /api/chat/messages/:id` → removes chat, messages, and Pinecone vectors (`deleteChatMemory`).

---

## RAG and memory design
- Embeddings: `gemini-embedding-001` (768 dims) via `ai.service.embedContent`.
- Storage: Pinecone index `gpt-embeddings`. Each vector carries metadata `{ user, chat, text }`.
- Query: On new prompt, embed it, `topK=3`, filter `{ user: userId }`, `includeMetadata: true`.
- Prompt composition:
  - LTM: a single message that contains a short instruction block and the concatenated `text` values from the topK matches, instructing the model to prioritize relevance and recent messages and ignore irrelevant items.
  - STM: last 20 messages of the current chat turned into role/parts for the Gemini chat API.
- Why it helps: STM preserves local conversational coherence; LTM brings back relevant knowledge across chats without bloating the prompt.

References:
- `Backend/src/services/ai.service.js`
- `Backend/src/services/vector.service.js`
- `Backend/src/sockets/socket.server.js`

---

## Deep Think mode
- UX: Toggle in `ChatComposer.jsx` (Normal ↔ Thinking), state sent with each message.
- Server: If `mode === 'thinking'`, use `gemini-2.5-flash` instead of `gemini-2.0-flash`.
- Contract stays the same; only model selection changes. Great for complex problems at a small latency cost.

References:
- `Frontend/src/components/chat/ChatComposer.jsx`
- `Backend/src/sockets/socket.server.js`

---

## Chat continuity and titles
- All messages persisted in Mongo under the chat ID → easy reload of full history.
- Temp chats on login (for quick start) get auto‑renamed on the first message using `generateTitleFromText(text)` (Gemini), giving concise, human‑friendly titles.

References:
- `Backend/src/models/chat.model.js`
- `Backend/src/controllers/auth.controllers.js` (temp chat creation)
- `Backend/src/sockets/socket.server.js` (title generation logic)

---

## Security and privacy
- JWT stored in cookie; HTTP routes protected by `auth.middleware.js`.
- Socket.IO authenticates by parsing/verifying the cookie token during handshake.
- Pinecone queries filtered by `{ user: id }` to avoid cross‑user leakage.
- Increased `maxHttpBufferSize` for images and explicit CORS on the socket.

References:
- `Backend/src/middlewares/auth.middleware.js`
- `Backend/src/sockets/socket.server.js`

---

## Performance choices
- Immediate AI response before background image upload and embeddings → minimizes perceived latency.
- Image downscaling/format normalization (Sharp) → smaller payloads/faster processing.
- STM limited to last 20 messages; LTM topK=3 → keeps prompts small, stable latency.
- Temp chat cleanup → keeps chat list fast and tidy.

---

## Trade‑offs & future improvements
- No streaming responses yet → consider server‑side streaming for better UX.
- Add a re‑ranker on top of Pinecone for higher precision on retrievals.
- Hybrid memory scope: blend per‑chat and per‑user context with weights.
- Add rate limiting and abuse detection on sockets and API.
- Structured feedback (like/dislike) wiring to a quality loop.

---

## Short pitch (memorize in ~30–45 seconds)
“Aura is a React + Node/Express AI chat app with Mongo for chat history, Pinecone for vector memory, and Google Gemini for both generation and embeddings. Each reply merges short‑term context (last 20 messages) with long‑term memory from Pinecone (top 3 semantically similar items filtered by user) to keep answers accurate and consistent. A Deep Think mode switches to a more capable model for complex queries. It supports image inputs, responding immediately and uploading in the background. Real‑time is via Socket.IO, and deleting a chat removes the DB records and vector memories.”

---

## File references you can cite
- LLM calls & embeddings: `Backend/src/services/ai.service.js`
- Vector memory: `Backend/src/services/vector.service.js`
- Real‑time + STM/LTM composition + Deep Think switch: `Backend/src/sockets/socket.server.js`
- Models & persistence: `Backend/src/models/*.js`
- REST endpoints: `Backend/src/routers/chat.router.js`, `Backend/src/controllers/chat.controllers.js`
- Frontend messaging & UI: `Frontend/src/pages/Home.jsx`, `Frontend/src/components/chat/*`

---

## Likely interview questions (with answers)
1) Why RAG vs just the chat history?  
STM captures the last turns; RAG brings in semantically similar info across earlier chats. This improves accuracy and continuity without overloading prompts.

2) How do you prevent irrelevant memory from confusing the model?  
Limit topK (3), filter by user, and wrap retrieved text in an instruction telling the model to ignore irrelevant context and prioritize recent messages. A re‑ranker can further improve precision.

3) What changes in Deep Think mode?  
Only model selection: Normal → `gemini-2.0-flash`; Thinking → `gemini-2.5-flash`. Same request structure; more capable model for deeper reasoning at some latency cost.

4) How do you avoid cross‑user data leakage in memory?  
Pinecone queries use a metadata filter `{ user: userId }`. Each vector is stored with the user id.

5) How are chat titles generated?  
First real message triggers `generateTitleFromText` (Gemini) to create a 3–6 word title; applied to temp chats for a clean sidebar.

6) What happens when a user sends an image?  
We process image (detect/convert/resize), respond immediately using the inline image + text, upload to ImageKit in the background, then swap the preview with the hosted URL when done.

7) How do you handle AI or upload failures?  
`ai.service` returns a safe fallback text if the API errors. Upload errors emit a client event; the UI marks the preview as failed so the user can retry.

8) What’s the token budget strategy?  
Limit STM to 20 messages and LTM to topK=3. This balances context richness with latency and cost.

9) How would you scale this?  
Add a Socket.IO adapter (Redis) for horizontal scale; move background embeddings/uploads to a queue (BullMQ). Consider streaming responses and a CDN for assets.

10) How do you measure quality?  
Track response time, token usage, retrieval hit rates and distances, user feedback (like/dislike), and whether retrieved snippets appear in helpful answers.

11) How do you delete a chat “cleanly”?  
Delete Mongo chat and messages, and call `deleteChatMemory` to remove vectors for that chat in Pinecone.

12) Any security considerations?  
JWT cookie auth for HTTP and sockets; Pinecone filter by user; CORS configured; buffer limits on socket; sanitize inputs; no secrets in the client.

---

## Edge cases handled
- Image formats like HEIC/HEIF are normalized to JPEG; large images downscaled.
- AI provider failures return a safe mock response; logs preserved for debugging.
- Temp chats are auto‑cleaned when unused; reduces clutter and queries.
- Socket reconnects are surfaced to the user (toasts) via client listeners.

---

## Where in code (deep links)
- STM/LTM composition & mode switch: `Backend/src/sockets/socket.server.js`
- Embeddings + generations: `Backend/src/services/ai.service.js`
- Pinecone upsert/query/delete: `Backend/src/services/vector.service.js`
- Temp chat title generation: `generateTitleFromText` in `ai.service.js` and usage in `socket.server.js`
- Image processing & upload: `socket.server.js` + `storage.service.js`

---

## Optional improvements (next steps)
- Streaming token‑by‑token responses for better UX.
- Re‑ranking retrieved chunks and/or hybrid search.
- Per‑chat vs per‑user memory weighting.
- Feedback‑driven fine‑tuning or prompt adaptation.
- Tests for socket flows and retrieval quality.
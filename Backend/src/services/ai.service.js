// Dynamic import for OpenRouter SDK (ESM-only package in CommonJS project)
let OpenRouter;
(async () => {
  const mod = await import('@openrouter/sdk');
  OpenRouter = mod.OpenRouter;
})();

// Initialize OpenRouter client
let openRouter;
function getClient() {
  if (!openRouter && OpenRouter) {
    openRouter = new OpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        'HTTP-Referer': 'https://aura-x4bd.onrender.com',
        'X-OpenRouter-Title': 'Aura',
      },
    });
  }
  return openRouter;
}

// Wait for SDK to load, then create client
async function ensureClient() {
  if (!OpenRouter) {
    await new Promise(r => setTimeout(r, 100));
  }
  const client = getClient();
  if (!client) throw new Error('OpenRouter SDK failed to initialize');
  return client;
}

// Model configuration
const MODELS = {
  NORMAL: 'meta-llama/llama-3.3-70b-instruct:free',       // Fast, lightweight for normal chat
  THINKING: 'stepfun/step-3.5-flash:free',                 // Reasoning model for thinking mode
  VISION: 'nvidia/nemotron-nano-12b-v2-vl:free',           // Vision model for image extraction
  TITLE: 'meta-llama/llama-3.3-70b-instruct:free',         // Quick model for title generation
  EMBEDDING: 'nvidia/llama-nemotron-embed-vl-1b-v2:free'   // Embedding model
};

// System instruction for Aura persona
const SYSTEM_INSTRUCTION = `
<persona>
    <name>Aura</name>
    <creator>
        <name>Ardhendu Abhishek Meher</name>
        <role>Developer and Designer</role>
        <description>Passionate about AI, web apps, and smooth user experiences. Loves building cool, practical tools.</description>
        <contact>https://www.bytecode.live/portfolio</contact>
    </creator>
    <mission>Be a helpful, accurate AI assistant with a playful, upbeat vibe. Empower users to build, learn, and create fast.</mission>
    <voice>Dark humour, friendly, concise, Gen-Z energy without slang overload. Use plain language. Add light emojis sparingly when it fits (never more than one per short paragraph). Adjust tone if needed to match context (e.g., more serious, empathetic, or straightforward).</voice>
    <values>Honesty, clarity, practicality, user-first. Admit limits. Prefer actionable steps over theory.</values>
    <behavior>
        <tone>Playful yet professional, with light dark humour where appropriate. Adjust tone for context (serious for math proofs, casual for general tips).</tone>
        <formatting>
            Default:
            - Clear headings (###), short paragraphs, minimal lists.
            - Separate sections with blank lines for readability.

            Math:
            - Inline math: Use '$ ... $' for expressions within a sentence.
            - Display math: Use '$$ ... $$' for standalone equations, each on its own line.
            - Complex derivations: Break into steps with numbered or bulleted points; each equation in '$$ ... $$'.
            - Align multi-step derivations using LaTeX line breaks when appropriate.
            - Final answers: Always present clearly in display math with proper fraction, exponent, and trig formatting.
            - Final answers: present in display math and boxed when appropriate.
            - Fenced code blocks for programming examples; include filename when relevant.

            Code & Snippets:
            - Use fenced code blocks for programming examples.
            - Include file names above code blocks when relevant.

            Style:
            - Light emoji usage (max one per short paragraph).
            - No excessive bolding; use **bold** only for section headers or emphasis.
            - Keep spacing consistent between text, equations, and lists.
        </formatting>
        <interaction>If the request is ambiguous, briefly state assumptions and proceed. Offer a one-line clarifying question only when necessary.</interaction>
        <safety>Do not provide disallowed, harmful, or private information. Refuse clearly and offer safer alternatives.</safety>
        <truthfulness>If unsure, say so and provide best-effort guidance or vetted sources. Do not invent facts, code, APIs, or prices.</truthfulness>
    </behavior>
    <capabilities>
        <reasoning>Think step-by-step internally; share only the useful outcome. Show calculations or assumptions when it helps the user.</reasoning>
        <structure>Start with a quick answer or summary. Follow with steps, examples, or code. End with a brief "Next steps" when relevant.</structure>
        <code>Provide runnable, minimal code. Include file names when relevant. Explain key decisions with one-line comments. Prefer modern best practices.</code>
    </capabilities>
    <constraints>
        <privacy>Never request or store sensitive personal data beyond what's required. Avoid sharing credentials, tokens, or secrets.</privacy>
        <claims>Don't guarantee outcomes or timelines. No "I'll keep working" statements.</claims>
        <styleLimits>No purple prose. No excessive emojis. No walls of text unless explicitly requested.</styleLimits>
    </constraints>
    <identity>You are "Aura". Refer to yourself as Aura when self-identifying. Add tasteful dark humour occasionally, but always keep relevance and user comfort in mind.</identity>
</persona>
`;

// Generate a concise title from a user's first prompt
async function generateTitleFromText(text) {
    const prompt = `Generate a very short, 3-6 word title (no quotes) summarizing this chat topic. Keep it concise and descriptive. Text: "${text.slice(0, 400)}"`;
    try {
        const client = await ensureClient();
        const response = await client.chat.send({
            model: MODELS.TITLE,
            messages: [
                { role: 'system', content: 'You are a helpful assistant that generates concise chat titles.' },
                { role: 'user', content: prompt }
            ],
            stream: false,
        });

        const title = response.choices?.[0]?.message?.content || '';
        return title.trim().replace(/^["'`]|["'`]$/g, '').slice(0, 80) || 'New Chat';
    } catch (e) {
        console.warn('Title generation failed:', e.message);
        return text ? (text.split('\n')[0].slice(0, 40) + (text.length > 40 ? '…' : '')) : 'New Chat';
    }
}

// Extract text description from an image using the vision model
async function extractImageInfo(base64ImageFile, mimeType) {
    try {
        const client = await ensureClient();
        const response = await client.chat.send({
            model: MODELS.VISION,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: 'Describe this image in detail. Include all visible text, objects, colors, layout, and any other relevant information that would help someone understand and answer questions about this image.'
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:${mimeType};base64,${base64ImageFile}`
                            }
                        }
                    ]
                }
            ],
            stream: false,
        });

        return response.choices?.[0]?.message?.content || 'Unable to extract information from the image.';
    } catch (err) {
        console.warn('Vision model failed:', err.message);
        return 'Unable to analyze the image. Please describe what you see in the image so I can help you.';
    }
}

// Generate content with optional image input
// For images: two-step flow (vision extraction → reasoning)
// For text only: single call to appropriate model
async function contentGenerator(base64ImageFile, userPrompt, opts = {}) {
    const modelName = opts.model || MODELS.THINKING;

    // Parse base64 image if provided
    let mimeTypeDetected;
    let base64Data = base64ImageFile;

    // If it's a data URI, extract the mime type and raw base64 payload
    const dataUriMatch = String(base64ImageFile || '').match(/^data:(image\/[a-zA-Z+.-]+);base64,(.*)$/);
    if (dataUriMatch) {
        mimeTypeDetected = dataUriMatch[1];
        base64Data = dataUriMatch[2];
    }

    // Allow caller override via opts.mimeType, otherwise use detected or default to jpeg
    const mimeType = opts.mimeType || mimeTypeDetected || 'image/jpeg';

    try {
        const client = await ensureClient();

        let userContent;

        if (base64Data) {
            // Two-step flow: extract image info first, then reason with stepfun
            const imageDescription = await extractImageInfo(base64Data, mimeType);

            userContent = `The user uploaded an image. Here is what the image contains:

---
${imageDescription}
---

The user's question/prompt about this image: ${userPrompt || 'What is in this image?'}

Please analyze the image content above and provide a helpful response to the user's question.`;
        } else {
            userContent = userPrompt;
        }

        const response = await client.chat.send({
            model: modelName,
            messages: [
                { role: 'system', content: SYSTEM_INSTRUCTION },
                { role: 'user', content: userContent }
            ],
            stream: false,
        });

        return response.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';
    } catch (err) {
        console.warn('AI content generation failed, returning fallback response:', err.message);

        const apiMessage = err?.message || 'AI service unavailable.';
        const hasImage = !!base64Data;
        const promptPreview = userPrompt ? String(userPrompt).trim().slice(0, 200) : '';

        if (hasImage) {
            return `AI service error: ${apiMessage} Mock response: I received your image${promptPreview ? ' and prompt: ' + promptPreview : '.'}`;
        } else {
            return `AI service error: ${apiMessage} Mock response: I received your prompt${promptPreview ? ': ' + promptPreview : '.'}`;
        }
    }
}

/*
 * Generate content when the caller already supplies message-style contents
 * (e.g. an array like [...ltm, ...stm] where each item has `parts`).
 * Converts Gemini message format to OpenRouter/OpenAI format.
 */
async function contentGeneratorFromMessages(contentsArray, opts = {}) {
    // Select model based on mode - thinking mode uses stepfun, normal uses llama
    const modelName = opts.model || MODELS.NORMAL;
    console.log(`[ai.service] contentGeneratorFromMessages using model: ${modelName}`);

    try {
        const client = await ensureClient();

        // Convert Gemini-style messages to OpenAI format
        const messages = [
            { role: 'system', content: SYSTEM_INSTRUCTION }
        ];

        // Convert each content item from Gemini format to OpenAI format
        // Gemini format: { role: 'user'|'model', parts: [{ text: '...' }] }
        // OpenAI format: { role: 'user'|'assistant'|'system', content: '...' }
        contentsArray.forEach(item => {
            if (!item || !item.parts) return;

            // Extract text from parts
            const textParts = item.parts
                .filter(p => p && p.text)
                .map(p => p.text)
                .join('\n');

            if (!textParts) return;

            // Map role: 'model' -> 'assistant', 'user' -> 'user'
            const role = item.role === 'model' ? 'assistant' : 'user';

            messages.push({
                role: role,
                content: textParts
            });
        });

        const response = await client.chat.send({
            model: modelName,
            messages: messages,
            stream: false,
        });

        return response.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';
    } catch (err) {
        console.warn('AI content generation failed (messages path):', err.message);

        const message = err?.message || 'AI service unavailable.';

        // Build a preview text from the provided parts
        let textParts = [];
        try {
            (contentsArray || []).forEach(item => {
                if (item && item.parts) {
                    item.parts.forEach(p => {
                        if (p && p.text) textParts.push(p.text);
                        if (p && p.inlineData) textParts.push('[image]');
                    });
                }
            });
        } catch (e) {
            // ignore
        }

        const combined = textParts.join(' ').trim().slice(0, 200);
        const hasImage = textParts.some(t => t === '[image]');

        if (hasImage) {
            return `AI service error for image: ${message} `;
        } else {
            return `AI service error for prompt: ${message} `;
        }
    }
}

/* Generate embeddings for content */
async function embeddingGenerator(content) {
    try {
        const client = await ensureClient();
        const response = await client.embeddings.generate({
            model: MODELS.EMBEDDING,
            input: content,
            dimensions: 768,
        });

        // Response format: { data: [{ embedding: number[] }], model, usage }
        if (typeof response === 'object' && 'data' in response) {
            const embedding = response.data?.[0]?.embedding;
            if (Array.isArray(embedding)) {
                return embedding;
            }
        }

        throw new Error('Unexpected embedding response format');
    } catch (err) {
        console.error('Embedding generation failed:', err.message);
        throw err;
    }
}

module.exports = {
    contentGenerator,
    contentGeneratorFromMessages,
    embeddingGenerator,
    generateTitleFromText,
};

const OpenAI = require('openai');

// Initialize OpenAI client with API key from environment
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Model configuration
const MODELS = {
    BASIC: 'gpt-4o-mini',           // Fast, cost-effective for basic tasks
    THINKING: 'gpt-5',              // Reasoning model for thinking mode
    VISION: 'gpt-4o',               // Vision-capable model for images
    TITLE: 'gpt-4o-mini',           // Quick model for title generation
    EMBEDDING: 'text-embedding-3-small'  // 768 dimensions
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
            - Align multi-step derivations using LaTeX line breaks (e.g., '\\\\') when appropriate.
            - Final answers: Always present clearly in display math with proper fraction, exponent, and trig formatting.
            - Final answers: present in display math and boxed when appropriate (e.g., '\\boxed{...}').
            - Fenced code blocks for programming examples; include filename when relevant.
            - Examples:
            '''
            The Laplace transform of $y''+4y=1$ is:
            
            $$
            Y(s) = \\frac{1}{s^2 + 4}
            $$
            '''

            Code & Snippets:
            - Use fenced code blocks ('''language) for programming examples.
            - Include file names above code blocks when relevant.

            Style:
            - Light emoji usage (max one per short paragraph).
            - No excessive bolding; use **bold** only for section headers or emphasis.
            - Keep spacing consistent between text, equations, and lists.
        </formatting>
        <problem_solving>
    <principle>
        For complex math problems, prefer correctness and verifiability over verbosity.
    </principle>

    <workflow>
        1. **Restate the problem** succinctly in one sentence (use inline math where helpful).
        2. **Outline the approach** in 1–3 bullet lines (no internal deliberation revealed).
        3. **Compute**: show essential steps using display math ('$$ ... $$'). Keep steps clear; skip trivial algebra unless requested.
        4. **Verify** automatically:
        - **Initial conditions check** (for ODEs): evaluate "y(0), y'(0), ..." and show results.
        - **Plug-in residual check**: compute the left-hand side minus right-hand side symbolically when feasible, otherwise numerically at 2–3 sample 't' points and show the residual values.
        - **Partial-fraction / transform pair checks**: confirm transforms/inverses match standard pairs.
        - **Sanity checks**: limits, continuity, and dimensional consistency if applicable.
        5. **Report verification**: list which checks passed/failed. If a check fails, correct the solution until all key checks pass.
        6. **Final answer**: present the concise boxed result in display mode, then a one-line concluding remark (e.g., initial-condition confirmation).
    </workflow>

    <verification_details>
        - Numerical spot-checks: evaluate residual at 't=0' and 't=1' (or user-specified points) with results shown to ~6 decimal places.
        - If symbolic residual simplifies to '0', show '0'. If not, show numeric residuals and explain magnitude.
        - For transforms, use known Laplace pairs and show the pair in a one-line comment.
    </verification_details>

    <cognitive_constraints>
        - **Do not reveal internal chain-of-thought or private deliberation.**
        - You may say: "I verified the solution by checking initial conditions and plugging it back into the ODE," and then show the *results* of those checks.
        - If the user asks for the internal chain-of-thought, politely refuse and offer a clear step-by-step **summary** of the approach and verification instead.
    </cognitive_constraints>

    <output_format>
        - Start with a one-line answer summary.
        - Then show the stepwise derivation with display math blocks.
        - After derivation, show verification block (initial conditions, residuals, numeric checks).
        - End with the final boxed solution:
        $$
        \\boxed{\\,y(t)=\\dots\\,}
        $$
        - Optionally add "Next steps" or "Want a shorter/longer explanation?" prompt.
    </output_format>
    </problem_solving>
        <interaction>If the request is ambiguous, briefly state assumptions and proceed. Offer a one-line clarifying question only when necessary. Adjust tone and humour based on context; keep things engaging but relevant. Complete tasks now; no background claims.</interaction> 
        <safety>Do not provide disallowed, harmful, or private information. Refuse clearly and offer safer alternatives.</safety> 
        <truthfulness>If unsure, say so and provide best-effort guidance or vetted sources. Do not invent facts, code, APIs, or prices.</truthfulness> 
        <math_explanations>
            - Present step-by-step solutions.
            - Show reasoning via clean LaTeX equations.
            - Summarize at the end with a final boxed or bolded equation.
        </math_explanations>
        <examples>
            - Use real equations in LaTeX.
            - Provide at least one worked example per topic if explanation is abstract.
        </examples>
    </behavior> 
    <capabilities> 
        <math_checks>
            - auto-check-initial-conditions: true
            - auto-plug-in-residual: true
            - numeric-spot-checks: [t=0, t=1] (default)
            - require-passes: initial_conditions && (residuals small)
        </math_checks>
        <reasoning>Think step-by-step internally; share only the useful outcome. Show calculations or assumptions when it helps the user.</reasoning> 
        <structure>Start with a quick answer or summary. Follow with steps, examples, or code. End with a brief "Next steps" when relevant.</structure> 
        <code>Provide runnable, minimal code. Include file names when relevant. Explain key decisions with one-line comments. Prefer modern best practices.</code> 
        <examples>Use concrete examples tailored to the user's context when known. Avoid generic filler.</examples> 
    </capabilities> 
    <constraints> 
        <privacy>Never request or store sensitive personal data beyond what's required. Avoid sharing credentials, tokens, or secrets.</privacy> 
        <claims>Don't guarantee outcomes or timelines. No "I'll keep working" statements.</claims> 
        <styleLimits>No purple prose. No excessive emojis. No walls of text unless explicitly requested.</styleLimits> 
    </constraints> 
    <tools> 
        <browsing>Use web browsing only when the answer likely changes over time (news, prices, laws, APIs, versions) or when citations are requested. When you browse, cite 1–3 trustworthy sources inline at the end of the relevant paragraph.</browsing> 
        <codeExecution>If executing or generating files, include clear run instructions and dependencies. Provide download links when a file is produced.</codeExecution> 
    </tools> 
    <task_patterns> 
        <howto>1) State goal, 2) List prerequisites, 3) Give step-by-step commands/snippets, 4) Add a quick verification check, 5) Provide common pitfalls.</howto> 
        <debugging>Ask for minimal reproducible details (env, versions, error text). Offer a hypothesis → test → fix plan with one or two variants.</debugging> 
        <planning>Propose a lightweight plan with milestones and rough effort levels. Offer an MVP path first, then nice-to-haves.</planning> 
    </task_patterns> 
    <refusals>
        If a request is unsafe or disallowed: - Briefly explain why, - Offer a safe, closest-possible alternative, - Keep tone kind and neutral.
        <chain_of_thought_request>
            If user requests internal chain-of-thought: refuse and offer a short, precise summary of steps and checks performed.
        </chain_of_thought_request>
    </refusals> 
    <personalization>Adapt examples, stack choices, tone, and explanations to the user's stated preferences and skill level. If unknown, default to modern, widely used tools.</personalization> 
    <finishing_touches>End with a small "Want me to tailor this further?" nudge when customization could help (e.g., specific stack, version, region).</finishing_touches> 
    <identity>You are "Aura". Refer to yourself as Aurora when self-identifying. Add tasteful dark humour occasionally, but always keep relevance and user comfort in mind.</identity> 
</persona>
`;

// Generate a concise title from a user's first prompt
async function generateTitleFromText(text) {
    const prompt = `Generate a very short, 3-6 word title (no quotes) summarizing this chat topic. Keep it concise and descriptive. Text: "${text.slice(0, 400)}"`;
    try {
        const response = await openai.chat.completions.create({
            model: MODELS.TITLE,
            messages: [
                { role: 'system', content: 'You are a helpful assistant that generates concise chat titles.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.6,
            max_tokens: 20
        });

        const title = response.choices[0]?.message?.content || '';
        return title.trim().replace(/^"|"$/g, '').slice(0, 80) || 'New Chat';
    } catch (e) {
        console.warn('Title generation failed:', e.message);
        return text ? (text.split('\n')[0].slice(0, 40) + (text.length > 40 ? '…' : '')) : 'New Chat';
    }
}

// Generate content with optional image input
async function contentGenerator(base64ImageFile, userPrompt, opts = {}) {
    const modelName = opts.model || MODELS.VISION;

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
        // Build messages array
        const messages = [
            { role: 'system', content: SYSTEM_INSTRUCTION }
        ];

        // If we have an image, use vision format
        if (base64Data) {
            messages.push({
                role: 'user',
                content: [
                    { type: 'text', text: userPrompt || 'What is in this image?' },
                    {
                        type: 'image_url',
                        image_url: {
                            url: `data:${mimeType};base64,${base64Data}`
                        }
                    }
                ]
            });
        } else {
            // Text-only message
            messages.push({
                role: 'user',
                content: userPrompt
            });
        }

        // Configure API parameters based on model type
        let apiParams;
        if (modelName === 'o3-mini' || modelName.startsWith('o1-')) {
            // o3-mini/o1 don't support system messages, temperature, or max_tokens in the standard way
            const systemContent = messages.find(m => m.role === 'system')?.content;
            const userMessages = messages.filter(m => m.role !== 'system');

            // Prepend system instruction to first user message if exists
            if (userMessages.length > 0 && systemContent) {
                if (Array.isArray(userMessages[0].content)) {
                    // For image messages, prepend to the text part
                    const textContent = userMessages[0].content.find(c => c.type === 'text');
                    if (textContent) {
                        textContent.text = `${systemContent}\n\n${textContent.text}`;
                    }
                } else {
                    // For text-only messages
                    userMessages[0].content = `${systemContent}\n\n${userMessages[0].content}`;
                }
            }

            apiParams = {
                model: modelName,
                messages: userMessages,
                max_completion_tokens: 2000  // thinking models use max_completion_tokens
            };
        } else {
            apiParams = {
                model: modelName,
                messages: messages,
                temperature: 0.8,
                max_tokens: 2000
            };
        }

        const response = await openai.chat.completions.create(apiParams);

        return response.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
    } catch (err) {
        console.warn('AI content generation failed, returning fallback response:', err.message);

        const apiMessage = err?.response?.data?.message || err?.message || 'AI service unavailable.';
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
 * Converts Gemini message format to OpenAI format.
 */
async function contentGeneratorFromMessages(contentsArray, opts = {}) {
    // Select model based on mode - basic vs thinking
    const modelName = opts.model || MODELS.BASIC;
    console.log(`[ai.service] contentGeneratorFromMessages using model: ${modelName}`);

    try {
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

        // For o3-mini/o1 model, we need to remove system message and use specific parameters
        let apiParams;
        if (modelName === 'o3-mini' || modelName.startsWith('o1-')) {
            // o3-mini doesn't support system messages, temperature, or max_tokens
            // Move system instruction to first user message
            const systemContent = messages.find(m => m.role === 'system')?.content;
            const userMessages = messages.filter(m => m.role !== 'system');

            // Prepend system instruction to first user message if exists
            if (userMessages.length > 0 && systemContent) {
                userMessages[0].content = `${systemContent}\n\n${userMessages[0].content}`;
            }

            apiParams = {
                model: modelName,
                messages: userMessages,
                max_completion_tokens: 2000  // o3-mini uses max_completion_tokens instead of max_tokens
            };
        } else {
            apiParams = {
                model: modelName,
                messages: messages,
                temperature: 0.8,
                max_tokens: 2000
            };
        }

        const response = await openai.chat.completions.create(apiParams);

        return response.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
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
        const response = await openai.embeddings.create({
            model: MODELS.EMBEDDING,
            input: content,
            dimensions: 768  // Match the original 768 dimensions from Gemini
        });

        return response.data[0].embedding;
    } catch (err) {
        console.error('Embedding generation failed:', err.message);
        throw err;
    }
}

module.exports = {
    contentGenerator,
    contentGeneratorFromMessages,
    embeddingGenerator,
    generateTitleFromText
};
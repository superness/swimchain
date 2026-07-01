/**
 * chat-api.js - Wrapper for claudeplus /api/chat/send endpoint with polling
 *
 * Provides async/await interface for sending chat messages and polling for responses.
 */

const http = require('http');
const https = require('https');

const DEFAULT_CONFIG = {
    baseUrl: 'http://localhost:3000',
    pollInterval: 1000,      // Poll every 1 second
    pollTimeout: 300000,     // 5 minute timeout for long responses
    maxRetries: 3,
    retryDelay: 1000
};

class ChatAPI {
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.baseUrl = new URL(this.config.baseUrl);
    }

    /**
     * Make an HTTP request
     */
    async _request(method, path, body = null, headers = {}) {
        const url = new URL(path, this.baseUrl);
        const isHttps = url.protocol === 'https:';
        const transport = isHttps ? https : http;

        const options = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...headers
            }
        };

        if (body) {
            const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
            options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
        }

        return new Promise((resolve, reject) => {
            const req = transport.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = data ? JSON.parse(data) : {};
                        resolve({
                            status: res.statusCode,
                            headers: res.headers,
                            data: parsed
                        });
                    } catch (e) {
                        resolve({
                            status: res.statusCode,
                            headers: res.headers,
                            data: data,
                            parseError: e.message
                        });
                    }
                });
            });

            req.on('error', reject);
            req.setTimeout(30000, () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            if (body) {
                req.write(typeof body === 'string' ? body : JSON.stringify(body));
            }
            req.end();
        });
    }

    /**
     * Send a chat message and get immediate response with conversation ID
     * @param {string} message - The message to send
     * @param {string} conversationId - Optional existing conversation ID
     * @param {object} options - Additional options (model, system prompt, etc.)
     * @returns {Promise<{conversationId: string, messageId: string, status: string}>}
     */
    async send(message, conversationId = null, options = {}) {
        const payload = {
            message,
            ...options
        };

        if (conversationId) {
            payload.conversationId = conversationId;
        }

        let lastError;
        for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
            try {
                const response = await this._request('POST', '/api/chat/send', payload);

                if (response.status >= 200 && response.status < 300) {
                    return response.data;
                }

                if (response.status === 429) {
                    // Rate limited, wait and retry
                    const retryAfter = parseInt(response.headers['retry-after'] || '5', 10) * 1000;
                    await this._sleep(retryAfter);
                    continue;
                }

                throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.data)}`);
            } catch (err) {
                lastError = err;
                if (attempt < this.config.maxRetries - 1) {
                    await this._sleep(this.config.retryDelay * (attempt + 1));
                }
            }
        }

        throw lastError;
    }

    /**
     * Poll for message completion status
     * @param {string} messageId - The message ID to poll
     * @param {string} conversationId - The conversation ID
     * @returns {Promise<{status: string, content: string, done: boolean}>}
     */
    async pollStatus(messageId, conversationId) {
        const response = await this._request(
            'GET',
            `/api/chat/status?messageId=${encodeURIComponent(messageId)}&conversationId=${encodeURIComponent(conversationId)}`
        );

        if (response.status >= 200 && response.status < 300) {
            return response.data;
        }

        throw new Error(`Poll failed: HTTP ${response.status}`);
    }

    /**
     * Send a message and poll until response is complete
     * @param {string} message - The message to send
     * @param {string} conversationId - Optional existing conversation ID
     * @param {object} options - Additional options
     * @param {function} onProgress - Optional callback for progress updates
     * @returns {Promise<{conversationId: string, response: string}>}
     */
    async sendAndWait(message, conversationId = null, options = {}, onProgress = null) {
        const sendResult = await this.send(message, conversationId, options);

        const msgId = sendResult.messageId;
        const convId = sendResult.conversationId || conversationId;

        if (!msgId) {
            // Response was immediate (synchronous mode)
            return {
                conversationId: convId,
                response: sendResult.content || sendResult.response || ''
            };
        }

        // Poll for completion
        const startTime = Date.now();
        let lastContent = '';

        while (true) {
            if (Date.now() - startTime > this.config.pollTimeout) {
                throw new Error('Polling timeout exceeded');
            }

            const status = await this.pollStatus(msgId, convId);

            if (onProgress && status.content && status.content !== lastContent) {
                onProgress(status.content, status);
                lastContent = status.content;
            }

            if (status.done || status.status === 'complete' || status.status === 'completed') {
                return {
                    conversationId: convId,
                    messageId: msgId,
                    response: status.content || status.response || ''
                };
            }

            if (status.status === 'error' || status.error) {
                throw new Error(status.error || 'Response generation failed');
            }

            await this._sleep(this.config.pollInterval);
        }
    }

    /**
     * Stream responses using polling with progress callback
     * @param {string} message - The message to send
     * @param {string} conversationId - Optional conversation ID
     * @param {function} onChunk - Callback for each new content chunk
     * @param {object} options - Additional options
     */
    async stream(message, conversationId = null, onChunk, options = {}) {
        let lastLength = 0;

        return this.sendAndWait(message, conversationId, options, (content) => {
            if (content.length > lastLength) {
                const newContent = content.slice(lastLength);
                onChunk(newContent);
                lastLength = content.length;
            }
        });
    }

    /**
     * Create a new conversation
     * @param {object} options - Conversation options (model, system prompt, etc.)
     * @returns {Promise<{conversationId: string}>}
     */
    async createConversation(options = {}) {
        const response = await this._request('POST', '/api/chat/conversation', options);

        if (response.status >= 200 && response.status < 300) {
            return response.data;
        }

        throw new Error(`Failed to create conversation: HTTP ${response.status}`);
    }

    /**
     * Get conversation history
     * @param {string} conversationId - The conversation ID
     * @returns {Promise<{messages: Array}>}
     */
    async getHistory(conversationId) {
        const response = await this._request(
            'GET',
            `/api/chat/history?conversationId=${encodeURIComponent(conversationId)}`
        );

        if (response.status >= 200 && response.status < 300) {
            return response.data;
        }

        throw new Error(`Failed to get history: HTTP ${response.status}`);
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Convenience function for one-shot messages
 */
async function chat(message, options = {}) {
    const api = new ChatAPI(options);
    return api.sendAndWait(message, null, options);
}

/**
 * Create a chat session for multi-turn conversations
 */
function createSession(config = {}) {
    const api = new ChatAPI(config);
    let conversationId = null;

    return {
        async send(message, options = {}) {
            const result = await api.sendAndWait(message, conversationId, options);
            conversationId = result.conversationId;
            return result.response;
        },

        async stream(message, onChunk, options = {}) {
            const result = await api.stream(message, conversationId, onChunk, options);
            conversationId = result.conversationId;
            return result.response;
        },

        getConversationId() {
            return conversationId;
        },

        async getHistory() {
            if (!conversationId) return { messages: [] };
            return api.getHistory(conversationId);
        }
    };
}

// Export for CommonJS
module.exports = {
    ChatAPI,
    chat,
    createSession,
    DEFAULT_CONFIG
};

// CLI usage example when run directly
if (require.main === module) {
    async function main() {
        const args = process.argv.slice(2);

        if (args.length === 0) {
            console.log('Usage: node chat-api.js "Your message here"');
            console.log('       node chat-api.js --base-url http://localhost:3000 "Your message"');
            process.exit(1);
        }

        let baseUrl = DEFAULT_CONFIG.baseUrl;
        let message = args[0];

        // Parse --base-url flag
        const urlIdx = args.indexOf('--base-url');
        if (urlIdx !== -1 && args[urlIdx + 1]) {
            baseUrl = args[urlIdx + 1];
            message = args.filter((_, i) => i !== urlIdx && i !== urlIdx + 1).join(' ');
        }

        console.log(`Sending to ${baseUrl}...`);

        try {
            const api = new ChatAPI({ baseUrl });
            const result = await api.sendAndWait(message, null, {}, (content) => {
                process.stdout.write('\r' + content.slice(-80));
            });

            console.log('\n\n--- Response ---');
            console.log(result.response);
            console.log('\nConversation ID:', result.conversationId);
        } catch (err) {
            console.error('Error:', err.message);
            process.exit(1);
        }
    }

    main();
}

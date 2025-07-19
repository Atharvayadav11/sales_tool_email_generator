const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Gemini API configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Middleware
app.use(cors({
    origin: '*', // Allow all origins - adjust for production
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'AI Email Generator API is running',
        timestamp: new Date().toISOString()
    });
});

// Main email generation endpoint
app.post('/generate-mail', async (req, res) => {
    try {
        const { userPrompt } = req.body;

        // Validate input
        if (!userPrompt || typeof userPrompt !== 'string') {
            return res.status(400).json({
                error: 'Invalid input. Please provide a userPrompt string.'
            });
        }

        if (userPrompt.trim().length === 0) {
            return res.status(400).json({
                error: 'Email prompt cannot be empty.'
            });
        }

        if (userPrompt.length > 2000) {
            return res.status(400).json({
                error: 'Email prompt is too long. Please keep it under 2000 characters.'
            });
        }

        console.log('Generating email for prompt:', userPrompt.substring(0, 100) + '...');

        // Generate email using Gemini API
        const generatedEmail = await generateEmailWithGemini(userPrompt.trim());

        // Return successful response
        res.json({
            generatedEmail,
            timestamp: new Date().toISOString(),
            success: true
        });

    } catch (error) {
        console.error('Error in /generate-mail endpoint:', error);
        
        // Handle different types of errors
        if (error.message.includes('API key')) {
            return res.status(500).json({
                error: 'API configuration error. Please check server settings.'
            });
        }
        
        if (error.message.includes('rate limit') || error.message.includes('quota')) {
            return res.status(429).json({
                error: 'Service temporarily unavailable due to high demand. Please try again later.'
            });
        }

        if (error.message.includes('network') || error.message.includes('timeout')) {
            return res.status(503).json({
                error: 'Service temporarily unavailable. Please try again in a moment.'
            });
        }

        // Generic error response
        res.status(500).json({
            error: 'Failed to generate email. Please try again.',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Generate email using Gemini API
 * @param {string} userPrompt - The user's email brief/topic
 * @returns {Promise<string>} - Generated email content
 */
async function generateEmailWithGemini(userPrompt) {
    try {
        // Construct the prompt for email generation
        const emailPrompt = `You are a professional email writing assistant. Based on the following brief/topic, write a clear, professional, and well-structured email.

Email Brief: ${userPrompt}

Requirements:
1. Write a complete email with appropriate subject line
2. Use professional yet friendly tone
3. Keep it concise but comprehensive
4. Include proper email structure (greeting, body, closing)
5. Make sure the content is relevant to the brief provided
6. Do not include placeholder text like [Your Name] or [Company Name] - use generic professional signatures

Format the response as a complete email that can be sent directly.`;

        const requestBody = {
            contents: [{
                parts: [{
                    text: emailPrompt
                }]
            }],
            generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 1024,
            }
        };

        console.log('Making request to Gemini API...');
        
        const response = await axios.post(
            `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
            requestBody,
            {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 30000 // 30 second timeout
            }
        );

        // Extract the generated text from Gemini response
        if (!response.data || !response.data.candidates || response.data.candidates.length === 0) {
            throw new Error('Invalid response from Gemini API');
        }

        const candidate = response.data.candidates[0];
        
        if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
            throw new Error('No content generated by Gemini API');
        }

        const generatedText = candidate.content.parts[0].text;
        
        if (!generatedText || generatedText.trim().length === 0) {
            throw new Error('Empty response from Gemini API');
        }

        console.log('Email generated successfully');
        return generatedText.trim();

    } catch (error) {
        console.error('Gemini API Error:', error.response?.data || error.message);
        
        if (error.response) {
            // API returned an error response
            const status = error.response.status;
            const errorMessage = error.response.data?.error?.message || 'Unknown API error';
            
            if (status === 400) {
                throw new Error(`Invalid request to AI service: ${errorMessage}`);
            } else if (status === 401 || status === 403) {
                throw new Error('API key authentication failed');
            } else if (status === 429) {
                throw new Error('Rate limit exceeded for AI service');
            } else {
                throw new Error(`AI service error (${status}): ${errorMessage}`);
            }
        } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            throw new Error('Network error: Unable to connect to AI service');
        } else if (error.code === 'ETIMEDOUT') {
            throw new Error('Request timeout: AI service took too long to respond');
        } else {
            throw new Error(`Unexpected error: ${error.message}`);
        }
    }
}

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        error: 'Internal server error',
        timestamp: new Date().toISOString()
    });
});

// 404 handler for unmatched routes
app.use((req, res, next) => {
    res.status(404).json({
        error: 'Endpoint not found',
        availableEndpoints: [
            'GET /health - Check server status',
            'POST /generate-mail - Generate email from prompt'
        ]
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 AI Email Generator API Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`✉️  Email generation: POST http://localhost:${PORT}/generate-mail`);
    console.log(`🔑 Using Gemini API key: ${GEMINI_API_KEY ? 'Configured' : 'Missing'}`);
    
    if (!GEMINI_API_KEY) {
        console.warn('⚠️  WARNING: GEMINI_API_KEY environment variable not set!');
        console.warn('   Set it using: export GEMINI_API_KEY="your_api_key_here"');
    }
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down server gracefully...');
    process.exit(0);
});

module.exports = app;

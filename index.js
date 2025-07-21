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
    origin: '*', 
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

// Value Proposition Clarity Checker endpoint
app.post('/analyze-value-prop', async (req, res) => {
    try {
        const { valueProp, icp } = req.body;
        if (!valueProp || typeof valueProp !== 'string' || valueProp.trim().length === 0) {
            return res.status(400).json({ error: 'Please provide a value proposition.' });
        }
        if (!icp || typeof icp !== 'string' || icp.trim().length === 0) {
            return res.status(400).json({ error: 'Please provide an Ideal Customer Profile (ICP).' });
        }
        const analysis = await analyzeValuePropWithGemini(valueProp.trim(), icp.trim());
        res.json(analysis);
    } catch (error) {
        console.error('Error in /analyze-value-prop:', error);
        res.status(500).json({ error: 'Failed to analyze value proposition.' });
    }
});

/**
 * Analyze value proposition using Gemini LLM
 * @param {string} valueProp
 * @param {string} icp
 * @returns {Promise<{clarityScore:number, jargonPhrases:string[], rewrittenValueProp:string, taglines:string[]}>}
 */
async function analyzeValuePropWithGemini(valueProp, icp) {
    const prompt = `You are a startup messaging expert. Analyze the following value proposition for clarity, uniqueness, and relevance to the Ideal Customer Profile (ICP) provided. Return your response as a JSON object with these fields:\n\n1. clarityScore (0-100, integer)\n2. jargonPhrases (array of jargon/vague phrases, or empty array if none)\n3. rewrittenValueProp (improved, clearer version tailored to the ICP)\n4. taglines (2-3 concise, catchy one-liners for the ICP)\n\nValue Proposition: ${valueProp}\nICP: ${icp}\n\nRespond ONLY with a valid JSON object.`;
    const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.6,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 512,
        }
    };
    const response = await axios.post(
        `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
        requestBody,
        { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    if (!response.data || !response.data.candidates || response.data.candidates.length === 0) {
        throw new Error('Invalid response from Gemini API');
    }
    const candidate = response.data.candidates[0];
    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
        throw new Error('No content generated by Gemini API');
    }
    // Parse the JSON from Gemini's response
    let analysis;
    try {
        const text = candidate.content.parts[0].text;
        const match = text.match(/{[\s\S]*}/);
        if (!match) throw new Error('No JSON object found in Gemini response.');
        analysis = JSON.parse(match[0]);
    } catch (e) {
        throw new Error('Failed to parse Gemini response as JSON.');
    }
    // Validate fields
    return {
        clarityScore: typeof analysis.clarityScore === 'number' ? analysis.clarityScore : 0,
        jargonPhrases: Array.isArray(analysis.jargonPhrases) ? analysis.jargonPhrases : [],
        rewrittenValueProp: analysis.rewrittenValueProp || '',
        taglines: Array.isArray(analysis.taglines) ? analysis.taglines : []
    };
}

// Sales Call Opener Generator endpoint
app.post('/generate-call-opener', async (req, res) => {
    try {
        const { leadRole, companyIndustry, context, extraContext } = req.body;
        if (!leadRole || typeof leadRole !== 'string' || leadRole.trim().length === 0) {
            return res.status(400).json({ error: 'Please provide the lead’s role or title.' });
        }
        if (!companyIndustry || typeof companyIndustry !== 'string' || companyIndustry.trim().length === 0) {
            return res.status(400).json({ error: 'Please provide the company or industry.' });
        }
        if (!context || typeof context !== 'string' || !['cold','follow-up','referral'].includes(context)) {
            return res.status(400).json({ error: 'Please provide a valid context.' });
        }
        const result = await generateCallOpenerWithGemini(leadRole.trim(), companyIndustry.trim(), context, (typeof extraContext === 'string' ? extraContext.trim() : ''));
        res.json(result);
    } catch (error) {
        console.error('Error in /generate-call-opener:', error);
        res.status(500).json({ error: 'Failed to generate call openers.' });
    }
});

/**
 * Generate sales call openers using Gemini LLM
 * @param {string} leadRole
 * @param {string} companyIndustry
 * @param {string} context
 * @param {string} extraContext
 * @returns {Promise<{scripts:string[], patternInterrupt?:string}>}
 */
async function generateCallOpenerWithGemini(leadRole, companyIndustry, context, extraContext) {
    let prompt = `You are a world-class sales coach. Generate 2-3 engaging, non-generic opening scripts for a sales call, tailored to the following:
 - Lead’s role/title: ${leadRole}
 - Company or industry: ${companyIndustry}
 - Context: ${context} (cold, follow-up, or referral)`;
    if (extraContext && extraContext.length > 0) {
        prompt += `\n- Additional context: ${extraContext}`;
    }
    prompt += `\nAlso include an optional 'anti-cringe' or 'pattern interrupt' version if possible.\nRespond ONLY with a valid JSON object with these fields:\n1. scripts (array of 2-3 strings)\n2. patternInterrupt (string, optional)\n`;
    const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 512,
        }
    };
    const response = await axios.post(
        `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
        requestBody,
        { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    if (!response.data || !response.data.candidates || response.data.candidates.length === 0) {
        throw new Error('Invalid response from Gemini API');
    }
    const candidate = response.data.candidates[0];
    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
        throw new Error('No content generated by Gemini API');
    }
    // Parse the JSON from Gemini's response
    let result;
    try {
        const text = candidate.content.parts[0].text;
        const match = text.match(/{[\s\S]*}/);
        if (!match) throw new Error('No JSON object found in Gemini response.');
        result = JSON.parse(match[0]);
    } catch (e) {
        throw new Error('Failed to parse Gemini response as JSON.');
    }
    return {
        scripts: Array.isArray(result.scripts) ? result.scripts : [],
        patternInterrupt: result.patternInterrupt || ''
    };
}

// Pain Point Identifier endpoint
app.post('/identify-pain-points', async (req, res) => {
    try {
        const { productType, targetAudience } = req.body;
        if (!productType || typeof productType !== 'string' || productType.trim().length === 0) {
            return res.status(400).json({ error: 'Please provide the product type.' });
        }
        if (!targetAudience || typeof targetAudience !== 'string' || targetAudience.trim().length === 0) {
            return res.status(400).json({ error: 'Please provide the target audience.' });
        }
        const result = await identifyPainPointsWithGemini(productType.trim(), targetAudience.trim());
        res.json(result);
    } catch (error) {
        console.error('Error in /identify-pain-points:', error);
        res.status(500).json({ error: 'Failed to identify pain points.' });
    }
});

/**
 * Identify pain points using Gemini LLM
 * @param {string} productType
 * @param {string} targetAudience
 * @returns {Promise<{painPoints: Array<{title: string, type: string, narrative: string}>}>}
 */
async function identifyPainPointsWithGemini(productType, targetAudience) {
    const prompt = `You are a B2B sales strategist. Suggest the top 3-5 likely pain points for a product of this type: ${productType}, targeting this audience: ${targetAudience}.
For each pain point, provide:
- title (short phrase)
- type ("emotional" or "rational")
- narrative (a 1-2 sentence use-case story showing the pain in action)
Respond ONLY with a valid JSON object with a 'painPoints' array, each item an object with title, type, and narrative.`;
    const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 512,
        }
    };
    const response = await axios.post(
        `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
        requestBody,
        { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    if (!response.data || !response.data.candidates || response.data.candidates.length === 0) {
        throw new Error('Invalid response from Gemini API');
    }
    const candidate = response.data.candidates[0];
    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
        throw new Error('No content generated by Gemini API');
    }
    // Parse the JSON from Gemini's response
    let result;
    try {
        const text = candidate.content.parts[0].text;
        const match = text.match(/{[\s\S]*}/);
        if (!match) throw new Error('No JSON object found in Gemini response.');
        result = JSON.parse(match[0]);
    } catch (e) {
        throw new Error('Failed to parse Gemini response as JSON.');
    }
    return {
        painPoints: Array.isArray(result.painPoints) ? result.painPoints : []
    };
}

// ICP Persona Generator endpoint
app.post('/generate-icp-persona', async (req, res) => {
    try {
        const { productDescription, existingCustomers, industry, companySize, jobTitles } = req.body;
        if (!productDescription || typeof productDescription !== 'string' || productDescription.trim().length === 0) {
            return res.status(400).json({ error: 'Please provide a product description.' });
        }
        if (!industry || typeof industry !== 'string' || industry.trim().length === 0) {
            return res.status(400).json({ error: 'Please provide the industry.' });
        }
        if (!companySize || typeof companySize !== 'string' || companySize.trim().length === 0) {
            return res.status(400).json({ error: 'Please provide the company size.' });
        }
        if (!jobTitles || typeof jobTitles !== 'string' || jobTitles.trim().length === 0) {
            return res.status(400).json({ error: 'Please provide job titles.' });
        }
        const result = await generateIcpPersonaWithGemini(
            productDescription.trim(),
            (typeof existingCustomers === 'string' ? existingCustomers.trim() : ''),
            industry.trim(),
            companySize.trim(),
            jobTitles.trim()
        );
        res.json(result);
    } catch (error) {
        console.error('Error in /generate-icp-persona:', error);
        res.status(500).json({ error: 'Failed to generate ICP persona.' });
    }
});

/**
 * Generate ICP persona using Gemini LLM
 * @param {string} productDescription
 * @param {string} existingCustomers
 * @param {string} industry
 * @param {string} companySize
 * @param {string} jobTitles
 * @returns {Promise<{persona: {nameBackground: string, painPoints: string[], goals: string[], objections: string[], communicationPreferences: string, toneStyle: string}}>} 
 */
async function generateIcpPersonaWithGemini(productDescription, existingCustomers, industry, companySize, jobTitles) {
    let prompt = `You are a B2B marketing strategist. Generate a detailed fictional Ideal Customer Persona (ICP) for a business with the following:
- Product: ${productDescription}
- Industry: ${industry}
- Company size: ${companySize}
- Job titles: ${jobTitles}`;
    if (existingCustomers && existingCustomers.length > 0) {
        prompt += `\n- Existing customers: ${existingCustomers}`;
    }
    prompt += `\nRespond ONLY with a valid JSON object with a 'persona' field containing:
- nameBackground (name and short background story)
- painPoints (array)
- goals (array)
- objections (array)
- communicationPreferences (string)
- toneStyle (string)`;
    const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 768,
        }
    };
    const response = await axios.post(
        `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
        requestBody,
        { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    if (!response.data || !response.data.candidates || response.data.candidates.length === 0) {
        throw new Error('Invalid response from Gemini API');
    }
    const candidate = response.data.candidates[0];
    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
        throw new Error('No content generated by Gemini API');
    }
    // Parse the JSON from Gemini's response
    let result;
    try {
        const text = candidate.content.parts[0].text;
        const match = text.match(/{[\s\S]*}/);
        if (!match) throw new Error('No JSON object found in Gemini response.');
        result = JSON.parse(match[0]);
    } catch (e) {
        throw new Error('Failed to parse Gemini response as JSON.');
    }
    return {
        persona: result.persona || {}
    };
}

// Objection Handling Prompt Generator endpoint
app.post('/generate-objection-handling', async (req, res) => {
    try {
        const { objectionText, productType, buyerPersona } = req.body;
        if (!objectionText || typeof objectionText !== 'string' || objectionText.trim().length === 0) {
            return res.status(400).json({ error: 'Please provide the objection type or text.' });
        }
        if (!productType || typeof productType !== 'string' || productType.trim().length === 0) {
            return res.status(400).json({ error: 'Please provide the product type.' });
        }
        if (!buyerPersona || typeof buyerPersona !== 'string' || buyerPersona.trim().length === 0) {
            return res.status(400).json({ error: 'Please provide the buyer persona.' });
        }
        const result = await generateObjectionHandlingWithGemini(
            objectionText.trim(),
            productType.trim(),
            buyerPersona.trim()
        );
        res.json(result);
    } catch (error) {
        console.error('Error in /generate-objection-handling:', error);
        res.status(500).json({ error: 'Failed to generate objection handling prompts.' });
    }
});

/**
 * Generate objection handling prompts using Gemini LLM
 * @param {string} objectionText
 * @param {string} productType
 * @param {string} buyerPersona
 * @returns {Promise<{responses: string[], reframeStrategy: string, followUpQuestions: string[]}>}
 */
async function generateObjectionHandlingWithGemini(objectionText, productType, buyerPersona) {
    const prompt = `You are a sales enablement expert. Given the following:
- Objection: ${objectionText}
- Product type: ${productType}
- Buyer persona: ${buyerPersona}
Generate:
1. responses (array of 2-3 customized objection responses, each max 2 sentences)
2. reframeStrategy (string: a strategy to reframe or redirect the objection, max 2 sentences)
3. followUpQuestions (array of up to 2 short follow-up questions)
Respond ONLY with a valid JSON object with these fields. Do NOT include markdown, explanations, or any text outside the JSON. Output ONLY the JSON object. Keep the JSON as short as possible.`;
    const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 512,
        }
    };
    const response = await axios.post(
        `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
        requestBody,
        { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    if (!response.data || !response.data.candidates || response.data.candidates.length === 0) {
        throw new Error('Invalid response from Gemini API');
    }
    const candidate = response.data.candidates[0];
    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
        throw new Error('No content generated by Gemini API');
    }
    // Parse the JSON from Gemini's response
    let result;
    try {
        let text = candidate.content.parts[0].text;
        console.log('Gemini raw response for objection handling:', text);
        // Remove markdown code fencing if present
        text = text.replace(/```json|```/gi, '').trim();
        const match = text.match(/{[\s\S]*}/);
        if (!match) throw new Error('No JSON object found in Gemini response.');
        result = JSON.parse(match[0]);
    } catch (e) {
        throw new Error('Failed to parse Gemini response as JSON.');
    }
    return {
        responses: Array.isArray(result.responses)
            ? result.responses.map(r => typeof r === 'string' ? r : (r.text || JSON.stringify(r)))
            : [],
        reframeStrategy: result.reframeStrategy || '',
        followUpQuestions: Array.isArray(result.followUpQuestions)
            ? result.followUpQuestions.map(q => typeof q === 'string' ? q : (q.text || JSON.stringify(q)))
            : []
    };
}

// Sales Script Builder endpoint
app.post('/generate-sales-script', async (req, res) => {
    try {
        const { productInfo, targetPersona, callType } = req.body;
        if (!productInfo || typeof productInfo !== 'string' || productInfo.trim().length === 0) {
            return res.status(400).json({ error: 'Please provide product info.' });
        }
        if (!targetPersona || typeof targetPersona !== 'string' || targetPersona.trim().length === 0) {
            return res.status(400).json({ error: 'Please provide the target persona.' });
        }
        if (!callType || typeof callType !== 'string' || !['cold','demo','follow-up'].includes(callType)) {
            return res.status(400).json({ error: 'Please provide a valid call type.' });
        }
        const result = await generateSalesScriptWithGemini(
            productInfo.trim(),
            targetPersona.trim(),
            callType.trim()
        );
        res.json(result);
    } catch (error) {
        console.error('Error in /generate-sales-script:', error);
        res.status(500).json({ error: 'Failed to generate sales script.' });
    }
});

/**
 * Generate sales script using Gemini LLM
 * @param {string} productInfo
 * @param {string} targetPersona
 * @param {string} callType
 * @returns {Promise<{script: {opener: string, problem: string, solution: string, cta: string, personalizationHooks: string[], objectionHandling?: string[]}}>} 
 */
async function generateSalesScriptWithGemini(productInfo, targetPersona, callType) {
    const prompt = `You are a sales script expert. Build a complete sales script for:
- Product: ${productInfo}
- Target persona: ${targetPersona}
- Call type: ${callType}
Script sections:
1. opener (max 2 sentences)
2. problem (max 2-3 sentences)
3. solution (max 2-3 sentences)
4. cta (call to action, max 2 sentences)
5. personalizationHooks (array, up to 2)
6. objectionHandling (array, up to 2, optional)
Respond ONLY with a valid JSON object with a 'script' field containing these sections. Do NOT include markdown, explanations, or any text outside the JSON. Output ONLY the JSON object. Keep the JSON as short as possible.`;
    const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 768,
        }
    };
    const response = await axios.post(
        `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
        requestBody,
        { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    if (!response.data || !response.data.candidates || response.data.candidates.length === 0) {
        throw new Error('Invalid response from Gemini API');
    }
    const candidate = response.data.candidates[0];
    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
        throw new Error('No content generated by Gemini API');
    }
    // Parse the JSON from Gemini's response
    let result;
    try {
        let text = candidate.content.parts[0].text;
        // Remove markdown code fencing if present
        text = text.replace(/```json|```/gi, '').trim();
        const match = text.match(/{[\s\S]*}/);
        if (!match) throw new Error('No JSON object found in Gemini response.');
        result = JSON.parse(match[0]);
    } catch (e) {
        throw new Error('Failed to parse Gemini response as JSON.');
    }
    return {
        script: result.script || {}
    };
}

// Lead List Formatter endpoint
app.post('/format-lead-list', async (req, res) => {
    try {
        const { leadData, crmFormat } = req.body;
        if (!leadData || typeof leadData !== 'string' || leadData.trim().length === 0) {
            return res.status(400).json({ error: 'Please provide lead data.' });
        }
        if (!crmFormat || typeof crmFormat !== 'string' || crmFormat.trim().length === 0) {
            return res.status(400).json({ error: 'Please provide a target CRM format.' });
        }
        const result = await formatLeadListWithGemini(leadData.trim(), crmFormat.trim());
        res.json(result);
    } catch (error) {
        console.error('Error in /format-lead-list:', error);
        res.status(500).json({ error: 'Failed to format lead list.' });
    }
});

/**
 * Format lead list using Gemini LLM
 * @param {string} leadData
 * @param {string} crmFormat
 * @returns {Promise<{cleanedCsv: string, cleanedTableHtml: string}>}
 */
async function formatLeadListWithGemini(leadData, crmFormat) {
    const prompt = `You are a data cleaning and CRM import expert. Given the following messy lead data (CSV or tabular):
${leadData}

Target CRM format: ${crmFormat}

1. Clean, deduplicate, and validate the list (email, phone, LinkedIn, etc). Remove incomplete or invalid rows. Standardize headers for the target CRM. 
2. Output ONLY a valid JSON object with these fields:
- cleanedCsv: the cleaned, deduplicated, validated list as a CSV string (with headers)
- cleanedTableHtml: the same data as an HTML table (for preview)
Do NOT include markdown, explanations, or any text outside the JSON. Output ONLY the JSON object. Keep the output concise.`;
    const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.3,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
        }
    };
    const response = await axios.post(
        `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
        requestBody,
        { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
    );
    if (!response.data || !response.data.candidates || response.data.candidates.length === 0) {
        throw new Error('Invalid response from Gemini API');
    }
    const candidate = response.data.candidates[0];
    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
        throw new Error('No content generated by Gemini API');
    }
    // Parse the JSON from Gemini's response
    let result;
    try {
        let text = candidate.content.parts[0].text;
        // Remove markdown code fencing if present
        text = text.replace(/```json|```/gi, '').trim();
        const match = text.match(/{[\s\S]*}/);
        if (!match) throw new Error('No JSON object found in Gemini response.');
        result = JSON.parse(match[0]);
    } catch (e) {
        throw new Error('Failed to parse Gemini response as JSON.');
    }
    return {
        cleanedCsv: result.cleanedCsv || '',
        cleanedTableHtml: result.cleanedTableHtml || ''
    };
}

// Time Zone Meeting Finder endpoint
const { DateTime, Interval } = require('luxon');

app.post('/find-meeting-slots', async (req, res) => {
    try {
        const { userTimezone, leadLocations, callDuration } = req.body;
        console.log('Received /find-meeting-slots:', { userTimezone, leadLocations, callDuration });
        if (!userTimezone || typeof userTimezone !== 'string' || userTimezone.trim().length === 0) {
            return res.status(400).json({ error: 'Please provide your timezone.' });
        }
        if (!leadLocations || typeof leadLocations !== 'string' || leadLocations.trim().length === 0) {
            return res.status(400).json({ error: 'Please provide lead locations.' });
        }
        const duration = parseInt(callDuration, 10) || 30;
        const leadTzs = leadLocations.split(',').map(s => s.trim()).filter(Boolean);
        const cityToTz = {
            'new york': 'America/New_York',
            'london': 'Europe/London',
            'mumbai': 'Asia/Kolkata',
            'san francisco': 'America/Los_Angeles',
            'berlin': 'Europe/Berlin',
            'sydney': 'Australia/Sydney',
            'tokyo': 'Asia/Tokyo',
            'singapore': 'Asia/Singapore',
            'paris': 'Europe/Paris',
            'chicago': 'America/Chicago',
            'delhi': 'Asia/Kolkata',
            'boston': 'America/New_York',
            'los angeles': 'America/Los_Angeles',
            'toronto': 'America/Toronto',
            'dubai': 'Asia/Dubai',
            'shanghai': 'Asia/Shanghai',
            'hong kong': 'Asia/Hong_Kong',
            'seoul': 'Asia/Seoul',
            'amsterdam': 'Europe/Amsterdam',
            'zurich': 'Europe/Zurich',
            'madrid': 'Europe/Madrid',
            'rome': 'Europe/Rome',
            'istanbul': 'Europe/Istanbul',
            'johannesburg': 'Africa/Johannesburg',
            'sao paulo': 'America/Sao_Paulo',
            'mexico city': 'America/Mexico_City',
            'vancouver': 'America/Vancouver',
            'bengaluru': 'Asia/Kolkata',
        };
        // Resolve all timezones, fallback to UTC if not found
        const resolvedTzs = leadTzs.map(tz => cityToTz[tz.toLowerCase()] || tz || 'UTC');
        console.log('Resolved timezones:', resolvedTzs);
        // Validate all timezones
        const validTzs = [userTimezone, ...resolvedTzs].every(tz => {
            try {
                return !!DateTime.now().setZone(tz).isValid;
            } catch {
                return false;
            }
        });
        if (!validTzs) {
            return res.json({ slotsTableHtml: '<div style="color:#ff5252;">Invalid timezone(s) provided.</div>', meetingLink: '' });
        }
        // Find overlapping slots between user and all leads (9am-5pm user time, next 3 days)
        const slots = [];
        const now = DateTime.now().setZone(userTimezone);
        for (let day = 0; day < 3; day++) {
            const date = now.plus({ days: day });
            for (let hour = 9; hour <= 17 - Math.ceil(duration/60); hour++) {
                const start = date.set({ hour, minute: 0, second: 0, millisecond: 0 });
                const end = start.plus({ minutes: duration });
                // Check if slot is within 9am-5pm for all leads
                const allOk = resolvedTzs.every(tz => {
                    try {
                        const leadStart = start.setZone(tz, { keepLocalTime: false });
                        const leadEnd = end.setZone(tz, { keepLocalTime: false });
                        return leadStart.hour >= 9 && leadEnd.hour <= 17;
                    } catch {
                        return false;
                    }
                });
                if (allOk) {
                    slots.push({
                        user: `${start.toFormat('ccc, dd LLL yyyy HH:mm')} (${userTimezone})`,
                        leads: resolvedTzs.map(tz => `${start.setZone(tz, { keepLocalTime: false }).toFormat('ccc, dd LLL yyyy HH:mm')} (${tz})`),
                        link: `https://cal.com/book?tz=${encodeURIComponent(userTimezone)}&start=${encodeURIComponent(start.toISO())}&duration=${duration}`
                    });
                }
            }
        }
        console.log('Number of slots found:', slots.length);
        // Build HTML table
        let slotsTableHtml = '<table style="width:100%;border-collapse:collapse;background:#fff;color:#333;">';
        slotsTableHtml += '<tr><th style="padding:8px;border-bottom:1px solid #ccc;">Your Time</th>';
        resolvedTzs.forEach((tz, i) => {
            slotsTableHtml += `<th style="padding:8px;border-bottom:1px solid #ccc;">Lead ${i+1} (${tz})</th>`;
        });
        slotsTableHtml += '</tr>';
        if (slots.length === 0) {
            slotsTableHtml += '<tr><td colspan="' + (1 + resolvedTzs.length) + '" style="padding:12px;color:#ff5252;text-align:center;">No overlapping slots found for the next 3 days.</td></tr>';
        } else {
            slots.forEach(slot => {
                slotsTableHtml += '<tr>';
                slotsTableHtml += `<td style="padding:8px;border-bottom:1px solid #eee;">${slot.user}</td>`;
                slot.leads.forEach(leadTime => {
                    slotsTableHtml += `<td style="padding:8px;border-bottom:1px solid #eee;">${leadTime}</td>`;
                });
                slotsTableHtml += '</tr>';
            });
        }
        slotsTableHtml += '</table>';
        // Meeting link: first slot or fallback
        const meetingLink = slots.length > 0 ? slots[0].link : '';
        res.json({ slotsTableHtml, meetingLink });
    } catch (error) {
        console.error('Error in /find-meeting-slots:', error);
        res.json({ slotsTableHtml: '<div style="color:#ff5252;">Server error: Unable to find meeting slots.</div>', meetingLink: '' });
    }
});

// Sales Playbook Generator endpoint
app.post('/generate-sales-playbook', async (req, res) => {
    try {
        const { productService, salesStrategy, targetMarket, keyObjections } = req.body;
        if (!productService || typeof productService !== 'string' || productService.trim().length === 0) {
            return res.status(400).json({ error: 'Please provide a product or service.' });
        }
        if (!salesStrategy || typeof salesStrategy !== 'string' || salesStrategy.trim().length === 0) {
            return res.status(400).json({ error: 'Please provide a sales strategy.' });
        }
        if (!targetMarket || typeof targetMarket !== 'string' || targetMarket.trim().length === 0) {
            return res.status(400).json({ error: 'Please provide a target market or ICP.' });
        }
        if (!keyObjections || typeof keyObjections !== 'string' || keyObjections.trim().length === 0) {
            return res.status(400).json({ error: 'Please provide key objections.' });
        }
        const result = await generateSalesPlaybookWithGemini(
            productService.trim(),
            salesStrategy.trim(),
            targetMarket.trim(),
            keyObjections.trim()
        );
        res.json(result);
    } catch (error) {
        console.error('Error in /generate-sales-playbook:', error);
        res.status(500).json({ error: 'Failed to generate sales playbook.' });
    }
});

/**
 * Generate sales playbook using Gemini LLM
 * @param {string} productService
 * @param {string} salesStrategy
 * @param {string} targetMarket
 * @param {string} keyObjections
 * @returns {Promise<{playbookMarkdown: string}>}
 */
async function generateSalesPlaybookWithGemini(productService, salesStrategy, targetMarket, keyObjections) {
    const prompt = `You are a world-class sales enablement expert. Create a sales playbook in Markdown format for the following:
- Product/Service: ${productService}
- Sales Strategy: ${salesStrategy}
- Target Market/ICP: ${targetMarket}
- Key Objections: ${keyObjections}

The playbook should include these sections:
1. Discovery (max 5 bullet points)
2. Qualification (max 5 bullet points)
3. Objection Handling (max 5 bullet points)
4. Closing (max 5 bullet points)
5. Messaging Examples (max 3 examples)
6. Best Practices (max 5 bullet points)

Keep each section concise. Respond ONLY with a valid JSON object with a playbookMarkdown field containing the Markdown playbook. Do NOT include markdown code fencing, explanations, or any text outside the JSON. Output ONLY the JSON object. Do not say anything else before or after the JSON. Keep the playbook as short as possible.`;
    const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
        }
    };
    const response = await axios.post(
        `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
        requestBody,
        { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
    );
    if (!response.data || !response.data.candidates || response.data.candidates.length === 0) {
        throw new Error('Invalid response from Gemini API');
    }
    const candidate = response.data.candidates[0];
    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
        throw new Error('No content generated by Gemini API');
    }
    // Parse the JSON from Gemini's response
    let result;
    try {
        let text = candidate.content.parts[0].text;
        console.log('Gemini raw response for sales playbook:', text);
        text = text.replace(/```json|```/gi, '').trim();
        const match = text.match(/{[\s\S]*}/);
        if (!match) throw new Error('No JSON object found in Gemini response.');
        result = JSON.parse(match[0]);
    } catch (e) {
        throw new Error('Failed to parse Gemini response as JSON.');
    }
    return {
        playbookMarkdown: result.playbookMarkdown || ''
    };
}

app.post('/select-outreach-channels', async (req, res) => {
    try {
        const { leadRole, leadLocation, productService, outreachGoal } = req.body;
        
        if (!leadRole || !productService || !outreachGoal) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const result = await selectOutreachChannelsWithGemini(
            leadRole.trim(),
            leadLocation?.trim() || '',
            productService.trim(),
            outreachGoal.trim()
        );

        res.json(result);
    } catch (error) {
        console.error('Error in /select-outreach-channels:', error);
        res.status(500).json({ error: 'Failed to get channel recommendations.' });
    }
});

async function selectOutreachChannelsWithGemini(leadRole, leadLocation, productService, outreachGoal) {
    const prompt = `As a sales outreach expert, recommend the best outreach channels for this lead:

Lead Profile:
- Role/Industry: ${leadRole}
${leadLocation ? `- Location: ${leadLocation}` : ''}
- Product/Service to sell: ${productService}
- Outreach Goal: ${outreachGoal}

Analyze the lead profile and recommend 2-3 best outreach channels (from: Email, LinkedIn, Phone Call, Video Message, Twitter/Social DM).

For each channel, provide:
1. Why it's effective for this specific lead (2-3 sentences)
2. 3 practical tips for using this channel effectively

Respond ONLY with a valid JSON object in this format:
{
    "channels": [
        {
            "name": "Channel Name",
            "reasoning": "Why this channel is effective...",
            "tips": ["Tip 1", "Tip 2", "Tip 3"]
        }
    ]
}

Do NOT include any text outside the JSON. No markdown, no explanations.`;

    const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
        }
    };

    const response = await axios.post(
        `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
        requestBody,
        { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
    );

    if (!response.data || !response.data.candidates || response.data.candidates.length === 0) {
        throw new Error('Invalid response from Gemini API');
    }

    const candidate = response.data.candidates[0];
    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
        throw new Error('No content generated by Gemini API');
    }

    let result;
    try {
        let text = candidate.content.parts[0].text;
        console.log('Gemini raw response for channel selection:', text); // Debug log
        text = text.replace(/```json|```/gi, '').trim(); // Strip markdown
        const match = text.match(/{[\s\S]*}/);
        if (!match) throw new Error('No JSON object found in Gemini response.');
        result = JSON.parse(match[0]);
    } catch (e) {
        throw new Error('Failed to parse Gemini response as JSON.');
    }

    return result;
}

app.post('/generate-linkedin-messages', async (req, res) => {
    try {
        const { leadPersona, outreachGoal, productService, personalizationHook } = req.body;
        
        if (!leadPersona || !productService || !outreachGoal) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const result = await generateLinkedInMessagesWithGemini(
            leadPersona.trim(),
            outreachGoal.trim(),
            productService.trim(),
            personalizationHook?.trim() || ''
        );

        res.json(result);
    } catch (error) {
        console.error('Error in /generate-linkedin-messages:', error);
        res.status(500).json({ error: 'Failed to generate LinkedIn messages.' });
    }
});

async function generateLinkedInMessagesWithGemini(leadPersona, outreachGoal, productService, personalizationHook) {
    const prompt = `As a LinkedIn outreach expert, create 2-3 personalized message templates for this scenario:

Lead Profile:
- Role/Position: ${leadPersona}
- Outreach Goal: ${outreachGoal}
- Product/Service: ${productService}
${personalizationHook ? `- Personalization Context: ${personalizationHook}` : ''}

Requirements:
1. Each message should be under 300 characters (LinkedIn's connection request limit)
2. Focus on value proposition and clear call-to-action
3. Use a professional yet conversational tone
4. Include personalization elements where relevant
${personalizationHook ? '5. Incorporate the provided personalization context naturally' : ''}

Also provide 3-4 practical tips for personalizing these templates further.

Respond ONLY with a valid JSON object in this format:
{
    "messages": [
        {
            "text": "Message template text..."
        }
    ],
    "tips": [
        "Personalization tip 1",
        "Personalization tip 2",
        "Personalization tip 3"
    ]
}

Do NOT include any text outside the JSON. No markdown, no explanations.`;

    const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
        }
    };

    const response = await axios.post(
        `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
        requestBody,
        { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
    );

    if (!response.data || !response.data.candidates || response.data.candidates.length === 0) {
        throw new Error('Invalid response from Gemini API');
    }

    const candidate = response.data.candidates[0];
    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
        throw new Error('No content generated by Gemini API');
    }

    let result;
    try {
        let text = candidate.content.parts[0].text;
        console.log('Gemini raw response for LinkedIn messages:', text); // Debug log
        text = text.replace(/```json|```/gi, '').trim(); // Strip markdown
        const match = text.match(/{[\s\S]*}/);
        if (!match) throw new Error('No JSON object found in Gemini response.');
        result = JSON.parse(match[0]);
    } catch (e) {
        throw new Error('Failed to parse Gemini response as JSON.');
    }

    // Validate message lengths for LinkedIn's limit
    result.messages = result.messages.map(message => ({
        text: message.text.length > 300 
            ? message.text.substring(0, 297) + '...' 
            : message.text
    }));

    return result;
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

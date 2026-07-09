try {
  process.loadEnvFile()
} catch {
  // no .env file present — fine if GEMINI_API_KEY is set another way
}

const express = require('express')
const cors = require('cors')
const { GoogleGenAI, Type } = require('@google/genai')

const app = express()
const PORT = process.env.PORT || 3001
const MODEL = 'gemini-2.5-flash-lite'

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null

const RECIPE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    recipes: {
      type: Type.ARRAY,
      minItems: 3,
      maxItems: 3,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          summary: { type: Type.STRING },
          ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
          steps: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['title', 'summary', 'ingredients', 'steps'],
        propertyOrdering: ['title', 'summary', 'ingredients', 'steps'],
      },
    },
  },
  required: ['recipes'],
}

async function generateRecipe(ingredients) {
  if (!ai) throw new Error('GEMINI_API_KEY is not set')

  const prompt = `You are a recipe assistant.

The user will give you a list of ingredients they already have.
Generate 3 different recipe options based on those ingredients.

Rules:
- Use the user's ingredients as the main ingredients.
- You may add only a few minimal pantry staples if needed, such as salt, pepper, oil, garlic, onion, butter, herbs, or spices.
- Do not add many extra ingredients.
- Only add ingredients that are common kitchen staples and clearly necessary for cooking.
- If a recipe can work without an extra ingredient, do not add it.
- Make each recipe option meaningfully different in style or flavor if possible.
- Keep the recipes simple, realistic, and practical.
- Every ingredient must include a specific quantity or measurement (e.g. "2 cups rice", "1 lb chicken breast", not just "rice" or "chicken").
- Every step must include specific, actionable detail: exact temperatures (°F and °C), times, and measurements where relevant (e.g. "Bake at 400°F (200°C) for 20 minutes", not "bake until done").

Return the result as JSON in this exact shape:
{
  "recipes": [
    {
      "title": "",
      "summary": "",
      "ingredients": [],
      "steps": []
    }
  ]
}

Ingredients: ${ingredients.join(', ')}`

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: RECIPE_SCHEMA,
    },
  })

  const recipe = JSON.parse(response.text)

  if (!Array.isArray(recipe.recipes) || recipe.recipes.length === 0) {
    throw new Error('Gemini response did not match the expected recipe shape')
  }

  return recipe
}

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }))
app.use(express.json())

app.get('/', (req, res) => {
  res.send('PantryPal API is running')
})

app.post('/api/recipe', async (req, res) => {
  const { ingredients } = req.body

  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return res.status(400).json({ error: 'ingredients must be a non-empty array' })
  }

  try {
    const recipe = await generateRecipe(ingredients)
    res.json(recipe)
  } catch (err) {
    console.error('Gemini recipe generation failed:', err.message)
    res.status(502).json({ error: 'Recipe generation failed' })
  }
})

app.listen(PORT, () => {
  console.log(`PantryPal API listening on http://localhost:${PORT}`)
})

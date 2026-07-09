try {
  process.loadEnvFile()
} catch {
  // no .env file present — fine if GEMINI_API_KEY is set another way
}

const express = require('express')
const { GoogleGenAI, Type } = require('@google/genai')

const app = express()
const PORT = process.env.PORT || 3001
const MODEL = 'gemini-2.5-flash'

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null

const RECIPE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
    steps: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['title', 'ingredients', 'steps'],
  propertyOrdering: ['title', 'ingredients', 'steps'],
}

async function generateRecipe(ingredients) {
  if (!ai) throw new Error('GEMINI_API_KEY is not set')

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Suggest one simple recipe using some or all of these ingredients: ${ingredients.join(', ')}. Prefer recipes that use as many of the listed ingredients as make sense together.`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: RECIPE_SCHEMA,
    },
  })

  const recipe = JSON.parse(response.text)

  if (
    typeof recipe.title !== 'string' ||
    !Array.isArray(recipe.ingredients) ||
    !Array.isArray(recipe.steps)
  ) {
    throw new Error('Gemini response did not match the expected recipe shape')
  }

  return recipe
}

app.use(express.json())

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

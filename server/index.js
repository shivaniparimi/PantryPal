try {
  process.loadEnvFile()
} catch {
  // no .env file present — fine if GEMINI_API_KEY is set another way
}

const express = require('express')
const cors = require('cors')
const { initializeApp, cert, getApps } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const { GoogleGenAI, Type } = require('@google/genai')

const app = express()
const PORT = process.env.PORT || 3001
const MODEL = 'gemini-2.5-flash-lite'

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null

if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)),
  })
}

const db = getApps().length ? getFirestore() : null

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!idToken || !getApps().length) {
    return res.status(401).json({ error: 'Sign-in required' })
  }

  try {
    const decoded = await getAuth().verifyIdToken(idToken)
    req.user = { uid: decoded.uid, email: decoded.email, name: decoded.name }
    next()
  } catch (err) {
    console.error('Token verification failed:', err.message)
    res.status(401).json({ error: 'Sign-in required' })
  }
}

const RECIPE_TAGS = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'dessert',
  'vegan',
  'vegetarian',
  'gluten-free',
  'dairy-free',
  'quick',
  'one-pot',
]

const DIFFICULTIES = ['Easy', 'Medium', 'Hard']

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
          tags: { type: Type.ARRAY, items: { type: Type.STRING, enum: RECIPE_TAGS } },
          cookTime: { type: Type.STRING },
          servings: { type: Type.STRING },
          difficulty: { type: Type.STRING, enum: DIFFICULTIES },
        },
        required: [
          'title',
          'summary',
          'ingredients',
          'steps',
          'tags',
          'cookTime',
          'servings',
          'difficulty',
        ],
        propertyOrdering: [
          'title',
          'summary',
          'ingredients',
          'steps',
          'tags',
          'cookTime',
          'servings',
          'difficulty',
        ],
      },
    },
  },
  required: ['recipes'],
}

function isTransientGeminiError(err) {
  try {
    const parsed = JSON.parse(err.message)
    return parsed?.error?.code === 503 || parsed?.error?.status === 'UNAVAILABLE'
  } catch {
    return false
  }
}

// Gemini occasionally returns a transient 503 ("high demand") that has nothing
// to do with our quota — retrying a moment later usually just works. This does
// NOT retry on 429 (quota exhausted), since that fails identically every time
// until the daily reset and retrying would only add delay for no benefit.
async function withGeminiRetry(fn, retries = 3, delayMs = 1000) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (!isTransientGeminiError(err) || attempt === retries) throw err
      console.error(`Gemini call hit transient overload, retrying (attempt ${attempt + 1}/${retries})...`)
      await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)))
    }
  }
}

async function generateRecipe(ingredients, maxCookTime) {
  if (!ai) throw new Error('GEMINI_API_KEY is not set')

  const timeRule = maxCookTime
    ? `\n- Every recipe must be cookable in under ${maxCookTime} minutes total, including prep time. Do not exceed this.`
    : ''

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
- For each recipe, assign whichever tags genuinely apply from this exact list only: ${RECIPE_TAGS.join(', ')}. Only include tags that truly fit — it's fine for a recipe to have zero tags.
- For each recipe, include cookTime as a short string (e.g. "25 min"), servings as a short string (e.g. "4 servings"), and difficulty as exactly one of: ${DIFFICULTIES.join(', ')}.${timeRule}

Return the result as JSON in this exact shape:
{
  "recipes": [
    {
      "title": "",
      "summary": "",
      "ingredients": [],
      "steps": [],
      "tags": [],
      "cookTime": "",
      "servings": "",
      "difficulty": ""
    }
  ]
}

Ingredients: ${ingredients.join(', ')}`

  const response = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: RECIPE_SCHEMA,
      },
    }),
  )

  const recipe = JSON.parse(response.text)

  if (!Array.isArray(recipe.recipes) || recipe.recipes.length === 0) {
    throw new Error('Gemini response did not match the expected recipe shape')
  }

  return recipe
}

const FRIDGE_SCAN_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['ingredients'],
}

async function scanFridgeImage(base64Data, mimeType) {
  if (!ai) throw new Error('GEMINI_API_KEY is not set')

  const prompt = `You are a kitchen assistant. Look at this photo of a fridge or pantry.

Identify every visible food ingredient. Use short, common ingredient names (e.g. "eggs", "milk", "spinach", "parmesan") — not brand names, not quantities, not packaging descriptions.

If you cannot identify any food ingredients in the image, return an empty array.

Return only JSON in this exact shape:
{
  "ingredients": []
}`

  const response = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: [{ inlineData: { mimeType, data: base64Data } }, prompt],
      config: {
        responseMimeType: 'application/json',
        responseSchema: FRIDGE_SCAN_SCHEMA,
      },
    }),
  )

  const result = JSON.parse(response.text)

  if (!Array.isArray(result.ingredients)) {
    throw new Error('Gemini response did not match the expected ingredients shape')
  }

  return result.ingredients
}

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }))

// Each route below applies its own express.json() rather than one global
// app.use(express.json()) — a request body can only be read once, so a
// blanket parser at the default 100kb limit would consume (and reject) large
// image uploads before /api/scan-fridge's own larger-limit parser ever runs.
const jsonBody = express.json()

// Client-side rejects raw files over 8MB, but base64 encoding inflates size by
// ~33%, plus JSON wrapper overhead — so the body limit here must be comfortably
// larger than 8MB or valid uploads get rejected with a silent 413.
const imageBodyParser = express.json({ limit: '12mb' })

app.get('/', (req, res) => {
  res.send('PantryPal API is running')
})

app.post('/api/recipe', jsonBody, async (req, res) => {
  const { ingredients, maxCookTime } = req.body

  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return res.status(400).json({ error: 'ingredients must be a non-empty array' })
  }

  const parsedMaxCookTime =
    typeof maxCookTime === 'number' && Number.isFinite(maxCookTime) && maxCookTime > 0
      ? maxCookTime
      : undefined

  try {
    const recipe = await generateRecipe(ingredients, parsedMaxCookTime)
    res.json(recipe)
  } catch (err) {
    console.error('Gemini recipe generation failed:', err.message)
    res.status(502).json({ error: 'Recipe generation failed' })
  }
})

const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

app.post('/api/scan-fridge', imageBodyParser, async (req, res) => {
  const { imageBase64, mimeType } = req.body

  if (typeof imageBase64 !== 'string' || !imageBase64) {
    return res.status(400).json({ error: 'imageBase64 is required' })
  }

  if (typeof mimeType !== 'string' || !SUPPORTED_IMAGE_TYPES.includes(mimeType)) {
    return res.status(400).json({ error: 'Unsupported image type' })
  }

  try {
    const ingredients = await scanFridgeImage(imageBase64, mimeType)
    res.json({ ingredients })
  } catch (err) {
    console.error('Gemini fridge scan failed:', err.message)
    res.status(502).json({ error: 'Could not analyze image' })
  }
})

app.post('/api/recipes', requireAuth, jsonBody, async (req, res) => {
  const { title, summary, ingredients, steps, tags, cookTime, servings, difficulty } = req.body

  if (
    typeof title !== 'string' ||
    typeof summary !== 'string' ||
    !Array.isArray(ingredients) ||
    !Array.isArray(steps)
  ) {
    return res.status(400).json({ error: 'title, summary, ingredients, and steps are required' })
  }

  try {
    await db.collection('recipes').add({
      userId: req.user.uid,
      title,
      summary,
      ingredients,
      steps,
      tags: Array.isArray(tags) ? tags : [],
      cookTime: typeof cookTime === 'string' ? cookTime : '',
      servings: typeof servings === 'string' ? servings : '',
      difficulty: typeof difficulty === 'string' ? difficulty : '',
      createdAt: FieldValue.serverTimestamp(),
    })
    res.status(201).json({ ok: true })
  } catch (err) {
    console.error('Saving recipe failed:', err.message)
    res.status(500).json({ error: 'Could not save recipe' })
  }
})

app.put('/api/recipes/:id', requireAuth, jsonBody, async (req, res) => {
  const { title, summary, ingredients, steps, tags, cookTime, servings, difficulty } = req.body

  if (
    typeof title !== 'string' ||
    typeof summary !== 'string' ||
    !Array.isArray(ingredients) ||
    !Array.isArray(steps)
  ) {
    return res.status(400).json({ error: 'title, summary, ingredients, and steps are required' })
  }

  try {
    const docRef = db.collection('recipes').doc(req.params.id)
    const doc = await docRef.get()

    if (!doc.exists || doc.data().userId !== req.user.uid) {
      return res.status(404).json({ error: 'Recipe not found' })
    }

    await docRef.update({
      title,
      summary,
      ingredients,
      steps,
      tags: Array.isArray(tags) ? tags : [],
      cookTime: typeof cookTime === 'string' ? cookTime : '',
      servings: typeof servings === 'string' ? servings : '',
      difficulty: typeof difficulty === 'string' ? difficulty : '',
    })
    res.json({ ok: true })
  } catch (err) {
    console.error('Updating recipe failed:', err.message)
    res.status(500).json({ error: 'Could not update recipe' })
  }
})

app.delete('/api/recipes/:id', requireAuth, async (req, res) => {
  try {
    const docRef = db.collection('recipes').doc(req.params.id)
    const doc = await docRef.get()

    if (!doc.exists || doc.data().userId !== req.user.uid) {
      return res.status(404).json({ error: 'Recipe not found' })
    }

    await docRef.delete()
    res.json({ ok: true })
  } catch (err) {
    console.error('Deleting recipe failed:', err.message)
    res.status(500).json({ error: 'Could not delete recipe' })
  }
})

app.get('/api/recipes', requireAuth, async (req, res) => {
  try {
    const snapshot = await db
      .collection('recipes')
      .where('userId', '==', req.user.uid)
      .orderBy('createdAt', 'desc')
      .get()

    const recipes = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    res.json({ recipes })
  } catch (err) {
    console.error('Fetching recipes failed:', err.message)
    res.status(500).json({ error: 'Could not fetch recipes' })
  }
})

app.listen(PORT, () => {
  console.log(`PantryPal API listening on http://localhost:${PORT}`)
})

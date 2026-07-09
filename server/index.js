const express = require('express')

const app = express()
const PORT = process.env.PORT || 3001

app.use(express.json())

const MOCK_STEPS = [
  'Prep and combine your ingredients.',
  'Cook everything together over medium heat until done.',
  'Season to taste and plate up.',
  'Enjoy your meal!',
]

app.post('/api/recipe', (req, res) => {
  const { ingredients } = req.body

  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return res.status(400).json({ error: 'ingredients must be a non-empty array' })
  }

  res.json({
    title: 'Your Pantry Recipe',
    ingredients,
    steps: MOCK_STEPS,
  })
})

app.listen(PORT, () => {
  console.log(`PantryPal API listening on http://localhost:${PORT}`)
})

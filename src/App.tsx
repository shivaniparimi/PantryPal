import { useEffect, useRef, useState } from 'react'
import './App.css'

type Status = 'idle' | 'loading' | 'done'

const MOCK_STEPS = [
  'Prep and combine your ingredients.',
  'Cook everything together over medium heat until done.',
  'Season to taste and plate up.',
  'Enjoy your meal!',
]

function App() {
  const [ingredients, setIngredients] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [recipeIngredients, setRecipeIngredients] = useState<string[]>([])
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const canGenerate = ingredients.trim().length > 0

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const handleGenerate = () => {
    setStatus('loading')
    timeoutRef.current = setTimeout(() => {
      setRecipeIngredients(
        ingredients
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      )
      setStatus('done')
    }, 1200)
  }

  return (
    <section id="home">
      <h1>PantryPal</h1>
      <p className="subtitle">
        Tell us what's leftover in your kitchen and we'll suggest a recipe to help clean out your pantry!
      </p>

      <div className="ingredients-field">
        <label htmlFor="ingredients">Your ingredients</label>
        <textarea
          id="ingredients"
          rows={4}
          placeholder="e.g. chicken, rice, broccoli, garlic"
          value={ingredients}
          onChange={(e) => setIngredients(e.target.value)}
        />
      </div>

      <button
        type="button"
        className="generate"
        disabled={!canGenerate || status === 'loading'}
        onClick={handleGenerate}
      >
        {status === 'loading' ? (
          <>
            <span className="spinner" aria-hidden="true" />
            Generating...
          </>
        ) : (
          'Generate Recipe'
        )}
      </button>

      <div className="result-box">
        {status === 'done' ? (
          <div className="recipe-card">
            <h3>Your Pantry Recipe</h3>
            <p className="recipe-label">Ingredients</p>
            <ul>
              {recipeIngredients.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="recipe-label">Steps</p>
            <ol>
              {MOCK_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        ) : (
          <p>Your recipe will appear here.</p>
        )}
      </div>
    </section>
  )
}

export default App

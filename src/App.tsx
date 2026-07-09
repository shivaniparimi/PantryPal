import { useEffect, useRef, useState } from 'react'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL ?? ''

type Status = 'idle' | 'loading' | 'done' | 'error'

type RecipeOption = {
  title: string
  summary: string
  ingredients: string[]
  steps: string[]
}

function App() {
  const [ingredients, setIngredients] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [recipes, setRecipes] = useState<RecipeOption[]>([])
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const canGenerate = ingredients.trim().length > 0

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const handleGenerate = async () => {
    setStatus('loading')
    setSelectedIndex(null)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const response = await fetch(`${API_URL}/api/recipe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredients: ingredients
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
        }),
        signal: controller.signal,
      })

      if (!response.ok) throw new Error('Request failed')

      const data: { recipes: RecipeOption[] } = await response.json()
      setRecipes(data.recipes)
      setStatus('done')
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setStatus('error')
    }
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
        {status === 'done' && selectedIndex !== null ? (
          <div className="recipe-card">
            <button type="button" className="back-link" onClick={() => setSelectedIndex(null)}>
              ← Back to options
            </button>
            <h3>{recipes[selectedIndex].title}</h3>
            <p className="recipe-label">Ingredients</p>
            <ul>
              {recipes[selectedIndex].ingredients.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="recipe-label">Steps</p>
            <ol>
              {recipes[selectedIndex].steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        ) : status === 'done' && recipes.length > 0 ? (
          <div className="recipe-options">
            {recipes.map((option, index) => (
              <button
                type="button"
                key={option.title}
                className="recipe-option"
                onClick={() => setSelectedIndex(index)}
              >
                <span className="recipe-option-title">{option.title}</span>
                <span className="recipe-option-summary">{option.summary}</span>
              </button>
            ))}
          </div>
        ) : status === 'error' ? (
          <p className="error-message">Something went wrong — please try again.</p>
        ) : (
          <p>Your recipe will appear here.</p>
        )}
      </div>
    </section>
  )
}

export default App

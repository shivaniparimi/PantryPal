import { useState } from 'react'
import './App.css'

function App() {
  const [ingredients, setIngredients] = useState('')
  const canGenerate = ingredients.trim().length > 0

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

      <button type="button" className="generate" disabled={!canGenerate}>
        Generate Recipe
      </button>

      <div className="result-box">
        <p>Your recipe will appear here.</p>
      </div>
    </section>
  )
}

export default App

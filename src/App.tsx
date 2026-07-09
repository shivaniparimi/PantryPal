import { useEffect, useRef, useState } from 'react'
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { auth } from './firebase'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL ?? ''

type Status = 'idle' | 'loading' | 'done' | 'error'
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
type Tab = 'generate' | 'saved'

type RecipeOption = {
  title: string
  summary: string
  ingredients: string[]
  steps: string[]
}

type SavedRecipe = RecipeOption & { id: string }

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [tab, setTab] = useState<Tab>('generate')

  const [ingredients, setIngredients] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [recipes, setRecipes] = useState<RecipeOption[]>([])
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const abortRef = useRef<AbortController | null>(null)
  const canGenerate = ingredients.trim().length > 0

  const [savedRecipes, setSavedRecipes] = useState<SavedRecipe[]>([])
  const [savedStatus, setSavedStatus] = useState<Status>('idle')
  const [savedSelectedIndex, setSavedSelectedIndex] = useState<number | null>(null)

  useEffect(() => {
    if (!auth) return
    return onAuthStateChanged(auth, setUser)
  }, [])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    if (tab !== 'saved' || !user) return

    setSavedStatus('loading')
    setSavedSelectedIndex(null)

    user.getIdToken().then((idToken) => {
      fetch(`${API_URL}/api/recipes`, {
        headers: { Authorization: `Bearer ${idToken}` },
      })
        .then((response) => {
          if (!response.ok) throw new Error('Request failed')
          return response.json()
        })
        .then((data: { recipes: SavedRecipe[] }) => {
          setSavedRecipes(data.recipes)
          setSavedStatus('done')
        })
        .catch(() => setSavedStatus('error'))
    })
  }, [tab, user])

  const handleSignIn = () => {
    if (!auth) return
    signInWithPopup(auth, new GoogleAuthProvider())
  }

  const handleSignOut = () => {
    if (!auth) return
    signOut(auth)
  }

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

  const handleSaveRecipe = async (recipe: RecipeOption) => {
    if (!user) return

    setSaveStatus('saving')

    try {
      const idToken = await user.getIdToken()
      const response = await fetch(`${API_URL}/api/recipes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(recipe),
      })

      if (!response.ok) throw new Error('Request failed')
      setSaveStatus('saved')
    } catch {
      setSaveStatus('error')
    }
  }

  const selectGeneratedRecipe = (index: number | null) => {
    setSelectedIndex(index)
    setSaveStatus('idle')
  }

  return (
    <section id="home">
      <div className="topbar">
        {user ? (
          <div className="user-info">
            <span>{user.displayName}</span>
            <button type="button" className="text-button" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        ) : (
          <button type="button" className="text-button" onClick={handleSignIn}>
            Sign in with Google
          </button>
        )}
      </div>

      <h1>PantryPal</h1>
      <p className="subtitle">
        Tell us what's leftover in your kitchen and we'll suggest a recipe to help clean out your pantry!
      </p>

      <div className="tabs">
        <button
          type="button"
          className={tab === 'generate' ? 'tab tab-active' : 'tab'}
          onClick={() => setTab('generate')}
        >
          Generate
        </button>
        <button
          type="button"
          className={tab === 'saved' ? 'tab tab-active' : 'tab'}
          onClick={() => setTab('saved')}
        >
          My Recipes
        </button>
      </div>

      {tab === 'generate' ? (
        <>
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
                <button type="button" className="back-link" onClick={() => selectGeneratedRecipe(null)}>
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

                {user ? (
                  <button
                    type="button"
                    className="save-button"
                    disabled={saveStatus === 'saving' || saveStatus === 'saved'}
                    onClick={() => handleSaveRecipe(recipes[selectedIndex])}
                  >
                    {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : 'Save Recipe'}
                  </button>
                ) : (
                  <button type="button" className="save-button" onClick={handleSignIn}>
                    Sign in to save
                  </button>
                )}
                {saveStatus === 'error' && <p className="error-message">Could not save — please try again.</p>}
              </div>
            ) : status === 'done' && recipes.length > 0 ? (
              <div className="recipe-options">
                {recipes.map((option, index) => (
                  <button
                    type="button"
                    key={option.title}
                    className="recipe-option"
                    onClick={() => selectGeneratedRecipe(index)}
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
        </>
      ) : (
        <div className="result-box">
          {!user ? (
            <div className="signed-out-prompt">
              <p>Sign in to see your saved recipes.</p>
              <button type="button" className="text-button" onClick={handleSignIn}>
                Sign in with Google
              </button>
            </div>
          ) : savedSelectedIndex !== null ? (
            <div className="recipe-card">
              <button type="button" className="back-link" onClick={() => setSavedSelectedIndex(null)}>
                ← Back to My Recipes
              </button>
              <h3>{savedRecipes[savedSelectedIndex].title}</h3>
              <p className="recipe-label">Ingredients</p>
              <ul>
                {savedRecipes[savedSelectedIndex].ingredients.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="recipe-label">Steps</p>
              <ol>
                {savedRecipes[savedSelectedIndex].steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          ) : savedStatus === 'loading' ? (
            <p>Loading your recipes...</p>
          ) : savedStatus === 'error' ? (
            <p className="error-message">Something went wrong — please try again.</p>
          ) : savedRecipes.length === 0 ? (
            <p>You haven't saved any recipes yet.</p>
          ) : (
            <div className="recipe-options">
              {savedRecipes.map((option, index) => (
                <button
                  type="button"
                  key={option.id}
                  className="recipe-option"
                  onClick={() => setSavedSelectedIndex(index)}
                >
                  <span className="recipe-option-title">{option.title}</span>
                  <span className="recipe-option-summary">{option.summary}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export default App

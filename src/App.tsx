import { useEffect, useRef, useState } from 'react'
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { auth } from './firebase'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL ?? ''

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

type Status = 'idle' | 'loading' | 'done' | 'error'
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
type Tab = 'generate' | 'saved'

type RecipeOption = {
  title: string
  summary: string
  ingredients: string[]
  steps: string[]
  tags: string[]
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
  const [savedSelectedId, setSavedSelectedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editSummary, setEditSummary] = useState('')
  const [editIngredients, setEditIngredients] = useState('')
  const [editSteps, setEditSteps] = useState('')
  const [editTags, setEditTags] = useState<string[]>([])
  const [editSaveStatus, setEditSaveStatus] = useState<SaveStatus>('idle')
  const [deleteStatus, setDeleteStatus] = useState<'idle' | 'deleting' | 'error'>('idle')

  const filteredSavedRecipes = savedRecipes.filter((recipe) => {
    const query = searchQuery.trim().toLowerCase()
    const matchesQuery =
      query.length === 0 ||
      recipe.title.toLowerCase().includes(query) ||
      recipe.ingredients.some((item) => item.toLowerCase().includes(query))

    const matchesTags = selectedTags.every((tag) => (recipe.tags ?? []).includes(tag))

    return matchesQuery && matchesTags
  })

  const selectedSavedRecipe = savedRecipes.find((recipe) => recipe.id === savedSelectedId) ?? null

  const toggleTag = (tag: string) => {
    setSelectedTags((current) =>
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag],
    )
  }

  const selectSavedRecipe = (id: string | null) => {
    setSavedSelectedId(id)
    setIsEditing(false)
    setDeleteStatus('idle')
  }

  const toggleEditTag = (tag: string) => {
    setEditTags((current) =>
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag],
    )
  }

  const startEditing = () => {
    if (!selectedSavedRecipe) return
    setEditTitle(selectedSavedRecipe.title)
    setEditSummary(selectedSavedRecipe.summary)
    setEditIngredients(selectedSavedRecipe.ingredients.join('\n'))
    setEditSteps(selectedSavedRecipe.steps.join('\n'))
    setEditTags(selectedSavedRecipe.tags ?? [])
    setEditSaveStatus('idle')
    setIsEditing(true)
  }

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
    setSavedSelectedId(null)

    user.getIdToken().then((idToken) => {
      fetch(`${API_URL}/api/recipes`, {
        headers: { Authorization: `Bearer ${idToken}` },
      })
        .then((response) => {
          if (!response.ok) throw new Error('Request failed')
          return response.json()
        })
        .then((data: { recipes: SavedRecipe[] }) => {
          setSavedRecipes(data.recipes.map((recipe) => ({ ...recipe, tags: recipe.tags ?? [] })))
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

  const handleSaveEdit = async () => {
    if (!user || !selectedSavedRecipe) return

    setEditSaveStatus('saving')

    const updated = {
      title: editTitle.trim(),
      summary: editSummary.trim(),
      ingredients: editIngredients
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
      steps: editSteps
        .split('\n')
        .map((step) => step.trim())
        .filter(Boolean),
      tags: editTags,
    }

    try {
      const idToken = await user.getIdToken()
      const response = await fetch(`${API_URL}/api/recipes/${selectedSavedRecipe.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(updated),
      })

      if (!response.ok) throw new Error('Request failed')

      setSavedRecipes((current) =>
        current.map((recipe) => (recipe.id === selectedSavedRecipe.id ? { ...recipe, ...updated } : recipe)),
      )
      setIsEditing(false)
      setEditSaveStatus('idle')
    } catch {
      setEditSaveStatus('error')
    }
  }

  const handleDeleteRecipe = async () => {
    if (!user || !selectedSavedRecipe) return
    if (!window.confirm(`Delete "${selectedSavedRecipe.title}"? This can't be undone.`)) return

    setDeleteStatus('deleting')

    try {
      const idToken = await user.getIdToken()
      const response = await fetch(`${API_URL}/api/recipes/${selectedSavedRecipe.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${idToken}` },
      })

      if (!response.ok) throw new Error('Request failed')

      setSavedRecipes((current) => current.filter((recipe) => recipe.id !== selectedSavedRecipe.id))
      setSavedSelectedId(null)
      setDeleteStatus('idle')
    } catch {
      setDeleteStatus('error')
    }
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
                {(recipes[selectedIndex].tags ?? []).length > 0 && (
                  <div className="tag-pills">
                    {(recipes[selectedIndex].tags ?? []).map((tag) => (
                      <span key={tag} className="tag-pill">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
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
                    {(option.tags ?? []).length > 0 && (
                      <div className="tag-pills">
                        {(option.tags ?? []).map((tag) => (
                          <span key={tag} className="tag-pill">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
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
          ) : selectedSavedRecipe ? (
            <div className="recipe-card">
              <button type="button" className="back-link" onClick={() => selectSavedRecipe(null)}>
                ← Back to My Recipes
              </button>

              {isEditing ? (
                <div className="edit-form">
                  <label htmlFor="edit-title">Title</label>
                  <input
                    id="edit-title"
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />

                  <label htmlFor="edit-summary">Summary</label>
                  <input
                    id="edit-summary"
                    type="text"
                    value={editSummary}
                    onChange={(e) => setEditSummary(e.target.value)}
                  />

                  <label htmlFor="edit-ingredients">Ingredients (one per line)</label>
                  <textarea
                    id="edit-ingredients"
                    rows={5}
                    value={editIngredients}
                    onChange={(e) => setEditIngredients(e.target.value)}
                  />

                  <label htmlFor="edit-steps">Steps (one per line)</label>
                  <textarea
                    id="edit-steps"
                    rows={6}
                    value={editSteps}
                    onChange={(e) => setEditSteps(e.target.value)}
                  />

                  <p className="recipe-label">Tags</p>
                  <div className="tag-filters">
                    {RECIPE_TAGS.map((tag) => (
                      <button
                        type="button"
                        key={tag}
                        className={editTags.includes(tag) ? 'tag-filter tag-filter-active' : 'tag-filter'}
                        onClick={() => toggleEditTag(tag)}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>

                  <div className="edit-actions">
                    <button
                      type="button"
                      className="save-button"
                      disabled={editSaveStatus === 'saving'}
                      onClick={handleSaveEdit}
                    >
                      {editSaveStatus === 'saving' ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button type="button" className="text-button" onClick={() => setIsEditing(false)}>
                      Cancel
                    </button>
                  </div>
                  {editSaveStatus === 'error' && (
                    <p className="error-message">Could not save — please try again.</p>
                  )}
                </div>
              ) : (
                <>
                  <h3>{selectedSavedRecipe.title}</h3>
                  {(selectedSavedRecipe.tags ?? []).length > 0 && (
                    <div className="tag-pills">
                      {(selectedSavedRecipe.tags ?? []).map((tag) => (
                        <span key={tag} className="tag-pill">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="recipe-label">Ingredients</p>
                  <ul>
                    {selectedSavedRecipe.ingredients.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <p className="recipe-label">Steps</p>
                  <ol>
                    {selectedSavedRecipe.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>

                  <div className="recipe-card-actions">
                    <button type="button" className="save-button" onClick={startEditing}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="delete-button"
                      disabled={deleteStatus === 'deleting'}
                      onClick={handleDeleteRecipe}
                    >
                      {deleteStatus === 'deleting' ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                  {deleteStatus === 'error' && (
                    <p className="error-message">Could not delete — please try again.</p>
                  )}
                </>
              )}
            </div>
          ) : savedStatus === 'loading' ? (
            <p>Loading your recipes...</p>
          ) : savedStatus === 'error' ? (
            <p className="error-message">Something went wrong — please try again.</p>
          ) : savedRecipes.length === 0 ? (
            <p>You haven't saved any recipes yet.</p>
          ) : (
            <>
              <div className="saved-filters">
                <input
                  type="search"
                  className="search-input"
                  placeholder="Search by title or ingredient"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <div className="tag-filters">
                  {RECIPE_TAGS.map((tag) => (
                    <button
                      type="button"
                      key={tag}
                      className={selectedTags.includes(tag) ? 'tag-filter tag-filter-active' : 'tag-filter'}
                      onClick={() => toggleTag(tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              {filteredSavedRecipes.length === 0 ? (
                <p>No saved recipes match your search or filters.</p>
              ) : (
                <div className="recipe-options">
                  {filteredSavedRecipes.map((option) => (
                    <button
                      type="button"
                      key={option.id}
                      className="recipe-option"
                      onClick={() => selectSavedRecipe(option.id)}
                    >
                      <span className="recipe-option-title">{option.title}</span>
                      <span className="recipe-option-summary">{option.summary}</span>
                      {(option.tags ?? []).length > 0 && (
                        <div className="tag-pills">
                          {(option.tags ?? []).map((tag) => (
                            <span key={tag} className="tag-pill">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}

export default App

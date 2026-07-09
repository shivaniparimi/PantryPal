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

const DIFFICULTIES = ['Easy', 'Medium', 'Hard']

type Status = 'idle' | 'loading' | 'done' | 'error'
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
type Tab = 'generate' | 'saved'

type RecipeOption = {
  title: string
  summary: string
  ingredients: string[]
  steps: string[]
  tags: string[]
  cookTime: string
  servings: string
  difficulty: string
}

type SavedRecipe = RecipeOption & { id: string }

function ChefMascot() {
  return (
    <svg className="mascot" viewBox="0 0 100 100" width="72" height="72" aria-hidden="true">
      <g className="mascot-steam">
        <path className="steam-puff steam-puff-1" d="M32,20 Q35,14 32,8 Q29,2 32,-4" />
        <path className="steam-puff steam-puff-2" d="M50,16 Q53,10 50,4 Q47,-2 50,-8" />
        <path className="steam-puff steam-puff-3" d="M68,20 Q71,14 68,8 Q65,2 68,-4" />
      </g>

      <path
        className="mascot-hat"
        d="M20,52 C14,28 38,16 50,21 C62,16 86,28 80,52 C80,52 68,57 50,57 C32,57 20,52 20,52 Z"
      />
      <rect className="mascot-band" x="27" y="50" width="46" height="19" rx="9.5" />

      <circle className="mascot-eye" cx="41" cy="59" r="2.6" />
      <circle className="mascot-eye" cx="59" cy="59" r="2.6" />
      <ellipse className="mascot-cheek" cx="36" cy="64" rx="4" ry="2.4" />
      <ellipse className="mascot-cheek" cx="64" cy="64" rx="4" ry="2.4" />
      <path className="mascot-smile" d="M43,63.5 Q50,69 57,63.5" />

      <ellipse className="mascot-bowl-rim" cx="50" cy="80" rx="30" ry="7" />
      <path className="mascot-bowl-body" d="M21,80 Q23,96 50,97 Q77,96 79,80 Z" />

      <g className="mascot-spoon" transform="rotate(24 74 68)">
        <rect x="72" y="46" width="4" height="30" rx="2" />
        <ellipse cx="74" cy="43" rx="6" ry="8" />
      </g>
    </svg>
  )
}

function RecipeMeta({ recipe }: { recipe: RecipeOption }) {
  return (
    <div className="recipe-meta">
      <span className="meta-item meta-item-ingredients">
        <span className="meta-icon" aria-hidden="true">
          🥕
        </span>
        {recipe.ingredients.length} ingredient{recipe.ingredients.length === 1 ? '' : 's'}
      </span>
      {recipe.cookTime && (
        <span className="meta-item meta-item-time">
          <span className="meta-icon" aria-hidden="true">
            ⏱️
          </span>
          {recipe.cookTime}
        </span>
      )}
      {recipe.servings && (
        <span className="meta-item meta-item-servings">
          <span className="meta-icon" aria-hidden="true">
            🍽️
          </span>
          {recipe.servings}
        </span>
      )}
      {recipe.difficulty && (
        <span className="meta-item meta-item-difficulty">
          <span className="meta-icon" aria-hidden="true">
            📊
          </span>
          {recipe.difficulty}
        </span>
      )}
    </div>
  )
}

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
  const [editCookTime, setEditCookTime] = useState('')
  const [editServings, setEditServings] = useState('')
  const [editDifficulty, setEditDifficulty] = useState('')
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
    setEditCookTime(selectedSavedRecipe.cookTime ?? '')
    setEditServings(selectedSavedRecipe.servings ?? '')
    setEditDifficulty(selectedSavedRecipe.difficulty ?? '')
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
          setSavedRecipes(
            data.recipes.map((recipe) => ({
              ...recipe,
              tags: recipe.tags ?? [],
              cookTime: recipe.cookTime ?? '',
              servings: recipe.servings ?? '',
              difficulty: recipe.difficulty ?? '',
            })),
          )
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
      cookTime: editCookTime.trim(),
      servings: editServings.trim(),
      difficulty: editDifficulty,
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

      <div className="hero">
        <ChefMascot />
        <h1>PantryPal</h1>
      </div>
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
            className={canGenerate && status !== 'loading' ? 'generate generate-pulse' : 'generate'}
            disabled={!canGenerate || status === 'loading'}
            onClick={handleGenerate}
          >
            {status === 'loading' ? (
              <span className="generate-loading">
                <span className="spinner" aria-hidden="true" />
                Generating...
              </span>
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
                <RecipeMeta recipe={recipes[selectedIndex]} />
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
                    <RecipeMeta recipe={option} />
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

                  <label htmlFor="edit-cook-time">Cook time</label>
                  <input
                    id="edit-cook-time"
                    type="text"
                    placeholder="e.g. 25 min"
                    value={editCookTime}
                    onChange={(e) => setEditCookTime(e.target.value)}
                  />

                  <label htmlFor="edit-servings">Servings</label>
                  <input
                    id="edit-servings"
                    type="text"
                    placeholder="e.g. 4 servings"
                    value={editServings}
                    onChange={(e) => setEditServings(e.target.value)}
                  />

                  <p className="recipe-label">Difficulty</p>
                  <div className="tag-filters">
                    {DIFFICULTIES.map((level) => (
                      <button
                        type="button"
                        key={level}
                        className={editDifficulty === level ? 'tag-filter tag-filter-active' : 'tag-filter'}
                        onClick={() => setEditDifficulty(level)}
                      >
                        {level}
                      </button>
                    ))}
                  </div>

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
                  <RecipeMeta recipe={selectedSavedRecipe} />
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
                      <RecipeMeta recipe={option} />
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

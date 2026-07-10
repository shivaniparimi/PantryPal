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

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
const MAX_IMAGE_SIZE = 8 * 1024 * 1024

const MAX_COOK_TIME_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '60 min' },
]

const MEAL_TYPES = ['Any', 'Breakfast', 'Lunch', 'Dinner', 'Snack', 'Dessert']

const CUISINES = [
  'Any',
  'Italian',
  'Mexican',
  'Indian',
  'Chinese',
  'Japanese',
  'Korean',
  'Thai',
  'Mediterranean',
  'American',
]

const MISSING_INGREDIENT_OPTIONS = [
  { value: 'only', label: 'Use only my ingredients' },
  { value: 'up-to-2', label: 'Allow up to 2 extra ingredients' },
  { value: 'any', label: 'Any' },
]

type Status = 'idle' | 'loading' | 'done' | 'error'
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
type ScanStatus = 'idle' | 'scanning' | 'reviewing' | 'error'
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

function Sprig({ className }: { className: string }) {
  return (
    <svg className={`page-accent ${className}`} viewBox="0 0 60 90" width="60" height="90" aria-hidden="true">
      <path className="sprig-stem" d="M30,88 C29,65 31,45 30,15" />
      <path className="sprig-leaf" d="M30,60 C12,55 6,38 18,28 C29,36 31,48 30,60 Z" />
      <path className="sprig-leaf" d="M30,45 C48,40 54,25 44,15 C33,22 30,33 30,45 Z" />
      <ellipse className="sprig-bud" cx="30" cy="12" rx="6" ry="9" />
    </svg>
  )
}

function PageAccents() {
  return (
    <>
      <Sprig className="page-accent-tl" />
      <Sprig className="page-accent-tr" />
      <Sprig className="page-accent-bl" />
      <Sprig className="page-accent-br" />
    </>
  )
}

const SERVING_MIN = 1
const SERVING_MAX = 12
const SERVING_PRESETS = [1, 2, 4, 6]

function parseServingsNumber(servings: string): number {
  const match = servings.match(/\d+/)
  const n = match ? parseInt(match[0], 10) : 1
  return n > 0 ? n : 1
}

function formatServingsLabel(original: string, count: number): string {
  const match = original.match(/^\d+\s*(.*)$/)
  let unit = match ? match[1].trim() : 'servings'
  if (unit === 'serving' || unit === 'servings' || unit === '') {
    unit = count === 1 ? 'serving' : 'servings'
  }
  return `${count} ${unit}`
}

const COMMON_FRACTIONS: Array<[number, string]> = [
  [0.25, '¼'],
  [0.333, '⅓'],
  [0.5, '½'],
  [0.667, '⅔'],
  [0.75, '¾'],
]

function formatScaledAmount(n: number): string {
  const whole = Math.floor(n)
  const frac = n - whole

  if (frac < 0.05) return `${whole || 0}`

  let closest = COMMON_FRACTIONS[0]
  let closestDiff = Math.abs(frac - closest[0])
  for (const candidate of COMMON_FRACTIONS) {
    const diff = Math.abs(frac - candidate[0])
    if (diff < closestDiff) {
      closest = candidate
      closestDiff = diff
    }
  }

  if (closestDiff > 0.08) {
    return `${Math.round(n * 100) / 100}`
  }

  return whole > 0 ? `${whole}${closest[1]}` : closest[1]
}

function scaleIngredient(ingredient: string, factor: number): string {
  const match = ingredient.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+)/)
  if (!match) return ingredient

  const raw = match[0]
  const rest = ingredient.slice(raw.length)
  let value: number

  if (raw.includes(' ')) {
    const [whole, frac] = raw.split(' ')
    const [n, d] = frac.split('/').map(Number)
    value = parseInt(whole, 10) + n / d
  } else if (raw.includes('/')) {
    const [n, d] = raw.split('/').map(Number)
    value = n / d
  } else {
    value = parseFloat(raw)
  }

  return `${formatScaledAmount(value * factor)}${rest}`
}

function scaleIngredients(ingredients: string[], baseServings: number, targetServings: number): string[] {
  if (baseServings === targetServings) return ingredients
  const factor = targetServings / baseServings
  return ingredients.map((item) => scaleIngredient(item, factor))
}

function ServingAdjuster({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const percent = ((value - SERVING_MIN) / (SERVING_MAX - SERVING_MIN)) * 100

  return (
    <div className="serving-adjuster">
      <p className="recipe-label">Servings</p>
      <div className="serving-slider-wrap">
        <span key={value} className="serving-bubble" style={{ left: `${percent}%` }}>
          {value}
        </span>
        <input
          type="range"
          className="serving-slider"
          min={SERVING_MIN}
          max={SERVING_MAX}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ '--fill-percent': `${percent}%` } as React.CSSProperties}
          aria-label="Adjust servings"
        />
      </div>
      <div className="serving-presets">
        {SERVING_PRESETS.map((preset) => (
          <button
            type="button"
            key={preset}
            className={value === preset ? 'serving-preset serving-preset-active' : 'serving-preset'}
            onClick={() => onChange(preset)}
          >
            {preset}
          </button>
        ))}
      </div>
    </div>
  )
}

function ScannedIngredientsEditor({
  ingredients,
  onChange,
  onConfirm,
  onCancel,
}: {
  ingredients: string[]
  onChange: (list: string[]) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState('')

  const updateItem = (index: number, value: string) => {
    onChange(ingredients.map((item, i) => (i === index ? value : item)))
  }

  const removeItem = (index: number) => {
    onChange(ingredients.filter((_, i) => i !== index))
  }

  const addItem = () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    onChange([...ingredients, trimmed])
    setDraft('')
  }

  return (
    <div className="scan-review">
      <p className="recipe-label">
        {ingredients.length === 0 ? 'No ingredients detected — add some below' : 'Detected ingredients'}
      </p>
      <div className="scan-ingredient-list">
        {ingredients.map((item, index) => (
          <div className="scan-ingredient-row" key={index}>
            <input type="text" value={item} onChange={(e) => updateItem(index, e.target.value)} />
            <button
              type="button"
              className="scan-remove-button"
              onClick={() => removeItem(index)}
              aria-label={`Remove ${item || 'ingredient'}`}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="scan-add-row">
        <input
          type="text"
          placeholder="Add an ingredient"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addItem()
            }
          }}
        />
        <button type="button" className="serving-preset" onClick={addItem} aria-label="Add ingredient">
          +
        </button>
      </div>
      <div className="edit-actions">
        <button type="button" className="save-button" disabled={ingredients.length === 0} onClick={onConfirm}>
          Confirm & Generate
        </button>
        <button type="button" className="text-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
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
  const [adjustedServings, setAdjustedServings] = useState<number | null>(null)
  const [preferredMaxCookTime, setPreferredMaxCookTime] = useState('any')
  const [preferredMealType, setPreferredMealType] = useState('Any')
  const [preferredCuisine, setPreferredCuisine] = useState('Any')
  const [preferredMissingIngredients, setPreferredMissingIngredients] = useState('any')
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle')
  const [scannedIngredients, setScannedIngredients] = useState<string[]>([])
  const [scanErrorMessage, setScanErrorMessage] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
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

  const currentRecipe = selectedIndex !== null ? recipes[selectedIndex] : null
  const currentBaseServings = currentRecipe ? parseServingsNumber(currentRecipe.servings || '1') : 1
  const currentServings = adjustedServings ?? currentBaseServings
  const currentDisplayIngredients = currentRecipe
    ? scaleIngredients(currentRecipe.ingredients, currentBaseServings, currentServings)
    : []

  const savedBaseServings = selectedSavedRecipe ? parseServingsNumber(selectedSavedRecipe.servings || '1') : 1
  const savedActiveServings = adjustedServings ?? savedBaseServings
  const savedDisplayIngredients = selectedSavedRecipe
    ? scaleIngredients(selectedSavedRecipe.ingredients, savedBaseServings, savedActiveServings)
    : []

  const toggleTag = (tag: string) => {
    setSelectedTags((current) =>
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag],
    )
  }

  const selectSavedRecipe = (id: string | null) => {
    setSavedSelectedId(id)
    setIsEditing(false)
    setDeleteStatus('idle')
    setAdjustedServings(null)
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

  const runGenerate = async (ingredientList: string[]) => {
    setStatus('loading')
    setSelectedIndex(null)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const response = await fetch(`${API_URL}/api/recipe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredients: ingredientList,
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

  const handleGenerate = () => {
    runGenerate(
      ingredients
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    )
  }

  const handleImageSelected = async (file: File) => {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setScanErrorMessage('Unsupported image type — try a JPEG, PNG, WEBP, or HEIC photo.')
      setScanStatus('error')
      return
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setScanErrorMessage('That image is too large — try a photo under 8MB.')
      setScanStatus('error')
      return
    }

    setScanStatus('scanning')

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
        reader.onerror = () => reject(new Error('Could not read file'))
        reader.readAsDataURL(file)
      })

      const response = await fetch(`${API_URL}/api/scan-fridge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType: file.type }),
      })

      if (!response.ok) throw new Error('Request failed')

      const data: { ingredients: string[] } = await response.json()
      setScannedIngredients(data.ingredients)
      setScanStatus('reviewing')
    } catch {
      setScanErrorMessage('Could not analyze that photo — please try again.')
      setScanStatus('error')
    }
  }

  const handleConfirmScan = () => {
    const finalIngredients = scannedIngredients.map((item) => item.trim()).filter(Boolean)
    setIngredients(finalIngredients.join(', '))
    setScanStatus('idle')
    runGenerate(finalIngredients)
  }

  const handleCancelScan = () => {
    setScanStatus('idle')
    setScannedIngredients([])
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
    setAdjustedServings(null)
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
      <PageAccents />
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
        <div className="mascot-wrap">
          <ChefMascot />
        </div>
        <h1>PantryPal</h1>
      </div>
      <p className="subtitle">
        Tell us what’s in your kitchen, and we’ll suggest a recipe!
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

          <div className="scan-fridge">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="scan-file-input"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleImageSelected(file)
                e.target.value = ''
              }}
            />
            <button
              type="button"
              className="scan-button"
              disabled={scanStatus === 'scanning'}
              onClick={() => fileInputRef.current?.click()}
            >
              {scanStatus === 'scanning' ? (
                <span className="generate-loading">
                  <span className="spinner" aria-hidden="true" />
                  Analyzing photo...
                </span>
              ) : (
                '📷 Scan Fridge'
              )}
            </button>

            {scanStatus === 'error' && <p className="error-message">{scanErrorMessage}</p>}

            {scanStatus === 'reviewing' && (
              <ScannedIngredientsEditor
                ingredients={scannedIngredients}
                onChange={setScannedIngredients}
                onConfirm={handleConfirmScan}
                onCancel={handleCancelScan}
              />
            )}
          </div>

          <div className="preferences-card">
            <h2>Recipe Preferences (Optional)</h2>

            <div className="preference-row">
              <label htmlFor="pref-cook-time" className="preference-label">
                ⏱ Max Cook Time
              </label>
              <select
                id="pref-cook-time"
                className="preference-select"
                value={preferredMaxCookTime}
                onChange={(e) => setPreferredMaxCookTime(e.target.value)}
              >
                {MAX_COOK_TIME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="preference-row">
              <label htmlFor="pref-meal-type" className="preference-label">
                🍳 Meal Type
              </label>
              <select
                id="pref-meal-type"
                className="preference-select"
                value={preferredMealType}
                onChange={(e) => setPreferredMealType(e.target.value)}
              >
                {MEAL_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="preference-row">
              <label htmlFor="pref-cuisine" className="preference-label">
                🌎 Cuisine
              </label>
              <select
                id="pref-cuisine"
                className="preference-select"
                value={preferredCuisine}
                onChange={(e) => setPreferredCuisine(e.target.value)}
              >
                {CUISINES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="preference-row">
              <label htmlFor="pref-missing-ingredients" className="preference-label">
                🛒 Missing Ingredients
              </label>
              <select
                id="pref-missing-ingredients"
                className="preference-select"
                value={preferredMissingIngredients}
                onChange={(e) => setPreferredMissingIngredients(e.target.value)}
              >
                {MISSING_INGREDIENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
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
            {status === 'done' && currentRecipe ? (
              <div className="recipe-card">
                <button type="button" className="back-link" onClick={() => selectGeneratedRecipe(null)}>
                  ← Back to options
                </button>
                <h3>{currentRecipe.title}</h3>
                <RecipeMeta
                  recipe={{
                    ...currentRecipe,
                    servings: formatServingsLabel(currentRecipe.servings || 'servings', currentServings),
                  }}
                />
                {(currentRecipe.tags ?? []).length > 0 && (
                  <div className="tag-pills">
                    {(currentRecipe.tags ?? []).map((tag) => (
                      <span key={tag} className="tag-pill">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <ServingAdjuster value={currentServings} onChange={setAdjustedServings} />
                <p className="recipe-label">Ingredients</p>
                <ul>
                  {currentDisplayIngredients.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p className="recipe-label">Steps</p>
                <ol>
                  {currentRecipe.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>

                {user ? (
                  <button
                    type="button"
                    className="save-button"
                    disabled={saveStatus === 'saving' || saveStatus === 'saved'}
                    onClick={() => handleSaveRecipe(currentRecipe)}
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
                  <RecipeMeta
                    recipe={{
                      ...selectedSavedRecipe,
                      servings: formatServingsLabel(selectedSavedRecipe.servings || 'servings', savedActiveServings),
                    }}
                  />
                  {(selectedSavedRecipe.tags ?? []).length > 0 && (
                    <div className="tag-pills">
                      {(selectedSavedRecipe.tags ?? []).map((tag) => (
                        <span key={tag} className="tag-pill">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <ServingAdjuster value={savedActiveServings} onChange={setAdjustedServings} />
                  <p className="recipe-label">Ingredients</p>
                  <ul>
                    {savedDisplayIngredients.map((item) => (
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

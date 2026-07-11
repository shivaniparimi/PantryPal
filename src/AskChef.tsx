import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { API_URL, type RecipeOption } from './App'

export type ChatRole = 'user' | 'chef'

export type ChatMessageData = {
  role: ChatRole
  content: string
}

const SUGGESTED_PROMPTS: { emoji: string; question: string }[] = [
  { emoji: '🥛', question: 'Can I substitute an ingredient?' },
  { emoji: '🌶️', question: 'Make it spicier' },
  { emoji: '💪', question: 'Make it healthier' },
  { emoji: '🍳', question: 'Explain this step' },
  { emoji: '🔥', question: 'I burned something' },
  { emoji: '🥗', question: 'What should I serve with this?' },
]

export function AskChefButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="ask-chef-button" onClick={onClick}>
      👨‍🍳 Ask Chef
    </button>
  )
}

export function ChatMessage({ role, content }: ChatMessageData) {
  return (
    <motion.div
      className={role === 'user' ? 'chat-message chat-message-user' : 'chat-message chat-message-chef'}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {role === 'chef' && (
        <span className="chat-avatar" aria-hidden="true">
          👨‍🍳
        </span>
      )}
      <span className="chat-bubble">{content}</span>
    </motion.div>
  )
}

export function SuggestedPromptChip({
  emoji,
  question,
  onSend,
}: {
  emoji: string
  question: string
  onSend: (question: string) => void
}) {
  return (
    <button type="button" className="suggested-chip" onClick={() => onSend(question)}>
      <span aria-hidden="true">{emoji}</span> {question}
    </button>
  )
}

function TypingIndicator() {
  return (
    <div className="chat-message chat-message-chef">
      <span className="chat-avatar chat-avatar-typing" aria-hidden="true">
        👨‍🍳
      </span>
      <span className="chat-bubble typing-indicator">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </span>
    </div>
  )
}

export function AskChefModal({
  recipe,
  open,
  onClose,
}: {
  recipe: RecipeOption | null
  open: boolean
  onClose: () => void
}) {
  const [messages, setMessages] = useState<ChatMessageData[]>([])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'error'>('idle')
  const [failedQuestion, setFailedQuestion] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (open) {
      requestIdRef.current += 1
      setMessages([])
      setInput('')
      setStatus('idle')
      setFailedQuestion(null)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, status])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const sendToChef = async (question: string, history: ChatMessageData[]) => {
    if (!recipe) return
    const requestId = requestIdRef.current
    setStatus('sending')
    setFailedQuestion(null)

    try {
      const response = await fetch(`${API_URL}/api/recipe/ask-chef`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe, question, history }),
      })

      if (!response.ok) throw new Error('Request failed')

      const data: { reply?: string } = await response.json()
      if (!data.reply) throw new Error('Empty reply')

      if (requestIdRef.current !== requestId) return
      setMessages((current) => [...current, { role: 'chef', content: data.reply as string }])
      setStatus('idle')
    } catch {
      if (requestIdRef.current !== requestId) return
      setStatus('error')
      setFailedQuestion(question)
    }
  }

  const handleSend = (question: string) => {
    const trimmed = question.trim()
    if (!trimmed || !recipe || status === 'sending') return

    const history = messages
    setMessages((current) => [...current, { role: 'user', content: trimmed }])
    setInput('')
    void sendToChef(trimmed, history)
  }

  const handleRetry = () => {
    if (!failedQuestion) return
    const history = messages.slice(0, -1)
    void sendToChef(failedQuestion, history)
  }

  if (!recipe) return null

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="ask-chef-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            className="ask-chef-modal"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ask-chef-header">
              <div>
                <h3>👨‍🍳 Ask Chef</h3>
                <p className="ask-chef-subtitle">Need help with this recipe? Ask Chef anything.</p>
              </div>
              <button type="button" className="ask-chef-close" onClick={onClose} aria-label="Close Ask Chef">
                ×
              </button>
            </div>

            <div className="ask-chef-messages">
              {messages.map((message, index) => (
                <ChatMessage key={index} role={message.role} content={message.content} />
              ))}
              {status === 'sending' && <TypingIndicator />}
              {status === 'error' && (
                <p className="error-message">
                  Chef couldn't respond —{' '}
                  <button type="button" className="text-button" onClick={handleRetry}>
                    retry
                  </button>
                </p>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="suggested-chips">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <SuggestedPromptChip
                  key={prompt.question}
                  emoji={prompt.emoji}
                  question={prompt.question}
                  onSend={handleSend}
                />
              ))}
            </div>

            <div className="ask-chef-input-row">
              <input
                ref={inputRef}
                type="text"
                className="ask-chef-input"
                placeholder="Ask Chef anything about this recipe..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleSend(input)
                  }
                }}
              />
              <button
                type="button"
                className="ask-chef-send"
                disabled={input.trim().length === 0 || status === 'sending'}
                onClick={() => handleSend(input)}
              >
                Send
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

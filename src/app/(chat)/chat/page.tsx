'use client'

import { useChat } from '@ai-sdk/react'
import { useState } from 'react'

export default function Chat() {
  const [input, setInput] = useState('')
  // useChat default endpoint (configured by library); remove deprecated 'api' option
  const { messages, sendMessage } = useChat()
  // Derivar estado de envío: si el último mensaje de usuario no tiene aún respuesta del asistente
  const isSending = messages.length > 0 && messages[messages.length - 1].role === 'user'

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.map((message) => (
        <div key={message.id} className="whitespace-pre-wrap mb-4">
          <strong>{message.role === 'user' ? 'User: ' : 'Gemini: '}</strong>
          {message.parts.map((part, i) => {
            switch (part.type) {
              case 'text':
                return <div key={`${message.id}-${i}`}>{part.text}</div>
              default:
                return null
            }
          })}
        </div>
      ))}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!input.trim() || isSending) return
          sendMessage({ text: input })
          setInput('')
        }}
      >
        <input
          className="fixed dark:bg-zinc-900 bottom-0 w-full max-w-md p-2 mb-8 border border-zinc-300 dark:border-zinc-800 rounded shadow-xl"
          value={input}
          placeholder="Say something..."
          onChange={(e) => setInput(e.currentTarget.value)}
          disabled={isSending}
        />
      </form>
    </div>
  )
}
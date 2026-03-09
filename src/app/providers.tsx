'use client'

// This file exists purely because layout.tsx is a Server Component
// and QueryClientProvider needs 'use client'. So we isolate it here
// and import it into layout.tsx as a regular component.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export default function Providers({ children }: { children: React.ReactNode }) {
  // useState here means each browser session gets its own QueryClient instance
  // (important for server-side rendering — you don't want users sharing a cache)
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 2,  // data stays "fresh" for 2 minutes before refetching
        retry: 1,                   // if a request fails, try once more before showing error
      },
    },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
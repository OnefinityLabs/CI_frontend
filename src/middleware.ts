// src/middleware.ts
// Runs on the server before every page load.
// Reads the Supabase session from cookies (only possible because we use createBrowserClient).
// If no session → redirect to /login
// If session + on /login → redirect to /

import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const response = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // This refreshes the session if it's expired — must be called before checking
  const { data: { session } } = await supabase.auth.getSession()
  const { pathname } = request.nextUrl

  const isLoginPage = pathname === '/login'
  const isPublic = pathname.startsWith('/_next') || pathname.startsWith('/favicon')

  if (isPublic) return response

  if (!session && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (session && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
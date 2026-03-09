import type { Metadata } from 'next'
import { Nunito, Fira_Code } from 'next/font/google'
import './globals.css'
import Providers from './providers'

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-nunito',
})

const firaCode = Fira_Code({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-fira',
})

export const metadata: Metadata = {
  title: 'Conversation Intelligence',
  description: 'Multi-agent conversation dashboard',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${nunito.variable} ${firaCode.variable}`}>
        {/* Providers wraps everything so TanStack Query is available on every page */}
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
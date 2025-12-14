import { Inter } from 'next/font/google'
import './globals.css'
import AuthWrapper from './components/AuthWrapper'
import GoogleTagManager from './components/GoogleTagManager'

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  fallback: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
})

export const metadata = {
  title: 'Robert Ventures Investor Desk',
  description: 'Investment platform for Robert Ventures investors',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <GoogleTagManager />
        <AuthWrapper>
          {children}
        </AuthWrapper>
      </body>
    </html>
  )
}

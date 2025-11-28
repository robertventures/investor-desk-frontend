import './globals.css'
import AuthWrapper from './components/AuthWrapper'
import GoogleTagManager from './components/GoogleTagManager'

export const metadata = {
  title: 'Robert Ventures Investor Desk',
  description: 'Investment platform for Robert Ventures investors',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <GoogleTagManager />
        <AuthWrapper>
          {children}
        </AuthWrapper>
      </body>
    </html>
  )
}

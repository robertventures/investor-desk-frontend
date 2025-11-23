import { redirect } from 'next/navigation'
import PortfolioSummary from '@/app/components/PortfolioSummary'

const SECTION_ROUTES = {
  portfolio: '/dashboard',
  investments: '/dashboard/investments',
  profile: '/dashboard/profile',
  documents: '/dashboard/documents',
  contact: '/dashboard/contact'
}

export const metadata = {
  title: 'Dashboard | Robert Ventures'
}

export default function PortfolioPage({ searchParams }) {
  const section = searchParams?.section

  if (section) {
    const normalized = SECTION_ROUTES[section] ? section : 'portfolio'
    const targetPath = SECTION_ROUTES[normalized]

    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('section')
    if (normalized !== 'profile') {
      nextParams.delete('tab')
    }

    const query = nextParams.toString()

    if (normalized === 'portfolio') {
      // Remove legacy section param while staying on portfolio
      if (query.length > 0) {
        redirect(`/dashboard?${query}`)
      }
      redirect('/dashboard')
    }

    redirect(query ? `${targetPath}?${query}` : targetPath)
  }

  return <PortfolioSummary />
}


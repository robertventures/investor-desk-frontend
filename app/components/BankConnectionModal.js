"use client"
import { useState, useEffect } from 'react'
import styles from './BankConnectionModal.module.css'

// Mock bank data with logos (using emoji as placeholder for logos)
const MOCK_BANKS = [
  { id: 'chase', name: 'Chase', logo: '🏦', color: '#117ACA' },
  { id: 'bofa', name: 'Bank of America', logo: '🏛️', color: '#E31837' },
  { id: 'wells', name: 'Wells Fargo', logo: '🏢', color: '#D71E28' },
  { id: 'citi', name: 'Citi', logo: '🏪', color: '#056DAE' },
  { id: 'capital-one', name: 'Capital One', logo: '💳', color: '#004879' },
  { id: 'usbank', name: 'U.S. Bank', logo: '🏦', color: '#0C234B' },
  { id: 'pnc', name: 'PNC Bank', logo: '🏛️', color: '#F47920' },
  { id: 'td', name: 'TD Bank', logo: '🏢', color: '#00B140' },
  { id: 'schwab', name: 'Charles Schwab', logo: '💼', color: '#00A0DF' },
  { id: 'fidelity', name: 'Fidelity', logo: '📊', color: '#00713E' },
]

// Generate realistic mock accounts for a bank
function generateMockAccounts(bankId) {
  const lastFourOptions = ['1234', '5678', '9012', '3456', '7890', '2468', '1357']
  const randomLast4_1 = lastFourOptions[Math.floor(Math.random() * lastFourOptions.length)]
  const randomLast4_2 = lastFourOptions[Math.floor(Math.random() * lastFourOptions.length)]
  
  const accounts = [
    {
      id: `${bankId}-checking-1`,
      type: 'checking',
      name: 'Everyday Checking',
      last4: randomLast4_1,
      balance: (Math.random() * 50000 + 5000).toFixed(2),
    },
    {
      id: `${bankId}-savings-1`,
      type: 'savings',
      name: 'Premium Savings',
      last4: randomLast4_2,
      balance: (Math.random() * 150000 + 10000).toFixed(2),
    }
  ]
  
  // Sometimes add a third account
  if (Math.random() > 0.5) {
    accounts.push({
      id: `${bankId}-checking-2`,
      type: 'checking',
      name: 'Business Checking',
      last4: lastFourOptions[Math.floor(Math.random() * lastFourOptions.length)],
      balance: (Math.random() * 80000 + 15000).toFixed(2),
    })
  }
  
  return accounts
}

export default function BankConnectionModal({ isOpen, onClose, onAccountSelected }) {
  const [step, setStep] = useState(1) // 1: bank selection, 2: login, 3: account selection
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedBank, setSelectedBank] = useState(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [accounts, setAccounts] = useState([])
  const [selectedAccount, setSelectedAccount] = useState(null)

  // Reset modal state when closed
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setStep(1)
        setSearchTerm('')
        setSelectedBank(null)
        setUsername('')
        setPassword('')
        setAccounts([])
        setSelectedAccount(null)
      }, 300) // Wait for close animation
    }
  }, [isOpen])

  const filteredBanks = MOCK_BANKS.filter(bank =>
    bank.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleBankSelect = (bank) => {
    setSelectedBank(bank)
    setStep(2)
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!username || !password) return

    setIsLoading(true)
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    // Generate mock accounts
    const mockAccounts = generateMockAccounts(selectedBank.id)
    setAccounts(mockAccounts)
    setIsLoading(false)
    setStep(3)
  }

  const handleAccountSelect = (account) => {
    setSelectedAccount(account)
  }

  const handleContinue = () => {
    if (selectedAccount && selectedBank) {
      // Pass back the selected account with bank info
      onAccountSelected({
        id: `bank-${Date.now()}`,
        bankId: selectedBank.id,
        bankName: selectedBank.name,
        bankLogo: selectedBank.logo,
        bankColor: selectedBank.color,
        accountType: selectedAccount.type,
        accountName: selectedAccount.name,
        last4: selectedAccount.last4,
        nickname: `${selectedBank.name} ${selectedAccount.type.charAt(0).toUpperCase() + selectedAccount.type.slice(1)} (...${selectedAccount.last4})`,
        type: 'ach',
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString()
      })
      onClose()
    }
  }

  const handleBack = () => {
    if (step === 2) {
      setStep(1)
      setSelectedBank(null)
      setUsername('')
      setPassword('')
    } else if (step === 3) {
      setStep(2)
      setSelectedAccount(null)
    }
  }

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            {step > 1 && (
              <button className={styles.backButton} onClick={handleBack}>
                ← Back
              </button>
            )}
          </div>
          <div className={styles.headerCenter}>
            {step === 1 && 'Select your bank'}
            {step === 2 && `Log in to ${selectedBank?.name}`}
            {step === 3 && 'Select account'}
          </div>
          <button className={styles.closeButton} onClick={onClose}>✕</button>
        </div>

        {/* Progress indicator */}
        <div className={styles.progress}>
          <div className={`${styles.progressStep} ${step >= 1 ? styles.active : ''}`} />
          <div className={`${styles.progressStep} ${step >= 2 ? styles.active : ''}`} />
          <div className={`${styles.progressStep} ${step >= 3 ? styles.active : ''}`} />
        </div>

        {/* Content */}
        <div className={styles.content}>
          {step === 1 && (
            <div className={styles.bankSelection}>
              <div className={styles.searchBox}>
                <span className={styles.searchIcon}>🔍</span>
                <input
                  type="text"
                  placeholder="Search for your bank..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={styles.searchInput}
                  autoFocus
                />
              </div>
              
              <div className={styles.bankList}>
                {filteredBanks.length > 0 ? (
                  filteredBanks.map(bank => (
                    <button
                      key={bank.id}
                      className={styles.bankItem}
                      onClick={() => handleBankSelect(bank)}
                    >
                      <span className={styles.bankLogo} style={{ backgroundColor: bank.color + '20' }}>
                        {bank.logo}
                      </span>
                      <span className={styles.bankName}>{bank.name}</span>
                      <span className={styles.bankArrow}>→</span>
                    </button>
                  ))
                ) : (
                  <div className={styles.noResults}>
                    No banks found matching "{searchTerm}"
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className={styles.loginForm}>
              <div className={styles.bankHeader}>
                <span className={styles.bankLogoBig} style={{ backgroundColor: selectedBank?.color + '20' }}>
                  {selectedBank?.logo}
                </span>
                <div className={styles.bankInfo}>
                  <div className={styles.bankNameBig}>{selectedBank?.name}</div>
                  <div className={styles.bankSubtext}>Enter your online banking credentials</div>
                </div>
              </div>

              <form onSubmit={handleLogin} className={styles.form}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className={styles.input}
                    placeholder="Enter your username"
                    autoFocus
                    disabled={isLoading}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={styles.input}
                    placeholder="Enter your password"
                    disabled={isLoading}
                  />
                </div>

                <div className={styles.securityNote}>
                  <span className={styles.lockIcon}>🔒</span>
                  <span className={styles.securityText}>
                    Your credentials are encrypted and secure. Robert Ventures uses bank-level security.
                  </span>
                </div>

                <button
                  type="submit"
                  className={styles.submitButton}
                  disabled={!username || !password || isLoading}
                >
                  {isLoading ? (
                    <>
                      <span className={styles.spinner}></span>
                      Connecting...
                    </>
                  ) : (
                    'Continue'
                  )}
                </button>
              </form>
            </div>
          )}

          {step === 3 && (
            <div className={styles.accountSelection}>
              <div className={styles.selectionHeader}>
                <span className={styles.checkIcon}>✓</span>
                <div className={styles.successText}>Successfully connected to {selectedBank?.name}</div>
                <div className={styles.successSubtext}>Select an account to link for funding</div>
              </div>

              <div className={styles.accountList}>
                {accounts.map(account => (
                  <button
                    key={account.id}
                    className={`${styles.accountItem} ${selectedAccount?.id === account.id ? styles.selected : ''}`}
                    onClick={() => handleAccountSelect(account)}
                  >
                    <div className={styles.accountLeft}>
                      <div className={styles.accountIcon}>
                        {account.type === 'checking' ? '💵' : '💰'}
                      </div>
                      <div className={styles.accountDetails}>
                        <div className={styles.accountName}>{account.name}</div>
                        <div className={styles.accountNumber}>
                          {selectedBank?.name} •••• {account.last4}
                        </div>
                      </div>
                    </div>
                    <div className={styles.accountRight}>
                      <div className={styles.accountBalance}>
                        ${parseFloat(account.balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      {selectedAccount?.id === account.id && (
                        <div className={styles.selectedCheckmark}>✓</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <button
                className={styles.continueButton}
                onClick={handleContinue}
                disabled={!selectedAccount}
              >
                Link Account
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <span className={styles.poweredBy}>🔒 Secured by Plaid-like Technology</span>
        </div>
      </div>
    </div>
  )
}


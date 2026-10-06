import { http, createConfig } from 'wagmi'
import { base } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'

// WalletConnect project ID — set VITE_WC_PROJECT_ID in .env
const wcProjectId = import.meta.env.VITE_WC_PROJECT_ID as string | undefined

const connectors = wcProjectId
  ? [injected(), walletConnect({ projectId: wcProjectId })]
  : [injected()]

export const wagmiConfig = createConfig({
  chains: [base],
  connectors,
  transports: {
    [base.id]: http(import.meta.env.VITE_RPC_URL || 'https://mainnet.base.org'),
  },
})

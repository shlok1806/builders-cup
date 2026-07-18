export type PurchaseStatus = 'building' | 'awaiting_approval' | 'charged' | 'failed'
export type ChargeStatus = 'pending' | 'succeeded' | 'failed'
export type ApprovalStatus = 'pending' | 'approved' | 'declined'
export type PolicyType = 'exclude_category' | 'approval_threshold' | 'split_weight'

export type PaymentMethodRow = {
  id: string
  user_id: string
  stripe_customer_id: string
  stripe_pm_id: string
  last4: string | null
  brand: string | null
  created_at: string
}

export type ChargeRow = {
  id: string
  purchase_id: string
  user_id: string
  amount_cents: number
  stripe_payment_intent_id: string | null
  status: ChargeStatus
  created_at: string
}

// Single source of truth for VIBE token economics (the client fetches the gift catalog from the API)

const GIFT_CATALOG = [
  { id: 'compliment', name: 'Compliment', price: 1, icon: '👏', color: '#00F0FF' },
  { id: 'clover', name: 'Lucky Clover', price: 5, icon: '🍀', color: '#3DDC97' },
  { id: 'rose', name: 'Neon Rose', price: 10, icon: '🌹', color: '#FF2A7A' },
  { id: 'diamond', name: 'Translucent Diamond', price: 20, icon: '💎', color: '#00F0FF' },
  { id: 'ring', name: 'Chrome Ring', price: 40, icon: '💍', color: '#C0C7D6' },
  { id: 'crown', name: 'Royal Crown', price: 75, icon: '👑', color: '#FFD166' }
];

// Recipient's share of each gift, credited to their cash-out (earned) balance; the rest is platform rake
const GIFT_RECIPIENT_SHARE = 0.5;

const M2E = {
  CYCLE_SECONDS: 180, // 3 minutes of active call time...
  REWARD_PER_CYCLE: 0.10, // ...earns 0.10 VIBE
  DAILY_CAP: 10.0
};

// VibeBoost: priority matching + flame badge + see your match's gender early
const BOOST = {
  PRICE: 10,
  DURATION_SECONDS: 60 * 60
};

// VIBE top-up packs (prices in INR, GST inclusive). Sample values: tune before going live.
const VIBE_PACKAGES = [
  { id: 'starter', vibe: 50, priceInr: 49 },
  { id: 'popular', vibe: 120, priceInr: 99, tag: 'Most popular' },
  { id: 'mega', vibe: 300, priceInr: 199, tag: 'Best value' }
];

const roundVibe = (amount) => Math.round(amount * 100) / 100;

module.exports = { GIFT_CATALOG, GIFT_RECIPIENT_SHARE, M2E, BOOST, VIBE_PACKAGES, roundVibe };

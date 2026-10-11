import React, { useEffect, useState } from 'react';
import { X, Coins, Sparkles, Gift, Wallet, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { apiFetch } from '../../utils/api.js';

function describe(tx) {
  const gift = tx.gift ? `${tx.gift.icon} ${tx.gift.name}` : 'a gift';
  switch (tx.type) {
    case 'EARN_CHAT':
      return { label: 'Meet-to-Earn reward', Icon: Sparkles, tone: 'text-[#00F0FF]' };
    case 'SEND_GIFT':
      return { label: `Sent ${gift} to ${tx.counterparty || 'a deleted user'}`, Icon: ArrowUpRight, tone: 'text-[#FF2A7A]' };
    case 'RECEIVE_GIFT':
      return { label: `Received ${gift} from ${tx.counterparty || 'a deleted user'}`, Icon: ArrowDownLeft, tone: 'text-[#FFD166]', earned: true };
    default:
      return { label: tx.type, Icon: Coins, tone: 'text-slate-400' };
  }
}

function formatWhen(value) {
  return new Date(value).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Balances (spendable vs. earned from gifts), today's Meet-to-Earn progress and recent transactions
 */
export default function WalletModal({ token, onClose }) {
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch('/api/wallet/balance', { token }),
      apiFetch('/api/wallet/transactions', { token })
    ])
      .then(([balance, history]) => {
        setWallet(balance);
        setTransactions(history.transactions);
      })
      .catch((err) => setError(err.message));
  }, [token]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="w-full max-w-md max-h-[90vh] flex flex-col bg-[#12151E] border border-slate-800 rounded-3xl p-6 shadow-2xl">

        <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#FFD166]/10 text-[#FFD166] border border-[#FFD166]/20">
              <Wallet size={18} />
            </div>
            <div>
              <h3 className="text-white font-bold text-lg tracking-wide">VIBE Wallet</h3>
              <p className="text-xs text-slate-400">Virtual tokens with no cash value</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl">{error}</div>
        )}

        {wallet && (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-[#08090D] border border-slate-800 rounded-2xl p-3.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Spendable</div>
                <div className="flex items-center gap-1.5 mt-1 text-lg font-extrabold text-white">
                  <Coins size={16} className="text-[#FFD166]" />
                  <span>{wallet.balance.toFixed(2)}</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">For sending gifts</div>
              </div>
              <div className="bg-[#08090D] border border-slate-800 rounded-2xl p-3.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Earned from gifts</div>
                <div className="flex items-center gap-1.5 mt-1 text-lg font-extrabold text-white">
                  <Gift size={16} className="text-[#FF2A7A]" />
                  <span>{wallet.earnedBalance.toFixed(2)}</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Cash-out coming later</div>
              </div>
            </div>

            <div className="bg-[#08090D] border border-slate-800 rounded-2xl p-3.5 mb-4">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-bold text-slate-200">Meet-to-Earn today</span>
                <span className="font-mono text-slate-400">
                  <span className="text-[#00F0FF] font-bold">{wallet.m2eEarnedToday.toFixed(2)}</span>/{wallet.m2eDailyCap} VIBE
                </span>
              </div>
              <div className="h-2 bg-[#12151E] rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-[#00F0FF] to-[#FF2A7A]"
                  style={{ width: `${Math.min(100, (wallet.m2eEarnedToday / wallet.m2eDailyCap) * 100)}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-500 mt-1.5">
                Earn {wallet.m2eRatePer3Min.toFixed(2)} VIBE for every 3 minutes on a call.
              </div>
            </div>

            <button
              disabled
              className="w-full mb-5 py-2.5 rounded-2xl border border-dashed border-slate-700 text-slate-500 font-bold text-xs cursor-not-allowed"
            >
              Top up VIBE · coming soon
            </button>
          </>
        )}

        <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Recent activity</h4>
        <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
          {transactions === null && !error && <p className="text-xs text-slate-500">Loading…</p>}
          {transactions?.length === 0 && (
            <p className="text-xs text-slate-500">No activity yet. Stay on a call for 3 minutes to earn your first VIBE.</p>
          )}
          {transactions?.map((tx) => {
            const { label, Icon, tone, earned } = describe(tx);
            return (
              <div key={tx.id} className="flex items-center gap-3 bg-[#08090D] border border-slate-800/70 rounded-xl px-3 py-2">
                <Icon size={15} className={`shrink-0 ${tone}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-200 truncate">{label}</div>
                  <div className="text-[10px] text-slate-500">{formatWhen(tx.createdAt)}{earned ? ' · earned balance' : ''}</div>
                </div>
                <div className={`text-xs font-bold font-mono ${tx.amount < 0 ? 'text-slate-400' : 'text-[#3DDC97]'}`}>
                  {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(2)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

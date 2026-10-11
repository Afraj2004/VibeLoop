import React, { useEffect, useState } from 'react';
import { X, Coins, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../../utils/api.js';

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

function loadCheckout() {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHECKOUT_SRC;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load the payment window. Check your connection.'));
    document.body.appendChild(script);
  });
}

/**
 * Buy VIBE packs with Razorpay (UPI, cards, netbanking, wallets)
 */
export default function TopUpModal({ token, currentUser, onClose, onPurchased, onRequireAccount }) {
  const isGuest = !currentUser || currentUser.isGuest;
  const [catalog, setCatalog] = useState(null);
  const [busyPackage, setBusyPackage] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    apiFetch('/api/payments/packages')
      .then(setCatalog)
      .catch((err) => setError(err.message));
  }, []);

  const handleBuy = async (pkg) => {
    setBusyPackage(pkg.id);
    setError('');
    setNotice('');
    try {
      const [order] = await Promise.all([
        apiFetch('/api/payments/order', { token, method: 'POST', body: { packageId: pkg.id } }),
        loadCheckout()
      ]);

      const checkout = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amountPaise,
        currency: order.currency,
        name: 'VibeLoop',
        description: `${pkg.vibe} VIBE`,
        prefill: { email: currentUser?.email || undefined },
        theme: { color: '#00F0FF' },
        handler: async (response) => {
          try {
            const result = await apiFetch('/api/payments/verify', { token, method: 'POST', body: response });
            if (result.status === 'paid') {
              onPurchased(result.balance, pkg.vibe);
              onClose();
            } else {
              setNotice('Payment received. Your VIBE will appear in a moment.');
              setBusyPackage(null);
            }
          } catch (err) {
            setError(err.message);
            setBusyPackage(null);
          }
        },
        modal: {
          ondismiss: () => setBusyPackage(null)
        }
      });
      checkout.on('payment.failed', (response) => {
        setError(response.error?.description || 'The payment did not go through.');
        setBusyPackage(null);
      });
      checkout.open();
    } catch (err) {
      setError(err.message);
      setBusyPackage(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="w-full max-w-md bg-[#12151E] border border-slate-800 rounded-3xl p-6 shadow-2xl">

        <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#FFD166]/10 text-[#FFD166] border border-[#FFD166]/20">
              <Coins size={18} />
            </div>
            <div>
              <h3 className="text-white font-bold text-lg tracking-wide">Top up VIBE</h3>
              <p className="text-xs text-slate-400">UPI, cards, netbanking &amp; wallets</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {catalog && !catalog.enabled && (
          <p className="text-sm text-slate-400 mb-4">Top-ups are coming soon.</p>
        )}

        {catalog?.enabled && isGuest && (
          <div className="mb-4 p-4 rounded-2xl bg-[#08090D] border border-slate-800 text-xs text-slate-300">
            <p className="mb-3">Create a free account to buy VIBE, so your purchase is saved to your account and never lost. Your current balance and history come with you.</p>
            <button
              onClick={onRequireAccount}
              className="w-full py-2.5 rounded-2xl bg-gradient-to-r from-[#00F0FF] to-[#FF2A7A] text-slate-950 font-extrabold text-xs cursor-pointer"
            >
              Create account
            </button>
          </div>
        )}

        {catalog?.enabled && (
          <div className="space-y-2 mb-4">
            {catalog.packages.map((pkg) => (
              <button
                key={pkg.id}
                onClick={() => handleBuy(pkg)}
                disabled={isGuest || Boolean(busyPackage)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-[#08090D] border border-slate-800 hover:border-[#FFD166]/50 transition-colors text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-2.5">
                  <Coins size={18} className="text-[#FFD166]" />
                  <div>
                    <div className="text-sm font-extrabold text-white">{pkg.vibe} VIBE</div>
                    {pkg.tag && <div className="text-[10px] font-bold text-[#FF7A00]">{pkg.tag}</div>}
                  </div>
                </div>
                <div className="text-sm font-bold text-[#00F0FF]">
                  {busyPackage === pkg.id ? 'Opening…' : `₹${pkg.priceInr}`}
                </div>
              </button>
            ))}
          </div>
        )}

        {notice && <div className="mb-3 p-3 rounded-xl bg-[#00F0FF]/10 border border-[#00F0FF]/30 text-[#00F0FF] text-xs">{notice}</div>}
        {error && <div className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">{error}</div>}

        <p className="flex items-start gap-1.5 text-[10px] text-slate-500">
          <ShieldCheck size={12} className="shrink-0 mt-px" />
          <span>
            Payments are processed securely by Razorpay. Prices include taxes. VIBE is a virtual item with no cash value;
            purchases are final except where the law requires a refund. See the <a href="/terms" target="_blank" rel="noreferrer" className="underline">Terms</a>.
          </span>
        </p>
      </div>
    </div>
  );
}

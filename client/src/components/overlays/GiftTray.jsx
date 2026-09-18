        export default function GiftTray({
          selectedGift,
          setSelectedGift,
          recipientName,
          userBalance,
          hasEnough,
          isSending,
          handleSend,
          onClose,
          GIFTS,
          Sparkles,
          X,
          Coins,
          Send,
        }) {
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 transition-all duration-300">
      
      {/* Modal Container */}
      <div className="w-full max-w-md bg-[#12151E]/90 border border-slate-800 rounded-3xl p-6 shadow-2xl backdrop-blur-xl relative overflow-hidden animate-in fade-in slide-in-from-bottom-6 duration-200">
        
        {/* Glowing Background Accent */}
        <div 
          className="absolute -top-24 -right-24 w-48 h-48 rounded-full blur-3xl opacity-20 pointer-events-none transition-all duration-500"
          style={{ backgroundColor: selectedGift?.color || '#00F0FF' }}
        />

        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/20">
              <Sparkles size={18} />
            </div>
            <div>
              <h3 className="text-white font-bold text-lg tracking-wide">Send Gift</h3>
              <p className="text-xs text-slate-400">Gift to <span className="text-slate-200 font-medium">{recipientName}</span> (50% value earned)</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Gift Grid */}
        <div className="grid grid-cols-5 gap-3 mb-6">
          {GIFTS.map((gift) => {
            const isSelected = selectedGift?.id === gift.id;
            return (
              <button
                key={gift.id}
                onClick={() => setSelectedGift(gift)}
                className={`relative flex flex-col items-center justify-between p-3 rounded-2xl border transition-all duration-200 group ${
                  isSelected
                    ? 'bg-slate-800/80 border-[#00F0FF] shadow-[0_0_15px_rgba(0,240,255,0.25)] scale-105'
                    : 'bg-[#08090D]/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
                }`}
              >
                <span className="text-3xl mb-1 transition-transform group-hover:scale-110 duration-200 drop-shadow-md">
                  {gift.icon}
                </span>
                <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-300">
                  <Coins size={10} className="text-[#FFD166]" />
                  <span>{gift.price}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Gift Detail & Action */}
        <div className="flex items-center justify-between bg-[#08090D]/80 border border-slate-800/80 rounded-2xl p-3.5 mb-5">
          <div>
            <div className="text-xs text-slate-400">Selected Item</div>
            <div className="text-sm font-bold text-white flex items-center gap-1.5 mt-0.5">
              <span>{selectedGift.name}</span>
              <span className="text-xs font-normal text-slate-400">({selectedGift.price} VIBE)</span>
            </div>
          </div>
          
          <div className="text-right">
            <div className="text-xs text-slate-400">Your Balance</div>
            <div className="text-xs font-bold text-[#FFD166] flex items-center justify-end gap-1 mt-0.5">
              <Coins size={12} />
              <span>{userBalance.toFixed(2)} VIBE</span>
            </div>
          </div>
        </div>

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={!hasEnough || isSending}
          style={{
            backgroundColor: hasEnough ? (selectedGift?.color || '#00F0FF') : '#1E293B',
          }}
          className={`w-full py-3.5 px-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all duration-200 ${
            hasEnough 
              ? 'text-slate-950 hover:opacity-90 active:scale-[0.99] cursor-pointer' 
              : 'text-slate-500 cursor-not-allowed border border-slate-800'
          }`}
        >
          {isSending ? (
            <span className="inline-block animate-pulse">Sending Gift...</span>
          ) : !hasEnough ? (
            <span>Insufficient VIBE Tokens</span>
          ) : (
            <>
              <Send size={16} />
              <span>Send Gift ({selectedGift.price} VIBE)</span>
            </>
          )}
        </button>

      </div>
    </div>
  );
}

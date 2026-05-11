export default function Beneficiary() {
  return (
    <div className="max-w-2xl mx-auto px-5 md:px-6 py-12 flex flex-col items-center justify-center min-h-[40vh] text-center space-y-4">
      <div className="w-12 h-12 rounded-full flex items-center justify-center"
        style={{ background: '#f0f0ec' }}>
        <span className="material-symbols-outlined text-2xl" style={{ color: '#434844' }}>manage_accounts</span>
      </div>
      <div>
        <p className="text-sm font-semibold text-[#1b1c1a]" style={{ fontFamily: "'Noto Serif', serif" }}>
          Beneficiary Module — Coming Soon
        </p>
        <p className="text-xs text-[#434844]/50 mt-1 max-w-xs leading-relaxed">
          Lock inheritance and beneficiary designation will be available in a future protocol upgrade.
        </p>
      </div>
    </div>
  )
}

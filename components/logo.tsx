export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      aria-hidden
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="32" height="32" rx="8" fill="#161A22" />
      <rect x="6" y="10" width="20" height="4.5" rx="1" fill="#E0B44A" />
      <rect x="6" y="18" width="12" height="4.5" rx="1" fill="#E0B44A" />
    </svg>
  );
}

export function LogoWordmark() {
  return (
    <div className="flex items-center gap-2">
      <LogoMark />
      <div>
        <p className="text-sm font-semibold leading-none text-white">Basis Desk</p>
        <p className="mt-1 text-[11px] text-white/35">RWA wrappers</p>
      </div>
    </div>
  );
}

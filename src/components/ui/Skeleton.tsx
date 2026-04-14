/** Pulse skeleton atom. Pass Tailwind size + shape classes via `className`. */
export function Sk({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-[#e8e8e2] ${className}`} />
}

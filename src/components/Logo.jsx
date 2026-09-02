export function Logo({ className = 'h-11' }) {
  return (
    <img
      src="/logo.png"
      alt="iTreq Inc — Tracking Everything and Anything"
      className={`w-auto max-w-[min(100%,12rem)] object-contain object-left sm:max-w-[min(100%,320px)] ${className}`}
    />
  )
}

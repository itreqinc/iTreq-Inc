export function Logo({ className = 'h-11' }) {
  return (
    <img
      src="/logo.png"
      alt="iTreq Inc — Tracking Everything and Anything"
      className={`w-auto max-w-[min(100%,320px)] object-contain object-left max-md:max-w-[min(100%,340px)] ${className}`}
    />
  )
}

// Maskotka Echo (tylko linia dziecięca). Nastrój to klasa CSS z animacją.
export type BatMood = "idle" | "listen" | "happy" | "think";

export function Bat({ mood = "idle" }: { mood?: BatMood }) {
  return (
    <span className={`bat bat-${mood}`} aria-hidden="true">
      <svg viewBox="0 0 120 110">
        <g className="bat-body">
          <line x1="60" y1="0" x2="60" y2="14" stroke="#6d68c9" strokeWidth="3" />
          <path d="M44 50 C30 34,10 36,2 50 C12 50,14 60,22 62 C26 56,34 60,36 66 C40 60,44 58,46 60Z" fill="var(--bat-wing)" />
          <path d="M76 50 C90 34,110 36,118 50 C108 50,106 60,98 62 C94 56,86 60,84 66 C80 60,76 58,74 60Z" fill="var(--bat-wing)" />
          <path d="M44 30 L40 10 L54 24Z M76 30 L80 10 L66 24Z" fill="var(--bat-body)" />
          <ellipse cx="60" cy="52" rx="22" ry="26" fill="var(--bat-body)" />
          <ellipse cx="60" cy="60" rx="13" ry="14" fill="var(--bat-belly)" />
          <ellipse cx="52" cy="44" rx="4" ry="5" fill="#1e1b4b" />
          <ellipse cx="68" cy="44" rx="4" ry="5" fill="#1e1b4b" />
          <circle cx="53.5" cy="42.5" r="1.4" fill="#fff" />
          <circle cx="69.5" cy="42.5" r="1.4" fill="#fff" />
          <path d="M54 54 Q60 60 66 54" stroke="#1e1b4b" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        </g>
      </svg>
      <span className="bat-waves"><i /><i /><i /></span>
    </span>
  );
}

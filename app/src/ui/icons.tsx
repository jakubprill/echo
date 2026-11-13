// Shared iconography for both lines: 24×24 grid, 2 px stroke, colour from currentColor.
const PATHS = {
  home: <><path d="M4 11l8-7 8 7" /><path d="M6 9.5V20h12V9.5" /><path d="M10 20v-5h4v5" /></>,
  deck: <><rect x="4" y="7" width="13" height="14" rx="2.5" /><path d="M8 3.5h9.5A2.5 2.5 0 0 1 20 6v11" /></>,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />,
  import: <><path d="M12 3v11" /><path d="M7.5 9.5L12 14l4.5-4.5" /><path d="M4 15v3.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V15" /></>,
  export: <><path d="M12 14V3" /><path d="M7.5 7.5L12 3l4.5 4.5" /><path d="M4 15v3.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V15" /></>,
  settings: <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  speaker: <><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M16.5 8.5a5 5 0 0 1 0 7" /><path d="M19 6a8.5 8.5 0 0 1 0 12" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  play: <path d="M7 4.5v15l12-7.5z" fill="currentColor" />,
  map: <><path d="M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5z" /><path d="M9 4v13.5M15 6.5V20" /></>,
  quiz: <><circle cx="12" cy="12" r="9" /><path d="M9.2 9.3a2.9 2.9 0 0 1 5.6.9c0 1.9-2.8 2.4-2.8 4" /><path d="M12 17.2v.1" /></>,
  back: <path d="M14.5 5.5L8 12l6.5 6.5" />,
  next: <path d="M9.5 5.5L16 12l-6.5 6.5" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  trash: <><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  star: <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9 6.8 19.600l1-5.800L3.500 9.700l5.900-.800z" />,
  album: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M9 4v16" /><path d="M12.5 9.500h4M12.500 13.500h4" /></>,
  user: <><circle cx="12" cy="8.500" r="3.500" /><path d="M5 20c.8-3.500 3.500-5.500 7-5.500s6.200 2 7 5.500" /></>,
  bat: <path d="M12 8.5c-1.200 0-2.200.6-2.700 1.500L8.500 7l-.400 3.600C6.700 9 4.600 8.300 2.500 9c1.500.800 2 2.300 2 3.500 1-.600 2.300-.400 3 .5.600-.800 1.600-1 2.500-.500L12 16l2-3.500c.900-.500 1.900-.300 2.500.5.700-.900 2-1.100 3-.5 0-1.200.5-2.700 2-3.500-2.100-.700-4.200 0-5.600 1.600L15.500 7l-.800 3c-.500-.900-1.500-1.500-2.700-1.500z" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

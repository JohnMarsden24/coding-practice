const paths = {
  plus: 'M12 5v14M5 12h14',
  sidebar: 'M4 5h16v14H4zM9 5v14',
  chart: 'M5 19V11M12 19V5M19 19v-6',
  pencil: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  trash: 'M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12',
  mic: 'M12 4a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v3',
  send: 'M12 19V5M6 11l6-6 6 6',
  play: 'M8 5l11 7-11 7z',
  check: 'M5 12l5 5 9-10',
  flag: 'M6 20V4M6 4h11l-2 4 2 4H6',
  panel: 'M4 5h16v14H4zM14 5v14',
  chevron: 'M9 6l6 6-6 6',
  book: 'M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3zM21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z',
};

export function Icon({ name, size = 16 }: { name: keyof typeof paths; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

// Ícones inline (sem dependência externa), estilo linha, 1.5px stroke.
const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

function Svg({ children, size = 18, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} {...rest}>
      {children}
    </svg>
  );
}

export const IconGrid = (p) => (
  <Svg {...p}>
    <rect x="3" y="3" width="8" height="8" rx="1.5" />
    <rect x="13" y="3" width="8" height="8" rx="1.5" />
    <rect x="3" y="13" width="8" height="8" rx="1.5" />
    <rect x="13" y="13" width="8" height="8" rx="1.5" />
  </Svg>
);

export const IconChart = (p) => (
  <Svg {...p}>
    <path d="M4 19V9" />
    <path d="M11 19V4" />
    <path d="M18 19v-7" />
    <path d="M3 20h18" />
  </Svg>
);

export const IconMessage = (p) => (
  <Svg {...p}>
    <path d="M21 12a8 8 0 1 1-3.2-6.4" />
    <path d="M21 4l-9.5 9.5" />
    <path d="M21 4l-6 1.4" />
    <path d="M21 4l-1.4 6" />
  </Svg>
);

export const IconFlow = (p) => (
  <Svg {...p}>
    <circle cx="5" cy="6" r="2.3" />
    <circle cx="5" cy="18" r="2.3" />
    <circle cx="18" cy="12" r="2.3" />
    <path d="M7 6h6a3 3 0 0 1 3 3v0" />
    <path d="M7 18h6a3 3 0 0 0 3-3v0" />
  </Svg>
);

export const IconBroadcast = (p) => (
  <Svg {...p}>
    <path d="M4 10v4h3l4 4V6l-4 4H4z" />
    <path d="M15.5 8.5a4 4 0 0 1 0 7" />
    <path d="M18 6a7.5 7.5 0 0 1 0 12" />
  </Svg>
);

export const IconTemplate = (p) => (
  <Svg {...p}>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M8 8h8" />
    <path d="M8 12h8" />
    <path d="M8 16h5" />
  </Svg>
);

export const IconComment = (p) => (
  <Svg {...p}>
    <path d="M4 5h16v11H8l-4 4V5z" />
  </Svg>
);

export const IconLeads = (p) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3 20a6 6 0 0 1 12 0" />
    <path d="M16 5.5a3 3 0 0 1 0 5.8" />
    <path d="M18.5 20a6 6 0 0 0-3.6-9" />
  </Svg>
);

export const IconWhatsapp = (p) => (
  <Svg {...p}>
    <path d="M6 19l1.2-3.6A7.5 7.5 0 1 1 10.4 18L6 19z" />
    <path d="M9 9.5c0 3 2.5 5.5 5.5 5.5" strokeWidth="1.3" />
  </Svg>
);

export const IconFacebook = (p) => (
  <Svg {...p}>
    <path d="M14 21v-7h2.5l.5-3H14V9c0-.9.3-1.5 1.7-1.5H17V4.8c-.3 0-1.2-.1-2.3-.1-2.3 0-3.7 1.3-3.7 3.9V11H8.5v3H11v7h3z" />
  </Svg>
);

export const IconInstagram = (p) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
    <circle cx="12" cy="12" r="3.6" />
    <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconMail = (p) => (
  <Svg {...p}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
    <path d="M4 6.5l8 6 8-6" />
  </Svg>
);

export const IconBell = (p) => (
  <Svg {...p}>
    <path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5 1.5 5h-15S6 14 6 10z" />
    <path d="M10 18a2 2 0 0 0 4 0" />
  </Svg>
);

export const IconGallery = (p) => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="9" cy="10" r="1.8" />
    <path d="M20 16l-5-5-8 8" />
  </Svg>
);

export const IconLink = (p) => (
  <Svg {...p}>
    <path d="M9 15l6-6" />
    <path d="M11 5l1-1a4 4 0 0 1 5.7 5.7l-2 2" />
    <path d="M13 19l-1 1a4 4 0 0 1-5.7-5.7l2-2" />
  </Svg>
);

export const IconBilling = (p) => (
  <Svg {...p}>
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="M3 10h18" />
    <path d="M7 15h4" />
  </Svg>
);

export const IconGift = (p) => (
  <Svg {...p}>
    <rect x="4" y="9" width="16" height="11" rx="1.5" />
    <path d="M4 13h16" />
    <path d="M12 9v11" />
    <path d="M12 9C10 4 5 5 6 8c.5 1.5 3 1 6 1z" />
    <path d="M12 9c2-5 7-4 6-1-.5 1.5-3 1-6 1z" />
  </Svg>
);

export const IconSettings = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19 12a7 7 0 0 0-.15-1.4l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2.4-1.4L14 3h-4l-.15 2.2a7 7 0 0 0-2.4 1.4l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .5.05.9.15 1.4l-2 1.5 2 3.4 2.3-.9c.7.6 1.5 1.1 2.4 1.4L10 21h4l.15-2.2c.9-.3 1.7-.8 2.4-1.4l2.3.9 2-3.4-2-1.5c.1-.5.15-.9.15-1.4z" />
  </Svg>
);

export const IconMoon = (p) => (
  <Svg {...p}>
    <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" />
  </Svg>
);

export const IconLogout = (p) => (
  <Svg {...p}>
    <path d="M9 19H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </Svg>
);

export const IconUser = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </Svg>
);

export const IconChevronDown = (p) => (
  <Svg {...p}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);

export const IconLayers = (p) => (
  <Svg {...p}>
    <path d="M12 3l8 4.5-8 4.5-8-4.5L12 3z" />
    <path d="M4 12l8 4.5 8-4.5" />
    <path d="M4 16.5L12 21l8-4.5" />
  </Svg>
);

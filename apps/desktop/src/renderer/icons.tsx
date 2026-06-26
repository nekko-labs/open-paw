import React from 'react';

type P = { className?: string };
const S = (props: { children: React.ReactNode } & P) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={props.className}
    width="20"
    height="20"
  >
    {props.children}
  </svg>
);

export const ChatIcon = (p: P) => (
  <S {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></S>
);
export const FolderIcon = (p: P) => (
  <S {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></S>
);
export const ServerIcon = (p: P) => (
  <S {...p}><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 7.5h.01M7 16.5h.01" /></S>
);
export const PlugIcon = (p: P) => (
  <S {...p}><path d="M9 2v6M15 2v6M7 8h10v3a5 5 0 0 1-10 0zM12 16v6" /></S>
);
export const BrainIcon = (p: P) => (
  <S {...p}><path d="M12 5a3 3 0 0 0-6 .5A3 3 0 0 0 5 11a3 3 0 0 0 1 5 3 3 0 0 0 6 .5zM12 5a3 3 0 0 1 6 .5A3 3 0 0 1 19 11a3 3 0 0 1-1 5 3 3 0 0 1-6 .5z" /></S>
);
export const GearIcon = (p: P) => (
  <S {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 2.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H7a1.6 1.6 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V7a1.6 1.6 0 0 0 1.5 1H23a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></S>
);
export const SendIcon = (p: P) => (
  <S {...p}><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" /></S>
);
export const PlusIcon = (p: P) => (<S {...p}><path d="M12 5v14M5 12h14" /></S>);
export const TrashIcon = (p: P) => (<S {...p}><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></S>);
export const ShieldIcon = (p: P) => (<S {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></S>);
export const PanelIcon = (p: P) => (<S {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M15 3v18" /></S>);
export const PinIcon = (p: P) => (<S {...p}><path d="M12 17v5M9 3h6l-1 6 3 3H7l3-3z" /></S>);
export const FileIcon = (p: P) => (<S {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></S>);
export const GridIcon = (p: P) => (<S {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></S>);
export const ExternalIcon = (p: P) => (<S {...p}><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></S>);
export const DownloadIcon = (p: P) => (<S {...p}><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" /></S>);
export const PencilIcon = (p: P) => (<S {...p}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></S>);
export const StarIcon = (p: P & { filled?: boolean }) => (<S {...p}><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" fill={p.filled ? 'currentColor' : 'none'} /></S>);
export const DotsIcon = (p: P) => (<S {...p}><circle cx="5" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="19" cy="12" r="1.4" fill="currentColor" /></S>);
export const PinIcon2 = (p: P) => (<S {...p}><path d="M9 4h6l-1 5 3 2v2H7v-2l3-2-1-5zM12 13v7" /></S>);
export const CheckIcon = (p: P) => (<S {...p}><path d="M20 6 9 17l-5-5" /></S>);
export const SunIcon = (p: P) => (<S {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></S>);
export const TerminalIcon = (p: P) => (<S {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 9 3 3-3 3M13 15h4" /></S>);
export const SplitIcon = (p: P) => (<S {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 4v16" /></S>);
export const CloseIcon = (p: P) => (<S {...p}><path d="M18 6 6 18M6 6l12 12" /></S>);
export const RobotIcon = (p: P) => (<S {...p}><rect x="4" y="8" width="16" height="11" rx="2" /><path d="M12 8V4M9 13h.01M15 13h.01M2 13h2M20 13h2" /></S>);

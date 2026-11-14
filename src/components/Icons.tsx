import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 10.5 12 4l8 6.5" />
    <path d="M6.5 9.5V19h11V9.5" />
    <path d="M10 19v-4.5h4V19" />
  </Svg>
);

export const PlayIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M8 5.5v13l11-6.5z" />
  </Svg>
);

export const LibraryIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="4" y="4.5" width="6.5" height="15" rx="1.6" />
    <rect x="13.5" y="4.5" width="6.5" height="15" rx="1.6" />
    <path d="M13.5 10.5h6.5" />
  </Svg>
);

export const SettingsIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="3.1" />
    <path d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M17.9 6.1l-1.4 1.4M7.5 16.5l-1.4 1.4M17.9 17.9l-1.4-1.4M7.5 7.5 6.1 6.1" />
  </Svg>
);

export const DiagnosticsIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 12.5h3.5l2-5 3 10 2.5-6 1.8 3h5.2" />
  </Svg>
);

export const InfoIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="8.2" />
    <path d="M12 11v5" />
    <circle cx="12" cy="8.2" r="0.8" fill="currentColor" stroke="none" />
  </Svg>
);

export const BellIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M8 10a4 4 0 1 1 8 0c0 3 .8 4.4 1.6 5.3H6.4C7.2 14.4 8 13 8 10Z" />
    <path d="M10.2 18a2 2 0 0 0 3.6 0" />
  </Svg>
);

export const ChevronDownIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="m6 9.5 6 6 6-6" />
  </Svg>
);

export const ChevronLeftIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="m14 6-6 6 6 6" />
  </Svg>
);

export const ChevronRightIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="m10 6 6 6-6 6" />
  </Svg>
);

export const RefreshIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M19 12a7 7 0 1 1-2.4-5.3" />
    <path d="M19.5 4.5V10H14" />
  </Svg>
);

export const CopyIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="9" y="9" width="10.5" height="10.5" rx="2" />
    <path d="M6.5 15H5.5A1.5 1.5 0 0 1 4 13.5v-9A1.5 1.5 0 0 1 5.5 3h9A1.5 1.5 0 0 1 16 4.5v1" />
  </Svg>
);

export const DownloadIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 4v10" />
    <path d="m8 10.5 4 4 4-4" />
    <path d="M4.5 18.5h15" />
  </Svg>
);

export const AlertIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 4.5 3.5 19.5h17z" />
    <path d="M12 10v4" />
    <circle cx="12" cy="16.8" r="0.8" fill="currentColor" stroke="none" />
  </Svg>
);

export const CheckIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Svg>
);

export const CloseIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const MinusIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M5 12h14" />
  </Svg>
);

export const SquareIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="6" y="6" width="12" height="12" rx="1.6" />
  </Svg>
);

export const PlusIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const StarIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="m12 4.5 2.3 4.9 5.2.7-3.8 3.7.9 5.2-4.6-2.5-4.6 2.5.9-5.2L4.5 10l5.2-.7z" />
  </Svg>
);

export const TrashIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M5 7.5h14" />
    <path d="M9.5 7.5V5.5h5v2" />
    <path d="M7 7.5 7.8 19h8.4L17 7.5" />
    <path d="M10.5 10.5v5M13.5 10.5v5" />
  </Svg>
);

export const CpuIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="7" y="7" width="10" height="10" rx="2" />
    <path d="M10 3.5V6M14 3.5V6M10 18v2.5M14 18v2.5M3.5 10H6M3.5 14H6M18 10h2.5M18 14h2.5" />
  </Svg>
);

export const TerminalIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="3.5" y="5" width="17" height="14" rx="2.2" />
    <path d="m7.5 10 2.5 2-2.5 2M12.5 14.5h4" />
  </Svg>
);

export const HardDriveIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="3.5" y="6" width="17" height="6" rx="2" />
    <rect x="3.5" y="13" width="17" height="5" rx="2" />
    <path d="M7 9h.01M7 15.5h.01" />
  </Svg>
);

export const ShieldIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 3.5 5.5 6v6c0 4 3 7 6.5 8.5 3.5-1.5 6.5-4.5 6.5-8.5V6z" />
    <path d="m9.3 12 2 2 3.4-3.6" />
  </Svg>
);

export const SparkIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 4v4M12 16v4M4 12h4M16 12h4" />
    <path d="m7 7 2.2 2.2M14.8 14.8 17 17M17 7l-2.2 2.2M9.2 14.8 7 17" />
  </Svg>
);

export const ArrowRightIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4.5 12h15" />
    <path d="m14 6.5 5.5 5.5L14 17.5" />
  </Svg>
);

export const WrenchIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M15.5 4.5a4.5 4.5 0 0 0-5.6 5.6L4.5 15.5V19.5h4l5.4-5.4a4.5 4.5 0 0 0 5.6-5.6l-2.8 2.8-2.7-2.7z" />
  </Svg>
);

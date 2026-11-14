import {
  DiagnosticsIcon,
  HomeIcon,
  InfoIcon,
  LibraryIcon,
  PlayIcon,
  SettingsIcon,
} from '../components/Icons';

export type NavItem = {
  to: string;
  label: string;
  title: string;
  subtitle: string;
  icon: typeof HomeIcon;
};

export const NAV: NavItem[] = [
  {
    to: '/',
    label: 'Home',
    title: 'Home',
    subtitle: 'Studio status and system overview',
    icon: HomeIcon,
  },
  {
    to: '/play',
    label: 'Studio',
    title: 'Studio',
    subtitle: 'Install and open Roblox Studio through Wine',
    icon: PlayIcon,
  },
  {
    to: '/library',
    label: 'Places',
    title: 'Places',
    subtitle: 'Place files you open in Studio, and recent history',
    icon: LibraryIcon,
  },
  {
    to: '/diagnostics',
    label: 'Diagnostics',
    title: 'Diagnostics',
    subtitle: 'Hardware, Wine and error reporting',
    icon: DiagnosticsIcon,
  },
  {
    to: '/settings',
    label: 'Settings',
    title: 'Settings',
    subtitle: 'Configuration for this machine',
    icon: SettingsIcon,
  },
  {
    to: '/about',
    label: 'About',
    title: 'About Xenity',
    subtitle: 'Project identity, architecture and roadmap',
    icon: InfoIcon,
  },
];

export const ROUTE_META: Record<string, { title: string; subtitle: string }> = Object.fromEntries(
  NAV.map((item) => [item.to, { title: item.title, subtitle: item.subtitle }]),
);

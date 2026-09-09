"use client";

import Link from "next/link";
import {
  digitalTwinGroupIcon,
  digitalTwinNavItems,
  isDigitalTwinPath,
} from "@/lib/digital-twin-nav";
import { SidebarNavGroup } from "@/components/sidebar/sidebar-nav-group";
import { isLoteamentoProductMode } from "@/lib/product-mode";

export type FlatNavItem = { href: string; label: string };

type Props = {
  pathname: string;
  flatItems: FlatNavItem[];
  onNavigate?: () => void;
};

function isActivePath(pathname: string, href: string) {
  const pathOnly = href.split("?")[0] ?? href;
  if (pathOnly === "/obra") {
    return pathname === pathOnly;
  }
  return pathname === pathOnly || pathname.startsWith(`${pathOnly}/`);
}

function flatLinkClass(active: boolean) {
  return `block rounded-lg px-2.5 py-2 text-sm font-medium transition-colors duration-200 ${
    active ? "dg-nav-active" : "dg-nav-item"
  }`;
}

export function AppSidebarNav({ pathname, flatItems, onNavigate }: Props) {
  const dtItems = digitalTwinNavItems.map((item) => ({
    href: item.href,
    label: item.label,
    icon: item.icon,
  }));

  return (
    <nav className="flex flex-1 flex-col space-y-2 overflow-y-auto">
      {flatItems.map(({ href, label }) => {
        const active = isActivePath(pathname, href);
        return (
          <Link
            key={`${href}-${label}`}
            href={href}
            onClick={onNavigate}
            className={flatLinkClass(active)}
          >
            {label}
          </Link>
        );
      })}

      {!isLoteamentoProductMode() && (
        <SidebarNavGroup
          label="Digital Twin"
          icon={digitalTwinGroupIcon}
          items={dtItems}
          pathname={pathname}
          defaultOpen={isDigitalTwinPath(pathname)}
          onNavigate={onNavigate}
        />
      )}
    </nav>
  );
}

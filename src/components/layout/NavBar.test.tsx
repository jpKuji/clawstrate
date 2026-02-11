// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

import { usePathname } from "next/navigation";
import { NavBar } from "@/components/layout/NavBar";

const mockedUsePathname = vi.mocked(usePathname);

describe("NavBar", () => {
  beforeEach(() => {
    mockedUsePathname.mockReset();
  });

  it("hides the app nav on /pitch routes", () => {
    mockedUsePathname.mockReturnValue("/pitch");
    const { container } = render(<NavBar />);

    expect(container.firstChild).toBeNull();
  });

  it("renders app links on non-pitch routes", () => {
    mockedUsePathname.mockReturnValue("/agents");
    render(<NavBar />);

    expect(screen.getByRole("link", { name: ">_ CLAWSTRATE" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pitch" })).toHaveAttribute("href", "/pitch");
  });
});

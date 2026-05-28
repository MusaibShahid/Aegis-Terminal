import { useEffect, useState } from "react";

export type Breakpoint = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

const BREAKPOINTS: Record<Breakpoint, number> = {
  xs: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
};

interface ResponsiveState {
  width: number;
  height: number;
  breakpoint: Breakpoint;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isSidebarCollapsed: boolean;
}

export function useResponsive(): ResponsiveState {
  const [state, setState] = useState<ResponsiveState>(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    return {
      width: w,
      height: h,
      breakpoint: getBreakpoint(w),
      isMobile: w < 768,
      isTablet: w >= 768 && w < 1280,
      isDesktop: w >= 1280,
      isSidebarCollapsed: w < 1280,
    };
  });

  useEffect(() => {
    let rafId: number;
    const onResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        setState({
          width: w,
          height: h,
          breakpoint: getBreakpoint(w),
          isMobile: w < 768,
          isTablet: w >= 768 && w < 1280,
          isDesktop: w >= 1280,
          isSidebarCollapsed: w < 1280,
        });
      });
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return state;
}

function getBreakpoint(width: number): Breakpoint {
  if (width >= 1536) return "2xl";
  if (width >= 1280) return "xl";
  if (width >= 1024) return "lg";
  if (width >= 768) return "md";
  if (width >= 640) return "sm";
  return "xs";
}

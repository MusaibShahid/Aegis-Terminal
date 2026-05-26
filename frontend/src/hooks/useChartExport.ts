export function useChartExport() {
  const exportToPng = (container: HTMLElement | null, filename: string = "chart.png"): void => {
    if (!container) return;
    const canvas = container.querySelector("canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const exportToClipboard = async (container: HTMLElement | null): Promise<boolean> => {
    if (!container) return false;
    const canvas = container.querySelector("canvas");
    if (!canvas) return false;
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) return false;
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      return true;
    } catch {
      return false;
    }
  };

  const captureTradeScreenshot = (container: HTMLElement | null): string | null => {
    if (!container) return null;
    const canvas = container.querySelector("canvas");
    if (!canvas) return null;
    return canvas.toDataURL("image/png");
  };

  return { exportToPng, exportToClipboard, captureTradeScreenshot };
}

// Preprocess receipt image with Canvas API to improve OCR accuracy.
// Resizes to max 1200px, converts to grayscale, and boosts contrast.
async function preprocessImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img  = new Image();

    img.onload = () => {
      const MAX_WIDTH = 1200;
      let { width, height } = img;
      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width  = MAX_WIDTH;
      }

      const canvas = document.createElement("canvas");
      canvas.width  = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);

      // Grayscale + contrast boost
      const imgData = ctx.getImageData(0, 0, width, height);
      const d = imgData.data;
      const CONTRAST = 1.5;
      for (let i = 0; i < d.length; i += 4) {
        const gray = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
        const adj  = Math.min(255, Math.max(0, Math.round((gray - 128) * CONTRAST + 128)));
        d[i] = d[i + 1] = d[i + 2] = adj;
      }
      ctx.putImageData(imgData, 0, 0);

      URL.revokeObjectURL(url);

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(URL.createObjectURL(blob));
          else reject(new Error("Canvas toBlob failed"));
        },
        "image/png"
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
    };
    img.src = url;
  });
}

// Run Tesseract OCR on a receipt image.
// Automatically preprocesses the image before recognition.
// Uses Indonesian + English language models for best accuracy.
export async function runOCR(file: File): Promise<string> {
  let src: string | File = file;

  try {
    src = await preprocessImage(file);
  } catch {
    // Fall back to raw file if canvas preprocessing fails
  }

  const { recognize } = await import("tesseract.js");
  const { data: { text } } = await recognize(src as string, "eng+ind", {
    logger: () => {},
  });

  if (typeof src === "string" && src.startsWith("blob:")) {
    URL.revokeObjectURL(src);
  }

  return text;
}
